import { CalendarDays, Coins, Target, TrendingUp, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { monthlyPlanningApi } from "../../services/api";
import type { MonthlyPlanningOverview } from "../../types/management";
import { formatCents, formatPercentage } from "../../utils/formatters";
import { StatCard } from "../ui/StatCard";

export function InvestmentPlanningBridge() {
  const [overview, setOverview] = useState<MonthlyPlanningOverview | null>(null);

  useEffect(() => {
    const now = new Date();
    void monthlyPlanningApi.overview(now.getFullYear(), now.getMonth() + 1).then(setOverview).catch(() => setOverview(null));
  }, []);

  if (!overview) return null;

  return (
    <section className="stat-card-grid stat-card-grid--wide mb-4">
      <StatCard label="Livre no planejamento" value={formatCents(overview.summary.availableToInvestInCents)} detail="Limite recomendado para aporte" icon={<TrendingUp size={18} />} tone="blue" />
      <StatCard label="Renda do mes" value={formatCents(overview.summary.totalIncomeWithDividendsInCents)} icon={<Coins size={18} />} />
      <StatCard label="Gastos realizados" value={formatCents(overview.summary.completedInCents)} icon={<WalletCards size={18} />} tone="amber" />
      <StatCard label="Gastos previstos" value={formatCents(overview.summary.plannedExpensesInCents)} icon={<CalendarDays size={18} />} tone="violet" />
      <StatCard label="Meta de aporte" value={formatCents(overview.summary.monthlyContributionGoalInCents)} detail={`${formatPercentage(overview.summary.contributionGoalPercent)} atingido`} icon={<Target size={18} />} tone="green" />
    </section>
  );
}
