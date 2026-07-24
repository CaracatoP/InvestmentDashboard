import { Target } from "lucide-react";
import type { Goal } from "../../types/investments";
import { formatCurrency, formatPercentage } from "../../utils/formatters";
import { ProgressBar } from "../ui/ProgressBar";

interface GoalCardProps {
  goal: Goal;
}

export function GoalCard({ goal }: GoalCardProps) {
  const isMoney = goal.type !== "shares";

  return (
    <article className="rounded-lg border border-line bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">{goal.title}</p>
          <p className="mt-1 text-sm text-muted">{goal.category ?? goal.assetTicker ?? "Meta"}</p>
        </div>
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-violet/10 text-violet">
          <Target size={17} />
        </div>
      </div>
      <div className="mt-5">
        <ProgressBar value={goal.progress} tone="violet" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        <span className="text-muted">{formatPercentage(goal.progress)}</span>
        <span className="font-medium text-ink">
          {isMoney ? formatCurrency(goal.current) : goal.current} / {isMoney ? formatCurrency(goal.target) : goal.target}
        </span>
      </div>
    </article>
  );
}
