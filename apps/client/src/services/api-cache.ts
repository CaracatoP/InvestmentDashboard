import type { WorkspaceCacheDomain } from "./cache-invalidation";

export type ApiCachePolicyKey =
  | "dashboard"
  | "portfolio"
  | "monthlyPlanning"
  | "history"
  | "contributions"
  | "cashBoxes"
  | "market"
  | "cdi"
  | "ai"
  | "dividends"
  | "goals"
  | "settings"
  | "records";

export const apiCachePolicy = {
  defaultScope: "single-user",
  maxEntries: 80,
  staleTimeMs: {
    dashboard: 60_000,
    portfolio: 60_000,
    monthlyPlanning: 60_000,
    history: 60_000,
    contributions: 60_000,
    cashBoxes: 60_000,
    market: 60_000,
    cdi: 60_000,
    ai: 60_000,
    dividends: 300_000,
    goals: 300_000,
    settings: 600_000,
    records: 60_000
  } satisfies Record<ApiCachePolicyKey, number>,
  neverCache: [
    "mutations",
    "projections",
    "ai-chat-sessions",
    "ai-chat-messages",
    "ai-analysis-generation",
    "market-refresh",
    "cdi-refresh"
  ]
} as const;

type CacheParams = Record<string, unknown> | URLSearchParams | string | undefined;

interface CacheEntry {
  payload: unknown;
  expiresAt: number;
  domains: WorkspaceCacheDomain[];
}

interface CachedRequestInput<T> {
  key: string;
  domains: WorkspaceCacheDomain[];
  staleTimeMs: number;
  request: () => Promise<T>;
  onHit?: () => void;
  onMiss?: () => void;
  onInflightReuse?: () => void;
}

interface ApiResponseCacheOptions {
  maxEntries?: number;
  now?: () => number;
  initialScope?: string;
}

function normalizeScope(scope?: string) {
  const normalized = scope?.trim();
  return normalized || apiCachePolicy.defaultScope;
}

function normalizeValue(value: unknown): string[] {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) return value.flatMap(normalizeValue).sort((left, right) => left.localeCompare(right));
  if (value instanceof Date) return [value.toISOString()];
  return [String(value)];
}

function appendParams(searchParams: URLSearchParams, params: CacheParams) {
  if (!params) return;

  if (typeof params === "string") {
    const source = new URLSearchParams(params.startsWith("?") ? params.slice(1) : params);
    source.forEach((value, key) => searchParams.append(key, value));
    return;
  }

  if (params instanceof URLSearchParams) {
    params.forEach((value, key) => searchParams.append(key, value));
    return;
  }

  for (const [key, value] of Object.entries(params)) {
    for (const normalizedValue of normalizeValue(value)) {
      searchParams.append(key, normalizedValue);
    }
  }
}

export function normalizeCacheQuery(params?: CacheParams) {
  const searchParams = new URLSearchParams();
  appendParams(searchParams, params);

  return [...searchParams.entries()]
    .filter(([, value]) => value !== "")
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyComparison = leftKey.localeCompare(rightKey);
      return keyComparison === 0 ? leftValue.localeCompare(rightValue) : keyComparison;
    })
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

export function createCanonicalCacheKey(path: string, params?: CacheParams) {
  const [basePath, currentQuery = ""] = path.split("?");
  const searchParams = new URLSearchParams(currentQuery);
  appendParams(searchParams, params);
  const query = normalizeCacheQuery(searchParams);
  return query ? `${basePath}?${query}` : basePath;
}

export function createApiResponseCache(options: ApiResponseCacheOptions = {}) {
  const maxEntries = options.maxEntries ?? apiCachePolicy.maxEntries;
  const now = options.now ?? Date.now;
  const cache = new Map<string, CacheEntry>();
  const inflight = new Map<string, Promise<unknown>>();
  const keysByDomain = new Map<WorkspaceCacheDomain, Set<string>>();
  let scope = normalizeScope(options.initialScope);
  let cacheVersion = 0;

  function scopedKey(key: string) {
    return `${scope}:${key}`;
  }

  function removeDomainReferences(key: string, domains: WorkspaceCacheDomain[]) {
    for (const domain of domains) {
      const keys = keysByDomain.get(domain);
      if (!keys) continue;
      keys.delete(key);
      if (keys.size === 0) keysByDomain.delete(domain);
    }
  }

  function deleteKey(key: string) {
    const entry = cache.get(key);
    if (entry) removeDomainReferences(key, entry.domains);
    cache.delete(key);
    inflight.delete(key);
  }

  function rememberKey(key: string, domains: WorkspaceCacheDomain[]) {
    for (const domain of domains) {
      const keys = keysByDomain.get(domain) ?? new Set<string>();
      keys.add(key);
      keysByDomain.set(domain, keys);
    }
  }

  function evictOverflow() {
    while (cache.size > maxEntries) {
      const oldestKey = cache.keys().next().value as string | undefined;
      if (!oldestKey) return;
      deleteKey(oldestKey);
    }
  }

  function clear(domains: WorkspaceCacheDomain[] = ["all"]) {
    cacheVersion += 1;

    if (domains.includes("all")) {
      cache.clear();
      inflight.clear();
      keysByDomain.clear();
      return;
    }

    const keysToDelete = new Set<string>();
    for (const domain of domains) {
      for (const key of keysByDomain.get(domain) ?? []) keysToDelete.add(key);
    }

    for (const key of keysToDelete) deleteKey(key);
  }

  async function get<T>({ key, domains, staleTimeMs, request, onHit, onMiss, onInflightReuse }: CachedRequestInput<T>) {
    const keyWithScope = scopedKey(key);
    const cached = cache.get(keyWithScope);

    if (cached && now() <= cached.expiresAt) {
      cache.delete(keyWithScope);
      cache.set(keyWithScope, cached);
      onHit?.();
      return cached.payload as T;
    }

    if (cached) deleteKey(keyWithScope);

    const activeRequest = inflight.get(keyWithScope);
    if (activeRequest) {
      onInflightReuse?.();
      return activeRequest as Promise<T>;
    }

    const requestVersion = cacheVersion;
    onMiss?.();
    let promise: Promise<T>;
    promise = request()
      .then((payload) => {
        if (requestVersion === cacheVersion) {
          cache.set(keyWithScope, { payload, expiresAt: now() + staleTimeMs, domains });
          rememberKey(keyWithScope, domains);
          evictOverflow();
        }
        return payload;
      })
      .finally(() => {
        if (inflight.get(keyWithScope) === promise) inflight.delete(keyWithScope);
      });

    inflight.set(keyWithScope, promise);
    return promise;
  }

  function setScope(nextScope?: string) {
    const normalized = normalizeScope(nextScope);
    if (normalized === scope) return;
    scope = normalized;
    clear(["all"]);
  }

  function clearForLogout() {
    scope = apiCachePolicy.defaultScope;
    clear(["all"]);
  }

  return {
    get,
    clear,
    setScope,
    clearForLogout,
    get size() {
      return cache.size;
    },
    get inflightSize() {
      return inflight.size;
    },
    has(key: string) {
      return cache.has(scopedKey(key));
    }
  };
}

export const apiResponseCache = createApiResponseCache();
