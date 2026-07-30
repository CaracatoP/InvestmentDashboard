import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { invalidateWorkspaceCache } from "./cache-invalidation";
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
  DividendRecord,
  GoalRecord,
  MonthlyExpenseRecord,
  MonthlyPlanningOverview,
  MonthlyPlanRecord,
  OperationRecord
} from "../types/management";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 12000
});

type ApiEnvelope<T> = T | { data: T };

type AssetPriceHistoryRequestOptions = {
  signal?: AbortSignal;
  forceRefresh?: boolean;
  interval?: string;
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

function unwrapData<T>(payload: ApiEnvelope<T>): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return payload.data as T;
  }

  return payload as T;
}

async function mutate<T>(request: () => Promise<{ data: ApiEnvelope<T> }>) {
  const { data } = await request();
  invalidateWorkspaceCache();
  return unwrapData(data);
}

export async function fetchDashboard() {
  const { data } = await api.get<ApiEnvelope<DashboardResponse>>("/dashboard");
  return unwrapData(data);
}

export async function fetchPortfolio() {
  const { data } = await api.get<ApiEnvelope<PortfolioResponse>>("/assets");
  return unwrapData(data);
}

export async function fetchAsset(ticker: string) {
  const { data } = await api.get<ApiEnvelope<AssetDetails>>(`/assets/${ticker}`);
  return unwrapData(data);
}

function normalizeHistoryOptions(options?: AbortSignal | AssetPriceHistoryRequestOptions): AssetPriceHistoryRequestOptions {
  if (!options) return {};
  if ("aborted" in options) return { signal: options };
  return options;
}

function getAssetHistoryCacheKey(ticker: string, range: string, interval?: string) {
  return `${ticker.toUpperCase()}-${range}-${interval ?? "auto"}`;
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
  if (!normalizedOptions.forceRefresh && cached && Date.now() <= cached.expiresAt) return cached.payload;

  const inflight = assetPriceHistoryInflight.get(key);
  if (!normalizedOptions.forceRefresh && inflight) return raceWithSignal(inflight, normalizedOptions.signal);

  const request = api.get<ApiEnvelope<AssetPriceHistoryResponse>>(`/assets/${ticker}/history`, {
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
    assetPriceHistoryInflight.delete(key);
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
  const { data } = await api.get<ApiEnvelope<DividendsResponse>>("/dividends");
  return unwrapData(data);
}

export async function fetchContributions() {
  const { data } = await api.get<ApiEnvelope<ContributionsResponse>>("/contributions");
  return unwrapData(data);
}

export async function createContribution(input: { date: string; amount: number; category: string; notes?: string }) {
  const { data } = await api.post<ApiEnvelope<unknown>>("/contributions", input);
  invalidateWorkspaceCache();
  return unwrapData(data);
}

export async function fetchGoals() {
  const { data } = await api.get<ApiEnvelope<Goal[]>>("/goals");
  return unwrapData(data);
}

export async function createGoal(input: Omit<Goal, "progress">) {
  const { data } = await api.post<ApiEnvelope<unknown>>("/goals", input);
  invalidateWorkspaceCache();
  return unwrapData(data);
}

export async function calculateProjection(input: ProjectionInput) {
  const { data } = await api.post<ApiEnvelope<ProjectionResponse>>("/projections", input);
  return unwrapData(data);
}

export async function fetchAiHealth() {
  const { data } = await api.get<ApiEnvelope<AiHealth>>("/ai/health", { timeout: 130000 });
  return unwrapData(data);
}

export async function generateAiAnalysis(input: {
  year: number;
  month: number;
  analysisType: AiAnalysisType;
  categoryId?: string;
  forceRefresh?: boolean;
}) {
  const { data } = await api.post<ApiEnvelope<AiAnalysisResult>>("/ai/analyses", input, { timeout: 130000 });
  return unwrapData(data);
}

export async function fetchAiAnalyses(limit = 20) {
  const { data } = await api.get<ApiEnvelope<AiStoredAnalysis[]>>("/ai/analyses", { params: { limit } });
  return unwrapData(data);
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
    return unwrapData(data);
  },
  removeSession: async (sessionId: string) => {
    await api.delete(`/ai/chat/sessions/${sessionId}`);
  }
};

export async function fetchHistory() {
  const { data } = await api.get<ApiEnvelope<Movement[]>>("/history");
  return unwrapData(data);
}

export async function fetchSettings() {
  const { data } = await api.get<ApiEnvelope<SettingsResponse>>("/settings");
  return unwrapData(data);
}

export async function updateSettingsProfile(input: { profileName: string; theme: SettingsResponse["profile"]["theme"]; currency: SettingsResponse["profile"]["currency"] }) {
  const { data } = await api.put<ApiEnvelope<SettingsResponse>>("/settings", input);
  invalidateWorkspaceCache();
  return unwrapData(data);
}

export async function fetchMarketStatus() {
  const { data } = await api.get<ApiEnvelope<unknown>>("/market/status");
  return unwrapData(data);
}

export async function refreshMarketData() {
  const { data } = await api.post<ApiEnvelope<MarketRefreshResponse>>("/market/refresh");
  invalidateWorkspaceCache();
  return unwrapData(data);
}

export async function fetchCdiStatus() {
  const { data } = await api.get<ApiEnvelope<CdiStatusResponse>>("/cdi/status");
  return unwrapData(data);
}

export async function refreshCdiData() {
  const { data } = await api.post<ApiEnvelope<CdiRefreshResponse>>("/cdi/refresh");
  invalidateWorkspaceCache();
  return unwrapData(data);
}

export async function updateAllocations(allocations: SettingsResponse["allocations"]) {
  const { data } = await api.put<ApiEnvelope<unknown>>("/settings/allocations", { allocations });
  invalidateWorkspaceCache();
  return unwrapData(data);
}

async function getRecords<T>(path: string) {
  const { data } = await api.get<ApiEnvelope<T[]>>(path, { params: { mode: "records" } });
  return unwrapData(data);
}

export const assetRecordsApi = {
  list: () => getRecords<AssetRecord>("/assets"),
  create: async (input: AssetRecord) => mutate(() => api.post<ApiEnvelope<AssetRecord>>("/assets", input)),
  update: async (id: string, input: Partial<AssetRecord>) => mutate(() => api.put<ApiEnvelope<AssetRecord>>(`/assets/${id}`, input)),
  remove: async (id: string) => mutate(() => api.delete(`/assets/${id}`))
};

export const operationRecordsApi = {
  list: () => getRecords<OperationRecord>("/operations"),
  create: async (input: OperationRecord) => mutate(() => api.post<ApiEnvelope<OperationRecord>>("/operations", input)),
  update: async (id: string, input: Partial<OperationRecord>) => mutate(() => api.put<ApiEnvelope<OperationRecord>>(`/operations/${id}`, input)),
  remove: async (id: string) => mutate(() => api.delete(`/operations/${id}`))
};

export const dividendRecordsApi = {
  list: () => getRecords<DividendRecord>("/dividends"),
  create: async (input: DividendRecord) => mutate(() => api.post<ApiEnvelope<DividendRecord>>("/dividends", input)),
  update: async (id: string, input: Partial<DividendRecord>) => mutate(() => api.put<ApiEnvelope<DividendRecord>>(`/dividends/${id}`, input)),
  remove: async (id: string) => mutate(() => api.delete(`/dividends/${id}`))
};

export const contributionRecordsApi = {
  list: () => getRecords<ContributionRecord>("/contributions"),
  create: async (input: ContributionRecord) => mutate(() => api.post<ApiEnvelope<ContributionRecord>>("/contributions", input)),
  update: async (id: string, input: Partial<ContributionRecord>) => mutate(() => api.put<ApiEnvelope<ContributionRecord>>(`/contributions/${id}`, input)),
  remove: async (id: string) => mutate(() => api.delete(`/contributions/${id}`))
};

export const cashBoxRecordsApi = {
  list: () => getRecords<CashBoxRecord>("/cash-boxes"),
  overview: async () => unwrapData((await api.get<ApiEnvelope<{ totals: { currentBalance: number; deposited: number; withdrawn: number; yield: number; profitability: number }; cashBoxes: CashBoxRecord[]; history: CashBoxMovementRecord[]; evolution: Array<{ month: string; value: number }> }>>("/cash-boxes")).data),
  create: async (input: CashBoxRecord) => mutate(() => api.post<ApiEnvelope<CashBoxRecord>>("/cash-boxes", input)),
  update: async (id: string, input: Partial<CashBoxRecord>) => mutate(() => api.put<ApiEnvelope<CashBoxRecord>>(`/cash-boxes/${id}`, input)),
  contribution: async (id: string, input: Pick<CashBoxMovementRecord, "value" | "date" | "description">) =>
    mutate(() => api.post<ApiEnvelope<CashBoxRecord>>(`/cash-boxes/${id}/contributions`, input)),
  withdrawal: async (id: string, input: Pick<CashBoxMovementRecord, "value" | "date" | "description">) =>
    mutate(() => api.post<ApiEnvelope<CashBoxRecord>>(`/cash-boxes/${id}/withdrawals`, input)),
  recalculate: async () => mutate(() => api.post<ApiEnvelope<unknown>>("/cash-boxes/recalculate", {})),
  remove: async (id: string) => mutate(() => api.delete(`/cash-boxes/${id}`))
};

export const goalRecordsApi = {
  list: () => getRecords<GoalRecord>("/goals"),
  create: async (input: GoalRecord) => mutate(() => api.post<ApiEnvelope<GoalRecord>>("/goals", input)),
  update: async (id: string, input: Partial<GoalRecord>) => mutate(() => api.put<ApiEnvelope<GoalRecord>>(`/goals/${id}`, input)),
  remove: async (id: string) => mutate(() => api.delete(`/goals/${id}`))
};

export const monthlyPlanningApi = {
  overview: async (year: number, month: number, comparisonRange = 1) => {
    const { data } = await api.get<ApiEnvelope<MonthlyPlanningOverview>>("/monthly-planning", { params: { year, month, comparisonRange } });
    return unwrapData(data);
  },
  savePlan: async (input: MonthlyPlanRecord) => mutate(() => api.post<ApiEnvelope<MonthlyPlanRecord>>("/monthly-planning", input)),
  updatePlan: async (id: string, input: Partial<MonthlyPlanRecord>) => mutate(() => api.put<ApiEnvelope<MonthlyPlanRecord>>(`/monthly-planning/${id}`, input)),
  copyPrevious: async (year: number, month: number) => mutate(() => api.post<ApiEnvelope<MonthlyPlanRecord>>("/monthly-planning/copy-previous", { year, month })),
  createExpense: async (planId: string, input: Omit<MonthlyExpenseRecord, "id" | "planId">) =>
    mutate(() => api.post<ApiEnvelope<MonthlyExpenseRecord>>(`/monthly-planning/${planId}/expenses`, input)),
  updateExpense: async (id: string, input: Partial<MonthlyExpenseRecord>, scope: "single" | "series" = "single") =>
    mutate(() => api.put<ApiEnvelope<MonthlyExpenseRecord>>(`/monthly-planning/expenses/${id}`, input, { params: { scope } })),
  removeExpense: async (id: string, scope: "single" | "series" = "single") => mutate(() => api.delete(`/monthly-planning/expenses/${id}`, { params: { scope } }))
};
