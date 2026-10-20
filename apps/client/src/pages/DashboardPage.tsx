import { Link } from "react-router-dom";
import { BadgePercent, ChevronRight, Coins, Landmark, Layers3, Target, TrendingUp, Wallet } from "lucide-react";
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
    return <section className="rounded-xl border border-line bg-panel p-6">
      <h1 className="text-lg font-semibold">Não foi possível carregar o resumo</h1>
      <p className="mt-2 text-sm text-muted">Verifique sua conexão e tente novamente.</p>
      <button type="button" onClick={() => void loadWorkspace(["dashboard"])} className="mt-4 min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink">Tentar novamente</button>
    </section>;
  }
  if (!dashboard) {
    return <div role="status" className="rounded-xl border border-line bg-panel p-6 text-sm text-muted">Carregando seu resumo…</div>;
  }

  const { metrics } = dashboard;

  return (
    <div>
      <PageHeader
        title="Visão geral do patrimônio"
        description="Acompanhe o saldo da carteira, seus resultados e as movimentações do mês."
        actions={<>
          <Link to="/investimentos/carteira" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-panel px-4 text-sm font-medium text-ink transition-colors hover:bg-elevated">Ver carteira</Link>
          <Link to="/operacoes" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent/90">Gerenciar operações</Link>
        </>}
      />

      <section aria-label="Resumo financeiro" className="grid min-w-0 grid-cols-2 overflow-hidden rounded-xl border border-line bg-panel shadow-soft xl:grid-cols-4 [&>*]:border-line [&>*:nth-child(even)]:border-l max-xl:[&>*:nth-child(n+3)]:border-t xl:[&>*+*]:border-l">
        <StatCard variant="plain" label="Patrimônio total" value={formatCurrency(metrics.totalWealth)} detail="Valor atualizado da carteira" icon={<Wallet size={18} />} />
        <StatCard variant="plain" label="Lucro total" value={formatCurrency(metrics.totalProfit)} detail="Resultado sobre preço médio" icon={<TrendingUp size={18} />} tone="blue" />
        <StatCard variant="plain" label="Rentabilidade" value={formatPercentage(metrics.returnPercentage)} detail="Carteira consolidada" icon={<BadgePercent size={18} />} tone="violet" />
        <StatCard variant="plain" label="Dividendos no mês" value={formatCurrency(metrics.monthlyDividends)} detail={`${formatCurrency(metrics.yearlyDividends)} no ano`} icon={<Coins size={18} />} tone="amber" />
      </section>
      <details className="group mt-2">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-1 text-sm font-medium text-muted transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
          <ChevronRight size={16} className="transition-transform duration-200 group-open:rotate-90" aria-hidden="true" />
          Mais indicadores da carteira
        </summary>
        <div className="stat-card-grid mt-1">
        <StatCard label="Aportes no mês" value={formatCurrency(metrics.monthlyContributions)} detail={`${formatCurrency(metrics.yearlyContributions)} no ano`} icon={<Landmark size={18} />} tone="amber" />
        <StatCard label="Quantidade de ativos" value={String(metrics.assetCount)} detail="Classes e produtos cadastrados" icon={<Layers3 size={18} />} tone="blue" />
        <StatCard label="Valor investido" value={formatCurrency(metrics.investedValue)} detail="Base histórica de custo" icon={<Wallet size={18} />} tone="violet" />
        <StatCard label="Valor atual" value={formatCurrency(metrics.currentValue)} detail="Marcação manual atual" icon={<TrendingUp size={18} />} />
        <StatCard label="Lucro líquido" value={formatCurrency(metrics.netProfit)} detail="Lucro somado aos dividendos" icon={<Coins size={18} />} tone="amber" />
        <StatCard label="Próximo aporte" value={dashboard.recommendation.ticker || "A definir"} detail={dashboard.recommendation.category} icon={<Target size={18} />} tone="rose" />
        </div>
      </details>

      <section className="mt-6 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <ChartCard title="Evolução patrimonial" description="Valor investido versus valor atual ao longo dos meses.">
          <LazyLineChart
            data={dashboard.wealthEvolution}
            series={[
              { dataKey: "invested", name: "Investido", color: "muted", dashed: true },
              { dataKey: "current", name: "Valor atual", color: "accent", area: true }
            ]}
          />
        </ChartCard>
        <ChartCard title="Patrimônio por categoria" description="Distribuição atual comparada ao alvo.">
          <LazyPieChart data={dashboard.categoryAllocation} />
        </ChartCard>
      </section>

      <section className="mt-4 grid min-w-0 gap-4 xl:grid-cols-2">
        <ChartCard title="Dividendos mensais">
          <LazyBarChart data={dashboard.monthlyDividends} name="Dividendos" color="accent" />
        </ChartCard>
        <ChartCard title="Aportes mensais">
          <LazyBarChart data={dashboard.monthlyContributions} name="Aportes" color="aqua" />
        </ChartCard>
      </section>

      <section className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <article className="min-w-0 rounded-xl border border-line bg-panel p-4 shadow-soft sm:p-5">
          <p className="flex items-center gap-2 text-sm text-muted">
            <Target size={16} className="text-accent" aria-hidden="true" />
            Rebalanceamento automático
          </p>
          <h2 className="mt-3 break-words text-xl font-semibold tracking-tight text-ink">{dashboard.recommendation.action}</h2>
          <p className="mt-2 max-w-prose break-words text-sm leading-6 text-muted">{dashboard.recommendation.reason}</p>
          <ul className="mt-5 divide-y divide-line/70 border-t border-line/70">
            {dashboard.recommendation.comparison.slice(0, 4).map((item) => (
              <li key={item.category} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                <span className="break-words text-ink">{item.category}</span>
                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums ${item.difference > 0 ? "bg-amber/10 text-amber" : "bg-accent/10 text-accent"}`}>
                  {item.difference > 0 ? "+" : ""}
                  {item.difference.toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        </article>
        <ChartCard title="Últimas movimentações">
          <Timeline items={dashboard.recentMovements} />
        </ChartCard>
      </section>
    </div>
  );
}

