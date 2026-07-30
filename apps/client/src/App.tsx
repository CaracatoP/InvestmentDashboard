import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { onWorkspaceCacheInvalidated } from "./services/cache-invalidation";
import { useInvestmentStore } from "./stores/useInvestmentStore";
import { applyThemePreference, normalizeThemePreference, onSystemThemeChange } from "./theme/app-theme";
import { setCurrencyPreference } from "./utils/formatters";

export function App() {
  const loadWorkspace = useInvestmentStore((state) => state.loadWorkspace);
  const settings = useInvestmentStore((state) => state.settings);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => onWorkspaceCacheInvalidated(() => {
    void loadWorkspace();
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
