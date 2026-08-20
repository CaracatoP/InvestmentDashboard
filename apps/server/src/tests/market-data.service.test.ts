import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { runWithAuthContext } from "../auth/auth-context";
import {
  buildRejectedQuote,
  clearAssetHistoryCacheForTests,
  getAssetPriceHistory,
  isValidMarketPrice,
  isValidStoredQuote,
  mapBrapiFiiHistoricalResponse,
  mapBrapiStockHistoricalResponse,
  normalizeHistoricalPricePoints,
  normalizeHistoryRange,
  parseBrapiTimestamp,
  refreshMarketQuotes
} from "../services/market-data.service";
import { getTickerProfile } from "../services/ticker.service";
import { clearCoinGeckoCachesForTests, fetchCoinGeckoSimplePrices } from "../services/coingecko-client";
import { env } from "../config/env";
import { createAsset, createOperation, createPriceHistory, upsertMarketQuote } from "../repositories/investment.repository";
import { getDashboard, getPortfolio } from "../services/portfolio.service";
import type { AssetRecord, MarketQuoteRecord } from "../types/investment";

const asset: AssetRecord = {
  id: "asset-1",
  name: "BB Seguridade",
  ticker: "BBSE3",
  category: "ACAO",
  currency: "BRL",
  active: true
};

function asUser<T>(userId: string, callback: () => Promise<T>) {
  return runWithAuthContext({ userId, role: "user", channel: "web" }, callback);
}

test("MarketQuote with positive price is valid", () => {
  const quote: MarketQuoteRecord = {
    ticker: "BBSE3",
    price: 35.2,
    quotedAt: "2026-07-24T14:00:00.000Z",
    source: "brapi",
    currency: "BRL",
    status: "updated"
  };

  assert.equal(isValidStoredQuote(quote), true);
});

test("zero, negative, NaN and null prices are rejected", () => {
  assert.equal(isValidMarketPrice(0), false);
  assert.equal(isValidMarketPrice(-1), false);
  assert.equal(isValidMarketPrice(Number.NaN), false);
  assert.equal(isValidMarketPrice(null), false);
});

test("rejected quote preserves last valid quote as stale", () => {
  const previous: MarketQuoteRecord = {
    ticker: "BBSE3",
    price: 35.2,
    quotedAt: "2026-07-24T14:00:00.000Z",
    source: "brapi",
    currency: "BRL",
    status: "updated"
  };
  const rejected = buildRejectedQuote(asset, getTickerProfile(asset), previous, "unavailable", "Provider missing ticker", "brapi");

  assert.equal(rejected.status, "stale");
  assert.equal(rejected.price, 35.2);
});

test("missing quote without fallback returns null price", () => {
  const rejected = buildRejectedQuote(asset, getTickerProfile(asset), null, "unavailable", "Provider missing ticker", "brapi");

  assert.equal(rejected.status, "unavailable");
  assert.equal(rejected.price, null);
});

test("CoinGecko simple price normalizes BTC in BRL", async () => {
  const previousCoinGeckoKey = env.coingeckoApiKey;
  const previousCoinGeckoBaseUrl = env.coingeckoApiBaseUrl;
  const previousTtl = env.coingeckoPriceCacheTtlSeconds;
  const previousFetch = globalThis.fetch;
  let requestedUrl = "";

  clearCoinGeckoCachesForTests();
  env.coingeckoApiKey = "demo-key";
  env.coingeckoApiBaseUrl = "https://api.coingecko.com/api/v3";
  env.coingeckoPriceCacheTtlSeconds = 60;
  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    assert.match(requestedUrl, /\/simple\/price\?/);
    assert.match(requestedUrl, /ids=bitcoin/);
    assert.match(requestedUrl, /vs_currencies=brl/);
    assert.equal((init?.headers as Record<string, string> | undefined)?.["x-cg-demo-api-key"], "demo-key");
    return new Response(
      JSON.stringify({
        bitcoin: {
          brl: 620000,
          brl_market_cap: 123456789,
          brl_24h_vol: 987654,
          brl_24h_change: 1.23,
          last_updated_at: 1787227200
        }
      }),
      { status: 200 }
    );
  }) as typeof fetch;

  try {
    const [quote] = await fetchCoinGeckoSimplePrices(["bitcoin"], { vsCurrency: "brl" });

    assert.equal(quote.coingeckoId, "bitcoin");
    assert.equal(quote.symbol, "BTC");
    assert.equal(quote.currency, "BRL");
    assert.equal(quote.price, 620000);
    assert.equal(quote.change24h, 1.23);
    assert.equal(quote.source, "coingecko");
    assert.equal(quote.stale, false);
  } finally {
    clearCoinGeckoCachesForTests();
    env.coingeckoApiKey = previousCoinGeckoKey;
    env.coingeckoApiBaseUrl = previousCoinGeckoBaseUrl;
    env.coingeckoPriceCacheTtlSeconds = previousTtl;
    globalThis.fetch = previousFetch;
  }
});

test("CoinGecko price cache reuses consecutive requests inside TTL", async () => {
  const previousCoinGeckoKey = env.coingeckoApiKey;
  const previousCoinGeckoBaseUrl = env.coingeckoApiBaseUrl;
  const previousTtl = env.coingeckoPriceCacheTtlSeconds;
  const previousFetch = globalThis.fetch;
  let fetchCount = 0;

  clearCoinGeckoCachesForTests();
  env.coingeckoApiKey = "demo-key";
  env.coingeckoApiBaseUrl = "https://api.coingecko.com/api/v3";
  env.coingeckoPriceCacheTtlSeconds = 60;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({ bitcoin: { brl: 620000, last_updated_at: 1787227200 } }), { status: 200 });
  }) as typeof fetch;

  try {
    const first = await fetchCoinGeckoSimplePrices(["bitcoin"], { vsCurrency: "brl" });
    const second = await fetchCoinGeckoSimplePrices(["bitcoin"], { vsCurrency: "brl" });

    assert.equal(first[0].price, 620000);
    assert.equal(second[0].price, 620000);
    assert.equal(fetchCount, 1);
  } finally {
    clearCoinGeckoCachesForTests();
    env.coingeckoApiKey = previousCoinGeckoKey;
    env.coingeckoApiBaseUrl = previousCoinGeckoBaseUrl;
    env.coingeckoPriceCacheTtlSeconds = previousTtl;
    globalThis.fetch = previousFetch;
  }
});

test("CoinGecko price cache refreshes after TTL expires", async () => {
  const previousCoinGeckoKey = env.coingeckoApiKey;
  const previousCoinGeckoBaseUrl = env.coingeckoApiBaseUrl;
  const previousTtl = env.coingeckoPriceCacheTtlSeconds;
  const previousFetch = globalThis.fetch;
  let fetchCount = 0;

  clearCoinGeckoCachesForTests();
  env.coingeckoApiKey = "demo-key";
  env.coingeckoApiBaseUrl = "https://api.coingecko.com/api/v3";
  env.coingeckoPriceCacheTtlSeconds = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({ bitcoin: { brl: 620000 + fetchCount, last_updated_at: 1787227200 } }), { status: 200 });
  }) as typeof fetch;

  try {
    const first = await fetchCoinGeckoSimplePrices(["bitcoin"], { vsCurrency: "brl" });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await fetchCoinGeckoSimplePrices(["bitcoin"], { vsCurrency: "brl" });

    assert.equal(first[0].price, 620001);
    assert.equal(second[0].price, 620002);
    assert.equal(fetchCount, 2);
  } finally {
    clearCoinGeckoCachesForTests();
    env.coingeckoApiKey = previousCoinGeckoKey;
    env.coingeckoApiBaseUrl = previousCoinGeckoBaseUrl;
    env.coingeckoPriceCacheTtlSeconds = previousTtl;
    globalThis.fetch = previousFetch;
  }
});

test("CoinGecko returns stale last valid price when provider fails after a successful fetch", async () => {
  const previousCoinGeckoKey = env.coingeckoApiKey;
  const previousCoinGeckoBaseUrl = env.coingeckoApiBaseUrl;
  const previousTtl = env.coingeckoPriceCacheTtlSeconds;
  const previousFetch = globalThis.fetch;
  let shouldFail = false;

  clearCoinGeckoCachesForTests();
  env.coingeckoApiKey = "demo-key";
  env.coingeckoApiBaseUrl = "https://api.coingecko.com/api/v3";
  env.coingeckoPriceCacheTtlSeconds = 0;
  globalThis.fetch = (async () => {
    if (shouldFail) {
      return new Response(JSON.stringify({ message: "temporarily unavailable" }), { status: 503 });
    }

    return new Response(JSON.stringify({ bitcoin: { brl: 620000, last_updated_at: 1787227200 } }), { status: 200 });
  }) as typeof fetch;

  try {
    const fresh = await fetchCoinGeckoSimplePrices(["bitcoin"], { vsCurrency: "brl" });
    await new Promise((resolve) => setTimeout(resolve, 2));
    shouldFail = true;
    const stale = await fetchCoinGeckoSimplePrices(["bitcoin"], { vsCurrency: "brl" });

    assert.equal(fresh[0].stale, false);
    assert.equal(stale[0].price, 620000);
    assert.equal(stale[0].stale, true);
  } finally {
    clearCoinGeckoCachesForTests();
    env.coingeckoApiKey = previousCoinGeckoKey;
    env.coingeckoApiBaseUrl = previousCoinGeckoBaseUrl;
    env.coingeckoPriceCacheTtlSeconds = previousTtl;
    globalThis.fetch = previousFetch;
  }
});

test("CoinGecko 429 fails once without retry loop or zero fallback", async () => {
  const previousCoinGeckoKey = env.coingeckoApiKey;
  const previousCoinGeckoBaseUrl = env.coingeckoApiBaseUrl;
  const previousFetch = globalThis.fetch;
  let fetchCount = 0;

  clearCoinGeckoCachesForTests();
  env.coingeckoApiKey = "demo-key";
  env.coingeckoApiBaseUrl = "https://api.coingecko.com/api/v3";
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({ status: { error_message: "rate limited" } }), { status: 429 });
  }) as typeof fetch;

  try {
    const suffix = randomUUID().slice(0, 6);
    const result = await asUser(`coingecko-429-${suffix}`, async () => {
      await createAsset({ name: "Rate Limit Coin", ticker: `RL${suffix.slice(0, 2).toUpperCase()}`, category: "CRIPTO", coingeckoId: `rate-limit-${suffix}`, currency: "BRL", active: true });
      return refreshMarketQuotes();
    });
    const failedQuote = result.quotes.find((quote) => quote.providerSymbol === `rate-limit-${suffix}`);

    assert.equal(fetchCount, 1);
    assert.equal(failedQuote?.status, "unavailable");
    assert.equal(failedQuote?.price, null);
  } finally {
    clearCoinGeckoCachesForTests();
    env.coingeckoApiKey = previousCoinGeckoKey;
    env.coingeckoApiBaseUrl = previousCoinGeckoBaseUrl;
    globalThis.fetch = previousFetch;
  }
});

test("history range aliases map 1M and 1A to supported BRAPI ranges", () => {
  assert.deepEqual(normalizeHistoryRange("1M"), { range: "1mo", interval: "1d" });
  assert.deepEqual(normalizeHistoryRange("1A"), { range: "1y", interval: "1d" });
});

test("BRAPI unix timestamps are converted from seconds", () => {
  const date = parseBrapiTimestamp(1781233200);

  assert.equal(date?.toISOString(), "2026-06-12T03:00:00.000Z");
});

test("historical points are sorted, deduplicated and reject invalid close", () => {
  const points = normalizeHistoricalPricePoints([
    { date: 1722470400, close: 10.1, open: 10, high: 10.5, low: 9.9, volume: 1000 },
    { date: 1722384000, close: 0, open: 9 },
    { date: 1722384000, close: 9.8, open: 9.7 },
    { date: 1722470400, close: 10.2, open: 10.1 }
  ]);

  assert.equal(points.length, 2);
  assert.equal(points[0].close, 9.8);
  assert.equal(points[1].close, 10.2);
});

test("stock historical response maps OHLCV data", () => {
  const result = mapBrapiStockHistoricalResponse(
    {
      results: [
        {
          symbol: "BBSE3",
          data: {
            usedRange: "1y",
            usedInterval: "1d",
            historicalDataPrice: [
              { date: 1722384000, open: 34, high: 35, low: 33.5, close: 34.8, volume: 1200 }
            ]
          }
        }
      ]
    },
    "BBSE3",
    "1y",
    "1d"
  );

  assert.equal(result?.ticker, "BBSE3");
  assert.equal(result?.points[0].close, 34.8);
  assert.equal(result?.points[0].volume, 1200);
});

test("FII historical response maps OHLCV data", () => {
  const result = mapBrapiFiiHistoricalResponse(
    {
      fiis: [
        {
          symbol: "MXRF11",
          historicalDataPrice: [
            { date: 1736478000, open: 9.33, high: 9.37, low: 9.3, close: 9.35, volume: 1027483 }
          ]
        }
      ]
    },
    "MXRF11",
    "1y",
    "1d"
  );

  assert.equal(result?.ticker, "MXRF11");
  assert.equal(result?.points[0].close, 9.35);
});

test("historical service falls back to cache when provider is unavailable", async () => {
  const previousProvider = env.marketDataProvider;
  const previousKey = env.marketDataApiKey;
  env.marketDataProvider = "";
  env.marketDataApiKey = "";

  try {
    const cachedAsset = await createAsset({
      name: "Fundo Cache",
      ticker: "CACH11",
      category: "FII",
      currency: "BRL",
      active: true
    });
    await createPriceHistory({
      ticker: cachedAsset.ticker,
      price: 9.95,
      capturedAt: new Date(),
      source: "brapi-history-1d",
      close: 9.95,
      type: "market_history",
      interval: "1d",
      granularity: "1d"
    });
    const history = await getAssetPriceHistory(cachedAsset, "1mo");

    assert.equal(history.status, "stale");
    assert.equal(history.points.length, 1);
    assert.equal(history.points[0].close, 9.95);
  } finally {
    env.marketDataProvider = previousProvider;
    env.marketDataApiKey = previousKey;
  }
});

test("historical service returns memory cache without duplicated provider calls", async () => {
  const previousProvider = env.marketDataProvider;
  const previousKey = env.marketDataApiKey;
  const previousTtl = env.marketHistoryCacheTtlMinutes;
  const previousFetch = globalThis.fetch;
  let fetchCount = 0;
  clearAssetHistoryCacheForTests();
  env.marketDataProvider = "brapi";
  env.marketDataApiKey = "test-token";
  env.marketHistoryCacheTtlMinutes = 60;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return new Response(
      JSON.stringify({
        results: [
          {
            symbol: "MEMC3",
            data: {
              usedRange: "1mo",
              usedInterval: "1d",
              historicalDataPrice: [{ date: 1784862000, open: 10, high: 10.3, low: 9.9, close: 10.2, volume: 1000 }]
            }
          }
        ]
      }),
      { status: 200 }
    );
  }) as typeof fetch;

  try {
    const cachedAsset = await createAsset({
      name: "Memory Cache",
      ticker: "MEMC3",
      category: "ACAO",
      currency: "BRL",
      active: true
    });
    const first = await getAssetPriceHistory(cachedAsset, "1mo");
    const second = await getAssetPriceHistory(cachedAsset, "1mo");

    assert.equal(first.status, "updated");
    assert.equal(second.status, "cached");
    assert.equal(fetchCount, 1);
  } finally {
    clearAssetHistoryCacheForTests();
    env.marketDataProvider = previousProvider;
    env.marketDataApiKey = previousKey;
    env.marketHistoryCacheTtlMinutes = previousTtl;
    globalThis.fetch = previousFetch;
  }
});

test("historical service deduplicates simultaneous cache misses", async () => {
  const previousProvider = env.marketDataProvider;
  const previousKey = env.marketDataApiKey;
  const previousFetch = globalThis.fetch;
  let fetchCount = 0;
  clearAssetHistoryCacheForTests();
  env.marketDataProvider = "brapi";
  env.marketDataApiKey = "test-token";
  globalThis.fetch = (async () => {
    fetchCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return new Response(
      JSON.stringify({
        results: [
          {
            symbol: "DEDUP3",
            data: {
              usedRange: "1mo",
              usedInterval: "1d",
              historicalDataPrice: [{ date: 1784862000, close: 20.2 }]
            }
          }
        ]
      }),
      { status: 200 }
    );
  }) as typeof fetch;

  try {
    const dedupedAsset = await createAsset({
      name: "Dedupe Cache",
      ticker: "DEDUP3",
      category: "ACAO",
      currency: "BRL",
      active: true
    });
    const [first, second] = await Promise.all([
      getAssetPriceHistory(dedupedAsset, "1mo"),
      getAssetPriceHistory(dedupedAsset, "1mo")
    ]);

    assert.equal(first.status, "updated");
    assert.equal(second.status, "updated");
    assert.equal(fetchCount, 1);
  } finally {
    clearAssetHistoryCacheForTests();
    env.marketDataProvider = previousProvider;
    env.marketDataApiKey = previousKey;
    globalThis.fetch = previousFetch;
  }
});

test("stale historical cache is returned while background refresh runs", async () => {
  const previousProvider = env.marketDataProvider;
  const previousKey = env.marketDataApiKey;
  const previousTtl = env.marketHistoryCacheTtlMinutes;
  const previousFetch = globalThis.fetch;
  let fetchCount = 0;
  clearAssetHistoryCacheForTests();
  env.marketDataProvider = "brapi";
  env.marketDataApiKey = "test-token";
  env.marketHistoryCacheTtlMinutes = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return new Response(
      JSON.stringify({
        results: [
          {
            symbol: "STALE3",
            data: {
              usedRange: "1mo",
              usedInterval: "1mo",
              historicalDataPrice: [{ date: 1784862000, close: 31.2 }]
            }
          }
        ]
      }),
      { status: 200 }
    );
  }) as typeof fetch;

  try {
    const staleAsset = await createAsset({
      name: "Stale Cache",
      ticker: "STALE3",
      category: "ACAO",
      currency: "BRL",
      active: true
    });
    await createPriceHistory({
      ticker: staleAsset.ticker,
      price: 30,
      capturedAt: new Date("2026-06-01T03:00:00.000Z"),
      source: "brapi-history-1d",
      close: 30,
      type: "market_history",
      interval: "1mo",
      granularity: "1mo"
    });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const history = await getAssetPriceHistory(staleAsset, "max");

    assert.equal(history.status, "stale");
    assert.equal(history.points[0].close, 30);
    assert.equal(fetchCount, 1);
    await new Promise((resolve) => setTimeout(resolve, 30));
  } finally {
    clearAssetHistoryCacheForTests();
    env.marketDataProvider = previousProvider;
    env.marketDataApiKey = previousKey;
    env.marketHistoryCacheTtlMinutes = previousTtl;
    globalThis.fetch = previousFetch;
  }
});

test("historical service fetches FII prices through BRAPI B3 history first", async () => {
  const previousProvider = env.marketDataProvider;
  const previousKey = env.marketDataApiKey;
  const previousFetch = globalThis.fetch;
  let requestedUrl = "";
  env.marketDataProvider = "brapi";
  env.marketDataApiKey = "test-token";
  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    assert.equal((init?.headers as Record<string, string> | undefined)?.Authorization, "Bearer test-token");
    return new Response(
      JSON.stringify({
        results: [
          {
            symbol: "STKF11",
            data: {
              usedRange: "1mo",
              usedInterval: "1d",
              historicalDataPrice: [{ date: 1784862000, open: 9.3, high: 9.4, low: 9.2, close: 9.35, volume: 1000 }]
            }
          }
        ]
      }),
      { status: 200 }
    );
  }) as typeof fetch;

  try {
    const fiiAsset = await createAsset({
      name: "FII Stock Endpoint",
      ticker: "STKF11",
      category: "FII",
      currency: "BRL",
      active: true
    });
    const history = await getAssetPriceHistory(fiiAsset, "1mo");

    assert.equal(requestedUrl.includes("/api/v2/stocks/historical?symbols=STKF11"), true);
    assert.equal(history.status, "updated");
    assert.equal(history.points.length, 1);
    assert.equal(history.points[0].close, 9.35);
  } finally {
    env.marketDataProvider = previousProvider;
    env.marketDataApiKey = previousKey;
    globalThis.fetch = previousFetch;
  }
});

test("historical service returns error when BRAPI fails without cache", async () => {
  const previousProvider = env.marketDataProvider;
  const previousKey = env.marketDataApiKey;
  const previousFetch = globalThis.fetch;
  env.marketDataProvider = "brapi";
  env.marketDataApiKey = "test-token";
  globalThis.fetch = (async () => new Response(JSON.stringify({ message: "Provider failed" }), { status: 500 })) as typeof fetch;

  try {
    const uncachedAsset = await createAsset({
      name: "Acao Sem Cache",
      ticker: "NOC3",
      category: "ACAO",
      currency: "BRL",
      active: true
    });
    const history = await getAssetPriceHistory(uncachedAsset, "1y");

    assert.equal(history.status, "error");
    assert.equal(history.points.length, 0);
  } finally {
    env.marketDataProvider = previousProvider;
    env.marketDataApiKey = previousKey;
    globalThis.fetch = previousFetch;
  }
});

test("crypto quotes are fetched in batch from CoinGecko with BRL priority", async () => {
  const previousCoinGeckoKey = env.coingeckoApiKey;
  const previousCoinGeckoBaseUrl = env.coingeckoApiBaseUrl;
  const previousProvider = env.marketDataProvider;
  const previousProviderKey = env.marketDataApiKey;
  const previousFetch = globalThis.fetch;
  let requestedUrl = "";
  let fetchCount = 0;

  clearCoinGeckoCachesForTests();
  env.coingeckoApiKey = "demo-key";
  env.coingeckoApiBaseUrl = "https://api.coingecko.com/api/v3";
  env.marketDataProvider = "";
  env.marketDataApiKey = "";
  globalThis.fetch = (async (input, init) => {
    fetchCount += 1;
    requestedUrl = String(input);
    assert.match(requestedUrl, /\/simple\/price\?/);
    assert.match(requestedUrl, /ids=bitcoin%2Cethereum%2Csolana/);
    assert.match(requestedUrl, /vs_currencies=brl/);
    assert.equal((init?.headers as Record<string, string> | undefined)?.["x-cg-demo-api-key"], "demo-key");
    return new Response(
      JSON.stringify({
        bitcoin: { brl: 620000, brl_24h_change: 2.5, last_updated_at: 1787227200 },
        ethereum: { brl: 18000, brl_24h_change: -1.2, last_updated_at: 1787227200 },
        solana: { brl: 950, brl_24h_change: 0.8, last_updated_at: 1787227200 }
      }),
      { status: 200 }
    );
  }) as typeof fetch;

  try {
    const suffix = randomUUID().slice(0, 6);
    const result = await asUser(`coingecko-batch-${suffix}`, async () => {
      await createAsset({ name: "Bitcoin", ticker: "BTC", category: "CRIPTO", coingeckoId: "bitcoin", currency: "BRL", active: true });
      await createAsset({ name: "Ethereum", ticker: "ETH", category: "CRIPTO", coingeckoId: "ethereum", currency: "BRL", active: true });
      await createAsset({ name: "Solana", ticker: "SOL", category: "CRIPTO", coingeckoId: "solana", currency: "BRL", active: true });
      return refreshMarketQuotes();
    });

    const btcQuote = result.quotes.find((quote) => quote.providerSymbol === "bitcoin");
    const ethQuote = result.quotes.find((quote) => quote.providerSymbol === "ethereum");
    const solQuote = result.quotes.find((quote) => quote.providerSymbol === "solana");
    assert.equal(result.updated >= 3, true);
    assert.equal(btcQuote?.price, 620000);
    assert.equal(ethQuote?.price, 18000);
    assert.equal(solQuote?.price, 950);
    assert.equal(btcQuote?.currency, "BRL");
    assert.equal(btcQuote?.change24h, 2.5);
    assert.equal(fetchCount, 1);
  } finally {
    clearCoinGeckoCachesForTests();
    env.coingeckoApiKey = previousCoinGeckoKey;
    env.coingeckoApiBaseUrl = previousCoinGeckoBaseUrl;
    env.marketDataProvider = previousProvider;
    env.marketDataApiKey = previousProviderKey;
    globalThis.fetch = previousFetch;
  }
});

test("crypto refresh keeps last valid quote when CoinGecko is rate limited", async () => {
  const previousCoinGeckoKey = env.coingeckoApiKey;
  const previousCoinGeckoBaseUrl = env.coingeckoApiBaseUrl;
  const previousFetch = globalThis.fetch;
  clearCoinGeckoCachesForTests();
  env.coingeckoApiKey = "demo-key";
  env.coingeckoApiBaseUrl = "https://api.coingecko.com/api/v3";
  globalThis.fetch = (async () => new Response(JSON.stringify({ status: { error_message: "rate limited" } }), { status: 429 })) as typeof fetch;

  try {
    const suffix = randomUUID().slice(0, 6);
    const result = await asUser(`coingecko-stale-${suffix}`, async () => {
      await createAsset({ name: "Bitcoin", ticker: "BTC", category: "CRIPTO", coingeckoId: "bitcoin", currency: "BRL", active: true });
      await upsertMarketQuote({
        assetKey: "crypto:bitcoin",
        ticker: "BTC",
        providerSymbol: "bitcoin",
        price: 600000,
        quotedAt: "2026-08-19T12:00:00.000Z",
        source: "coingecko",
        currency: "BRL",
        status: "updated",
        market: "crypto",
        assetKind: "crypto"
      });
      return refreshMarketQuotes();
    });

    const btcQuote = result.quotes.find((quote) => quote.providerSymbol === "bitcoin");
    assert.equal(btcQuote?.status, "stale");
    assert.equal(btcQuote?.price, 600000);
  } finally {
    clearCoinGeckoCachesForTests();
    env.coingeckoApiKey = previousCoinGeckoKey;
    env.coingeckoApiBaseUrl = previousCoinGeckoBaseUrl;
    globalThis.fetch = previousFetch;
  }
});

test("invalid CoinGecko id does not break valid crypto quotes in the same batch", async () => {
  const previousCoinGeckoKey = env.coingeckoApiKey;
  const previousCoinGeckoBaseUrl = env.coingeckoApiBaseUrl;
  const previousFetch = globalThis.fetch;

  clearCoinGeckoCachesForTests();
  env.coingeckoApiKey = "demo-key";
  env.coingeckoApiBaseUrl = "https://api.coingecko.com/api/v3";
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        bitcoin: { brl: 620000, last_updated_at: 1787227200 }
      }),
      { status: 200 }
    )) as typeof fetch;

  try {
    const suffix = randomUUID().slice(0, 6);
    const result = await asUser(`coingecko-invalid-${suffix}`, async () => {
      await createAsset({ name: "Bitcoin", ticker: "BTC", category: "CRIPTO", coingeckoId: "bitcoin", currency: "BRL", active: true });
      await createAsset({ name: "Unknown", ticker: `ZZ${suffix.slice(0, 2).toUpperCase()}`, category: "CRIPTO", coingeckoId: "not-a-real-coin-id", currency: "BRL", active: true });
      return refreshMarketQuotes();
    });

    const btcQuote = result.quotes.find((quote) => quote.providerSymbol === "bitcoin");
    const invalidQuote = result.quotes.find((quote) => quote.providerSymbol === "not-a-real-coin-id");

    assert.equal(btcQuote?.status, "updated");
    assert.equal(btcQuote?.price, 620000);
    assert.equal(invalidQuote?.status, "unavailable");
    assert.equal(invalidQuote?.price, null);
  } finally {
    clearCoinGeckoCachesForTests();
    env.coingeckoApiKey = previousCoinGeckoKey;
    env.coingeckoApiBaseUrl = previousCoinGeckoBaseUrl;
    globalThis.fetch = previousFetch;
  }
});

test("crypto market quotes are public but portfolio quantities stay isolated by user", async () => {
  const previousCoinGeckoKey = env.coingeckoApiKey;
  const previousCoinGeckoBaseUrl = env.coingeckoApiBaseUrl;
  const previousFetch = globalThis.fetch;
  let fetchCount = 0;

  clearCoinGeckoCachesForTests();
  env.coingeckoApiKey = "demo-key";
  env.coingeckoApiBaseUrl = "https://api.coingecko.com/api/v3";

  try {
    const suffix = randomUUID().slice(0, 6);
    const coingeckoId = `bitcoin-test-${suffix}`;
    const ticker = `BT${suffix.replace(/\d/g, "A").slice(0, 4).toUpperCase()}`;
    const userA = `coingecko-owner-a-${suffix}`;
    const userB = `coingecko-owner-b-${suffix}`;
    globalThis.fetch = (async (input) => {
      fetchCount += 1;
      assert.match(String(input), new RegExp(`ids=${coingeckoId}`));
      return new Response(JSON.stringify({ [coingeckoId]: { brl: 620000, last_updated_at: 1787227200 } }), { status: 200 });
    }) as typeof fetch;

    const userAData = await asUser(userA, async () => {
      await createAsset({ name: "Bitcoin Test", ticker, category: "CRIPTO", coingeckoId, currency: "BRL", active: true });
      await createOperation({
        assetTicker: ticker,
        type: "COMPRA",
        date: "2026-08-20",
        quantity: 0.00012345,
        price: 500000,
        fees: 0,
        totalValue: 61.725
      });
      return {
        portfolio: await getPortfolio(),
        dashboard: await getDashboard()
      };
    });

    const portfolioB = await asUser(userB, async () => {
      await createAsset({ name: "Bitcoin Test", ticker, category: "CRIPTO", coingeckoId, currency: "BRL", active: true });
      await createOperation({
        assetTicker: ticker,
        type: "COMPRA",
        date: "2026-08-20",
        quantity: 0.0025,
        price: 500000,
        fees: 0,
        totalValue: 1250
      });
      return getPortfolio();
    });

    const btcA = userAData.portfolio.assets.find((item) => item.ticker === ticker);
    const btcB = portfolioB.assets.find((item) => item.ticker === ticker);

    assert.equal(fetchCount, 1);
    assert.equal(btcA?.quantity, 0.00012345);
    assert.equal(btcB?.quantity, 0.0025);
    assert.equal(Math.abs((btcA?.currentValue ?? 0) - 76.539) < 0.000001, true);
    assert.equal(Math.abs(userAData.dashboard.metrics.marketAssetsValue - 76.539) < 0.000001, true);
    assert.equal(btcB?.currentValue, 1550);
  } finally {
    clearCoinGeckoCachesForTests();
    env.coingeckoApiKey = previousCoinGeckoKey;
    env.coingeckoApiBaseUrl = previousCoinGeckoBaseUrl;
    globalThis.fetch = previousFetch;
  }
});

test("crypto historical prices are fetched from CoinGecko", async () => {
  const previousCoinGeckoKey = env.coingeckoApiKey;
  const previousCoinGeckoBaseUrl = env.coingeckoApiBaseUrl;
  const previousFetch = globalThis.fetch;
  clearCoinGeckoCachesForTests();
  env.coingeckoApiKey = "demo-key";
  env.coingeckoApiBaseUrl = "https://api.coingecko.com/api/v3";
  globalThis.fetch = (async (input, init) => {
    assert.match(String(input), /\/coins\/ethereum\/market_chart\?/);
    assert.equal((init?.headers as Record<string, string> | undefined)?.["x-cg-demo-api-key"], "demo-key");
    return new Response(
      JSON.stringify({
        prices: [
          [1787083200000, 18000],
          [1787169600000, 18100],
          [1787256000000, 18250]
        ],
        total_volumes: [
          [1787083200000, 1200000000],
          [1787169600000, 1300000000],
          [1787256000000, 1400000000]
        ]
      }),
      { status: 200 }
    );
  }) as typeof fetch;

  try {
    const suffix = randomUUID().slice(0, 6);
    const history = await asUser(`coingecko-history-${suffix}`, async () => {
      const cryptoAsset = await createAsset({
        name: "Ethereum",
        ticker: "ETH",
        category: "CRIPTO",
        coingeckoId: "ethereum",
        currency: "BRL",
        active: true
      });
      return getAssetPriceHistory(cryptoAsset, "1mo");
    });

    assert.equal(history.status, "updated");
    assert.equal(history.source, "coingecko");
    assert.equal(history.currency, "BRL");
    assert.equal(history.points.length >= 3, true);
  } finally {
    clearCoinGeckoCachesForTests();
    env.coingeckoApiKey = previousCoinGeckoKey;
    env.coingeckoApiBaseUrl = previousCoinGeckoBaseUrl;
    globalThis.fetch = previousFetch;
  }
});

test("ticker profiles identify stock, FII and ETF for historical provider", () => {
  assert.equal(getTickerProfile({ ticker: "BBSE3", category: "ACAO" }).kind, "stock");
  assert.equal(getTickerProfile({ ticker: "VGIR11", category: "FII" }).kind, "fii");
  assert.equal(getTickerProfile({ ticker: "IVVB11", category: "ETF" }).kind, "etf");
});
