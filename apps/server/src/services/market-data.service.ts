import { env } from "../config/env";
import { createPriceHistory, listAssets, listMarketQuotes, listPriceHistory, upsertMarketQuote } from "../repositories/investment.repository";
import type { AssetRecord, MarketQuoteRecord } from "../types/investment";
import { getTickerProfile, normalizeTicker, type TickerProfile } from "./ticker.service";

type QuoteStatus = MarketQuoteRecord["status"];
type PriceHistoryStatus = "updated" | "cached" | "stale" | "unavailable" | "unsupported" | "error";
type HistoryRange = "1mo" | "3mo" | "6mo" | "1y" | "5y" | "max";
type HistoryInterval = "1d" | "1wk" | "1mo";

const historyCacheTtlMs = 6 * 60 * 60 * 1000;

export interface HistoricalPricePoint {
  timestamp: Date;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
}

export interface HistoricalPricesResult {
  ticker: string;
  providerSymbol: string;
  source: string;
  currency: string;
  range: HistoryRange;
  interval: HistoryInterval;
  points: HistoricalPricePoint[];
}

interface HistoricalPriceResponse {
  ticker: string;
  range: HistoryRange;
  interval: HistoryInterval;
  source: string;
  currency: string;
  points: Array<HistoricalPricePoint & { timestamp: Date }>;
  lastUpdatedAt: Date | null;
  status: PriceHistoryStatus;
  message?: string;
}

interface BrapiHistoricalPoint {
  date?: number | string;
  timestamp?: number | string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  adjustedClose?: number;
}

interface MarketQuoteInput {
  ticker: string;
  providerSymbol: string;
  price: number;
  quotedAt: Date;
  source: string;
  currency: string;
  market: string;
  assetKind: string;
  errorMessage?: string;
}

interface ProviderRequestAsset {
  asset: AssetRecord;
  profile: TickerProfile;
}

interface MarketDataProvider {
  name: string;
  fetchBatch(items: ProviderRequestAsset[]): Promise<MarketQuoteInput[]>;
  fetchHistoricalPrices(item: ProviderRequestAsset, range: HistoryRange, interval: HistoryInterval): Promise<HistoricalPricesResult>;
}

export function normalizeHistoryRange(input?: string) {
  const normalized = (input ?? "1y").trim().toLowerCase();
  const aliases: Record<string, HistoryRange> = {
    "1m": "1mo",
    "1mo": "1mo",
    "1mes": "1mo",
    "3m": "3mo",
    "3mo": "3mo",
    "6m": "6mo",
    "6mo": "6mo",
    "1a": "1y",
    "1y": "1y",
    "5a": "5y",
    "5y": "5y",
    max: "max"
  };
  const range = aliases[normalized];

  if (!range) throw new Error(`Unsupported history range: ${input}`);

  const intervalByRange: Record<HistoryRange, HistoryInterval> = {
    "1mo": "1d",
    "3mo": "1d",
    "6mo": "1d",
    "1y": "1d",
    "5y": "1wk",
    max: "1mo"
  };

  return { range, interval: intervalByRange[range] };
}

function rangeStartDate(range: HistoryRange, now = new Date()) {
  if (range === "max") return new Date("1900-01-01T00:00:00.000Z");

  const monthsByRange: Record<Exclude<HistoryRange, "max">, number> = {
    "1mo": 1,
    "3mo": 3,
    "6mo": 6,
    "1y": 12,
    "5y": 60
  };
  const start = new Date(now);
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() - monthsByRange[range]);
  return start;
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function parseBrapiTimestamp(value: number | string | undefined): Date | null {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value === "number") {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function validOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function normalizeHistoricalPricePoints(points: BrapiHistoricalPoint[]) {
  const byTimestamp = new Map<number, HistoricalPricePoint>();

  for (const point of points) {
    const timestamp = parseBrapiTimestamp(point.date ?? point.timestamp);
    const close = Number(point.close);

    if (!timestamp || !Number.isFinite(close) || close <= 0) continue;

    byTimestamp.set(timestamp.getTime(), {
      timestamp,
      open: validOptionalNumber(point.open),
      high: validOptionalNumber(point.high),
      low: validOptionalNumber(point.low),
      close,
      volume: validOptionalNumber(point.volume)
    });
  }

  return [...byTimestamp.values()].sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
}

function reducePointsToInterval(points: HistoricalPricePoint[], interval: HistoryInterval) {
  if (interval === "1d") return points;

  const byBucket = new Map<string, HistoricalPricePoint>();

  for (const point of points) {
    const date = point.timestamp;
    const bucket =
      interval === "1mo"
        ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
        : `${date.getUTCFullYear()}-${String(Math.ceil((((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86_400_000) + 1) / 7)).padStart(2, "0")}`;
    byBucket.set(bucket, point);
  }

  return [...byBucket.values()].sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
}

export function mapBrapiStockHistoricalResponse(payload: unknown, fallbackTicker: string, range: HistoryRange, interval: HistoryInterval): HistoricalPricesResult | null {
  const result = (payload as { results?: Array<{ symbol?: string; data?: { usedRange?: string; usedInterval?: string; historicalDataPrice?: BrapiHistoricalPoint[] } }> }).results?.[0];
  const points = normalizeHistoricalPricePoints(result?.data?.historicalDataPrice ?? []);

  if (!result || points.length === 0) return null;

  return {
    ticker: normalizeTicker(result.symbol ?? fallbackTicker),
    providerSymbol: fallbackTicker,
    source: "brapi",
    currency: "BRL",
    range: (result.data?.usedRange as HistoryRange | undefined) ?? range,
    interval: (result.data?.usedInterval as HistoryInterval | undefined) ?? interval,
    points
  };
}

export function mapBrapiFiiHistoricalResponse(payload: unknown, fallbackTicker: string, range: HistoryRange, interval: HistoryInterval): HistoricalPricesResult | null {
  const result = (payload as { fiis?: Array<{ symbol?: string; historicalDataPrice?: BrapiHistoricalPoint[] }> }).fiis?.[0];
  const points = reducePointsToInterval(normalizeHistoricalPricePoints(result?.historicalDataPrice ?? []), interval);

  if (!result || points.length === 0) return null;

  return {
    ticker: normalizeTicker(result.symbol ?? fallbackTicker),
    providerSymbol: fallbackTicker,
    source: "brapi",
    currency: "BRL",
    range,
    interval,
    points
  };
}

class UnavailableMarketDataProvider implements MarketDataProvider {
  name = env.marketDataProvider || "unconfigured";

  async fetchBatch(): Promise<MarketQuoteInput[]> {
    return [];
  }

  async fetchHistoricalPrices(item: ProviderRequestAsset, range: HistoryRange, interval: HistoryInterval): Promise<HistoricalPricesResult> {
    return {
      ticker: item.profile.internalTicker,
      providerSymbol: item.profile.providerSymbol,
      source: this.name,
      currency: item.asset.currency ?? "BRL",
      range,
      interval,
      points: []
    };
  }
}

class BrapiMarketDataProvider implements MarketDataProvider {
  name = "brapi";

  async fetchBatch(items: ProviderRequestAsset[]): Promise<MarketQuoteInput[]> {
    const [b3Quotes, cryptoQuotes] = await Promise.all([this.fetchB3Quotes(items), this.fetchCryptoQuotes(items)]);
    return [...b3Quotes, ...cryptoQuotes];
  }

  async fetchHistoricalPrices(item: ProviderRequestAsset, range: HistoryRange, interval: HistoryInterval): Promise<HistoricalPricesResult> {
    if (item.profile.market !== "b3") {
      return {
        ticker: item.profile.internalTicker,
        providerSymbol: item.profile.providerSymbol,
        source: this.name,
        currency: item.asset.currency ?? "BRL",
        range,
        interval,
        points: []
      };
    }

    try {
      return await this.fetchStockHistoricalPrices(item, range, interval);
    } catch (error) {
      if (item.profile.kind !== "fii") throw error;

      console.warn("Brapi B3 historical endpoint failed for FII, trying FII endpoint fallback", {
        ticker: item.profile.internalTicker,
        providerSymbol: item.profile.providerSymbol,
        message: error instanceof Error ? error.message : "Unknown BRAPI error"
      });

      return this.fetchFiiHistoricalPrices(item, range, interval);
    }
  }

  private async fetchStockHistoricalPrices(item: ProviderRequestAsset, range: HistoryRange, interval: HistoryInterval) {
    const url =
      `https://brapi.dev/api/v2/stocks/historical?symbols=${encodeURIComponent(item.profile.providerSymbol)}` +
      `&range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&sortOrder=asc`;
    const payload = await this.fetchJson<unknown>(url, item.profile.providerSymbol);
    const result = mapBrapiStockHistoricalResponse(payload, item.profile.providerSymbol, range, interval);

    if (!result) throw new Error("BRAPI did not return historical prices for this ticker");

    return result;
  }

  private async fetchFiiHistoricalPrices(item: ProviderRequestAsset, range: HistoryRange, interval: HistoryInterval) {
    const startDate = toDateInput(rangeStartDate(range));
    const endDate = toDateInput(new Date());
    const url =
      `https://brapi.dev/api/v2/fii/historical?symbols=${encodeURIComponent(item.profile.providerSymbol)}` +
      `&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&sortOrder=asc`;
    const payload = await this.fetchJson<unknown>(url, item.profile.providerSymbol);
    const result = mapBrapiFiiHistoricalResponse(payload, item.profile.providerSymbol, range, interval);

    if (!result) throw new Error("BRAPI did not return FII historical prices for this ticker");

    return result;
  }

  private async fetchB3Quotes(items: ProviderRequestAsset[]): Promise<MarketQuoteInput[]> {
    const b3Items = items.filter((item) => item.profile.market === "b3");
    const quotes: MarketQuoteInput[] = [];

    for (const item of b3Items) {
      const url = `https://brapi.dev/api/v2/stocks/quote?symbols=${encodeURIComponent(item.profile.providerSymbol)}`;

      try {
        const payload = await this.fetchJson<{
          results?: Array<{
            requestedSymbol?: string;
            symbol?: string;
            changed?: boolean;
            data?: {
              regularMarketPrice?: number;
              regularMarketTime?: string;
              currency?: string;
            };
          }>;
          requestedAt?: string;
          took?: number;
        }>(url, item.profile.providerSymbol);
        const result = (payload.results ?? [])[0];
        const data = result?.data;
        const ticker = normalizeTicker(String(result?.symbol ?? item.profile.internalTicker));

        console.info("Brapi stock quote parsed", {
          requestedTicker: item.profile.internalTicker,
          providerSymbol: item.profile.providerSymbol,
          returnedTicker: ticker,
          price: data?.regularMarketPrice,
          regularMarketTime: data?.regularMarketTime
        });

        quotes.push({
          ticker,
          providerSymbol: item.profile.providerSymbol,
          price: Number(data?.regularMarketPrice),
          quotedAt: data?.regularMarketTime ? new Date(data.regularMarketTime) : new Date(),
          source: this.name,
          currency: data?.currency ?? "BRL",
          market: item.profile.market,
          assetKind: item.profile.kind
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown BRAPI error";
        console.warn("Brapi stock quote failed", {
          ticker: item.profile.internalTicker,
          providerSymbol: item.profile.providerSymbol,
          message
        });
        quotes.push({
          ticker: item.profile.internalTicker,
          providerSymbol: item.profile.providerSymbol,
          price: Number.NaN,
          quotedAt: new Date(),
          source: this.name,
          currency: item.asset.currency ?? "BRL",
          market: item.profile.market,
          assetKind: item.profile.kind,
          errorMessage: message
        });
      }
    }

    return quotes;
  }

  private async fetchCryptoQuotes(items: ProviderRequestAsset[]): Promise<MarketQuoteInput[]> {
    const cryptoItems = items.filter((item) => item.profile.market === "crypto");
    const quotes: MarketQuoteInput[] = [];

    for (const item of cryptoItems) {
      const url = `https://brapi.dev/api/v2/crypto?coin=${encodeURIComponent(item.profile.providerSymbol)}&currency=BRL`;

      try {
        const payload = await this.fetchJson<{
          coins?: Array<{
            coin?: string;
            regularMarketPrice?: number;
            regularMarketTime?: string;
            currency?: string;
          }>;
        }>(url, item.profile.providerSymbol);
        const coin = (payload.coins ?? [])[0];
        const ticker = normalizeTicker(String(coin?.coin ?? item.profile.internalTicker));

        console.info("Brapi crypto quote parsed", {
          requestedTicker: item.profile.internalTicker,
          providerSymbol: item.profile.providerSymbol,
          returnedTicker: ticker,
          price: coin?.regularMarketPrice,
          regularMarketTime: coin?.regularMarketTime
        });

        quotes.push({
          ticker,
          providerSymbol: item.profile.providerSymbol,
          price: Number(coin?.regularMarketPrice),
          quotedAt: coin?.regularMarketTime ? new Date(coin.regularMarketTime) : new Date(),
          source: this.name,
          currency: coin?.currency ?? "BRL",
          market: "crypto",
          assetKind: "crypto"
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown BRAPI error";
        console.warn("Brapi crypto quote failed", {
          ticker: item.profile.internalTicker,
          providerSymbol: item.profile.providerSymbol,
          message
        });
        quotes.push({
          ticker: item.profile.internalTicker,
          providerSymbol: item.profile.providerSymbol,
          price: Number.NaN,
          quotedAt: new Date(),
          source: this.name,
          currency: item.asset.currency ?? "BRL",
          market: item.profile.market,
          assetKind: item.profile.kind,
          errorMessage: message
        });
      }
    }

    return quotes;
  }

  private async fetchJson<T>(url: string, symbol: string): Promise<T> {
    const token = env.marketDataApiKey.replace(/^Bearer\s+/i, "").trim();

    const result = await this.requestJson(url, symbol, {
      Authorization: `Bearer ${token}`
    });

    if (result.response.ok) return result.payload as T;
    this.throwBrapiError(result.response.status, result.payload);
  }

  private sanitizeUrl(url: string) {
    return url.replace(/([?&]token=)[^&]+/i, "$1***");
  }

  private summarizePayload(payload: unknown) {
    if (!payload || typeof payload !== "object") return payload;

    const data = payload as {
      results?: Array<{ symbol?: string; data?: { historicalDataPrice?: unknown[] } }>;
      fiis?: Array<{ symbol?: string; historicalDataPrice?: unknown[] }>;
      coins?: unknown[];
      error?: unknown;
      message?: unknown;
      code?: unknown;
    };

    if (data.results?.some((item) => item.data?.historicalDataPrice)) {
      return {
        results: data.results.map((item) => ({
          symbol: item.symbol,
          historicalPoints: item.data?.historicalDataPrice?.length ?? 0
        }))
      };
    }

    if (data.fiis?.some((item) => item.historicalDataPrice)) {
      return {
        fiis: data.fiis.map((item) => ({
          symbol: item.symbol,
          historicalPoints: item.historicalDataPrice?.length ?? 0
        }))
      };
    }

    return payload;
  }

  private async requestJson(url: string, symbol: string, headers: Record<string, string>) {
    console.info("Brapi request", { ticker: symbol, url: this.sanitizeUrl(url), auth: headers.Authorization ? "bearer" : "none" });
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(12000)
    });
    const text = await response.text();
    let payload: unknown;

    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text.slice(0, 500) };
    }

    console.info("Brapi response", {
      ticker: symbol,
      url: this.sanitizeUrl(url),
      status: response.status,
      json: this.summarizePayload(payload)
    });

    return { response, payload };
  }

  private throwBrapiError(status: number, payload: unknown): never {
    if (status === 429) throw new Error("Market data rate limit reached");
    const message =
      typeof payload === "object" && payload && "message" in payload ? String((payload as { message?: unknown }).message) : "Market data request failed";
    throw new Error(`Market data request failed with status ${status}: ${message}`);
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
        buildRejectedQuote(item.asset, item.profile, previous, "unavailable", fetched.errorMessage ?? "Provider returned an invalid price", provider.name)
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

function historyStorageSource(source: string, interval: HistoryInterval) {
  return `${source}-history-${interval}`;
}

function toCachedPoint(record: Awaited<ReturnType<typeof listPriceHistory>>[number]): HistoricalPricePoint {
  return {
    timestamp: new Date(record.capturedAt),
    open: record.open,
    high: record.high,
    low: record.low,
    close: record.close ?? record.price,
    volume: record.volume
  };
}

function latestCacheUpdate(records: Awaited<ReturnType<typeof listPriceHistory>>) {
  const timestamps = records
    .map((record) => record.updatedAt ?? record.createdAt)
    .filter(Boolean)
    .map((value) => new Date(value as string | Date).getTime())
    .filter(Number.isFinite);

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps));
}

function cacheIsFresh(records: Awaited<ReturnType<typeof listPriceHistory>>, now = new Date()) {
  const lastUpdatedAt = latestCacheUpdate(records);
  return Boolean(lastUpdatedAt && now.getTime() - lastUpdatedAt.getTime() <= historyCacheTtlMs);
}

function cacheCoversRange(records: Awaited<ReturnType<typeof listPriceHistory>>, range: HistoryRange, now = new Date()) {
  if (records.length === 0) return false;
  if (range === "max") return true;

  const start = rangeStartDate(range, now).getTime();
  const earliest = Math.min(...records.map((record) => new Date(record.capturedAt).getTime()));
  return earliest <= start + 10 * 86_400_000;
}

function buildHistoryResponse(
  asset: AssetRecord,
  range: HistoryRange,
  interval: HistoryInterval,
  source: string,
  status: PriceHistoryStatus,
  records: Awaited<ReturnType<typeof listPriceHistory>>,
  message?: string
): HistoricalPriceResponse {
  return {
    ticker: normalizeTicker(asset.ticker),
    range,
    interval,
    source,
    currency: asset.currency ?? "BRL",
    points: records.map(toCachedPoint).filter((point) => Number.isFinite(point.close) && point.close > 0),
    lastUpdatedAt: latestCacheUpdate(records),
    status,
    message
  };
}

async function listCachedHistoricalPrices(asset: AssetRecord, range: HistoryRange, interval: HistoryInterval) {
  const from = range === "max" ? undefined : rangeStartDate(range);
  return listPriceHistory(asset.ticker, {
    type: "market_history",
    interval,
    from
  });
}

async function persistHistoricalPrices(asset: AssetRecord, profile: TickerProfile, result: HistoricalPricesResult) {
  const source = historyStorageSource(result.source, result.interval);

  for (const point of result.points) {
    await createPriceHistory({
      ticker: profile.internalTicker,
      price: point.close,
      capturedAt: point.timestamp,
      source,
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      volume: point.volume,
      currency: result.currency,
      providerSymbol: result.providerSymbol,
      market: profile.market,
      assetKind: profile.kind,
      type: "market_history",
      interval: result.interval,
      granularity: result.interval
    });
  }
}

export async function getAssetPriceHistory(asset: AssetRecord, requestedRange?: string): Promise<HistoricalPriceResponse> {
  const { range, interval } = normalizeHistoryRange(requestedRange);
  const profile = getTickerProfile(asset);
  const provider = getProvider();
  const cachedRecords = await listCachedHistoricalPrices(asset, range, interval);

  if (!profile.supported || profile.market !== "b3") {
    return cachedRecords.length > 0
      ? buildHistoryResponse(asset, range, interval, provider.name, "stale", cachedRecords, "Asset is not supported by historical price provider")
      : buildHistoryResponse(asset, range, interval, provider.name, "unsupported", [], "Asset is not supported by historical price provider");
  }

  if (cacheIsFresh(cachedRecords) && cacheCoversRange(cachedRecords, range)) {
    return buildHistoryResponse(asset, range, interval, "brapi", "cached", cachedRecords);
  }

  if (!env.marketDataProvider || !env.marketDataApiKey) {
    return cachedRecords.length > 0
      ? buildHistoryResponse(asset, range, interval, provider.name, "stale", cachedRecords, "Market data provider not configured")
      : buildHistoryResponse(asset, range, interval, provider.name, "unavailable", [], "Market data provider not configured");
  }

  try {
    const fetched = await provider.fetchHistoricalPrices({ asset, profile }, range, interval);
    const points = fetched.points.filter((point) => Number.isFinite(point.close) && point.close > 0);

    if (points.length === 0) {
      return cachedRecords.length > 0
        ? buildHistoryResponse(asset, range, interval, fetched.source, "stale", cachedRecords, "Provider returned no valid historical prices")
        : buildHistoryResponse(asset, range, interval, fetched.source, "unavailable", [], "Provider returned no valid historical prices");
    }

    await persistHistoricalPrices(asset, profile, { ...fetched, points });
    const refreshedRecords = await listCachedHistoricalPrices(asset, range, interval);
    return buildHistoryResponse(asset, range, interval, fetched.source, "updated", refreshedRecords.length > 0 ? refreshedRecords : cachedRecords);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown historical price provider error";
    return cachedRecords.length > 0
      ? buildHistoryResponse(asset, range, interval, provider.name, "stale", cachedRecords, message)
      : buildHistoryResponse(asset, range, interval, provider.name, "error", [], message);
  }
}
