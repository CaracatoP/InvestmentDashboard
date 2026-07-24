import { Command, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { navigationItems } from "../../constants/navigation";
import { useInvestmentStore } from "../../stores/useInvestmentStore";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const loadWorkspace = useInvestmentStore((state) => state.loadWorkspace);
  const isLoading = useInvestmentStore((state) => state.isLoading);
  const error = useInvestmentStore((state) => state.error);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <aside className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 backdrop-blur lg:inset-y-0 lg:left-0 lg:right-auto lg:w-64 lg:border-r lg:border-t-0">
        <div className="hidden h-16 items-center gap-3 border-b border-line px-5 lg:flex">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/15 text-accent">
            <Command size={19} />
          </div>
          <div>
            <p className="text-sm font-semibold">Invest Hub</p>
            <p className="text-xs text-muted">Carteira pessoal</p>
          </div>
        </div>
        <nav className="scrollbar-thin flex gap-1 overflow-x-auto px-2 py-2 lg:block lg:space-y-1 lg:px-3 lg:py-4">
          {navigationItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  [
                    "group flex min-w-12 items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm transition lg:justify-start",
                    isActive ? "bg-elevated text-ink shadow-soft" : "text-muted hover:bg-elevated/70 hover:text-ink"
                  ].join(" ")
                }
                title={item.label}
              >
                <Icon size={18} className="shrink-0" />
                <span className="hidden lg:inline">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-canvas/90 px-4 backdrop-blur md:px-8">
          <div>
            <p className="text-sm text-muted">Dashboard de investimentos</p>
            <p className="text-xs text-muted/70">Atualizado com dados locais e MongoDB-ready</p>
          </div>
          <button
            type="button"
            onClick={() => void loadWorkspace()}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-panel text-muted transition hover:border-accent/50 hover:text-ink"
            title="Atualizar dados"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
          </button>
        </header>

        {error ? (
          <div className="mx-4 mt-4 rounded-lg border border-rose/40 bg-rose/10 px-4 py-3 text-sm text-rose md:mx-8">
            {error}
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-6 md:px-8 lg:pb-10">{children}</main>
      </div>
    </div>
  );
}
