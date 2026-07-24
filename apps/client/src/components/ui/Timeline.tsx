import { Circle } from "lucide-react";
import type { Movement } from "../../types/investments";
import { formatCurrency, formatDate } from "../../utils/formatters";

interface TimelineProps {
  items: Movement[];
}

export function Timeline({ items }: TimelineProps) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article key={item.id} className="grid grid-cols-[auto_1fr] gap-3 rounded-lg border border-line bg-panel p-4">
          <div className="pt-1 text-accent">
            <Circle size={12} fill="currentColor" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-ink">{item.type}</p>
              <span className="text-xs text-muted">{formatDate(item.date)}</span>
            </div>
            <p className="mt-1 text-sm text-muted">
              {item.title} - {item.description}
            </p>
            <p className="mt-2 text-sm font-medium text-accent">{formatCurrency(item.amount)}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
