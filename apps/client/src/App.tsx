import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { onWorkspaceCacheInvalidated } from "./services/cache-invalidation";
import { getWorkspaceDomainsForPath } from "./services/route-workspace-domains";
import { useInvestmentStore } from "./stores/useInvestmentStore";
import { applyThemePreference, normalizeThemePreference, onSystemThemeChange } from "./theme/app-theme";
import { setCurrencyPreference } from "./utils/formatters";

export function App() {
  const location = useLocation();
  const loadWorkspace = useInvestmentStore((state) => state.loadWorkspace);
  const settings = useInvestmentStore((state) => state.settings);

  useEffect(() => {
    void loadWorkspace(getWorkspaceDomainsForPath(location.pathname));
  }, [loadWorkspace, location.pathname]);

  useEffect(() => onWorkspaceCacheInvalidated((domains) => {
    void loadWorkspace(domains);
  }), [loadWorkspace]);

  useEffect(() => {
    const themePreference = normalizeThemePreference(settings?.profile.theme);
    applyThemePreference(themePreference, { persist: true });
    if (themePreference !== "system") return undefined;
    return onSystemThemeChange(() => applyThemePreference(themePreference, { persist: true }));
  }, [settings?.profile.theme]);

  useEffect(() => {
    setCurrencyPreference(settings?.profile.currency);
  }, [settings?.profile.currency]);

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
