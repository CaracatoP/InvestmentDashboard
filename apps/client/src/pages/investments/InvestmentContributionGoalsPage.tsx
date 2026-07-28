import { CalendarDays, Target, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { InvestmentPlanningBridge } from "../../components/investments/InvestmentPlanningBridge";
import { InvestmentsSubnav } from "../../components/investments/InvestmentsSubnav";
import { PageHeader } from "../../components/ui/PageHeader";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { StatCard } from "../../components/ui/StatCard";
import { monthlyPlanningApi } from "../../services/api";
import type { MonthlyPlanningOverview } from "../../types/management";
import { formatCents, formatPercentage } from "../../utils/formatters";

export default function InvestmentContributionGoalsPage() {
  const [overview, setOverview] = useState<MonthlyPlanningOverview | null>(null);

  useEffect(() => {
    const now = new Date();
    void monthlyPlanningApi.overview(now.getFullYear(), now.getMonth() + 1).then(setOverview).catch(() => setOverview(null));
  }, []);

  return (
    <div>
      <InvestmentsSubnav />
      <PageHeader eyebrow="Metas de aporte" title="Progresso da meta mensal" description="Meta, aportado, restante e percentual atingido vindos do Planejamento Mensal e da aba Aportes." />
      <InvestmentPlanningBridge />
      {overview ? (
        <>
          <section className="stat-card-grid mb-4">
            <StatCard label="Meta mensal" value={formatCents(overview.summary.monthlyContributionGoalInCents)} icon={<Target size={18} />} />
            <StatCard label="Aportado" value={formatCents(overview.summary.contributedThisMonthInCents)} icon={<TrendingUp size={18} />} tone="blue" />
            <StatCard label="Restante" value={formatCents(overview.summary.contributionGoalRemainingInCents)} icon={<CalendarDays size={18} />} tone={overview.summary.contributionGoalRemainingInCents > 0 ? "amber" : "green"} />
            <StatCard label="Percentual atingido" value={formatPercentage(overview.summary.contributionGoalPercent)} icon={<Target size={18} />} tone="violet" />
          </section>
          <section className="rounded-lg border border-line bg-panel p-4 shadow-soft">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="font-medium text-ink">Historico do mes atual</span>
              <span className="text-muted">{formatPercentage(overview.summary.contributionGoalPercent)}</span>
            </div>
            <ProgressBar value={Math.min(overview.summary.contributionGoalPercent, 100)} tone={overview.summary.contributionGoalPercent >= 100 ? "green" : "blue"} />
          </section>
        </>
      ) : (
        <p className="rounded-lg border border-line bg-panel p-4 text-sm text-muted">Carregando meta de aporte...</p>
      )}
    </div>
  );
}
