import assert from "node:assert/strict";
import test from "node:test";
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
  parseBrapiTimestamp
} from "../services/market-data.service";
import { getTickerProfile } from "../services/ticker.service";
import { env } from "../config/env";
import { createAsset, createPriceHistory } from "../repositories/investment.repository";
import type { AssetRecord, MarketQuoteRecord } from "../types/investment";

const asset: AssetRecord = {
  id: "asset-1",
  name: "BB Seguridade",
  ticker: "BBSE3",
  category: "ACAO",
  currency: "BRL",
  active: true
};

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

test("ticker profiles identify stock, FII and ETF for historical provider", () => {
  assert.equal(getTickerProfile({ ticker: "BBSE3", category: "ACAO" }).kind, "stock");
  assert.equal(getTickerProfile({ ticker: "VGIR11", category: "FII" }).kind, "fii");
  assert.equal(getTickerProfile({ ticker: "IVVB11", category: "ETF" }).kind, "etf");
});
