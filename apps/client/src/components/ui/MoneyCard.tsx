import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatPercentage } from "../../utils/formatters";
import { MoneyValue } from "./ValueDisplay";

interface MoneyCardProps {
  label: string;
  value: string;
  percentage?: number;
}

export function MoneyCard({ label, value, percentage }: MoneyCardProps) {
  const positive = (percentage ?? 0) >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;

  return (
    <article className="min-w-0 rounded-lg border border-line bg-elevated p-4">
      <p className="text-sm text-muted">{label}</p>
      <div className="mt-3 flex min-w-0 items-end justify-between gap-3">
        <p className="min-w-0 font-semibold tracking-tight text-ink">
          <MoneyValue value={value} size="card" />
        </p>
        {percentage !== undefined ? (
          <span className={`inline-flex shrink-0 items-center gap-1 text-sm ${positive ? "text-accent" : "text-rose"}`}>
            <Icon size={16} />
            {formatPercentage(percentage)}
          </span>
        ) : null}
      </div>
    </article>
  );
}
