import { env } from "../config/env";
import {
  findKnownCryptoByQuery,
  listKnownCryptoAssets,
  normalizeCoinGeckoId,
  normalizeTicker
} from "./ticker.service";

const coinListCacheTtlMs = 24 * 60 * 60 * 1000;
const maxSimplePriceIdsPerRequest = 250;
const requestTimeoutMs = 12_000;

const coinListCache = {
  results: null as CoinGeckoCoinListItem[] | null,
  expiresAt: 0
};
const searchCache = new Map<string, { results: CoinGeckoSearchResult[]; expiresAt: number }>();
const priceCache = new Map<string, { snapshot: CoinGeckoPriceSnapshot; expiresAt: number }>();
const pendingPriceRequests = new Map<string, Promise<CoinGeckoPriceSnapshot[]>>();

export type CoinGeckoErrorCode =
  | "not_configured"
  | "rate_limited"
  | "auth_failed"
  | "not_found"
  | "server_error"
  | "timeout"
  | "network_error"
  | "invalid_response"
  | "request_failed";

export class CoinGeckoClientError extends Error {
  code: CoinGeckoErrorCode;
  status?: number;
  retryable: boolean;

  constructor(message: string, options: { code: CoinGeckoErrorCode; status?: number; retryable?: boolean }) {
    super(message);
    this.name = "CoinGeckoClientError";
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

export interface CoinGeckoSearchResult {
  coingeckoId: string;
  name: string;
  symbol: string;
  marketProvider: "coingecko";
  imageUrl?: string;
}

interface CoinGeckoCoinListItem {
  id: string;
  symbol: string;
  name: string;
}

export interface CoinGeckoPriceSnapshot {
  coingeckoId: string;
  symbol: string;
  name: string;
  currency: string;
  price: number;
  change24h?: number;
  marketCap?: number;
  volume24h?: number;
  lastUpdatedAt: Date;
  source: "coingecko";
  stale: boolean;
  errorMessage?: string;
}

export interface CoinGeckoMarketSnapshot {
  coingeckoId: string;
  name: string;
  symbol: string;
  currentPrice: number;
  priceChange24h?: number;
  marketCap?: number;
  volume24h?: number;
  lastUpdatedAt: Date | null;
  stale?: boolean;
  errorMessage?: string;
}

export interface CoinGeckoMarketChartPoint {
  timestamp: Date;
  price: number;
  volume?: number;
}

export type CoinGeckoResolution =
  | { status: "resolved"; result: CoinGeckoSearchResult }
  | { status: "ambiguous"; results: CoinGeckoSearchResult[] }
  | { status: "not_found"; results: [] };

function getBaseUrl() {
  return env.coingeckoApiBaseUrl.trim().replace(/\/+$/, "");
}

function isProBaseUrl(baseUrl: string) {
  return /pro-api\.coingecko\.com/i.test(baseUrl);
}

function isConfigured() {
  return env.coingeckoApiKey.trim().length > 0;
}

function getPriceCacheTtlMs() {
  return Math.max(0, env.coingeckoPriceCacheTtlSeconds * 1000);
}

function buildHeaders() {
  const baseUrl = getBaseUrl();
  const headerName = isProBaseUrl(baseUrl) ? "x-cg-pro-api-key" : "x-cg-demo-api-key";

  return {
    Accept: "application/json",
    [headerName]: env.coingeckoApiKey.trim()
  } satisfies Record<string, string>;
}

function extractPayloadMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const candidate = payload as { error?: unknown; message?: unknown; status?: unknown };
  if (typeof candidate.error === "string" && candidate.error.trim()) return candidate.error;
  if (typeof candidate.message === "string" && candidate.message.trim()) return candidate.message;
  if (typeof candidate.status === "string" && candidate.status.trim()) return candidate.status;
  if (candidate.status && typeof candidate.status === "object" && "error_message" in candidate.status) {
    return String((candidate.status as { error_message?: unknown }).error_message ?? "");
  }
  return "";
}

function toFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toPositiveNumber(value: unknown) {
  const number = toFiniteNumber(value);
  return number && number > 0 ? number : undefined;
}

function chunk<T>(items: T[], size: number) {
  const parts: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    parts.push(items.slice(index, index + size));
  }

  return parts;
}

function canonicalVsCurrency(value = "brl") {
  return value.trim().toLowerCase() || "brl";
}

function priceCacheKey(coingeckoId: string, vsCurrency = "brl") {
  return `${normalizeCoinGeckoId(coingeckoId)}:${canonicalVsCurrency(vsCurrency)}`;
}

function knownAssetForId(coingeckoId: string) {
  const normalizedId = normalizeCoinGeckoId(coingeckoId);
  return listKnownCryptoAssets().find((asset) => asset.coingeckoId === normalizedId) ?? null;
}

function displayIdentityForId(coingeckoId: string) {
  const known = knownAssetForId(coingeckoId);
  return {
    name: known?.name ?? coingeckoId,
    symbol: known?.symbol ?? normalizeTicker(coingeckoId.slice(0, 8))
  };
}

function logCoinGeckoOperation(input: {
  operation: string;
  coinCount: number;
  cacheHitCount?: number;
  cacheMissCount?: number;
  status: string;
  staleFallback?: number;
  durationMs: number;
}) {
  console.info("CoinGecko provider", {
    provider: "coingecko",
    operation: input.operation,
    coinCount: input.coinCount,
    cacheHitCount: input.cacheHitCount ?? 0,
    cacheMissCount: input.cacheMissCount ?? 0,
    status: input.status,
    staleFallback: input.staleFallback ?? 0,
    durationMs: input.durationMs
  });
}

async function requestCoinGeckoJson<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
  options: { retry?: boolean } = {}
) {
  if (!isConfigured()) {
    throw new CoinGeckoClientError("CoinGecko API key not configured", { code: "not_configured" });
  }

  const url = new URL(`${getBaseUrl()}/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const startedAt = Date.now();
  const fetchOnce = async () => {
    try {
      const response = await fetch(url, {
        headers: buildHeaders(),
        signal: AbortSignal.timeout(requestTimeoutMs)
      });
      const text = await response.text();
      let payload: unknown = {};

      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        throw new CoinGeckoClientError("CoinGecko returned invalid JSON", {
          code: "invalid_response",
          status: response.status,
          retryable: response.status >= 500
        });
      }

      if (response.ok) return payload as T;

      const message = extractPayloadMessage(payload);
      if (response.status === 429) {
        throw new CoinGeckoClientError("CoinGecko rate limit reached", { code: "rate_limited", status: 429, retryable: false });
      }
      if (response.status === 401 || response.status === 403) {
        throw new CoinGeckoClientError("CoinGecko authentication failed", { code: "auth_failed", status: response.status });
      }
      if (response.status === 404) {
        throw new CoinGeckoClientError("CoinGecko resource not found", { code: "not_found", status: 404 });
      }
      if (response.status >= 500) {
        throw new CoinGeckoClientError(message || "CoinGecko server error", {
          code: "server_error",
          status: response.status,
          retryable: true
        });
      }

      throw new CoinGeckoClientError(message ? `CoinGecko request failed: ${message}` : "CoinGecko request failed", {
        code: "request_failed",
        status: response.status
      });
    } catch (error) {
      if (error instanceof CoinGeckoClientError) throw error;
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new CoinGeckoClientError("CoinGecko request timed out", { code: "timeout", retryable: true });
      }
      throw new CoinGeckoClientError(error instanceof Error ? error.message : "CoinGecko network error", {
        code: "network_error",
        retryable: true
      });
    }
  };

  try {
    return await fetchOnce();
  } catch (error) {
    if (options.retry !== false && error instanceof CoinGeckoClientError && error.retryable && error.code !== "rate_limited") {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return fetchOnce();
    }

    throw error;
  } finally {
    if (env.performanceLogs) {
      console.info("CoinGecko request finished", {
        provider: "coingecko",
        path: url.pathname,
        status: "done",
        durationMs: Date.now() - startedAt
      });
    }
  }
}

function normalizeCoinList(payload: unknown): CoinGeckoCoinListItem[] {
  if (!Array.isArray(payload)) {
    throw new CoinGeckoClientError("CoinGecko coins list has invalid shape", { code: "invalid_response" });
  }

  return payload
    .filter((coin): coin is { id: string; symbol: string; name: string } =>
      Boolean(
        coin &&
          typeof coin === "object" &&
          typeof (coin as { id?: unknown }).id === "string" &&
          typeof (coin as { symbol?: unknown }).symbol === "string" &&
          typeof (coin as { name?: unknown }).name === "string"
      )
    )
    .map((coin) => ({
      id: normalizeCoinGeckoId(coin.id),
      symbol: normalizeTicker(coin.symbol),
      name: coin.name.trim()
    }));
}

export function clearCoinGeckoCachesForTests() {
  coinListCache.results = null;
  coinListCache.expiresAt = 0;
  searchCache.clear();
  priceCache.clear();
  pendingPriceRequests.clear();
}

export function clearCoinGeckoSearchCacheForTests() {
  searchCache.clear();
  coinListCache.results = null;
  coinListCache.expiresAt = 0;
}

export async function fetchCoinGeckoCoinList() {
  if (coinListCache.results && coinListCache.expiresAt >= Date.now()) return coinListCache.results;

  const payload = await requestCoinGeckoJson<unknown[]>("/coins/list");
  const results = normalizeCoinList(payload);
  coinListCache.results = results;
  coinListCache.expiresAt = Date.now() + coinListCacheTtlMs;
  return results;
}

function toSearchResult(coin: CoinGeckoCoinListItem): CoinGeckoSearchResult {
  return {
    coingeckoId: coin.id,
    name: coin.name,
    symbol: normalizeTicker(coin.symbol),
    marketProvider: "coingecko"
  };
}

function rankCoinListResult(query: string, coin: CoinGeckoCoinListItem) {
  const normalizedQuery = query.toLowerCase();
  const normalizedId = normalizeCoinGeckoId(query);
  const name = coin.name.toLowerCase();
  const symbol = coin.symbol.toLowerCase();

  if (coin.id === normalizedId) return 0;
  if (symbol === normalizedQuery) return 1;
  if (name === normalizedQuery) return 2;
  if (coin.id.startsWith(normalizedId)) return 3;
  if (name.startsWith(normalizedQuery)) return 4;
  if (symbol.includes(normalizedQuery)) return 5;
  if (name.includes(normalizedQuery) || coin.id.includes(normalizedId)) return 6;
  return 99;
}

export async function searchCoinGeckoAssets(query: string, limit = 10): Promise<CoinGeckoSearchResult[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) return [];

  const cacheKey = `${normalizedQuery.toLowerCase()}:${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt >= Date.now()) return cached.results;

  const known = findKnownCryptoByQuery(normalizedQuery);
  const results = new Map<string, CoinGeckoSearchResult>();
  if (known) {
    results.set(known.coingeckoId, {
      coingeckoId: known.coingeckoId,
      name: known.name,
      symbol: known.symbol,
      marketProvider: "coingecko"
    });
  }

  const list = await fetchCoinGeckoCoinList();
  const ranked = list
    .map((coin) => ({ coin, rank: rankCoinListResult(normalizedQuery, coin) }))
    .filter((entry) => entry.rank < 99)
    .sort((left, right) => left.rank - right.rank || left.coin.name.localeCompare(right.coin.name, "pt-BR"))
    .slice(0, Math.max(limit * 2, limit));

  for (const entry of ranked) {
    if (results.size >= limit) break;
    results.set(entry.coin.id, toSearchResult(entry.coin));
  }

  const finalResults = [...results.values()].slice(0, limit);
  searchCache.set(cacheKey, { results: finalResults, expiresAt: Date.now() + coinListCacheTtlMs });
  return finalResults;
}

export async function resolveCoinGeckoAsset(query: string): Promise<CoinGeckoResolution> {
  const normalizedQuery = query.trim();
  const known = findKnownCryptoByQuery(normalizedQuery);
  if (known) {
    return {
      status: "resolved",
      result: {
        coingeckoId: known.coingeckoId,
        name: known.name,
        symbol: known.symbol,
        marketProvider: "coingecko"
      }
    };
  }

  const matches = await searchCoinGeckoAssets(normalizedQuery, 12);
  if (matches.length === 0) return { status: "not_found", results: [] };

  const normalizedId = normalizeCoinGeckoId(normalizedQuery);
  const exactId = matches.find((match) => match.coingeckoId === normalizedId);
  if (exactId) return { status: "resolved", result: exactId };

  const normalizedText = normalizedQuery.toLowerCase();
  const exactName = matches.find((match) => match.name.toLowerCase() === normalizedText);
  if (exactName) return { status: "resolved", result: exactName };

  const exactSymbolMatches = matches.filter((match) => match.symbol.toLowerCase() === normalizedText);
  if (exactSymbolMatches.length === 1) return { status: "resolved", result: exactSymbolMatches[0] };
  if (exactSymbolMatches.length > 1) return { status: "ambiguous", results: exactSymbolMatches.slice(0, 5) };

  return { status: "ambiguous", results: matches.slice(0, 5) };
}

function staleSnapshotsFor(ids: string[], vsCurrency: string, errorMessage: string) {
  return ids
    .map((id) => priceCache.get(priceCacheKey(id, vsCurrency))?.snapshot)
    .filter((snapshot): snapshot is CoinGeckoPriceSnapshot => Boolean(snapshot))
    .map((snapshot) => ({
      ...snapshot,
      stale: true,
      errorMessage
    }));
}

function parseSimplePricePayload(
  payload: unknown,
  requestedIds: string[],
  vsCurrency: string,
  requestedAt: Date
): CoinGeckoPriceSnapshot[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new CoinGeckoClientError("CoinGecko simple price has invalid shape", { code: "invalid_response" });
  }

  const currency = canonicalVsCurrency(vsCurrency);
  const output: CoinGeckoPriceSnapshot[] = [];

  for (const coingeckoId of requestedIds) {
    const rawCoin = (payload as Record<string, unknown>)[coingeckoId];
    if (!rawCoin || typeof rawCoin !== "object") continue;

    const coin = rawCoin as Record<string, unknown>;
    const price = toPositiveNumber(coin[currency]);
    if (!price) continue;

    const marketCap = toPositiveNumber(coin[`${currency}_market_cap`]);
    const volume24h = toPositiveNumber(coin[`${currency}_24h_vol`]);
    const change24h = toFiniteNumber(coin[`${currency}_24h_change`]);
    const lastUpdatedUnix = toPositiveNumber(coin.last_updated_at);
    const lastUpdatedAt = lastUpdatedUnix ? new Date(lastUpdatedUnix * 1000) : requestedAt;
    const identity = displayIdentityForId(coingeckoId);

    output.push({
      coingeckoId,
      name: identity.name,
      symbol: identity.symbol,
      currency: currency.toUpperCase(),
      price,
      change24h,
      marketCap,
      volume24h,
      lastUpdatedAt,
      source: "coingecko",
      stale: false
    });
  }

  return output;
}

async function requestSimplePrices(missingIds: string[], vsCurrency: string) {
  const requestedAt = new Date();
  const snapshots: CoinGeckoPriceSnapshot[] = [];

  for (const batch of chunk(missingIds, maxSimplePriceIdsPerRequest)) {
    const payload = await requestCoinGeckoJson<unknown>("/simple/price", {
      ids: batch.join(","),
      vs_currencies: canonicalVsCurrency(vsCurrency),
      include_market_cap: true,
      include_24hr_vol: true,
      include_24hr_change: true,
      include_last_updated_at: true
    });

    snapshots.push(...parseSimplePricePayload(payload, batch, vsCurrency, requestedAt));
  }

  return snapshots;
}

export async function fetchCoinGeckoSimplePrices(ids: string[], options: { vsCurrency?: string } = {}): Promise<CoinGeckoPriceSnapshot[]> {
  const startedAt = Date.now();
  const vsCurrency = canonicalVsCurrency(options.vsCurrency ?? "brl");
  const normalizedIds = Array.from(new Set(ids.map((id) => normalizeCoinGeckoId(id)).filter(Boolean)));
  if (normalizedIds.length === 0) return [];

  const now = Date.now();
  const freshSnapshots: CoinGeckoPriceSnapshot[] = [];
  const missingIds: string[] = [];

  for (const id of normalizedIds) {
    const cached = priceCache.get(priceCacheKey(id, vsCurrency));
    if (cached && cached.expiresAt >= now) freshSnapshots.push({ ...cached.snapshot, stale: false });
    else missingIds.push(id);
  }

  if (missingIds.length === 0) {
    logCoinGeckoOperation({
      operation: "price_batch",
      coinCount: normalizedIds.length,
      cacheHitCount: freshSnapshots.length,
      cacheMissCount: 0,
      status: "cache-hit",
      durationMs: Date.now() - startedAt
    });
    return freshSnapshots;
  }

  const requestKey = `${vsCurrency}:${missingIds.slice().sort().join(",")}`;
  const pending = pendingPriceRequests.get(requestKey);
  if (pending) return [...freshSnapshots, ...(await pending)];

  const request = requestSimplePrices(missingIds, vsCurrency)
    .then((snapshots) => {
      const returnedIds = new Set(snapshots.map((snapshot) => snapshot.coingeckoId));
      for (const snapshot of snapshots) {
        priceCache.set(priceCacheKey(snapshot.coingeckoId, vsCurrency), {
          snapshot: { ...snapshot, stale: false },
          expiresAt: Date.now() + getPriceCacheTtlMs()
        });
      }

      const missingFromPayload = missingIds.filter((id) => !returnedIds.has(id));
      const stale = staleSnapshotsFor(missingFromPayload, vsCurrency, "CoinGecko did not return this asset");

      logCoinGeckoOperation({
        operation: "price_batch",
        coinCount: normalizedIds.length,
        cacheHitCount: freshSnapshots.length,
        cacheMissCount: missingIds.length,
        status: "updated",
        staleFallback: stale.length,
        durationMs: Date.now() - startedAt
      });

      return [...snapshots, ...stale];
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : "Unknown CoinGecko error";
      const stale = staleSnapshotsFor(missingIds, vsCurrency, message);
      logCoinGeckoOperation({
        operation: "price_batch",
        coinCount: normalizedIds.length,
        cacheHitCount: freshSnapshots.length,
        cacheMissCount: missingIds.length,
        status: error instanceof CoinGeckoClientError ? error.code : "error",
        staleFallback: stale.length,
        durationMs: Date.now() - startedAt
      });

      if (stale.length > 0) return stale;
      throw error;
    })
    .finally(() => {
      pendingPriceRequests.delete(requestKey);
    });

  pendingPriceRequests.set(requestKey, request);
  return [...freshSnapshots, ...(await request)];
}

export async function fetchCoinGeckoMarkets(ids: string[]): Promise<CoinGeckoMarketSnapshot[]> {
  const snapshots = await fetchCoinGeckoSimplePrices(ids, { vsCurrency: "brl" });

  return snapshots.map((snapshot) => ({
    coingeckoId: snapshot.coingeckoId,
    name: snapshot.name,
    symbol: snapshot.symbol,
    currentPrice: snapshot.price,
    priceChange24h: snapshot.change24h,
    marketCap: snapshot.marketCap,
    volume24h: snapshot.volume24h,
    lastUpdatedAt: snapshot.lastUpdatedAt,
    stale: snapshot.stale,
    errorMessage: snapshot.errorMessage
  }));
}

export async function fetchCoinGeckoMarketChart(coingeckoId: string, days: string) {
  const payload = await requestCoinGeckoJson<{
    prices?: Array<[number, number]>;
    total_volumes?: Array<[number, number]>;
  }>(`/coins/${encodeURIComponent(normalizeCoinGeckoId(coingeckoId))}/market_chart`, {
    vs_currency: "brl",
    days,
    interval: "daily"
  });

  const volumeByTimestamp = new Map(
    (payload.total_volumes ?? [])
      .filter((entry) => Array.isArray(entry) && entry.length >= 2)
      .map((entry) => [Number(entry[0]), toPositiveNumber(entry[1])])
  );

  return (payload.prices ?? [])
    .filter((entry) => Array.isArray(entry) && entry.length >= 2)
    .map((entry) => ({
      timestamp: new Date(Number(entry[0])),
      price: Number(entry[1]),
      volume: volumeByTimestamp.get(Number(entry[0]))
    }))
    .filter((point) => Number.isFinite(point.timestamp.getTime()) && Number.isFinite(point.price) && point.price > 0) as CoinGeckoMarketChartPoint[];
}
