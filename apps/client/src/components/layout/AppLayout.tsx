import { Command, LogOut, Menu, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { navigationItems } from "../../constants/navigation";
import { refreshMarketData } from "../../services/api";
import { useInvestmentStore } from "../../stores/useInvestmentStore";

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
  const isPortfolioPage = location.pathname === "/carteira";

  useEffect(() => {
    if (!isDrawerOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsDrawerOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDrawerOpen]);

  async function handleRefresh() {
    await refreshMarketData();
  }

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  const navigation = (onNavigate?: () => void) => (
    <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {navigationItems.map((item) => {
        const Icon = item.icon;

        return (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onNavigate}
            className={({ isActive }) =>
              [
                "group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition",
                isActive ? "bg-elevated text-ink shadow-soft" : "text-muted hover:bg-elevated/70 hover:text-ink"
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
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu de navegacao">
          <button type="button" className="absolute inset-0 h-full w-full bg-black/60 backdrop-blur-sm" aria-label="Fechar menu" onClick={() => setIsDrawerOpen(false)} />
          <aside className="relative z-50 flex h-full w-[80vw] max-w-80 flex-col border-r border-line bg-panel shadow-soft pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1rem)]">
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
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm text-muted">Dashboard de investimentos</p>
              <p className="hidden truncate text-xs text-muted/70 xs:block">{error ? "Falha ao sincronizar" : "MongoDB conectado e dados sincronizados"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleRefresh()}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line bg-panel text-muted transition hover:border-accent/50 hover:text-ink"
              title="Atualizar dados"
              aria-label="Atualizar dados"
            >
              <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
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

        {error ? (
          <div className="mx-3 mt-4 rounded-lg border border-rose/40 bg-rose/10 px-4 py-3 text-sm text-rose sm:mx-4 md:mx-6 lg:mx-8">
            {error}
          </div>
        ) : null}

        <main className={["mx-auto w-full max-w-7xl px-3 pb-8 pt-5 sm:px-4 md:px-6 lg:px-8 lg:pb-10", isPortfolioPage ? "portfolio-main" : ""].join(" ")}>
          {children}
        </main>
      </div>
    </div>
  );
}
