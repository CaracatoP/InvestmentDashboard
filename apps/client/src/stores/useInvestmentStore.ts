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
  loadWorkspace: () => Promise<void>;
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
  loadWorkspace: async () => {
    set({ isLoading: true, error: null });

    try {
      const [dashboard, portfolio, dividends, contributions, goals, history, settings] = await Promise.all([
        fetchDashboard(),
        fetchPortfolio(),
        fetchDividends(),
        fetchContributions(),
        fetchGoals(),
        fetchHistory(),
        fetchSettings()
      ]);

      set({
        dashboard,
        portfolio,
        dividends,
        contributions,
        goals,
        history,
        settings,
        isLoading: false
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Nao foi possivel carregar os dados.",
        isLoading: false
      });
    }
  }
}));
