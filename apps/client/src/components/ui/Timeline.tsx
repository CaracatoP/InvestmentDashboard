import { Circle } from "lucide-react";
import type { Movement } from "../../types/investments";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { MoneyValue } from "./ValueDisplay";

interface TimelineProps {
  items: Movement[];
}

export function Timeline({ items }: TimelineProps) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article key={item.id} className="grid min-w-0 grid-cols-[auto_1fr] gap-3 rounded-lg border border-line bg-panel p-4">
          <div className="pt-1 text-accent">
            <Circle size={12} fill="currentColor" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="break-words font-medium text-ink">{item.type}</p>
              <span className="text-xs text-muted">{formatDate(item.date)}</span>
            </div>
            <p className="mt-1 break-words text-sm text-muted">
              {item.title} - {item.description}
            </p>
            <p className="mt-2 min-w-0 text-sm font-medium text-accent">
              <MoneyValue value={formatCurrency(item.amount)} />
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}
