import { Repeat2 } from "lucide-react";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { MoneyValue } from "../ui/ValueDisplay";

interface OperationCardProps {
  type: string;
  ticker: string;
  date: string;
  amount: number;
  description: string;
}

export function OperationCard({ type, ticker, date, amount, description }: OperationCardProps) {
  return (
    <article className="min-w-0 rounded-lg border border-line bg-panel p-4">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-aqua/10 text-aqua">
          <Repeat2 size={17} />
        </div>
        <div className="min-w-0">
          <p className="break-words font-medium text-ink">
            {type} {ticker}
          </p>
          <p className="text-sm text-muted">{formatDate(date)}</p>
        </div>
      </div>
      <p className="mt-3 break-words text-sm text-muted">{description}</p>
      <p className="mt-2 min-w-0 font-semibold text-ink">
        <MoneyValue value={formatCurrency(amount)} />
      </p>
    </article>
  );
}
