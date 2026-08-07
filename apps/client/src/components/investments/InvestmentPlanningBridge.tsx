import { CalendarDays, Coins, Target, TrendingUp, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { useWorkspaceInvalidation } from "../../hooks/useWorkspaceInvalidation";
import type { WorkspaceCacheDomain } from "../../services/cache-invalidation";
import { monthlyPlanningApi } from "../../services/api";
import type { MonthlyPlanningOverview } from "../../types/management";
import { formatCents } from "../../utils/formatters";
import { StatCard } from "../ui/StatCard";

const investmentBridgeDomains: WorkspaceCacheDomain[] = ["monthlyPlanning", "dashboard", "portfolio", "operations", "cashBoxes", "contributions", "dividends"];

export function InvestmentPlanningBridge() {
  const [overview, setOverview] = useState<MonthlyPlanningOverview | null>(null);

  async function loadCurrentOverview() {
    const now = new Date();
    setOverview(await monthlyPlanningApi.overview(now.getFullYear(), now.getMonth() + 1).catch(() => null));
  }

  useEffect(() => {
    void loadCurrentOverview();
  }, []);

  useWorkspaceInvalidation(investmentBridgeDomains, () => loadCurrentOverview());

  if (!overview) return null;

  return (
    <section className="stat-card-grid stat-card-grid--wide mb-4">
      <StatCard
        label="Livre para investir"
        value={formatCents(overview.summary.availableToInvestInCents)}
        detail="Saldo do planejamento ainda disponivel para novos aportes."
        icon={<TrendingUp size={18} />}
        tone="blue"
      />
      <StatCard
        label="Aportes em ativos"
        value={formatCents(overview.investmentSummary.assetContributionsThisMonthInCents)}
        detail={`${formatCents(overview.summary.contributedThisMonthInCents)} contam para a meta mensal.`}
        icon={<Coins size={18} />}
        tone="green"
      />
      <StatCard
        label="Caixinhas no mes"
        value={formatCents(overview.investmentSummary.cashBoxContributionsThisMonthInCents)}
        detail="Transferencias para reserva ficam separadas da meta da carteira."
        icon={<WalletCards size={18} />}
        tone="amber"
      />
      <StatCard
        label="Planejado para investir"
        value={formatCents(overview.summary.plannedInvestmentsInCents)}
        detail={`${formatCents(overview.summary.completedInvestmentsInCents)} ja foram executados neste mes.`}
        icon={<CalendarDays size={18} />}
        tone="violet"
      />
      <StatCard
        label="Meta de aporte"
        value={formatCents(overview.summary.monthlyContributionGoalInCents)}
        detail={`${formatCents(overview.summary.contributionGoalRemainingInCents)} restantes para fechar a meta.`}
        icon={<Target size={18} />}
        tone="green"
      />
    </section>
  );
}
