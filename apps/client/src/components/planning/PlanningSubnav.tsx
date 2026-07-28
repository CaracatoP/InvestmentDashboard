import { NavLink } from "react-router-dom";

const planningSubnavItems = [
  { label: "Visao geral", path: "/planejamento-mensal" },
  { label: "Orcamento", path: "/planejamento-mensal/orcamento" },
  { label: "Gastos", path: "/planejamento-mensal/gastos" },
  { label: "Calendario", path: "/planejamento-mensal/calendario" },
  { label: "Objetivos", path: "/planejamento-mensal/objetivos" },
  { label: "Analises", path: "/planejamento-mensal/analises" }
] as const;

export function PlanningSubnav() {
  return (
    <nav className="scrollbar-thin mb-4 flex gap-2 overflow-x-auto rounded-lg border border-line bg-panel p-2 shadow-soft" aria-label="Navegacao de planejamento">
      {planningSubnavItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === "/planejamento-mensal"}
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
