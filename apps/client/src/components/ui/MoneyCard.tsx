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
    <article className="min-w-0 rounded-xl border border-line bg-elevated/60 p-4">
      <p className="text-sm text-muted">{label}</p>
      <div className="mt-3 flex min-w-0 items-end justify-between gap-3">
        <p className="min-w-0 font-semibold tracking-tight text-ink">
          <MoneyValue value={value} size="card" />
        </p>
        {percentage !== undefined ? (
          <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums ${positive ? "bg-accent/10 text-accent" : "bg-rose/10 text-rose"}`}>
            <Icon size={14} />
            {formatPercentage(percentage)}
          </span>
        ) : null}
      </div>
    </article>
  );
}
