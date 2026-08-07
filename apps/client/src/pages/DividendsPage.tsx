import { Award, CalendarDays, Coins, TrendingUp } from "lucide-react";
import { LazyBarChart, LazyPieChart } from "../components/charts/LazyCharts";
import { DividendCard } from "../components/cards/DividendCard";
import { ChartCard } from "../components/ui/ChartCard";
import { PageHeader } from "../components/ui/PageHeader";
import { MobileDataCard } from "../components/ui/Responsive";
import { StatCard } from "../components/ui/StatCard";
import { MoneyValue } from "../components/ui/ValueDisplay";
import { useInvestmentStore } from "../stores/useInvestmentStore";
import type { AllocationComparison } from "../types/investments";
import { formatCurrency } from "../utils/formatters";

const dividendColors = ["#22c55e", "#38bdf8", "#a78bfa", "#f59e0b", "#fb7185", "#14b8a6"];

export function DividendsPage() {
  const dividends = useInvestmentStore((state) => state.dividends);

  if (!dividends) {
    return <div className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">Carregando dividendos...</div>;
  }

  const totalByAsset = dividends.byAsset.reduce((total, item) => total + item.value, 0);
  const pieData: AllocationComparison[] = dividends.byAsset
    .filter((item) => item.value > 0)
    .map((item, index) => ({
      category: item.ticker,
      targetPercentage: 0,
      currentPercentage: totalByAsset > 0 ? (item.value / totalByAsset) * 100 : 0,
      difference: 0,
      value: item.value,
      color: dividendColors[index % dividendColors.length]
    }));

  return (
    <div>
      <PageHeader
        eyebrow="Dividendos"
        title="Renda passiva calculada automaticamente"
        description="Recebimentos, media mensal, maior pagamento, calendario, tabela e graficos vindos da API."
      />

      <section className="stat-card-grid">
        <StatCard label="Dividendos mes" value={formatCurrency(dividends.totals.month)} icon={<Coins size={18} />} />
        <StatCard label="Dividendos ano" value={formatCurrency(dividends.totals.year)} icon={<CalendarDays size={18} />} tone="blue" />
        <StatCard label="Total recebido" value={formatCurrency(dividends.totals.allTime)} icon={<TrendingUp size={18} />} tone="violet" />
        <StatCard label="Media mensal" value={formatCurrency(dividends.totals.monthlyAverage)} icon={<Coins size={18} />} tone="amber" />
        <StatCard label="Maior pagamento" value={formatCurrency(dividends.totals.biggestPayment)} icon={<Award size={18} />} tone="rose" />
      </section>

      <section className="mt-6 grid min-w-0 gap-4 xl:grid-cols-2">
        <ChartCard title="Grafico mensal">
          <LazyBarChart data={dividends.monthly} name="Dividendos" color="#22c55e" />
        </ChartCard>
        <ChartCard title="Grafico anual">
          <LazyBarChart data={dividends.annual} xAxisKey="year" name="Dividendos" color="#38bdf8" />
        </ChartCard>
      </section>

      <section className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <ChartCard title="Dividendos por ativo">
          <LazyPieChart data={pieData} />
        </ChartCard>
        <ChartCard title="Calendario">
          <div className="space-y-3">
            {dividends.calendar.map((dividend) => (
              <DividendCard key={`${dividend.assetTicker}-${dividend.date}-${dividend.amount}`} ticker={dividend.assetTicker} amount={dividend.amount} date={dividend.date} />
            ))}
          </div>
        </ChartCard>
      </section>

      <section className="mt-4 min-w-0 rounded-lg border border-line bg-panel p-3 shadow-soft sm:p-4">
        <h2 className="text-base font-semibold text-ink">Tabela</h2>
        <div className="mt-4 space-y-3 md:hidden">
          {dividends.table.map((dividend) => (
            <MobileDataCard
              key={`${dividend.assetTicker}-${dividend.date}-${dividend.amount}`}
              title={dividend.assetTicker}
              subtitle={new Date(dividend.date).toLocaleDateString("pt-BR")}
              badge={<span className="text-accent"><MoneyValue value={formatCurrency(dividend.amount)} /></span>}
            >
              <div className="mobile-metric-grid text-sm">
                <div className="rounded-lg bg-elevated px-3 py-2">
                  <p className="text-xs text-muted">Cotas</p>
                  <p className="font-medium text-ink">{dividend.shares}</p>
                </div>
                <div className="rounded-lg bg-elevated px-3 py-2">
                  <p className="text-xs text-muted">Valor</p>
                  <p className="min-w-0 font-medium text-accent">
                    <MoneyValue value={formatCurrency(dividend.amount)} />
                  </p>
                </div>
              </div>
            </MobileDataCard>
          ))}
        </div>
        <div className="scrollbar-thin mt-4 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.14em] text-muted">
              <tr className="border-b border-line">
                <th className="py-3 font-medium">Ativo</th>
                <th className="py-3 font-medium">Data</th>
                <th className="py-3 font-medium">Cotas</th>
                <th className="py-3 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {dividends.table.map((dividend) => (
                <tr key={`${dividend.assetTicker}-${dividend.date}-${dividend.amount}`} className="border-b border-line/70 text-muted">
                  <td className="py-3 font-medium text-ink">{dividend.assetTicker}</td>
                  <td className="py-3">{new Date(dividend.date).toLocaleDateString("pt-BR")}</td>
                  <td className="py-3">{dividend.shares}</td>
                  <td className="py-3 text-right text-accent">
                    <MoneyValue value={formatCurrency(dividend.amount)} size="table" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

