import { NavLink } from "react-router-dom";

const investmentSubnavItems = [
  { label: "Visao geral", path: "/investimentos" },
  { label: "Carteira", path: "/investimentos/carteira" },
  { label: "Aportes", path: "/investimentos/aportes" },
  { label: "Dividendos", path: "/investimentos/dividendos" },
  { label: "Metas", path: "/investimentos/metas" },
  { label: "Analises", path: "/investimentos/analises" }
] as const;

export function InvestmentsSubnav() {
  return (
    <nav className="scrollbar-thin mb-4 flex gap-2 overflow-x-auto rounded-lg border border-line bg-panel p-2 shadow-soft" aria-label="Navegacao de investimentos">
      {investmentSubnavItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === "/investimentos"}
          className={({ isActive }) =>
            [
              "inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg px-3 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              isActive ? "bg-elevated text-ink shadow-soft" : "text-muted hover:bg-elevated/70 hover:text-ink"
            ].join(" ")
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
