import { Circle } from "lucide-react";
import type { Movement } from "../../types/investments";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { MoneyValue } from "./ValueDisplay";

interface TimelineProps {
  items: Movement[];
  showStatus?: boolean;
  emptyMessage?: string;
  colorByFlow?: boolean;
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function getMovementFlow(item: Movement) {
  const eventType = normalizeText(item.eventType || item.type);
  const source = normalizeText(item.source);

  if (["aporte", "dividendo", "rendimento", "venda"].includes(eventType)) return "inflow";
  if (eventType === "resgate") return source === "cashboxes" ? "outflow" : "inflow";
  if (["compra", "gasto", "recorrencia"].includes(eventType)) return "outflow";
  return "neutral";
}

function flowClasses(item: Movement, colorByFlow: boolean) {
  if (!colorByFlow) return { dot: "text-accent", amount: "text-accent" };

  const flow = getMovementFlow(item);
  if (flow === "inflow") return { dot: "text-accent", amount: "text-accent" };
  if (flow === "outflow") return { dot: "text-rose", amount: "text-rose" };
  return { dot: "text-muted", amount: "text-muted" };
}

export function Timeline({ items, showStatus = false, emptyMessage = "Nenhum evento encontrado.", colorByFlow = false }: TimelineProps) {
  if (items.length === 0) {
    return <p className="rounded-lg border border-line bg-panel p-4 text-sm text-muted">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const tone = flowClasses(item, colorByFlow);

        return (
          <article key={item.id} className="grid min-w-0 grid-cols-[auto_1fr] gap-3 rounded-lg border border-line bg-panel p-4">
            <div className={`pt-1 ${tone.dot}`}>
              <Circle size={12} fill="currentColor" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="break-words font-medium text-ink">{item.type}</p>
                  {showStatus && item.statusLabel ? (
                    <span className="rounded-full border border-line bg-elevated px-2 py-0.5 text-xs text-muted">{item.statusLabel}</span>
                  ) : null}
                </div>
                <span className="text-xs text-muted">{formatDate(item.date)}</span>
              </div>
              <p className="mt-1 break-words text-sm text-muted">
                {item.title} - {item.description}
              </p>
              <p className={`mt-2 min-w-0 text-sm font-medium ${tone.amount}`}>
                <MoneyValue value={formatCurrency(item.amount)} />
              </p>
            </div>
          </article>
        );
      })}
    </div>
  );
}
