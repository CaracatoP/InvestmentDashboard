import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { onWorkspaceCacheInvalidated } from "./services/cache-invalidation";
import { useInvestmentStore } from "./stores/useInvestmentStore";

export function App() {
  const loadWorkspace = useInvestmentStore((state) => state.loadWorkspace);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => onWorkspaceCacheInvalidated(() => {
    void loadWorkspace();
  }), [loadWorkspace]);

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
