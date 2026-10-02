import { Command, LogOut, Menu, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { navigationItems } from "../../constants/navigation";
import { refreshMarketData } from "../../services/api";
import { useInvestmentStore } from "../../stores/useInvestmentStore";

import { useDialogFocus } from "../../hooks/useDialogFocus";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const profileName = useInvestmentStore((state) => state.settings?.profile.name);
  const isLoading = useInvestmentStore((state) => state.isLoading);
  const error = useInvestmentStore((state) => state.error);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const drawerRef = useDialogFocus<HTMLElement>(isDrawerOpen, () => setIsDrawerOpen(false));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const [refreshMessage, setRefreshMessage] = useState("");
  const [refreshFailed, setRefreshFailed] = useState(false);
  const currentSection = navigationItems.find((item) => item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path));
  const isPortfolioPage = location.pathname === "/carteira" || location.pathname === "/investimentos/carteira";

  useEffect(() => { setIsDrawerOpen(false); }, [location.pathname]);
  useEffect(() => {
    const wideScreen = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (wideScreen.matches) setIsDrawerOpen(false); };
    wideScreen.addEventListener("change", closeOnDesktop);
    return () => wideScreen.removeEventListener("change", closeOnDesktop);
  }, []);

  async function handleRefresh() {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setIsRefreshing(true);
    setRefreshMessage("");
    setRefreshFailed(false);
    try {
      const result = await refreshMarketData();
      setRefreshMessage(result.failed > 0 || result.stale > 0
        ? "Atualização parcial. Algumas cotações mantêm o último valor disponível."
        : result.updated > 0 ? "Cotações atualizadas." : "Nenhuma cotação nova disponível.");
    } catch {
      setRefreshFailed(true);
      setRefreshMessage("Não foi possível atualizar as cotações. Tente novamente.");
    } finally {
      refreshingRef.current = false;
      setIsRefreshing(false);
    }
  }

  async function handleLogout() {
    try { await logout(); } catch { /* AuthProvider clears the local session even on failure. */ }
    navigate("/login", { replace: true });
  }

  const navigation = (onNavigate?: () => void) => (
    <nav aria-label="Navegação principal" className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {navigationItems.map((item) => {
        const Icon = item.icon;

        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            onClick={onNavigate}
            className={({ isActive }) =>
              [
                "group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition",
                isActive ? "bg-accent/10 font-semibold text-ink" : "text-muted hover:bg-elevated/70 hover:text-ink"
              ].join(" ")
            }
            title={item.label}
          >
            <Icon size={18} className="shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <a href="#main-content" className="skip-link">Pular para o conteúdo</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-panel/95 backdrop-blur lg:flex">
        <div className="flex h-16 items-center gap-3 border-b border-line px-5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/15 text-accent">
            <Command size={19} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Invest Hub</p>
            <p className="truncate text-xs text-muted">{profileName || user?.name || "Carteira pessoal"}</p>
          </div>
        </div>
        {navigation()}
      </aside>

      {isDrawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" tabIndex={-1} className="absolute inset-0 h-full w-full bg-black/60 backdrop-blur-sm" aria-label="Fechar menu" onClick={() => setIsDrawerOpen(false)} />
          <aside ref={drawerRef} id="mobile-navigation" tabIndex={-1} role="dialog" aria-modal="true" aria-label="Menu de navegação" className="relative z-50 flex h-full w-[80vw] max-w-80 flex-col border-r border-line bg-panel shadow-soft pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1rem)]">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
                  <Command size={19} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">Invest Hub</p>
                  <p className="truncate text-xs text-muted">{profileName || user?.name || "Carteira pessoal"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line bg-elevated text-muted transition hover:text-ink"
                aria-label="Fechar menu"
              >
                <X size={18} />
              </button>
            </div>
            {navigation(() => setIsDrawerOpen(false))}
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-line bg-canvas/90 px-3 py-2 backdrop-blur sm:px-4 md:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line bg-panel text-muted transition hover:border-accent/50 hover:text-ink lg:hidden"
              aria-label="Abrir menu"
              aria-expanded={isDrawerOpen}
              aria-controls={isDrawerOpen ? "mobile-navigation" : undefined}
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{currentSection?.label ?? "Investimentos"}</p>
              <p className="hidden truncate text-xs text-muted xs:block">{error ? "Dados indisponíveis no momento" : isLoading ? "Carregando seus dados…" : "Sua organização financeira"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleRefresh()}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line bg-panel text-muted transition hover:border-accent/50 hover:text-ink"
              disabled={isRefreshing}
              title="Atualizar cotações"
              aria-label={isRefreshing ? "Atualizando cotações" : "Atualizar cotações"}
              aria-busy={isRefreshing}
            >
              <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line bg-panel text-muted transition hover:border-rose/50 hover:text-rose"
              title="Sair"
              aria-label="Sair"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <div role="status" aria-live="polite" aria-atomic="true">
          {refreshMessage ? <p className={`mx-3 mt-4 rounded-lg border px-4 py-3 text-sm sm:mx-4 md:mx-6 lg:mx-8 ${refreshFailed ? "border-rose/40 bg-rose/10 text-rose" : "border-line bg-panel text-ink"}`}>{refreshMessage}</p> : null}
        </div>

        {error ? (
          <div role="alert" className="mx-3 mt-4 rounded-lg border border-rose/40 bg-rose/10 px-4 py-3 text-sm text-rose sm:mx-4 md:mx-6 lg:mx-8">
            {error}
          </div>
        ) : null}

        <main id="main-content" tabIndex={-1} className={["mx-auto w-full max-w-7xl px-3 pb-8 pt-5 sm:px-4 md:px-6 lg:px-8 lg:pb-10", isPortfolioPage ? "portfolio-main" : ""].join(" ")}>
          {children}
        </main>
      </div>
    </div>
  );
}
