import { createCanonicalCacheKey } from "./api-cache";

export const workspaceQueryKeys = {
  dashboard: () => createCanonicalCacheKey("/dashboard"),
  portfolio: () => createCanonicalCacheKey("/assets"),
  asset: (ticker: string) => createCanonicalCacheKey(`/assets/${ticker.toUpperCase()}`),
  assetHistory: (ticker: string, range: string, interval?: string) =>
    createCanonicalCacheKey(`/assets/${ticker.toUpperCase()}/history`, { interval: interval ?? "auto", period: range }),
  dividends: () => createCanonicalCacheKey("/dividends"),
  contributions: () => createCanonicalCacheKey("/contributions"),
  goals: () => createCanonicalCacheKey("/goals"),
  history: () => createCanonicalCacheKey("/history"),
  settings: () => createCanonicalCacheKey("/settings"),
  aiHealth: () => createCanonicalCacheKey("/ai/health"),
  aiAnalyses: (limit: number) => createCanonicalCacheKey("/ai/analyses", { limit }),
  marketStatus: () => createCanonicalCacheKey("/market/status"),
  cdiStatus: () => createCanonicalCacheKey("/cdi/status"),
  cashBoxesOverview: () => createCanonicalCacheKey("/cash-boxes"),
  records: (path: string) => createCanonicalCacheKey(path, { mode: "records" }),
  monthlyPlanningOverview: (year: number, month: number, comparisonRange: number) =>
    createCanonicalCacheKey("/monthly-planning", { comparisonRange, month, year })
};
