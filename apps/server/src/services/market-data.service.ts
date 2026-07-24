import { env } from "../config/env";
import { createPriceHistory, listAssets, listMarketQuotes, upsertMarketQuote } from "../repositories/investment.repository";
import type { AssetRecord, MarketQuoteRecord } from "../types/investment";
import { getTickerProfile, normalizeTicker, type TickerProfile } from "./ticker.service";

type QuoteStatus = MarketQuoteRecord["status"];

interface MarketQuoteInput {
  ticker: string;
  providerSymbol: string;
  price: number;
  quotedAt: Date;
  source: string;
  currency: string;
  market: string;
  assetKind: string;
}

interface ProviderRequestAsset {
  asset: AssetRecord;
  profile: TickerProfile;
}

interface MarketDataProvider {
  name: string;
  fetchBatch(items: ProviderRequestAsset[]): Promise<MarketQuoteInput[]>;
}

class UnavailableMarketDataProvider implements MarketDataProvider {
  name = env.marketDataProvider || "unconfigured";

  async fetchBatch(): Promise<MarketQuoteInput[]> {
    return [];
  }
}

class BrapiMarketDataProvider implements MarketDataProvider {
  name = "brapi";

  async fetchBatch(items: ProviderRequestAsset[]): Promise<MarketQuoteInput[]> {
    const [b3Quotes, cryptoQuotes] = await Promise.all([this.fetchB3Quotes(items), this.fetchCryptoQuotes(items)]);
    return [...b3Quotes, ...cryptoQuotes];
  }

  private async fetchB3Quotes(items: ProviderRequestAsset[]): Promise<MarketQuoteInput[]> {
    const b3Items = items.filter((item) => item.profile.market === "b3");
    const symbols = b3Items.map((item) => item.profile.providerSymbol);
    if (symbols.length === 0) return [];

    const payload = await this.fetchJson<{
      results?: Array<{
        symbol?: string;
        regularMarketPrice?: number;
        regularMarketTime?: string;
        currency?: string;
      }>;
    }>(`https://brapi.dev/api/quote/${encodeURIComponent(symbols.join(","))}?token=${encodeURIComponent(env.marketDataApiKey)}`);

    return (payload.results ?? []).map((item) => {
      const ticker = normalizeTicker(String(item.symbol ?? ""));
      const profile = b3Items.find((request) => request.profile.internalTicker === ticker)?.profile;

      return {
        ticker,
        providerSymbol: profile?.providerSymbol ?? ticker,
        price: Number(item.regularMarketPrice),
        quotedAt: item.regularMarketTime ? new Date(item.regularMarketTime) : new Date(),
        source: this.name,
        currency: item.currency ?? "BRL",
        market: profile?.market ?? "b3",
        assetKind: profile?.kind ?? "stock"
      };
    });
  }

  private async fetchCryptoQuotes(items: ProviderRequestAsset[]): Promise<MarketQuoteInput[]> {
    const cryptoItems = items.filter((item) => item.profile.market === "crypto");
    const coins = cryptoItems.map((item) => item.profile.providerSymbol);
    if (coins.length === 0) return [];

    const payload = await this.fetchJson<{
      coins?: Array<{
        coin?: string;
        regularMarketPrice?: number;
        regularMarketTime?: string;
        currency?: string;
      }>;
    }>(
      `https://brapi.dev/api/v2/crypto?coin=${encodeURIComponent(coins.join(","))}&currency=BRL&token=${encodeURIComponent(env.marketDataApiKey)}`
    );

    return (payload.coins ?? []).map((item) => {
      const ticker = normalizeTicker(String(item.coin ?? ""));
      const profile = cryptoItems.find((request) => request.profile.internalTicker === ticker)?.profile;

      return {
        ticker,
        providerSymbol: profile?.providerSymbol ?? ticker,
        price: Number(item.regularMarketPrice),
        quotedAt: item.regularMarketTime ? new Date(item.regularMarketTime) : new Date(),
        source: this.name,
        currency: item.currency ?? "BRL",
        market: "crypto",
        assetKind: "crypto"
      };
    });
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (response.status === 429) {
        throw new Error("Market data rate limit reached");
      }

      if (!response.ok) {
        throw new Error(`Market data request failed with status ${response.status}`);
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function getProvider(): MarketDataProvider {
  if (env.marketDataProvider.toLowerCase() === "brapi") return new BrapiMarketDataProvider();
  return new UnavailableMarketDataProvider();
}

export function isValidMarketPrice(price: unknown): price is number {
  return typeof price === "number" && Number.isFinite(price) && price > 0;
}

export function isValidStoredQuote(quote?: MarketQuoteRecord | null) {
  return Boolean(quote && isValidMarketPrice(quote.price) && ["success", "updated", "stale"].includes(quote.status));
}

export function buildRejectedQuote(
  asset: AssetRecord,
  profile: TickerProfile,
  previous: MarketQuoteRecord | null | undefined,
  status: QuoteStatus,
  errorMessage: string,
  providerName = getProvider().name
): Omit<MarketQuoteRecord, "id"> {
  const hasPrevious = isValidStoredQuote(previous);

  return {
    ticker: profile.internalTicker,
    providerSymbol: profile.providerSymbol,
    price: hasPrevious ? previous?.price : null,
    quotedAt: hasPrevious ? (previous?.quotedAt ?? new Date()) : new Date(),
    source: hasPrevious ? (previous?.source ?? providerName) : providerName,
    currency: previous?.currency ?? asset.currency ?? "BRL",
    status: hasPrevious ? "stale" : status,
    errorMessage,
    market: profile.market,
    assetKind: profile.kind
  };
}

function buildUpdatedQuote(quote: MarketQuoteInput): Omit<MarketQuoteRecord, "id"> {
  return {
    ticker: quote.ticker,
    providerSymbol: quote.providerSymbol,
    price: quote.price,
    quotedAt: quote.quotedAt,
    source: quote.source,
    currency: quote.currency,
    status: "updated",
    errorMessage: "",
    market: quote.market,
    assetKind: quote.assetKind
  };
}

export async function refreshMarketQuotes() {
  const provider = getProvider();
  const activeAssets = (await listAssets()).filter((asset) => asset.active && asset.ticker);
  const previousQuotes = new Map((await listMarketQuotes()).map((quote) => [normalizeTicker(quote.ticker), quote]));
  const now = new Date();
  const requestItems = activeAssets.map((asset) => ({ asset, profile: getTickerProfile(asset) }));
  const supportedItems = requestItems.filter((item) => item.profile.supported);
  const unsupportedItems = requestItems.filter((item) => !item.profile.supported);

  console.info("Market refresh request", {
    provider: provider.name,
    tickers: requestItems.map((item) => item.profile.internalTicker),
    providerSymbols: requestItems.map((item) => item.profile.providerSymbol),
    unsupported: unsupportedItems.map((item) => item.profile.internalTicker)
  });

  let fetchedQuotes: MarketQuoteInput[] = [];
  let providerError = "";

  if (!env.marketDataProvider || !env.marketDataApiKey) {
    providerError = "Market data provider not configured";
  } else {
    try {
      fetchedQuotes = await provider.fetchBatch(supportedItems);
    } catch (error) {
      providerError = error instanceof Error ? error.message : "Unknown market data error";
    }
  }

  const fetchedByTicker = new Map(fetchedQuotes.map((quote) => [normalizeTicker(quote.ticker), quote]));
  let updated = 0;
  let stale = 0;
  let failed = 0;
  let unsupported = 0;
  const quotes: MarketQuoteRecord[] = [];

  console.info("Market provider response", {
    received: fetchedQuotes.map((quote) => quote.ticker),
    missing: supportedItems.filter((item) => !fetchedByTicker.has(item.profile.internalTicker)).map((item) => item.profile.internalTicker)
  });

  for (const item of unsupportedItems) {
    unsupported += 1;
    failed += 1;
    const savedQuote = await upsertMarketQuote(
      buildRejectedQuote(item.asset, item.profile, previousQuotes.get(item.profile.internalTicker), "unsupported", "Asset type is not supported by market data provider", provider.name)
    );
    quotes.push(savedQuote);
  }

  for (const item of supportedItems) {
    const fetched = fetchedByTicker.get(item.profile.internalTicker);
    const previous = previousQuotes.get(item.profile.internalTicker);

    if (!fetched) {
      const status: QuoteStatus = providerError ? "error" : "unavailable";
      const savedQuote = await upsertMarketQuote(
        buildRejectedQuote(item.asset, item.profile, previous, status, providerError || "Provider did not return this ticker", provider.name)
      );
      if (savedQuote.status === "stale") stale += 1;
      else failed += 1;
      quotes.push(savedQuote);
      continue;
    }

    if (!isValidMarketPrice(fetched.price)) {
      console.warn("Market quote rejected", { ticker: item.profile.internalTicker, providerSymbol: item.profile.providerSymbol, price: fetched.price });
      const savedQuote = await upsertMarketQuote(
        buildRejectedQuote(item.asset, item.profile, previous, "unavailable", "Provider returned an invalid price", provider.name)
      );
      if (savedQuote.status === "stale") stale += 1;
      else failed += 1;
      quotes.push(savedQuote);
      continue;
    }

    updated += 1;
    const savedQuote = await upsertMarketQuote(buildUpdatedQuote(fetched));
    await createPriceHistory({
      ticker: item.profile.internalTicker,
      price: fetched.price,
      capturedAt: fetched.quotedAt,
      source: fetched.source
    });
    quotes.push(savedQuote);
  }

  console.info("Market refresh upserts", {
    updated,
    stale,
    failed,
    unsupported,
    total: requestItems.length
  });

  return {
    provider: provider.name,
    refreshedAt: now,
    total: requestItems.length,
    requested: supportedItems.length,
    updated,
    stale,
    failed,
    unsupported,
    quotes
  };
}

export async function getMarketStatus() {
  const quotes = await listMarketQuotes();
  const validQuotes = quotes.filter((quote) => isValidMarketPrice(quote.price));
  const lastQuote = [...validQuotes].sort((left, right) => new Date(right.quotedAt).getTime() - new Date(left.quotedAt).getTime())[0];

  return {
    provider: env.marketDataProvider || "unconfigured",
    timezone: env.marketTimezone,
    refreshHours: env.marketRefreshHours,
    lastUpdatedAt: lastQuote?.quotedAt ?? null,
    connected: Boolean(env.marketDataProvider && env.marketDataApiKey),
    quotes
  };
}
