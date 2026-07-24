import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatPercentage } from "../../utils/formatters";

interface MoneyCardProps {
  label: string;
  value: string;
  percentage?: number;
}

export function MoneyCard({ label, value, percentage }: MoneyCardProps) {
  const positive = (percentage ?? 0) >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;

  return (
    <article className="rounded-lg border border-line bg-elevated p-4">
      <p className="text-sm text-muted">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-2xl font-semibold tracking-normal text-ink">{value}</p>
        {percentage !== undefined ? (
          <span className={`inline-flex items-center gap-1 text-sm ${positive ? "text-accent" : "text-rose"}`}>
            <Icon size={16} />
            {formatPercentage(percentage)}
          </span>
        ) : null}
      </div>
    </article>
  );
}
