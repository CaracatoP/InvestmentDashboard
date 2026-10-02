import { Link } from "react-router-dom";
import { BadgePercent, Coins, Landmark, Layers3, Target, TrendingUp, Wallet } from "lucide-react";
import { LazyBarChart, LazyLineChart, LazyPieChart } from "../components/charts/LazyCharts";
import { ChartCard } from "../components/ui/ChartCard";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Timeline } from "../components/ui/Timeline";
import { useInvestmentStore } from "../stores/useInvestmentStore";
import { formatCurrency, formatPercentage } from "../utils/formatters";

export function DashboardPage() {
  const dashboard = useInvestmentStore((state) => state.dashboard);

  const error = useInvestmentStore((state) => state.error);
  const loadWorkspace = useInvestmentStore((state) => state.loadWorkspace);

  if (!dashboard && error) {
    return <section className="rounded-lg border border-line bg-panel p-6">
      <h1 className="text-lg font-semibold">Não foi possível carregar o resumo</h1>
      <p className="mt-2 text-sm text-muted">Verifique sua conexão e tente novamente.</p>
      <button type="button" onClick={() => void loadWorkspace(["dashboard"])} className="mt-4 min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-black">Tentar novamente</button>
    </section>;
  }
  if (!dashboard) {
    return <div role="status" className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">Carregando seu resumo…</div>;
  }

  const { metrics } = dashboard;

  return (
    <div>
      <PageHeader
        title="Visão geral do patrimônio"
        description="Acompanhe o saldo da carteira, seus resultados e as movimentações do mês."
        actions={<>
          <Link to="/investimentos/carteira" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-panel px-4 text-sm text-ink hover:bg-elevated">Ver carteira</Link>
          <Link to="/operacoes" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-black hover:bg-accent/90">Gerenciar operações</Link>
        </>}
      />

      <section aria-label="Resumo financeiro" className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Patrimônio total" value={formatCurrency(metrics.totalWealth)} detail="Valor atualizado da carteira" icon={<Wallet size={18} />} />
        <StatCard label="Lucro total" value={formatCurrency(metrics.totalProfit)} detail="Resultado sobre preço médio" icon={<TrendingUp size={18} />} tone="blue" />
        <StatCard label="Rentabilidade" value={formatPercentage(metrics.returnPercentage)} detail="Carteira consolidada" icon={<BadgePercent size={18} />} tone="violet" />
        <StatCard label="Dividendos no mês" value={formatCurrency(metrics.monthlyDividends)} detail={`${formatCurrency(metrics.yearlyDividends)} no ano`} icon={<Coins size={18} />} />
      </section>
      <details className="mt-4 rounded-lg border border-line bg-panel p-4">
        <summary className="cursor-pointer text-sm font-medium text-ink">Mais indicadores da carteira</summary>
        <div className="stat-card-grid mt-4">
        <StatCard label="Aportes no mês" value={formatCurrency(metrics.monthlyContributions)} detail={`${formatCurrency(metrics.yearlyContributions)} no ano`} icon={<Landmark size={18} />} tone="amber" />
        <StatCard label="Quantidade de ativos" value={String(metrics.assetCount)} detail="Classes e produtos cadastrados" icon={<Layers3 size={18} />} tone="blue" />
        <StatCard label="Valor investido" value={formatCurrency(metrics.investedValue)} detail="Base histórica de custo" icon={<Wallet size={18} />} tone="violet" />
        <StatCard label="Valor atual" value={formatCurrency(metrics.currentValue)} detail="Marcação manual atual" icon={<TrendingUp size={18} />} />
        <StatCard label="Lucro líquido" value={formatCurrency(metrics.netProfit)} detail="Lucro somado aos dividendos" icon={<Coins size={18} />} tone="amber" />
        <StatCard label="Próximo aporte" value={dashboard.recommendation.ticker || "A definir"} detail={dashboard.recommendation.category} icon={<Target size={18} />} tone="rose" />
        </div>
      </details>

      <section className="mt-6 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <ChartCard title="Evolução patrimonial" description="Valor investido versus valor atual ao longo dos meses.">
          <LazyLineChart
            data={dashboard.wealthEvolution}
            series={[
              { dataKey: "invested", name: "Investido", color: "#8b9491" },
              { dataKey: "current", name: "Atual", color: "#22c55e" }
            ]}
          />
        </ChartCard>
        <ChartCard title="Patrimônio por categoria" description="Distribuição atual comparada ao alvo.">
          <LazyPieChart data={dashboard.categoryAllocation} />
        </ChartCard>
      </section>

      <section className="mt-4 grid min-w-0 gap-4 xl:grid-cols-2">
        <ChartCard title="Dividendos mensais">
          <LazyBarChart data={dashboard.monthlyDividends} name="Dividendos" color="#22c55e" />
        </ChartCard>
        <ChartCard title="Aportes mensais">
          <LazyBarChart data={dashboard.monthlyContributions} name="Aportes" color="#f59e0b" />
        </ChartCard>
      </section>

      <section className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <article className="min-w-0 rounded-lg border border-line bg-panel p-4 shadow-soft sm:p-5">
          <p className="text-sm text-muted">Rebalanceamento automático</p>
          <h2 className="mt-2 break-words text-xl font-semibold text-ink">{dashboard.recommendation.action}</h2>
          <p className="mt-3 break-words text-sm leading-6 text-muted">{dashboard.recommendation.reason}</p>
          <div className="mt-5 space-y-2">
            {dashboard.recommendation.comparison.slice(0, 4).map((item) => (
              <div key={item.category} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-elevated px-3 py-2 text-sm">
                <span className="break-words text-muted">{item.category}</span>
                <span className={`shrink-0 ${item.difference > 0 ? "text-amber" : "text-accent"}`}>
                  {item.difference > 0 ? "+" : ""}
                  {item.difference.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </article>
        <ChartCard title="Últimas movimentações">
          <Timeline items={dashboard.recentMovements} />
        </ChartCard>
      </section>
    </div>
  );
}

