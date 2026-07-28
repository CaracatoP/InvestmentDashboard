import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { invalidateWorkspaceCache } from "./cache-invalidation";
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
const assetPriceHistoryCache = new Map<string, AssetPriceHistoryResponse>();

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

export async function fetchAssetPriceHistory(ticker: string, range = "1y", signal?: AbortSignal) {
  const key = `${ticker.toUpperCase()}-${range}`;
  const cached = assetPriceHistoryCache.get(key);
  if (cached) return cached;

  const { data } = await api.get<ApiEnvelope<AssetPriceHistoryResponse>>(`/assets/${ticker}/price-history`, {
    params: { range },
    signal
  });
  const payload = unwrapData(data);
  assetPriceHistoryCache.set(key, payload);
  return payload;
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

export async function fetchHistory() {
  const { data } = await api.get<ApiEnvelope<Movement[]>>("/history");
  return unwrapData(data);
}

export async function fetchSettings() {
  const { data } = await api.get<ApiEnvelope<SettingsResponse>>("/settings");
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
