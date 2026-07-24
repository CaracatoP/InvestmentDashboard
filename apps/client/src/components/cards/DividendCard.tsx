import { Coins } from "lucide-react";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { MoneyValue } from "../ui/ValueDisplay";

interface DividendCardProps {
  ticker: string;
  amount: number;
  date: string;
}

export function DividendCard({ ticker, amount, date }: DividendCardProps) {
  return (
    <article className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/10 text-accent">
          <Coins size={17} />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-ink">{ticker}</p>
          <p className="text-sm text-muted">{formatDate(date)}</p>
        </div>
      </div>
      <p className="min-w-0 shrink-0 font-semibold text-accent">
        <MoneyValue value={formatCurrency(amount)} />
      </p>
    </article>
  );
}
