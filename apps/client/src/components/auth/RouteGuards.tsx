import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";

const loadingCard = (
  <div className="grid min-h-screen place-items-center bg-canvas px-4 text-ink">
    <div className="rounded-lg border border-line bg-panel p-6 text-sm text-muted shadow-soft">Carregando sessao...</div>
  </div>
);

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return loadingCard;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return loadingCard;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}
