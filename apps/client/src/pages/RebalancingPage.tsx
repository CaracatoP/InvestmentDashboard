import { ArrowDownCircle, ArrowUpCircle, GitCompareArrows, Target } from "lucide-react";
import { LazyBarChart, LazyPieChart } from "../components/charts/LazyCharts";
import { ChartCard } from "../components/ui/ChartCard";
import { PageHeader } from "../components/ui/PageHeader";
import { ProgressBar } from "../components/ui/ProgressBar";
import { StatCard } from "../components/ui/StatCard";
import { MoneyValue } from "../components/ui/ValueDisplay";
import { useInvestmentStore } from "../stores/useInvestmentStore";
import { formatCurrency, formatPercentage } from "../utils/formatters";

const allocationColors = ["#22c55e", "#38bdf8", "#a78bfa", "#f59e0b", "#fb7185", "#14b8a6"];

export function RebalancingPage() {
  const portfolio = useInvestmentStore((state) => state.portfolio);

  if (!portfolio) {
    return <div className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">Carregando rebalanceamento...</div>;
  }

  const comparison = (portfolio.allocation?.categories ?? portfolio.allocationComparison).map((item, index) =>
    "label" in item
      ? {
          categoryId: item.categoryId,
          category: item.label,
          targetPercentage: item.targetPercent,
          currentPercentage: item.currentPercent,
          difference: item.currentPercent - item.targetPercent,
          differenceValue: item.differenceValue,
          differencePercent: item.differencePercent,
          status: item.status,
          value: item.currentValue,
          targetValue: item.idealValue,
          missingValue: item.amountNeeded,
          color: allocationColors[index % allocationColors.length]
        }
      : {
          ...item,
          value: item.value ?? 0,
          color: item.color ?? allocationColors[index % allocationColors.length]
        }
  );
  const underAllocated =
    portfolio.allocation?.largestDeficit
      ? comparison.find((item) => item.categoryId === portfolio.allocation?.largestDeficit?.categoryId)
      : [...comparison].filter((item) => item.targetPercentage > 0 && (item.differenceValue ?? -item.difference) > 0).sort((left, right) => left.difference - right.difference)[0];
  const overAllocated =
    portfolio.allocation?.largestExcess
      ? comparison.find((item) => item.categoryId === portfolio.allocation?.largestExcess?.categoryId)
      : [...comparison].filter((item) => item.difference > 0).sort((left, right) => right.difference - left.difference)[0];
  const missingData = comparison.map((item) => ({
    month: item.category,
    value: item.missingValue ?? 0
  }));
  const idealData = comparison.map((item) => ({
    ...item,
    value: item.targetValue ?? 0,
    currentPercentage: item.targetPercentage
  }));
  const differenceData = comparison.map((item) => ({
    month: item.category,
    value: item.differenceValue ?? (item.targetValue ?? 0) - (item.value ?? 0)
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Rebalanceamento"
        title="Carteira ideal x carteira atual"
        description="Peso atual, peso ideal, diferenca, valor faltante e proximo aporte calculados automaticamente."
      />

      <section className="stat-card-grid">
        <StatCard label="Proximo aporte" value={underAllocated?.category ?? "A definir"} detail={portfolio.recommendation.action} icon={<Target size={18} />} />
        <StatCard label="Quanto falta" value={formatCurrency(underAllocated?.missingValue ?? 0)} detail={underAllocated ? `${formatPercentage(Math.abs(underAllocated.difference))} abaixo do ideal` : "Sem alvo"} icon={<ArrowDownCircle size={18} />} tone="blue" />
        <StatCard label="Maior excesso" value={overAllocated?.category ?? "A definir"} detail={formatPercentage(overAllocated?.difference ?? 0)} icon={<ArrowUpCircle size={18} />} tone="amber" />
        <StatCard label="Categorias" value={String(comparison.length)} detail="Alocacoes configuradas" icon={<GitCompareArrows size={18} />} tone="violet" />
      </section>

      <section className="mt-6 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ChartCard title="Distribuicao atual">
          <LazyPieChart data={comparison} />
        </ChartCard>
        <ChartCard title="Distribuicao ideal e diferenca">
          <LazyPieChart data={idealData} height={170} />
          <LazyBarChart data={differenceData} name="Diferenca" color="#38bdf8" height={170} />
        </ChartCard>
        <ChartCard title="Quanto falta por categoria">
          <LazyBarChart data={missingData} name="Quanto falta" color="#38bdf8" />
        </ChartCard>
      </section>

      <section className="mt-4 min-w-0 rounded-lg border border-line bg-panel p-4 shadow-soft">
        <h2 className="text-base font-semibold text-ink">Peso atual x ideal</h2>
        <div className="mt-4 space-y-4">
          {comparison.map((item) => (
            <div key={item.category}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="break-words font-medium text-ink">{item.category}</span>
                <span className="shrink-0 text-muted">
                  Atual {formatPercentage(item.currentPercentage)} / Ideal {formatPercentage(item.targetPercentage)}
                </span>
              </div>
              <ProgressBar value={item.currentPercentage} tone={item.difference > 0 ? "amber" : "green"} />
              <div className="mt-2 grid min-w-0 gap-2 text-sm text-muted md:grid-cols-3">
                <span>Diferenca: {item.difference > 0 ? "+" : ""}{formatPercentage(item.difference)}</span>
                <span className="min-w-0">Atual: <MoneyValue value={formatCurrency(item.value ?? 0)} /></span>
                <span className="min-w-0">Falta: <MoneyValue value={formatCurrency(item.missingValue ?? 0)} /></span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

