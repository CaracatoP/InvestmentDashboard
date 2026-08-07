import { create } from "zustand";
import {
  fetchContributions,
  fetchDashboard,
  fetchDividends,
  fetchGoals,
  fetchHistory,
  fetchPortfolio,
  fetchSettings
} from "../services/api";
import type { WorkspaceCacheDomain } from "../services/cache-invalidation";
import { createLatestRequestTracker } from "../services/request-order";
import type {
  ContributionsResponse,
  DashboardResponse,
  DividendsResponse,
  Goal,
  Movement,
  PortfolioResponse,
  SettingsResponse
} from "../types/investments";

interface InvestmentStore {
  dashboard: DashboardResponse | null;
  portfolio: PortfolioResponse | null;
  dividends: DividendsResponse | null;
  contributions: ContributionsResponse | null;
  goals: Goal[];
  history: Movement[];
  settings: SettingsResponse | null;
  isLoading: boolean;
  error: string | null;
  setSettings: (settings: SettingsResponse) => void;
  loadWorkspace: (domains?: WorkspaceCacheDomain[]) => Promise<void>;
}

const workspaceDataDomains = ["dashboard", "portfolio", "dividends", "contributions", "goals", "history", "settings"] as const;
type WorkspaceDataDomain = (typeof workspaceDataDomains)[number];
const workspaceDataDomainSet = new Set<WorkspaceDataDomain>(workspaceDataDomains);
const workspaceRequestTracker = createLatestRequestTracker<WorkspaceDataDomain>();

function normalizeRequestedDomains(domains?: WorkspaceCacheDomain[]): WorkspaceDataDomain[] {
  if (!domains || domains.includes("all")) return [...workspaceDataDomains];
  return Array.from(new Set(domains.filter((domain): domain is WorkspaceDataDomain => workspaceDataDomainSet.has(domain as WorkspaceDataDomain))));
}

export const useInvestmentStore = create<InvestmentStore>((set) => ({
  dashboard: null,
  portfolio: null,
  dividends: null,
  contributions: null,
  goals: [],
  history: [],
  settings: null,
  isLoading: false,
  error: null,
  setSettings: (settings) => set({ settings }),
  loadWorkspace: async (domains) => {
    const requestedDomains = normalizeRequestedDomains(domains);
    if (requestedDomains.length === 0) return;

    const fullLoad = !domains || domains.includes("all");
    const requestVersions = workspaceRequestTracker.start(requestedDomains);
    if (fullLoad) set({ isLoading: true, error: null });
    else set({ error: null });

    try {
      const updates: Partial<Pick<InvestmentStore, WorkspaceDataDomain>> = {};
      const tasks: Promise<void>[] = [];

      if (requestedDomains.includes("dashboard")) tasks.push(fetchDashboard().then((dashboard) => { updates.dashboard = dashboard; }));
      if (requestedDomains.includes("portfolio")) tasks.push(fetchPortfolio().then((portfolio) => { updates.portfolio = portfolio; }));
      if (requestedDomains.includes("dividends")) tasks.push(fetchDividends().then((dividends) => { updates.dividends = dividends; }));
      if (requestedDomains.includes("contributions")) tasks.push(fetchContributions().then((contributions) => { updates.contributions = contributions; }));
      if (requestedDomains.includes("goals")) tasks.push(fetchGoals().then((goals) => { updates.goals = goals; }));
      if (requestedDomains.includes("history")) tasks.push(fetchHistory().then((history) => { updates.history = history; }));
      if (requestedDomains.includes("settings")) tasks.push(fetchSettings().then((settings) => { updates.settings = settings; }));

      await Promise.all(tasks);

      const freshUpdates = Object.fromEntries(
        Object.entries(updates).filter(([domain]) => workspaceRequestTracker.isLatest(domain as WorkspaceDataDomain, requestVersions.get(domain as WorkspaceDataDomain) ?? 0))
      ) as Partial<Pick<InvestmentStore, WorkspaceDataDomain>>;

      if (Object.keys(freshUpdates).length === 0 && !fullLoad) return;

      set((state) => ({
        ...state,
        ...freshUpdates,
        isLoading: false
      }));
    } catch (error) {
      const isCurrentRequest = requestedDomains.some((domain) => workspaceRequestTracker.isLatest(domain, requestVersions.get(domain) ?? 0));
      if (!isCurrentRequest) return;

      set({
        error: error instanceof Error ? error.message : "Nao foi possivel carregar os dados.",
        isLoading: false
      });
    }
  }
}));
