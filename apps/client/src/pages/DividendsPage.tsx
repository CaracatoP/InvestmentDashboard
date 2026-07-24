import { Award, CalendarDays, Coins, TrendingUp } from "lucide-react";
import { BarChart } from "../components/charts/BarChart";
import { PieChart } from "../components/charts/PieChart";
import { DividendCard } from "../components/cards/DividendCard";
import { ChartCard } from "../components/ui/ChartCard";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Dividendos mes" value={formatCurrency(dividends.totals.month)} icon={<Coins size={18} />} />
        <StatCard label="Dividendos ano" value={formatCurrency(dividends.totals.year)} icon={<CalendarDays size={18} />} tone="blue" />
        <StatCard label="Total recebido" value={formatCurrency(dividends.totals.allTime)} icon={<TrendingUp size={18} />} tone="violet" />
        <StatCard label="Media mensal" value={formatCurrency(dividends.totals.monthlyAverage)} icon={<Coins size={18} />} tone="amber" />
        <StatCard label="Maior pagamento" value={formatCurrency(dividends.totals.biggestPayment)} icon={<Award size={18} />} tone="rose" />
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-2">
        <ChartCard title="Grafico mensal">
          <BarChart data={dividends.monthly} name="Dividendos" color="#22c55e" />
        </ChartCard>
        <ChartCard title="Grafico anual">
          <BarChart data={dividends.annual} xAxisKey="year" name="Dividendos" color="#38bdf8" />
        </ChartCard>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <ChartCard title="Dividendos por ativo">
          <PieChart data={pieData} />
        </ChartCard>
        <ChartCard title="Calendario">
          <div className="space-y-3">
            {dividends.calendar.map((dividend) => (
              <DividendCard key={`${dividend.assetTicker}-${dividend.date}-${dividend.amount}`} ticker={dividend.assetTicker} amount={dividend.amount} date={dividend.date} />
            ))}
          </div>
        </ChartCard>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-panel p-4 shadow-soft">
        <h2 className="text-base font-semibold text-ink">Tabela</h2>
        <div className="scrollbar-thin mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.14em] text-muted">
              <tr className="border-b border-line">
                <th className="py-3 font-medium">Ativo</th>
                <th className="py-3 font-medium">Data</th>
                <th className="py-3 font-medium">Cotas</th>
                <th className="py-3 font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {dividends.table.map((dividend) => (
                <tr key={`${dividend.assetTicker}-${dividend.date}-${dividend.amount}`} className="border-b border-line/70 text-muted">
                  <td className="py-3 font-medium text-ink">{dividend.assetTicker}</td>
                  <td className="py-3">{new Date(dividend.date).toLocaleDateString("pt-BR")}</td>
                  <td className="py-3">{dividend.shares}</td>
                  <td className="py-3 text-accent">{formatCurrency(dividend.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
