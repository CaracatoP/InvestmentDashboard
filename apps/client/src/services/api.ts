import axios from "axios";
import { API_BASE_URL } from "../config/api";
import {
  invalidateWorkspaceCache,
  isWorkspaceCacheDomain,
  type WorkspaceAffectedEntity,
  type WorkspaceCacheDomain
} from "./cache-invalidation";
import {
  buildWorkspaceSyncFromEffect,
  resolveMutationEffect,
  type WorkspaceMutationEffectKey
} from "./workspace-mutation-effects";
import { apiCachePolicy, apiResponseCache, type ApiCachePolicyKey } from "./api-cache";
import { workspaceQueryKeys } from "./workspace-query-keys";
import type {
  AiAnalysisResult,
  AiAnalysisType,
  AiChatMessageResult,
  AiChatSession,
  AiChatSessionDetails,
  AiHealth,
  AiProjectionExplanationResult,
  AiStoredAnalysis
} from "../types/ai";
import type {
  AssetDetails,
  AssetPriceHistoryResponse,
  CdiRefreshResponse,
  CdiStatusResponse,
  ContributionsResponse,
  DashboardResponse,
  DividendsResponse,
  Goal,
  MarketRefreshResponse,
  Movement,
  PortfolioResponse,
  ProjectionInput,
  ProjectionResponse,
  SettingsResponse
} from "../types/investments";
import type {
  AssetRecord,
  CashBoxMovementRecord,
  CashBoxRecord,
  ContributionRecord,
  CryptoAssetSearchResult,
  DividendRecord,
  GoalRecord,
  MonthlyExpenseCompletionResult,
  MonthlyExpenseRecord,
  MonthlyIncomeEntryCompletionResult,
  MonthlyIncomeEntryRecord,
  MonthlyPlanningOverview,
  MonthlyPlanRecord,
  OperationRecord
} from "../types/management";
import type {
  AuthLoginInput,
  AuthMeResponse,
  AuthMessageResponse,
  AuthRegisterInput,
  AuthUser,
  WhatsAppIntegrationStatus,
  WhatsAppLinkCreated
} from "../types/auth";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 12000,
  withCredentials: true
});

let csrfTokenMemory = "";

function setCsrfToken(token: string) {
  csrfTokenMemory = token.trim();
}

export function clearCsrfToken() {
  csrfTokenMemory = "";
}

function readCookie(name: string) {
  if (typeof document === "undefined") return "";
  const prefix = `${name}=`;
  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix))
    ?.slice(prefix.length) ?? "";
}

function readCsrfToken() {
  return csrfTokenMemory || readCookie("invest_hub_csrf");
}

function readCsrfHeader(headers: unknown) {
  if (!headers || typeof headers !== "object") return "";
  const candidate = (headers as Record<string, unknown>)["x-csrf-token"] ?? (headers as Record<string, unknown>)["X-CSRF-Token"];
  if (typeof candidate === "string") return candidate;
  if (Array.isArray(candidate)) return typeof candidate[0] === "string" ? candidate[0] : "";
  return "";
}

api.interceptors.request.use((config) => {
  const method = (config.method ?? "get").toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrfToken = readCsrfToken();
    if (csrfToken) config.headers.set("X-CSRF-Token", csrfToken);
  }
  return config;
});

function extractApiErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as { error?: { message?: unknown } }).error;
  return typeof error?.message === "string" && error.message.trim() ? error.message : null;
}

api.interceptors.response.use(
  (response) => {
    const csrfToken = readCsrfHeader(response.headers);
    if (csrfToken) setCsrfToken(csrfToken);
    return response;
  },
  (error) => {
    if (axios.isAxiosError(error)) {
      const csrfToken = readCsrfHeader(error.response?.headers);
      if (csrfToken) setCsrfToken(csrfToken);
      const message = extractApiErrorMessage(error.response?.data);
      if (message) error.message = message;
    }

    return Promise.reject(error);
  }
);

type ApiEnvelope<T> = T | { data: T };

type AssetPriceHistoryRequestOptions = {
  signal?: AbortSignal;
  forceRefresh?: boolean;
  interval?: string;
};

type ApiClientMetrics = {
  networkRequests: number;
  cacheHits: number;
  cacheMisses: number;
  inflightReused: number;
  mutations: number;
  invalidations: number;
  lastInvalidation: {
    domains: WorkspaceCacheDomain[];
    mutationKey?: string;
    reason?: string;
    source?: "mutation" | "ai";
  } | null;
  mutationCounts: Partial<Record<WorkspaceMutationEffectKey, number>>;
};

const assetHistoryStaleTimeMs: Record<string, number> = {
  "1mo": 15 * 60 * 1000,
  "3mo": 30 * 60 * 1000,
  "6mo": 30 * 60 * 1000,
  "1y": 60 * 60 * 1000,
  "5y": 4 * 60 * 60 * 1000,
  max: 8 * 60 * 60 * 1000
};

const assetPriceHistoryCache = new Map<string, { payload: AssetPriceHistoryResponse; expiresAt: number }>();
const assetPriceHistoryInflight = new Map<string, Promise<AssetPriceHistoryResponse>>();
const apiClientMetrics: ApiClientMetrics = {
  networkRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  inflightReused: 0,
  mutations: 0,
  invalidations: 0,
  lastInvalidation: null,
  mutationCounts: {},
};

export { apiCachePolicy };

function unwrapData<T>(payload: ApiEnvelope<T>): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return payload.data as T;
  }

  return payload as T;
}

function normalizeMutationDomains(values: unknown): WorkspaceCacheDomain[] {
  const items = Array.isArray(values) ? values : typeof values === "string" ? values.split(",") : [];
  const domains = items
    .map((value) => String(value).trim())
    .filter((value): value is WorkspaceCacheDomain => isWorkspaceCacheDomain(value));

  return domains.includes("all") ? ["all"] : Array.from(new Set(domains));
}

function normalizeAffectedEntities(values: unknown): WorkspaceAffectedEntity[] {
  if (!Array.isArray(values)) return [];

  return values
    .map((value): WorkspaceAffectedEntity | null => {
      if (!value || typeof value !== "object") return null;
      const entity = value as { type?: unknown; id?: unknown };
      if (typeof entity.type !== "string" || !entity.type.trim()) return null;
      return {
        type: entity.type,
        id: entity.id === null || entity.id === undefined ? undefined : String(entity.id)
      } satisfies WorkspaceAffectedEntity;
    })
    .filter((value): value is WorkspaceAffectedEntity => Boolean(value));
}

function recordNetworkRequest() {
  apiClientMetrics.networkRequests += 1;
}

function parseAffectedDomainsHeader(headers?: Record<string, unknown>) {
  if (!headers) return [];
  const candidate =
    headers["x-affected-domains"] ??
    headers["X-Affected-Domains"] ??
    headers["x-workspace-domains"] ??
    headers["X-Workspace-Domains"];
  return normalizeMutationDomains(candidate);
}

function readAiMutationMetadata(result: AiChatMessageResult) {
  const metadata = result.assistantMessage.structuredResponse?.metadata as
    | {
        affectedDomains?: unknown;
        affectedEntities?: unknown;
        mutationKey?: unknown;
      }
    | undefined;

  return {
    domains: normalizeMutationDomains(metadata?.affectedDomains),
    affectedEntities: normalizeAffectedEntities(metadata?.affectedEntities),
    mutationKey: typeof metadata?.mutationKey === "string" ? metadata.mutationKey : undefined
  };
}

export function clearApiCache(domains: WorkspaceCacheDomain[] = ["all"]) {
  apiResponseCache.clear(domains);

  if (domains.includes("all") || domains.some((domain) => domain === "market" || domain === "portfolio")) {
    assetPriceHistoryCache.clear();
    assetPriceHistoryInflight.clear();
  }
}

export function clearApiCacheForLogout() {
  apiResponseCache.clearForLogout();
  assetPriceHistoryCache.clear();
  assetPriceHistoryInflight.clear();
  clearCsrfToken();
  invalidateWorkspaceCache({ domains: ["all"], source: "manual", reason: "logout" });
}

export function setApiCacheScope(scope?: string) {
  apiResponseCache.setScope(scope);
  assetPriceHistoryCache.clear();
  assetPriceHistoryInflight.clear();
}

function invalidateApiDomains(
  domains: WorkspaceCacheDomain[],
  input: {
    source?: "mutation" | "ai";
    mutationKey?: string;
    reason?: string;
    affectedEntities?: WorkspaceAffectedEntity[];
  } = {}
) {
  clearApiCache(domains);
  apiClientMetrics.invalidations += 1;
  apiClientMetrics.lastInvalidation = {
    domains,
    mutationKey: input.mutationKey,
    reason: input.reason,
    source: input.source ?? "mutation"
  };
  invalidateWorkspaceCache({
    domains,
    source: input.source ?? "mutation",
    mutationKey: input.mutationKey,
    reason: input.reason,
    affectedEntities: input.affectedEntities
  });
}

async function cachedRequest<T>(
  key: string,
  domains: WorkspaceCacheDomain[],
  policyKey: ApiCachePolicyKey,
  request: () => Promise<{ data: ApiEnvelope<T> }>
) {
  return apiResponseCache.get({
    key,
    domains,
    staleTimeMs: apiCachePolicy.staleTimeMs[policyKey],
    request: () => request().then(({ data }) => unwrapData(data)),
    onHit: () => {
      apiClientMetrics.cacheHits += 1;
    },
    onMiss: () => {
      apiClientMetrics.cacheMisses += 1;
      recordNetworkRequest();
    },
    onInflightReuse: () => {
      apiClientMetrics.inflightReused += 1;
    }
  });
}

async function mutate<T>(
  request: () => Promise<{ data: ApiEnvelope<T>; headers?: Record<string, unknown> }>,
  effectKey: WorkspaceMutationEffectKey | WorkspaceCacheDomain[] = ["all"]
) {
  recordNetworkRequest();
  apiClientMetrics.mutations += 1;
  if (!Array.isArray(effectKey)) {
    apiClientMetrics.mutationCounts[effectKey] = (apiClientMetrics.mutationCounts[effectKey] ?? 0) + 1;
  }

  const response = await request();
  const payload = unwrapData(response.data);
  const effect = Array.isArray(effectKey)
    ? { domains: effectKey, mutationKey: undefined, reason: undefined }
    : buildWorkspaceSyncFromEffect(effectKey);
  const headerDomains = parseAffectedDomainsHeader(response.headers);
  const domains = headerDomains.length > 0 ? headerDomains : effect.domains;

  invalidateApiDomains(domains, {
    source: "mutation",
    mutationKey: effect.mutationKey,
    reason: effect.reason
  });

  return payload;
}

export function getApiClientMetrics() {
  return {
    ...apiClientMetrics,
    lastInvalidation: apiClientMetrics.lastInvalidation
      ? {
          ...apiClientMetrics.lastInvalidation,
          domains: [...apiClientMetrics.lastInvalidation.domains]
        }
      : null,
    mutationCounts: { ...apiClientMetrics.mutationCounts }
  };
}

export function resetApiClientMetrics() {
  apiClientMetrics.networkRequests = 0;
  apiClientMetrics.cacheHits = 0;
  apiClientMetrics.cacheMisses = 0;
  apiClientMetrics.inflightReused = 0;
  apiClientMetrics.mutations = 0;
  apiClientMetrics.invalidations = 0;
  apiClientMetrics.lastInvalidation = null;
  apiClientMetrics.mutationCounts = {};
}

export const authApi = {
  register: async (input: AuthRegisterInput) => {
    const { data } = await api.post<ApiEnvelope<AuthMessageResponse>>("/auth/register", input);
    return unwrapData(data);
  },
  login: async (input: AuthLoginInput) => {
    const { data } = await api.post<ApiEnvelope<{ user: AuthUser }>>("/auth/login", input);
    return unwrapData(data);
  },
  logout: async () => {
    await api.post("/auth/logout");
  },
  me: async () => {
    const { data } = await api.get<ApiEnvelope<AuthMeResponse>>("/auth/me");
    return unwrapData(data);
  },
  forgotPassword: async (email: string) => {
    const { data } = await api.post<ApiEnvelope<AuthMessageResponse>>("/auth/forgot-password", { email });
    return unwrapData(data);
  },
  resetPassword: async (input: { token: string; password: string; confirmPassword: string }) => {
    const { data } = await api.post<ApiEnvelope<AuthMessageResponse>>("/auth/reset-password", input);
    return unwrapData(data);
  },
  changePassword: async (input: { currentPassword: string; password: string; confirmPassword: string }) => {
    const { data } = await api.post<ApiEnvelope<AuthMessageResponse>>("/auth/change-password", input);
    return unwrapData(data);
  }
};

export const adminUsersApi = {
  list: async () => {
    const { data } = await api.get<ApiEnvelope<AuthUser[]>>("/admin/users");
    return unwrapData(data);
  },
  approve: async (userId: string) => {
    const { data } = await api.post<ApiEnvelope<AuthUser>>(`/admin/users/${userId}/approve`);
    return unwrapData(data);
  },
  reject: async (userId: string) => {
    const { data } = await api.post<ApiEnvelope<AuthUser>>(`/admin/users/${userId}/reject`);
    return unwrapData(data);
  },
  disable: async (userId: string) => {
    const { data } = await api.post<ApiEnvelope<AuthUser>>(`/admin/users/${userId}/disable`);
    return unwrapData(data);
  },
  reactivate: async (userId: string) => {
    const { data } = await api.post<ApiEnvelope<AuthUser>>(`/admin/users/${userId}/reactivate`);
    return unwrapData(data);
  }
};

export const integrationsApi = {
  whatsappStatus: async () => {
    const { data } = await api.get<ApiEnvelope<WhatsAppIntegrationStatus>>("/integrations/whatsapp");
    return unwrapData(data);
  },
  createWhatsAppLink: async () => {
    const { data } = await api.post<ApiEnvelope<WhatsAppLinkCreated>>("/integrations/whatsapp/link");
    return unwrapData(data);
  },
  cancelWhatsAppLink: async () => {
    const { data } = await api.delete<ApiEnvelope<{ cancelled: number }>>("/integrations/whatsapp/link");
    return unwrapData(data);
  },
  disconnectWhatsApp: async () => {
    const { data } = await api.delete<ApiEnvelope<{ disconnected: number }>>("/integrations/whatsapp");
    return unwrapData(data);
  }
};

export async function fetchDashboard() {
  return cachedRequest(workspaceQueryKeys.dashboard(), ["dashboard"], "dashboard", () => api.get<ApiEnvelope<DashboardResponse>>("/dashboard"));
}

export async function fetchPortfolio() {
  return cachedRequest(workspaceQueryKeys.portfolio(), ["portfolio"], "portfolio", () => api.get<ApiEnvelope<PortfolioResponse>>("/assets"));
}

export async function fetchAsset(ticker: string) {
  const canonicalTicker = ticker.toUpperCase();
  return cachedRequest(workspaceQueryKeys.asset(canonicalTicker), ["portfolio"], "portfolio", () => api.get<ApiEnvelope<AssetDetails>>(`/assets/${canonicalTicker}`));
}

function normalizeHistoryOptions(options?: AbortSignal | AssetPriceHistoryRequestOptions): AssetPriceHistoryRequestOptions {
  if (!options) return {};
  if ("aborted" in options) return { signal: options };
  return options;
}

function getAssetHistoryCacheKey(ticker: string, range: string, interval?: string) {
  return workspaceQueryKeys.assetHistory(ticker, range, interval);
}

function raceWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException("Request aborted", "AbortError"));

  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("Request aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export async function fetchAssetPriceHistory(ticker: string, range = "3mo", options?: AbortSignal | AssetPriceHistoryRequestOptions) {
  const normalizedOptions = normalizeHistoryOptions(options);
  const key = getAssetHistoryCacheKey(ticker, range, normalizedOptions.interval);
  const cached = assetPriceHistoryCache.get(key);
  if (!normalizedOptions.forceRefresh && cached && Date.now() <= cached.expiresAt) {
    apiClientMetrics.cacheHits += 1;
    return cached.payload;
  }

  const inflight = assetPriceHistoryInflight.get(key);
  if (!normalizedOptions.forceRefresh && inflight) {
    apiClientMetrics.inflightReused += 1;
    return raceWithSignal(inflight, normalizedOptions.signal);
  }

  apiClientMetrics.cacheMisses += 1;
  recordNetworkRequest();

  let request: Promise<AssetPriceHistoryResponse>;
  request = api.get<ApiEnvelope<AssetPriceHistoryResponse>>(`/assets/${ticker}/history`, {
    params: {
      period: range,
      interval: normalizedOptions.interval,
      forceRefresh: normalizedOptions.forceRefresh ? "true" : undefined
    }
  }).then(({ data }) => {
    const payload = unwrapData(data);
    const staleTime = assetHistoryStaleTimeMs[payload.range] ?? assetHistoryStaleTimeMs[range] ?? 30 * 60 * 1000;
    assetPriceHistoryCache.set(key, { payload, expiresAt: Date.now() + staleTime });
    return payload;
  }).finally(() => {
    if (assetPriceHistoryInflight.get(key) === request) assetPriceHistoryInflight.delete(key);
  });

  assetPriceHistoryInflight.set(key, request);
  return raceWithSignal(request, normalizedOptions.signal);
}

export function prefetchAssetPriceHistory(ticker: string, range = "3mo", interval?: string) {
  const key = getAssetHistoryCacheKey(ticker, range, interval);
  const cached = assetPriceHistoryCache.get(key);
  if (cached && Date.now() <= cached.expiresAt) return;
  if (assetPriceHistoryInflight.has(key)) return;
  void fetchAssetPriceHistory(ticker, range, { interval }).catch(() => undefined);
}

export async function fetchDividends() {
  return cachedRequest(workspaceQueryKeys.dividends(), ["dividends"], "dividends", () => api.get<ApiEnvelope<DividendsResponse>>("/dividends"));
}

export async function fetchContributions() {
  return cachedRequest(workspaceQueryKeys.contributions(), ["contributions"], "contributions", () => api.get<ApiEnvelope<ContributionsResponse>>("/contributions"));
}

export async function createContribution(input: { date: string; amount: number; category: string; notes?: string }) {
  return mutate(() => api.post<ApiEnvelope<unknown>>("/contributions", input), "contribution.create");
}

export async function fetchGoals() {
  return cachedRequest(workspaceQueryKeys.goals(), ["goals"], "goals", () => api.get<ApiEnvelope<Goal[]>>("/goals"));
}

export async function createGoal(input: Omit<Goal, "progress">) {
  return mutate(() => api.post<ApiEnvelope<unknown>>("/goals", input), "goal.create");
}

export async function calculateProjection(input: ProjectionInput) {
  const { data } = await api.post<ApiEnvelope<ProjectionResponse>>("/projections", input);
  return unwrapData(data);
}

export async function fetchAiHealth() {
  return cachedRequest(workspaceQueryKeys.aiHealth(), ["ai"], "ai", () => api.get<ApiEnvelope<AiHealth>>("/ai/health", { timeout: 130000 }));
}

export async function generateAiAnalysis(input: {
  year: number;
  month: number;
  analysisType: AiAnalysisType;
  categoryId?: string;
  forceRefresh?: boolean;
}) {
  recordNetworkRequest();
  const { data } = await api.post<ApiEnvelope<AiAnalysisResult>>("/ai/analyses", input, { timeout: 130000 });
  invalidateApiDomains(["ai"], {
    source: "ai",
    mutationKey: "ai.analysis.generated",
    reason: "ai-analysis-generated"
  });
  return unwrapData(data);
}

export async function fetchAiAnalyses(limit = 20) {
  return cachedRequest(workspaceQueryKeys.aiAnalyses(limit), ["ai"], "ai", () => api.get<ApiEnvelope<AiStoredAnalysis[]>>("/ai/analyses", { params: { limit } }));
}

export async function explainProjectionWithAi(input: { input?: Record<string, unknown>; projection: Record<string, unknown> }) {
  const { data } = await api.post<ApiEnvelope<AiProjectionExplanationResult>>("/ai/projections/explain", input, { timeout: 130000 });
  return unwrapData(data);
}

export const aiChatApi = {
  createSession: async (title?: string) => {
    const { data } = await api.post<ApiEnvelope<AiChatSession>>("/ai/chat/sessions", { title });
    return unwrapData(data);
  },
  listSessions: async () => {
    const { data } = await api.get<ApiEnvelope<AiChatSession[]>>("/ai/chat/sessions");
    return unwrapData(data);
  },
  getSession: async (sessionId: string) => {
    const { data } = await api.get<ApiEnvelope<AiChatSessionDetails>>(`/ai/chat/sessions/${sessionId}`);
    return unwrapData(data);
  },
  sendMessage: async (sessionId: string, message: string) => {
    const { data } = await api.post<ApiEnvelope<AiChatMessageResult>>(`/ai/chat/sessions/${sessionId}/messages`, { message }, { timeout: 130000 });
    const result = unwrapData(data);
    if (result.assistantMessage.structuredResponse?.responseType === "success") {
      const metadata = readAiMutationMetadata(result);
      const fallback = resolveMutationEffect("ai.action.success");
      invalidateApiDomains(metadata.domains.length > 0 ? metadata.domains : fallback.invalidate, {
        source: "ai",
        mutationKey: metadata.mutationKey ?? "ai.action.success",
        reason: "ai-action-executed",
        affectedEntities: metadata.affectedEntities
      });
    }
    return result;
  },
  removeSession: async (sessionId: string) => {
    await api.delete(`/ai/chat/sessions/${sessionId}`);
  }
};

export async function fetchHistory() {
  return cachedRequest(workspaceQueryKeys.history(), ["history"], "history", () => api.get<ApiEnvelope<Movement[]>>("/history"));
}

export async function fetchSettings() {
  return cachedRequest(workspaceQueryKeys.settings(), ["settings"], "settings", () => api.get<ApiEnvelope<SettingsResponse>>("/settings"));
}

export async function updateSettingsProfile(input: { profileName: string; theme: SettingsResponse["profile"]["theme"]; currency: SettingsResponse["profile"]["currency"] }) {
  return mutate(() => api.put<ApiEnvelope<SettingsResponse>>("/settings", input), "settings.profile.update");
}

export async function fetchMarketStatus() {
  return cachedRequest(workspaceQueryKeys.marketStatus(), ["market"], "market", () => api.get<ApiEnvelope<unknown>>("/market/status"));
}

export async function refreshMarketData() {
  return mutate(() => api.post<ApiEnvelope<MarketRefreshResponse>>("/market/refresh"), "market.refresh");
}

export async function fetchCdiStatus() {
  return cachedRequest(workspaceQueryKeys.cdiStatus(), ["cdi"], "cdi", () => api.get<ApiEnvelope<CdiStatusResponse>>("/cdi/status"));
}

export async function refreshCdiData() {
  return mutate(() => api.post<ApiEnvelope<CdiRefreshResponse>>("/cdi/refresh"), "cdi.refresh");
}

export async function updateAllocations(allocations: SettingsResponse["allocations"]) {
  return mutate(() => api.put<ApiEnvelope<unknown>>("/settings/allocations", { allocations }), "settings.allocations.update");
}

async function getRecords<T>(path: string, domains: WorkspaceCacheDomain[]) {
  return cachedRequest(workspaceQueryKeys.records(path), domains, "records", () => api.get<ApiEnvelope<T[]>>(path, { params: { mode: "records" } }));
}

export const assetRecordsApi = {
  list: () => getRecords<AssetRecord>("/assets", ["assets", "portfolio"]),
  searchCrypto: async (query: string) => {
    const { data } = await api.get<ApiEnvelope<CryptoAssetSearchResult[]>>("/assets/crypto/search", { params: { q: query } });
    return unwrapData(data);
  },
  create: async (input: AssetRecord) => mutate(() => api.post<ApiEnvelope<AssetRecord>>("/assets", input), "asset.create"),
  update: async (id: string, input: Partial<AssetRecord>) => mutate(() => api.put<ApiEnvelope<AssetRecord>>(`/assets/${id}`, input), "asset.update"),
  remove: async (id: string) => mutate(() => api.delete(`/assets/${id}`), "asset.remove")
};

export const operationRecordsApi = {
  list: () => getRecords<OperationRecord>("/operations", ["operations", "portfolio"]),
  create: async (input: OperationRecord) => mutate(() => api.post<ApiEnvelope<OperationRecord>>("/operations", input), "operation.create"),
  update: async (id: string, input: Partial<OperationRecord>) => mutate(() => api.put<ApiEnvelope<OperationRecord>>(`/operations/${id}`, input), "operation.update"),
  remove: async (id: string) => mutate(() => api.delete(`/operations/${id}`), "operation.remove")
};

export const dividendRecordsApi = {
  list: () => getRecords<DividendRecord>("/dividends", ["dividends"]),
  create: async (input: DividendRecord) => mutate(() => api.post<ApiEnvelope<DividendRecord>>("/dividends", input), "dividend.create"),
  update: async (id: string, input: Partial<DividendRecord>) => mutate(() => api.put<ApiEnvelope<DividendRecord>>(`/dividends/${id}`, input), "dividend.update"),
  receive: async (id: string, input: Partial<DividendRecord>) => mutate(() => api.post<ApiEnvelope<DividendRecord>>(`/dividends/${id}/receive`, input), "dividend.receive"),
  remove: async (id: string) => mutate(() => api.delete(`/dividends/${id}`), "dividend.remove")
};

export const contributionRecordsApi = {
  list: () => getRecords<ContributionRecord>("/contributions", ["contributions"]),
  create: async (input: ContributionRecord) => mutate(() => api.post<ApiEnvelope<ContributionRecord>>("/contributions", input), "contribution.create"),
  update: async (id: string, input: Partial<ContributionRecord>) => mutate(() => api.put<ApiEnvelope<ContributionRecord>>(`/contributions/${id}`, input), "contribution.update"),
  remove: async (id: string) => mutate(() => api.delete(`/contributions/${id}`), "contribution.remove")
};

export const cashBoxRecordsApi = {
  list: () => getRecords<CashBoxRecord>("/cash-boxes", ["cashBoxes"]),
  overview: async () =>
    cachedRequest(
      workspaceQueryKeys.cashBoxesOverview(),
      ["cashBoxes"],
      "cashBoxes",
      () => api.get<ApiEnvelope<{ totals: { currentBalance: number; deposited: number; withdrawn: number; yield: number; profitability: number }; cashBoxes: CashBoxRecord[]; history: CashBoxMovementRecord[]; evolution: Array<{ month: string; value: number }> }>>("/cash-boxes")
    ),
  create: async (input: CashBoxRecord) => mutate(() => api.post<ApiEnvelope<CashBoxRecord>>("/cash-boxes", input), "cashBox.create"),
  update: async (id: string, input: Partial<CashBoxRecord>) => mutate(() => api.put<ApiEnvelope<CashBoxRecord>>(`/cash-boxes/${id}`, input), "cashBox.update"),
  contribution: async (id: string, input: Pick<CashBoxMovementRecord, "value" | "date" | "description">) =>
    mutate(() => api.post<ApiEnvelope<CashBoxRecord>>(`/cash-boxes/${id}/contributions`, input), "cashBox.contribution"),
  withdrawal: async (id: string, input: Pick<CashBoxMovementRecord, "value" | "date" | "description">) =>
    mutate(() => api.post<ApiEnvelope<CashBoxRecord>>(`/cash-boxes/${id}/withdrawals`, input), "cashBox.withdrawal"),
  recalculate: async () => mutate(() => api.post<ApiEnvelope<unknown>>("/cash-boxes/recalculate", {}), "cashBox.recalculate"),
  remove: async (id: string) => mutate(() => api.delete(`/cash-boxes/${id}`), "cashBox.remove")
};

export const goalRecordsApi = {
  list: () => getRecords<GoalRecord>("/goals", ["goals"]),
  create: async (input: GoalRecord) => mutate(() => api.post<ApiEnvelope<GoalRecord>>("/goals", input), "goal.create"),
  update: async (id: string, input: Partial<GoalRecord>) => mutate(() => api.put<ApiEnvelope<GoalRecord>>(`/goals/${id}`, input), "goal.update"),
  remove: async (id: string) => mutate(() => api.delete(`/goals/${id}`), "goal.remove")
};

export const monthlyPlanningApi = {
  overview: async (year: number, month: number, comparisonRange = 1) => {
    return cachedRequest(
      workspaceQueryKeys.monthlyPlanningOverview(year, month, comparisonRange),
      ["monthlyPlanning"],
      "monthlyPlanning",
      () => api.get<ApiEnvelope<MonthlyPlanningOverview>>("/monthly-planning", { params: { year, month, comparisonRange } })
    );
  },
  savePlan: async (input: MonthlyPlanRecord) => mutate(() => api.post<ApiEnvelope<MonthlyPlanRecord>>("/monthly-planning", input), "monthlyPlanning.savePlan"),
  updatePlan: async (id: string, input: Partial<MonthlyPlanRecord>) => mutate(() => api.put<ApiEnvelope<MonthlyPlanRecord>>(`/monthly-planning/${id}`, input), "monthlyPlanning.updatePlan"),
  copyPrevious: async (year: number, month: number) => mutate(() => api.post<ApiEnvelope<MonthlyPlanRecord>>("/monthly-planning/copy-previous", { year, month }), "monthlyPlanning.copyPrevious"),
  createExpense: async (planId: string, input: Omit<MonthlyExpenseRecord, "id" | "planId">) =>
    mutate(() => api.post<ApiEnvelope<MonthlyExpenseRecord>>(`/monthly-planning/${planId}/expenses`, input), "monthlyPlanning.createExpense"),
  createIncomeEntry: async (planId: string, input: Omit<MonthlyIncomeEntryRecord, "id" | "planId">) =>
    mutate(() => api.post<ApiEnvelope<MonthlyIncomeEntryRecord>>(`/monthly-planning/${planId}/income-entries`, input), "monthlyPlanning.createIncomeEntry"),
  completeExpense: async (id: string, input: { completedAt?: string }, comparisonRange = 1) =>
    mutate(
      () => api.patch<ApiEnvelope<MonthlyExpenseCompletionResult>>(`/monthly-planning/expenses/${id}/complete`, input, { params: { comparisonRange } }),
      "monthlyPlanning.completeExpense"
    ),
  receiveIncomeEntry: async (id: string, input: { receivedAt?: string }, comparisonRange = 1) =>
    mutate(
      () => api.patch<ApiEnvelope<MonthlyIncomeEntryCompletionResult>>(`/monthly-planning/income-entries/${id}/receive`, input, { params: { comparisonRange } }),
      "monthlyPlanning.receiveIncomeEntry"
    ),
  updateExpense: async (id: string, input: Partial<MonthlyExpenseRecord>, scope: "single" | "series" = "single") =>
    mutate(() => api.put<ApiEnvelope<MonthlyExpenseRecord>>(`/monthly-planning/expenses/${id}`, input, { params: { scope } }), "monthlyPlanning.updateExpense"),
  updateIncomeEntry: async (id: string, input: Partial<MonthlyIncomeEntryRecord>, scope: "single" | "series" = "single") =>
    mutate(() => api.put<ApiEnvelope<MonthlyIncomeEntryRecord>>(`/monthly-planning/income-entries/${id}`, input, { params: { scope } }), "monthlyPlanning.updateIncomeEntry"),
  removeExpense: async (id: string, scope: "single" | "series" = "single") => mutate(() => api.delete(`/monthly-planning/expenses/${id}`, { params: { scope } }), "monthlyPlanning.removeExpense"),
  removeIncomeEntry: async (id: string, scope: "single" | "series" = "single") => mutate(() => api.delete(`/monthly-planning/income-entries/${id}`, { params: { scope } }), "monthlyPlanning.removeIncomeEntry")
};

