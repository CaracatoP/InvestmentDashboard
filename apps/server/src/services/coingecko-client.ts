import { env } from "../config/env";
import { normalizeCoinGeckoId, normalizeTicker } from "./ticker.service";

const searchCacheTtlMs = 5 * 60 * 1000;
const searchCache = new Map<string, { results: CoinGeckoSearchResult[]; expiresAt: number }>();

export interface CoinGeckoSearchResult {
  coingeckoId: string;
  name: string;
  symbol: string;
  marketProvider: "coingecko";
  imageUrl?: string;
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
}

export interface CoinGeckoMarketChartPoint {
  timestamp: Date;
  price: number;
  volume?: number;
}

function getBaseUrl() {
  return env.coingeckoApiBaseUrl.trim().replace(/\/+$/, "");
}

function isProBaseUrl(baseUrl: string) {
  return /pro-api\.coingecko\.com/i.test(baseUrl);
}

function isConfigured() {
  return env.coingeckoApiKey.trim().length > 0;
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

async function requestCoinGeckoJson<T>(path: string, params: Record<string, string | number | undefined> = {}) {
  if (!isConfigured()) throw new Error("CoinGecko API key not configured");

  const url = new URL(`${getBaseUrl()}/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  try {
    const response = await fetch(url, {
      headers: buildHeaders(),
      signal: AbortSignal.timeout(12000)
    });
    const text = await response.text();
    let payload: unknown = {};

    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text.slice(0, 500) };
    }

    if (response.ok) return payload as T;
    if (response.status === 429) throw new Error("CoinGecko rate limit reached");
    if (response.status === 401 || response.status === 403) throw new Error("CoinGecko authentication failed");

    const message = extractPayloadMessage(payload);
    throw new Error(message ? `CoinGecko request failed with status ${response.status}: ${message}` : `CoinGecko request failed with status ${response.status}`);
  } catch (error) {
    if (error instanceof Error && error.message) {
      if (error.name === "TimeoutError" || error.name === "AbortError") {
        throw new Error("CoinGecko request timed out");
      }

      throw error;
    }

    throw new Error("CoinGecko request failed");
  }
}

export function clearCoinGeckoSearchCacheForTests() {
  searchCache.clear();
}

export async function searchCoinGeckoAssets(query: string, limit = 10): Promise<CoinGeckoSearchResult[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) return [];

  const cacheKey = `${normalizedQuery.toLowerCase()}:${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt >= Date.now()) return cached.results;

  const payload = await requestCoinGeckoJson<{
    coins?: Array<{
      id?: string;
      name?: string;
      symbol?: string;
      thumb?: string;
      market_cap_rank?: number | null;
    }>;
  }>("/search", { query: normalizedQuery });
  const normalizedNeedle = normalizedQuery.toLowerCase();

  const results = (payload.coins ?? [])
    .filter((coin) => coin.id && coin.name && coin.symbol)
    .map((coin) => ({
      coingeckoId: normalizeCoinGeckoId(String(coin.id)),
      name: String(coin.name).trim(),
      symbol: normalizeTicker(String(coin.symbol)),
      imageUrl: coin.thumb ? String(coin.thumb) : undefined,
      marketProvider: "coingecko" as const,
      marketCapRank: typeof coin.market_cap_rank === "number" ? coin.market_cap_rank : Number.MAX_SAFE_INTEGER
    }))
    .sort((left, right) => {
      const leftExactScore =
        left.symbol.toLowerCase() === normalizedNeedle || left.name.toLowerCase() === normalizedNeedle || left.coingeckoId === normalizeCoinGeckoId(normalizedNeedle)
          ? 0
          : 1;
      const rightExactScore =
        right.symbol.toLowerCase() === normalizedNeedle || right.name.toLowerCase() === normalizedNeedle || right.coingeckoId === normalizeCoinGeckoId(normalizedNeedle)
          ? 0
          : 1;
      if (leftExactScore !== rightExactScore) return leftExactScore - rightExactScore;
      if (left.marketCapRank !== right.marketCapRank) return left.marketCapRank - right.marketCapRank;
      return left.name.localeCompare(right.name, "pt-BR");
    })
    .slice(0, limit)
    .map(({ marketCapRank: _marketCapRank, ...result }) => result);

  searchCache.set(cacheKey, { results, expiresAt: Date.now() + searchCacheTtlMs });
  return results;
}

export async function fetchCoinGeckoMarkets(ids: string[]): Promise<CoinGeckoMarketSnapshot[]> {
  const normalizedIds = Array.from(new Set(ids.map((id) => normalizeCoinGeckoId(id)).filter(Boolean)));
  if (normalizedIds.length === 0) return [];

  const snapshots: CoinGeckoMarketSnapshot[] = [];

  for (const batch of chunk(normalizedIds, 100)) {
    const payload = await requestCoinGeckoJson<
      Array<{
        id?: string;
        symbol?: string;
        name?: string;
        current_price?: number;
        price_change_percentage_24h?: number;
        price_change_percentage_24h_in_currency?: number;
        market_cap?: number;
        total_volume?: number;
        last_updated?: string;
      }>
    >("/coins/markets", {
      vs_currency: "brl",
      ids: batch.join(","),
      per_page: batch.length,
      page: 1,
      sparkline: "false",
      price_change_percentage: "24h"
    });

    for (const coin of payload) {
      if (!coin.id || !coin.symbol || !coin.name) continue;

      snapshots.push({
        coingeckoId: normalizeCoinGeckoId(String(coin.id)),
        name: String(coin.name).trim(),
        symbol: normalizeTicker(String(coin.symbol)),
        currentPrice: Number(coin.current_price),
        priceChange24h: toFiniteNumber(coin.price_change_percentage_24h_in_currency ?? coin.price_change_percentage_24h),
        marketCap: toPositiveNumber(coin.market_cap),
        volume24h: toPositiveNumber(coin.total_volume),
        lastUpdatedAt: coin.last_updated ? new Date(coin.last_updated) : null
      });
    }
  }

  return snapshots;
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
