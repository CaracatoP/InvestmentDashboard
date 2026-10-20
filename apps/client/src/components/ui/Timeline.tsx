import { ArrowDownLeft, ArrowUpRight, Minus } from "lucide-react";
import type { Movement } from "../../types/investments";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { MoneyValue } from "./ValueDisplay";

interface TimelineProps {
  items: Movement[];
  showStatus?: boolean;
  emptyMessage?: string;
  colorByFlow?: boolean;
  /** Draws the list inside its own panel when it is not already inside a card. */
  framed?: boolean;
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function getMovementFlow(item: Movement): "inflow" | "outflow" | "neutral" {
  const eventType = normalizeText(item.eventType || item.type);
  const source = normalizeText(item.source);

  if (["aporte", "dividendo", "rendimento", "venda", "income", "entrada"].includes(eventType)) return "inflow";
  if (eventType === "resgate") return source === "cashboxes" ? "outflow" : "inflow";
  if (["compra", "gasto", "recorrencia"].includes(eventType)) return "outflow";
  return "neutral";
}

const flowIcon = { inflow: ArrowDownLeft, outflow: ArrowUpRight, neutral: Minus };

function flowClasses(item: Movement, colorByFlow: boolean) {
  const flow = getMovementFlow(item);
  const icon = flow === "inflow" ? "bg-accent/10 text-accent" : flow === "outflow" ? "bg-rose/10 text-rose" : "bg-elevated text-muted";
  if (!colorByFlow) return { flow, icon, amount: "text-ink" };
  return { flow, icon, amount: flow === "inflow" ? "text-accent" : flow === "outflow" ? "text-rose" : "text-muted" };
}

export function Timeline({ items, showStatus = false, emptyMessage = "Nenhum evento encontrado.", colorByFlow = false, framed = false }: TimelineProps) {
  const frame = framed ? "rounded-xl border border-line bg-panel px-4 shadow-soft" : "";

  if (items.length === 0) {
    return <p className={`${framed ? "rounded-xl border border-line bg-panel p-4" : "py-2"} text-sm text-muted`}>{emptyMessage}</p>;
  }

  return (
    <ul className={`min-w-0 divide-y divide-line/70 ${frame}`}>
      {items.map((item) => {
        const tone = flowClasses(item, colorByFlow);
        const Icon = flowIcon[tone.flow];

        return (
          <li key={item.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 py-3.5">
            <span className={`mt-0.5 grid h-8 w-8 place-items-center rounded-full ${tone.icon}`} aria-hidden="true">
              <Icon size={15} />
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="break-words text-sm font-medium text-ink">{item.title || item.type}</p>
                {showStatus && item.statusLabel ? (
                  <span className="rounded-full border border-line bg-elevated px-2 py-0.5 text-xs text-muted">{item.statusLabel}</span>
                ) : null}
              </div>
              <p className="mt-0.5 break-words text-xs leading-5 text-muted">
                {item.type}{item.description ? ` · ${item.description}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-semibold tabular-nums ${tone.amount}`}>
                <MoneyValue value={formatCurrency(item.amount)} />
              </p>
              <p className="mt-0.5 text-xs text-muted">{formatDate(item.date)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
