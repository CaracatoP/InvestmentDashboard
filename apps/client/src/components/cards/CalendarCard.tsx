import { CalendarDays } from "lucide-react";
import type { Movement } from "../../types/investments";
import { formatCurrency, formatDate } from "../../utils/formatters";

interface CalendarCardProps {
  event: Movement;
}

export function CalendarCard({ event }: CalendarCardProps) {
  return (
    <article className="min-w-0 rounded-lg border border-line bg-panel p-4 transition hover:border-aqua/50">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-aqua/10 text-aqua">
          <CalendarDays size={18} />
        </div>
        <span className="text-xs text-muted">{formatDate(event.date)}</span>
      </div>
      <p className="mt-4 break-words font-semibold text-ink">{event.type}</p>
      <p className="mt-1 break-words text-sm text-muted">{event.title}</p>
      <p className="mt-3 break-words text-sm font-medium text-accent [overflow-wrap:anywhere]">{formatCurrency(event.amount)}</p>
    </article>
  );
}
