import { CircleDollarSign } from "lucide-react";
import { formatCurrency, formatDate } from "../../utils/formatters";

interface ContributionCardProps {
  category: string;
  amount: number;
  date: string;
  notes?: string;
}

export function ContributionCard({ category, amount, date, notes }: ContributionCardProps) {
  return (
    <article className="rounded-lg border border-line bg-panel p-4">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-amber/10 text-amber">
          <CircleDollarSign size={17} />
        </div>
        <div>
          <p className="font-medium text-ink">{category}</p>
          <p className="text-sm text-muted">{formatDate(date)}</p>
        </div>
      </div>
      <p className="mt-3 text-xl font-semibold text-ink">{formatCurrency(amount)}</p>
      {notes ? <p className="mt-1 text-sm text-muted">{notes}</p> : null}
    </article>
  );
}
