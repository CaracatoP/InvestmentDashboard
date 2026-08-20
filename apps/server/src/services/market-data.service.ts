import { env } from "../config/env";
import {
  createPriceHistory,
  findMarketQuoteByAssetKey,
  listAllActiveAssetsForMarketData,
  listAssets,
  listMarketQuotes,
  listPriceHistory,
  upsertMarketQuote
} from "../repositories/investment.repository";
import type { AssetRecord, MarketQuoteRecord } from "../types/investment";
import {
  fetchCoinGeckoMarketChart,
  fetchCoinGeckoMarkets,
  searchCoinGeckoAssets,
  type CoinGeckoSearchResult
} from "./coingecko-client";
import { buildAssetMarketKey, buildStoredMarketDataKey, getTickerProfile, normalizeTicker, type TickerProfile } from "./ticker.service";

type QuoteStatus = MarketQuoteRecord["status"];
type PriceHistoryStatus = "updated" | "cached" | "stale" | "unavailable" | "unsupported" | "error";
export type HistoryRange = "1mo" | "3mo" | "6mo" | "1y" | "5y" | "max";
export type HistoryInterval = "1d" | "1wk" | "1mo";

const defaultHistoryCacheTtlMs: Record<HistoryRange, number> = {
  "1mo": 15 * 60 * 1000,
  "3mo": 30 * 60 * 1000,
  "6mo": 30 * 60 * 1000,
  "1y": 60 * 60 * 1000,
  "5y": 4 * 60 * 60 * 1000,
  max: 8 * 60 * 60 * 1000
};

const historyResponseCache = new Map<string, { response: HistoricalPriceResponse; expiresAt: number }>();
const historyRefreshPromises = new Map<string, Promise<HistoricalPriceResponse>>();

export interface HistoricalPricePoint {
  timestamp: Date;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
  valueInCents?: number;
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
  assetId?: string;
  ticker: string;
  period: HistoryRange;
  range: HistoryRange;
  interval: HistoryInterval;
  source: string;
  currency: string;
  points: Array<HistoricalPricePoint & { timestamp: Date }>;
  lastUpdatedAt: Date | null;
  updatedAt: Date | null;
  cached: boolean;
  status: PriceHistoryStatus;
  message?: string;
}

export interface AssetPriceHistoryRequest {
  period?: string;
  range?: string;
  interval?: string;
  startDate?: string;
  endDate?: string;
  forceRefresh?: boolean;
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
  assetKey: string;
  ticker: string;
  providerSymbol: string;
  price: number;
  quotedAt: Date;
  source: string;
  currency: string;
  market: string;
  assetKind: string;
  errorMessage?: string;
  change24h?: number;
  marketCap?: number;
  volume24h?: number;
  displayName?: string;
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

function configuredMarketProviders() {
  const providers: string[] = [];
  if (env.marketDataProvider.trim() && env.marketDataApiKey.trim()) providers.push(env.marketDataProvider.trim().toLowerCase());
  if (env.coingeckoApiKey.trim()) providers.push("coingecko");
  return providers;
}

function marketProviderLabel() {
  const providers = configuredMarketProviders();
  return providers.length > 0 ? providers.join("+") : "unconfigured";
}

function validOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function dedupeAssetsForMarketData(assets: AssetRecord[]) {
  const byMarketKey = new Map<string, AssetRecord>();

  for (const asset of assets.filter((item) => item.active && item.ticker)) {
    const marketKey = buildAssetMarketKey(asset);
    if (!byMarketKey.has(marketKey)) byMarketKey.set(marketKey, asset);
  }

  return [...byMarketKey.values()];
}

function buildInvalidQuoteInput(item: ProviderRequestAsset, source: string, errorMessage: string): MarketQuoteInput {
  return {
    assetKey: item.profile.marketKey,
    ticker: item.profile.internalTicker,
    providerSymbol: item.profile.providerSymbol,
    price: Number.NaN,
    quotedAt: new Date(),
    source,
    currency: item.asset.currency ?? "BRL",
    market: item.profile.market,
    assetKind: item.profile.kind,
    errorMessage,
    displayName: item.asset.name
  };
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

export function normalizeHistoryInterval(input: string | undefined, fallback: HistoryInterval) {
  if (!input || input.trim() === "") return fallback;

  const normalized = input.trim().toLowerCase();
  const aliases: Record<string, HistoryInterval> = {
    "1d": "1d",
    daily: "1d",
    dia: "1d",
    "1w": "1wk",
    "1wk": "1wk",
    weekly: "1wk",
    semana: "1wk",
    "1m": "1mo",
    "1mo": "1mo",
    monthly: "1mo",
    mes: "1mo"
  };
  const interval = aliases[normalized];
  if (!interval) throw new Error(`Unsupported history interval: ${input}`);
  return interval;
}

function parseHistoryDate(value: string | undefined, boundary: "start" | "end") {
  if (!value) return undefined;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Invalid history ${boundary}Date: ${value}`);

  const date = new Date(`${value}T${boundary === "start" ? "00:00:00.000" : "23:59:59.999"}Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid history ${boundary}Date: ${value}`);
  return date;
}

function normalizeHistoryRequest(input?: string | AssetPriceHistoryRequest) {
  const period = typeof input === "string" ? input : input?.period ?? input?.range;
  const normalized = normalizeHistoryRange(period);
  const interval = normalizeHistoryInterval(typeof input === "string" ? undefined : input?.interval, normalized.interval);
  const startDate = parseHistoryDate(typeof input === "string" ? undefined : input?.startDate, "start");
  const endDate = parseHistoryDate(typeof input === "string" ? undefined : input?.endDate, "end");

  if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
    throw new Error("Invalid history date range: startDate must be before endDate");
  }

  return {
    range: normalized.range,
    interval,
    startDate,
    endDate,
    forceRefresh: typeof input === "string" ? false : Boolean(input?.forceRefresh)
  };
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

function coinGeckoDaysForRange(range: HistoryRange) {
  if (range === "max") return "max";

  const daysByRange: Record<Exclude<HistoryRange, "max">, string> = {
    "1mo": "30",
    "3mo": "90",
    "6mo": "180",
    "1y": "365",
    "5y": "1825"
  };

  return daysByRange[range];
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
  name: string;

  constructor(name = "unavailable") {
    this.name = name;
  }

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
    return this.fetchB3Quotes(items.filter((item) => item.profile.market === "b3"));
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
    const quotes: MarketQuoteInput[] = [];

    for (const item of items) {
      const url = `https://brapi.dev/api/v2/stocks/quote?symbols=${encodeURIComponent(item.profile.providerSymbol)}`;

      try {
        const payload = await this.fetchJson<{
          results?: Array<{
            symbol?: string;
            data?: {
              regularMarketPrice?: number;
              regularMarketTime?: string;
              currency?: string;
            };
          }>;
        }>(url, item.profile.providerSymbol);
        const result = (payload.results ?? [])[0];
        const data = result?.data;

        quotes.push({
          assetKey: item.profile.marketKey,
          ticker: normalizeTicker(String(result?.symbol ?? item.profile.internalTicker)),
          providerSymbol: item.profile.providerSymbol,
          price: Number(data?.regularMarketPrice),
          quotedAt: data?.regularMarketTime ? new Date(data.regularMarketTime) : new Date(),
          source: this.name,
          currency: data?.currency ?? "BRL",
          market: item.profile.market,
          assetKind: item.profile.kind,
          displayName: item.asset.name
        });
      } catch (error) {
        quotes.push(buildInvalidQuoteInput(item, this.name, error instanceof Error ? error.message : "Unknown BRAPI error"));
      }
    }

    return quotes;
  }

  private async fetchJson<T>(url: string, symbol: string): Promise<T> {
    const token = env.marketDataApiKey.replace(/^Bearer\s+/i, "").trim();
    if (!token) throw new Error("Market data provider not configured");

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
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
      status: response.status,
      payload: typeof payload === "object" ? payload : String(payload)
    });

    if (response.ok) return payload as T;
    if (response.status === 429) throw new Error("Market data rate limit reached");
    const message =
      typeof payload === "object" && payload && "message" in payload ? String((payload as { message?: unknown }).message) : "Market data request failed";
    throw new Error(`Market data request failed with status ${response.status}: ${message}`);
  }
}

class CoinGeckoMarketDataProvider implements MarketDataProvider {
  name = "coingecko";

  async fetchBatch(items: ProviderRequestAsset[]): Promise<MarketQuoteInput[]> {
    const cryptoItems = items.filter((item) => item.profile.market === "crypto");
    if (cryptoItems.length === 0) return [];
    if (!env.coingeckoApiKey.trim()) {
      return cryptoItems.map((item) => buildInvalidQuoteInput(item, this.name, "CoinGecko API key not configured"));
    }

    try {
      const markets = await fetchCoinGeckoMarkets(cryptoItems.map((item) => item.profile.providerSymbol));
      const marketById = new Map(markets.map((market) => [market.coingeckoId, market]));

      return cryptoItems.map((item) => {
        const market = marketById.get(item.profile.providerSymbol);
        if (!market) return buildInvalidQuoteInput(item, this.name, "CoinGecko did not return this asset");

        return {
          assetKey: item.profile.marketKey,
          ticker: item.profile.internalTicker,
          providerSymbol: item.profile.providerSymbol,
          price: market.currentPrice,
          quotedAt: market.lastUpdatedAt ?? new Date(),
          source: this.name,
          currency: "BRL",
          market: item.profile.market,
          assetKind: item.profile.kind,
          displayName: market.name,
          change24h: market.priceChange24h,
          marketCap: market.marketCap,
          volume24h: market.volume24h
        };
      });
    } catch (error) {
      return cryptoItems.map((item) => buildInvalidQuoteInput(item, this.name, error instanceof Error ? error.message : "Unknown CoinGecko error"));
    }
  }

  async fetchHistoricalPrices(item: ProviderRequestAsset, range: HistoryRange, interval: HistoryInterval): Promise<HistoricalPricesResult> {
    if (item.profile.market !== "crypto") {
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

    const chartPoints = await fetchCoinGeckoMarketChart(item.profile.providerSymbol, coinGeckoDaysForRange(range));
    const reducedPoints = reducePointsToInterval(
      chartPoints.map((point) => ({
        timestamp: point.timestamp,
        close: point.price,
        volume: point.volume
      })),
      interval
    );

    if (reducedPoints.length === 0) throw new Error("CoinGecko did not return historical prices for this asset");

    return {
      ticker: item.profile.internalTicker,
      providerSymbol: item.profile.providerSymbol,
      source: this.name,
      currency: "BRL",
      range,
      interval,
      points: reducedPoints
    };
  }
}

class RoutedMarketDataProvider implements MarketDataProvider {
  name = marketProviderLabel();
  private readonly b3Provider: MarketDataProvider;
  private readonly cryptoProvider: MarketDataProvider;

  constructor() {
    this.b3Provider = env.marketDataProvider.trim().toLowerCase() === "brapi" ? new BrapiMarketDataProvider() : new UnavailableMarketDataProvider(env.marketDataProvider || "b3-unconfigured");
    this.cryptoProvider = new CoinGeckoMarketDataProvider();
  }

  async fetchBatch(items: ProviderRequestAsset[]): Promise<MarketQuoteInput[]> {
    const b3Items = items.filter((item) => item.profile.market === "b3");
    const cryptoItems = items.filter((item) => item.profile.market === "crypto");
    const [b3Quotes, cryptoQuotes] = await Promise.all([
      this.safeFetch(this.b3Provider, b3Items),
      this.safeFetch(this.cryptoProvider, cryptoItems)
    ]);

    return [...b3Quotes, ...cryptoQuotes];
  }

  async fetchHistoricalPrices(item: ProviderRequestAsset, range: HistoryRange, interval: HistoryInterval): Promise<HistoricalPricesResult> {
    if (item.profile.market === "crypto") return this.cryptoProvider.fetchHistoricalPrices(item, range, interval);
    if (item.profile.market === "b3") return this.b3Provider.fetchHistoricalPrices(item, range, interval);

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

  private async safeFetch(provider: MarketDataProvider, items: ProviderRequestAsset[]) {
    if (items.length === 0) return [];

    try {
      return await provider.fetchBatch(items);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Unknown ${provider.name} error`;
      return items.map((item) => buildInvalidQuoteInput(item, provider.name, message));
    }
  }
}

function getProvider(): MarketDataProvider {
  return new RoutedMarketDataProvider();
}

function storedQuoteKey(quote: Pick<MarketQuoteRecord, "assetKey" | "ticker" | "market" | "providerSymbol">) {
  return quote.assetKey?.trim() || buildStoredMarketDataKey(quote);
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
    assetKey: profile.marketKey,
    ticker: profile.internalTicker,
    providerSymbol: profile.providerSymbol,
    price: hasPrevious ? previous?.price : null,
    quotedAt: hasPrevious ? (previous?.quotedAt ?? new Date()) : new Date(),
    source: hasPrevious ? (previous?.source ?? providerName) : providerName,
    currency: previous?.currency ?? asset.currency ?? "BRL",
    status: hasPrevious ? "stale" : status,
    errorMessage,
    market: profile.market,
    assetKind: profile.kind,
    change24h: previous?.change24h,
    marketCap: previous?.marketCap,
    volume24h: previous?.volume24h,
    displayName: previous?.displayName ?? asset.name
  };
}

function buildUpdatedQuote(quote: MarketQuoteInput): Omit<MarketQuoteRecord, "id"> {
  return {
    assetKey: quote.assetKey,
    ticker: quote.ticker,
    providerSymbol: quote.providerSymbol,
    price: quote.price,
    quotedAt: quote.quotedAt,
    source: quote.source,
    currency: quote.currency,
    status: "updated",
    errorMessage: "",
    market: quote.market,
    assetKind: quote.assetKind,
    change24h: quote.change24h,
    marketCap: quote.marketCap,
    volume24h: quote.volume24h,
    displayName: quote.displayName
  };
}

async function persistQuoteSnapshot(item: ProviderRequestAsset, quote: MarketQuoteInput) {
  await createPriceHistory({
    assetKey: quote.assetKey,
    ticker: item.profile.internalTicker,
    price: quote.price,
    capturedAt: quote.quotedAt,
    source: quote.source,
    currency: quote.currency,
    providerSymbol: quote.providerSymbol,
    market: quote.market,
    assetKind: quote.assetKind,
    type: "intraday_snapshot",
    interval: "snapshot",
    granularity: "snapshot"
  });
}

async function refreshMarketQuotesForAssets(assets: AssetRecord[]) {
  const provider = getProvider();
  const activeAssets = dedupeAssetsForMarketData(assets);
  const previousQuotes = new Map((await listMarketQuotes()).map((quote) => [storedQuoteKey(quote), quote]));
  const requestItems = activeAssets.map((asset) => ({ asset, profile: getTickerProfile(asset) }));
  const supportedItems = requestItems.filter((item) => item.profile.supported);
  const unsupportedItems = requestItems.filter((item) => !item.profile.supported);
  const fetchedQuotes = await provider.fetchBatch(supportedItems);
  const fetchedByKey = new Map(fetchedQuotes.map((quote) => [quote.assetKey, quote]));

  let updated = 0;
  let stale = 0;
  let failed = 0;
  let unsupported = 0;
  const quotes: MarketQuoteRecord[] = [];

  for (const item of unsupportedItems) {
    unsupported += 1;
    failed += 1;
    const savedQuote = await upsertMarketQuote(
      buildRejectedQuote(
        item.asset,
        item.profile,
        previousQuotes.get(item.profile.marketKey),
        "unsupported",
        item.profile.market === "crypto" ? "Crypto asset is missing CoinGecko identifier" : "Asset type is not supported by market data provider",
        provider.name
      )
    );
    quotes.push(savedQuote);
  }

  for (const item of supportedItems) {
    const fetched = fetchedByKey.get(item.profile.marketKey);
    const previous = previousQuotes.get(item.profile.marketKey);

    if (!fetched) {
      const savedQuote = await upsertMarketQuote(
        buildRejectedQuote(item.asset, item.profile, previous, "unavailable", "Provider did not return this asset", provider.name)
      );
      if (savedQuote.status === "stale") stale += 1;
      else failed += 1;
      quotes.push(savedQuote);
      continue;
    }

    if (!isValidMarketPrice(fetched.price)) {
      const savedQuote = await upsertMarketQuote(
        buildRejectedQuote(item.asset, item.profile, previous, "unavailable", fetched.errorMessage ?? "Provider returned an invalid price", fetched.source || provider.name)
      );
      if (savedQuote.status === "stale") stale += 1;
      else failed += 1;
      quotes.push(savedQuote);
      continue;
    }

    updated += 1;
    const savedQuote = await upsertMarketQuote(buildUpdatedQuote(fetched));
    await persistQuoteSnapshot(item, fetched);
    quotes.push(savedQuote);
  }

  return {
    provider: provider.name,
    refreshedAt: new Date(),
    total: requestItems.length,
    requested: supportedItems.length,
    updated,
    stale,
    failed,
    unsupported,
    quotes
  };
}

export async function refreshMarketQuotes() {
  return refreshMarketQuotesForAssets(await listAssets());
}

export async function refreshAllMarketQuotes() {
  return refreshMarketQuotesForAssets(await listAllActiveAssetsForMarketData());
}

export async function searchCryptoAssets(query: string, limit = 10): Promise<CoinGeckoSearchResult[]> {
  return searchCoinGeckoAssets(query, limit);
}

export async function getMarketQuoteSnapshot(asset: AssetRecord, options: { refreshIfMissing?: boolean } = {}) {
  const profile = getTickerProfile(asset);
  const previous = await findMarketQuoteByAssetKey(profile.marketKey);

  if (isValidStoredQuote(previous)) return previous;
  if (options.refreshIfMissing === false) return previous;
  if (!profile.supported) return buildRejectedQuote(asset, profile, previous, "unsupported", "Asset is missing provider identity");

  const provider = getProvider();
  const fetched = await provider.fetchBatch([{ asset, profile }]);
  const quote = fetched[0];

  if (quote && isValidMarketPrice(quote.price)) {
    const saved = await upsertMarketQuote(buildUpdatedQuote(quote));
    await persistQuoteSnapshot({ asset, profile }, quote);
    return saved;
  }

  const rejected = buildRejectedQuote(asset, profile, previous, previous ? "stale" : "unavailable", quote?.errorMessage ?? "Provider did not return a valid quote", provider.name);
  return upsertMarketQuote(rejected);
}

export async function getMarketStatus() {
  const [assets, allQuotes] = await Promise.all([listAssets(), listMarketQuotes()]);
  const userAssetKeys = new Set(assets.map((asset) => buildAssetMarketKey(asset)));
  const quotes = allQuotes.filter((quote) => userAssetKeys.has(storedQuoteKey(quote)));
  const validQuotes = quotes.filter((quote) => isValidMarketPrice(quote.price));
  const lastQuote = [...validQuotes].sort((left, right) => new Date(right.quotedAt).getTime() - new Date(left.quotedAt).getTime())[0];

  return {
    provider: marketProviderLabel(),
    timezone: env.marketTimezone,
    refreshHours: env.marketRefreshHours,
    lastUpdatedAt: lastQuote?.quotedAt ?? null,
    connected: configuredMarketProviders().length > 0,
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

function getHistoryCacheTtlMs(range: HistoryRange) {
  if (Number.isFinite(env.marketHistoryCacheTtlMinutes) && env.marketHistoryCacheTtlMinutes >= 0) {
    return env.marketHistoryCacheTtlMinutes * 60 * 1000;
  }

  return defaultHistoryCacheTtlMs[range];
}

function buildHistoryCacheKey(asset: AssetRecord, profile: TickerProfile, range: HistoryRange, interval: HistoryInterval, startDate?: Date, endDate?: Date) {
  return [
    "asset-history",
    asset.id ?? profile.marketKey,
    profile.marketKey,
    range,
    interval,
    startDate ? toDateInput(startDate) : "",
    endDate ? toDateInput(endDate) : ""
  ].join(":");
}

function cloneHistoryResponse(response: HistoricalPriceResponse, status: PriceHistoryStatus = response.status): HistoricalPriceResponse {
  return {
    ...response,
    status,
    cached: status === "cached" || status === "stale",
    points: response.points.map((point) => ({ ...point, timestamp: new Date(point.timestamp) }))
  };
}

function rememberHistoryResponse(cacheKey: string, response: HistoricalPriceResponse, range: HistoryRange) {
  historyResponseCache.set(cacheKey, {
    response: cloneHistoryResponse(response),
    expiresAt: Date.now() + getHistoryCacheTtlMs(range)
  });
}

export function clearAssetHistoryCacheForTests() {
  historyResponseCache.clear();
  historyRefreshPromises.clear();
}

function cacheIsFresh(records: Awaited<ReturnType<typeof listPriceHistory>>, range: HistoryRange, now = new Date()) {
  const lastUpdatedAt = latestCacheUpdate(records);
  return Boolean(lastUpdatedAt && now.getTime() - lastUpdatedAt.getTime() <= getHistoryCacheTtlMs(range));
}

function cacheCoversRange(records: Awaited<ReturnType<typeof listPriceHistory>>, range: HistoryRange, now = new Date(), startDate?: Date) {
  if (records.length === 0) return false;
  if (range === "max") return true;

  const start = (startDate ?? rangeStartDate(range, now)).getTime();
  const earliest = Math.min(...records.map((record) => new Date(record.capturedAt).getTime()));
  return earliest <= start + 10 * 86_400_000;
}

function buildHistoryResponse(
  asset: AssetRecord,
  profile: TickerProfile,
  range: HistoryRange,
  interval: HistoryInterval,
  source: string,
  status: PriceHistoryStatus,
  records: Awaited<ReturnType<typeof listPriceHistory>>,
  message?: string
): HistoricalPriceResponse {
  const lastUpdatedAt = latestCacheUpdate(records);
  return {
    assetId: asset.id,
    ticker: normalizeTicker(asset.ticker),
    period: range,
    range,
    interval,
    source,
    currency: asset.currency ?? "BRL",
    points: records
      .map(toCachedPoint)
      .filter((point) => Number.isFinite(point.close) && point.close > 0)
      .map((point) => ({ ...point, valueInCents: Math.round(point.close * 100) })),
    lastUpdatedAt,
    updatedAt: lastUpdatedAt,
    cached: status === "cached" || status === "stale",
    status,
    message
  };
}

async function listCachedHistoricalPrices(asset: AssetRecord, profile: TickerProfile, range: HistoryRange, interval: HistoryInterval, startDate?: Date, endDate?: Date) {
  const from = startDate ?? (range === "max" ? undefined : rangeStartDate(range));
  const byAssetKey = await listPriceHistory(undefined, {
    assetKey: profile.marketKey,
    type: "market_history",
    interval,
    from,
    to: endDate
  });

  if (byAssetKey.length > 0) return byAssetKey;

  return listPriceHistory(asset.ticker, {
    type: "market_history",
    interval,
    from,
    to: endDate
  });
}

async function persistHistoricalPrices(asset: AssetRecord, profile: TickerProfile, result: HistoricalPricesResult) {
  const source = historyStorageSource(result.source, result.interval);

  for (const point of result.points) {
    await createPriceHistory({
      assetKey: profile.marketKey,
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

async function refreshHistoricalPrices(input: {
  asset: AssetRecord;
  profile: TickerProfile;
  provider: MarketDataProvider;
  range: HistoryRange;
  interval: HistoryInterval;
  startDate?: Date;
  endDate?: Date;
  cachedRecords: Awaited<ReturnType<typeof listPriceHistory>>;
  cacheKey: string;
  requestedAt: number;
}) {
  const { asset, profile, provider, range, interval, startDate, endDate, cachedRecords, cacheKey, requestedAt } = input;

  try {
    const providerStartedAt = Date.now();
    const fetched = await provider.fetchHistoricalPrices({ asset, profile }, range, interval);
    const providerDurationMs = Date.now() - providerStartedAt;
    const points = fetched.points.filter((point) => Number.isFinite(point.close) && point.close > 0);

    if (points.length === 0) {
      const response = cachedRecords.length > 0
        ? buildHistoryResponse(asset, profile, range, interval, fetched.source, "stale", cachedRecords, "Provider returned no valid historical prices")
        : buildHistoryResponse(asset, profile, range, interval, fetched.source, "unavailable", [], "Provider returned no valid historical prices");
      rememberHistoryResponse(cacheKey, response, range);
      return response;
    }

    await persistHistoricalPrices(asset, profile, { ...fetched, points });
    const refreshedRecords = await listCachedHistoricalPrices(asset, profile, range, interval, startDate, endDate);
    const response = buildHistoryResponse(asset, profile, range, interval, fetched.source, "updated", refreshedRecords.length > 0 ? refreshedRecords : cachedRecords);
    rememberHistoryResponse(cacheKey, response, range);
    console.info("Asset history provider refresh", {
      assetId: asset.id,
      ticker: normalizeTicker(asset.ticker),
      period: range,
      interval,
      cache: "miss",
      points: response.points.length,
      providerDurationMs,
      durationMs: Date.now() - requestedAt
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown historical price provider error";
    const response = cachedRecords.length > 0
      ? buildHistoryResponse(asset, profile, range, interval, provider.name, "stale", cachedRecords, message)
      : buildHistoryResponse(asset, profile, range, interval, provider.name, "error", [], message);
    rememberHistoryResponse(cacheKey, response, range);
    return response;
  }
}

function scheduleHistoricalRefresh(input: Parameters<typeof refreshHistoricalPrices>[0]) {
  const existing = historyRefreshPromises.get(input.cacheKey);
  if (existing) return existing;

  const promise = refreshHistoricalPrices(input)
    .catch((error) => {
      console.warn("Asset history background refresh failed", {
        assetId: input.asset.id,
        ticker: normalizeTicker(input.asset.ticker),
        period: input.range,
        interval: input.interval,
        message: error instanceof Error ? error.message : "Unknown historical refresh error"
      });
      return buildHistoryResponse(input.asset, input.profile, input.range, input.interval, input.provider.name, "stale", input.cachedRecords, "Background refresh failed");
    })
    .finally(() => {
      historyRefreshPromises.delete(input.cacheKey);
    });

  historyRefreshPromises.set(input.cacheKey, promise);
  return promise;
}

function logHistoryResponse(input: {
  asset: AssetRecord;
  range: HistoryRange;
  interval: HistoryInterval;
  cache: "hit" | "persistent-hit" | "stale" | "miss" | "unsupported" | "deduped";
  response: HistoricalPriceResponse;
  startedAt: number;
}) {
  console.info("Asset history response", {
    assetId: input.asset.id,
    ticker: normalizeTicker(input.asset.ticker),
    period: input.range,
    interval: input.interval,
    cache: input.cache,
    status: input.response.status,
    points: input.response.points.length,
    durationMs: Date.now() - input.startedAt
  });
}

export async function getAssetPriceHistory(asset: AssetRecord, requestedRange?: string | AssetPriceHistoryRequest): Promise<HistoricalPriceResponse> {
  const startedAt = Date.now();
  const { range, interval, startDate, endDate, forceRefresh } = normalizeHistoryRequest(requestedRange);
  const profile = getTickerProfile(asset);
  const provider = getProvider();
  const cacheKey = buildHistoryCacheKey(asset, profile, range, interval, startDate, endDate);
  const memoryCache = historyResponseCache.get(cacheKey);

  if (!forceRefresh && memoryCache && Date.now() <= memoryCache.expiresAt) {
    const response = cloneHistoryResponse(memoryCache.response, "cached");
    logHistoryResponse({ asset, range, interval, cache: "hit", response, startedAt });
    return response;
  }

  const cachedRecords = await listCachedHistoricalPrices(asset, profile, range, interval, startDate, endDate);
  const supportsHistory = profile.supported && profile.market !== "unsupported";

  if (!supportsHistory) {
    const response = cachedRecords.length > 0
      ? buildHistoryResponse(asset, profile, range, interval, provider.name, "stale", cachedRecords, "Asset is not supported by historical price provider")
      : buildHistoryResponse(asset, profile, range, interval, provider.name, "unsupported", [], "Asset is not supported by historical price provider");
    rememberHistoryResponse(cacheKey, response, range);
    logHistoryResponse({ asset, range, interval, cache: "unsupported", response, startedAt });
    return response;
  }

  const hasUsablePersistentCache = cachedRecords.length > 0 && cacheCoversRange(cachedRecords, range, new Date(), startDate);
  const persistentCacheIsFresh = hasUsablePersistentCache && cacheIsFresh(cachedRecords, range);

  if (!forceRefresh && persistentCacheIsFresh) {
    const response = buildHistoryResponse(asset, profile, range, interval, provider.name, "cached", cachedRecords);
    rememberHistoryResponse(cacheKey, response, range);
    logHistoryResponse({ asset, range, interval, cache: "persistent-hit", response, startedAt });
    return response;
  }

  if (!forceRefresh && hasUsablePersistentCache) {
    const response = buildHistoryResponse(asset, profile, range, interval, provider.name, "stale", cachedRecords, "Exibindo dados salvos enquanto o historico atualiza em segundo plano.");
    rememberHistoryResponse(cacheKey, response, range);
    void scheduleHistoricalRefresh({ asset, profile, provider, range, interval, startDate, endDate, cachedRecords, cacheKey, requestedAt: startedAt });
    logHistoryResponse({ asset, range, interval, cache: "stale", response, startedAt });
    return response;
  }

  const refreshInput = { asset, profile, provider, range, interval, startDate, endDate, cachedRecords, cacheKey, requestedAt: startedAt };
  const existingRefresh = historyRefreshPromises.get(cacheKey);
  const response = existingRefresh ? await existingRefresh : await scheduleHistoricalRefresh(refreshInput);
  logHistoryResponse({ asset, range, interval, cache: existingRefresh ? "deduped" : "miss", response, startedAt });
  return response;
}
