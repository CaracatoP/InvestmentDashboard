import { Target } from "lucide-react";
import type { Goal } from "../../types/investments";
import { formatCurrency, formatPercentage } from "../../utils/formatters";
import { ProgressBar } from "../ui/ProgressBar";
import { MoneyValue } from "../ui/ValueDisplay";

interface GoalCardProps {
  goal: Goal;
}

export function GoalCard({ goal }: GoalCardProps) {
  const isMoney = goal.type !== "shares";

  return (
    <article className="min-w-0 rounded-lg border border-line bg-panel p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{goal.title}</p>
          <p className="mt-1 text-sm text-muted">{goal.category ?? goal.assetTicker ?? "Meta"}</p>
        </div>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet/10 text-violet">
          <Target size={17} />
        </div>
      </div>
      <div className="mt-5">
        <ProgressBar value={goal.progress} tone="violet" />
      </div>
      <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted">{formatPercentage(goal.progress)}</span>
        <span className="min-w-0 font-medium text-ink">
          {isMoney ? (
            <>
              <MoneyValue value={formatCurrency(goal.current)} /> / <MoneyValue value={formatCurrency(goal.target)} />
            </>
          ) : (
            `${goal.current} / ${goal.target}`
          )}
        </span>
      </div>
    </article>
  );
}
