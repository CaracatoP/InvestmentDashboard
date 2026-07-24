import { Calculator, Clock, Coins, Target, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LineChart } from "../components/charts/LineChart";
import { ChartCard } from "../components/ui/ChartCard";
import { PageHeader } from "../components/ui/PageHeader";
import { ProgressBar } from "../components/ui/ProgressBar";
import { StatCard } from "../components/ui/StatCard";
import { calculateProjection } from "../services/api";
import { useInvestmentStore } from "../stores/useInvestmentStore";
import type { Goal } from "../types/investments";
import type { ProjectionInput, ProjectionResponse } from "../types/investments";
import { formatCurrency, formatPercentage } from "../utils/formatters";

const initialProjection: ProjectionInput = {
  wealth: 0,
  monthlyContribution: 0,
  expectedReturn: 0,
  inflation: 0,
  currentAge: 0,
  targetAge: 1,
  reinvestDividends: true,
  monthlyDividendYield: 0
};

function getGoalTarget(goal: Goal) {
  return goal.target;
}

function getGoalCurrent(goal: Goal) {
  return goal.current;
}

function getGoalProjectedValue(goal: Goal, item: ProjectionResponse["series"][number]) {
  if (goal.type === "wealth") return item.wealth;
  if (goal.type === "dividend") return item.projectedDividends;
  return getGoalCurrent(goal);
}

function getGoalTimeLabel(goal: Goal, projection: ProjectionResponse | null, currentAge: number, targetAge: number) {
  const target = getGoalTarget(goal);
  if (target <= 0) return "Meta sem alvo";
  if (getGoalCurrent(goal) >= target) return "Atingida agora";

  const reachedPoint = projection?.series.find((item) => getGoalProjectedValue(goal, item) >= target);
  if (!reachedPoint) return `Nao atinge ate ${targetAge} anos`;

  const years = Math.max(Math.round(reachedPoint.age - currentAge), 0);
  if (years === 0) return "Menos de 1 ano";
  if (years === 1) return "1 ano";
  return `${years} anos`;
}

export function ProjectionsPage() {
  const dashboard = useInvestmentStore((state) => state.dashboard);
  const contributions = useInvestmentStore((state) => state.contributions);
  const dividends = useInvestmentStore((state) => state.dividends);
  const goals = useInvestmentStore((state) => state.goals);
  const settings = useInvestmentStore((state) => state.settings);
  const [form, setForm] = useState<ProjectionInput>(initialProjection);
  const [projection, setProjection] = useState<ProjectionResponse | null>(null);
  const [error, setError] = useState("");
  const [hasLoadedDefaults, setHasLoadedDefaults] = useState(false);

  useEffect(() => {
    if (hasLoadedDefaults || !dashboard || !settings) return;

    const currentAge = settings.projections?.currentAge ?? initialProjection.currentAge;
    const targetAge = settings.projections?.targetAge ?? initialProjection.targetAge;

    setForm({
      wealth: dashboard.metrics.totalWealth,
      monthlyContribution: contributions?.totals.monthlyAverage ?? dashboard.metrics.monthlyContributions,
      expectedReturn: settings.projections?.expectedReturn ?? initialProjection.expectedReturn,
      inflation: settings.projections?.inflation ?? initialProjection.inflation,
      currentAge,
      targetAge: targetAge > currentAge ? targetAge : currentAge + 1,
      reinvestDividends: true,
      monthlyDividendYield: dashboard.metrics.currentValue > 0 ? ((dividends?.totals.monthlyAverage ?? 0) / dashboard.metrics.currentValue) * 100 : 0
    });
    setHasLoadedDefaults(true);
  }, [contributions?.totals.monthlyAverage, dashboard, dividends?.totals.monthlyAverage, hasLoadedDefaults, settings]);

  useEffect(() => {
    if (form.targetAge <= form.currentAge) {
      setError("A idade objetivo deve ser maior que a idade atual.");
      return;
    }

    setError("");
    const timeout = window.setTimeout(() => {
      void calculateProjection(form).then(setProjection);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [form]);

  const goalTimelines = useMemo(
    () =>
      goals.map((goal) => {
        const target = getGoalTarget(goal);
        const projected = projection?.series.at(-1);
        const projectedValue = projected ? getGoalProjectedValue(goal, projected) : getGoalCurrent(goal);

        return {
          goal,
          projectedValue,
          timeLabel: getGoalTimeLabel(goal, projection, form.currentAge, form.targetAge),
          progress: target > 0 ? Math.min((projectedValue / target) * 100, 100) : 0
        };
      }),
    [form.currentAge, form.targetAge, goals, projection]
  );

  function updateField(field: keyof ProjectionInput, value: number | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <div>
      <PageHeader
        eyebrow="Projecoes"
        title="Simulador de independencia financeira"
        description="Projete patrimonio, renda futura, inflacao e reinvestimento de dividendos ate a idade objetivo."
      />

      <section className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
        <form onSubmit={(event) => event.preventDefault()} className="rounded-lg border border-line bg-panel p-4 shadow-soft">
          <h2 className="text-base font-semibold text-ink">Parametros</h2>
          <div className="mt-4 grid gap-3">
            {[
              ["wealth", "Patrimonio"],
              ["monthlyContribution", "Aporte mensal"],
              ["expectedReturn", "Rentabilidade esperada (%)"],
              ["inflation", "Inflacao (%)"],
              ["monthlyDividendYield", "Dividend yield mensal (%)"],
              ["currentAge", "Idade atual"],
              ["targetAge", "Idade objetivo"]
            ].map(([field, label]) => (
              <label key={field} className="grid gap-1 text-sm text-muted">
                {label}
                <input
                  type="number"
                  value={form[field as keyof ProjectionInput] as number}
                  onChange={(event) => updateField(field as keyof ProjectionInput, Number(event.target.value))}
                  min={field === "targetAge" ? form.currentAge + 1 : 0}
                  step={field === "currentAge" || field === "targetAge" ? "1" : "0.01"}
                  className="h-10 rounded-lg border border-line bg-elevated px-3 text-sm text-ink outline-none focus:border-accent"
                />
              </label>
            ))}
            <label className="flex items-center justify-between gap-3 rounded-lg border border-line bg-elevated px-3 py-3 text-sm text-muted">
              Reinvestir dividendos
              <input
                type="checkbox"
                checked={form.reinvestDividends}
                onChange={(event) => updateField("reinvestDividends", event.target.checked)}
                className="h-4 w-4 accent-accent"
              />
            </label>
            <div className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-black">
              <Calculator size={16} />
              Calculando em tempo real
            </div>
            {error ? <p className="rounded-lg bg-amber/10 px-3 py-2 text-sm text-amber">{error}</p> : null}
          </div>
        </form>

        <div className="space-y-4">
          {projection ? (
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Patrimonio futuro" value={formatCurrency(projection.summary.futureWealth)} icon={<TrendingUp size={18} />} />
              <StatCard label="Valor real" value={formatCurrency(projection.summary.realFutureWealth)} icon={<TrendingUp size={18} />} tone="blue" />
              <StatCard label="Dividendos futuros" value={formatCurrency(projection.summary.futureMonthlyDividends)} icon={<Coins size={18} />} tone="amber" />
              <StatCard label="Tempo projetado" value={`${projection.summary.years} anos`} detail={`${projection.summary.months} meses`} icon={<Clock size={18} />} tone="violet" />
            </section>
          ) : null}
          <ChartCard title="Grafico de crescimento">
            <LineChart
              data={projection?.series ?? []}
              xAxisKey="age"
              series={[
                { dataKey: "wealth", name: "Nominal", color: "#22c55e" },
                { dataKey: "realWealth", name: "Real", color: "#38bdf8" },
                { dataKey: "projectedDividends", name: "Dividendos", color: "#f59e0b" }
              ]}
            />
          </ChartCard>

          <section className="rounded-lg border border-line bg-panel p-4 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-ink">Tempo ate atingir metas</h2>
              <Target size={18} className="text-muted" />
            </div>
            <div className="mt-4 space-y-4">
              {goalTimelines.length > 0 ? (
                goalTimelines.map(({ goal, projectedValue, timeLabel, progress }) => (
                  <div key={goal.title}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-medium text-ink">{goal.title}</span>
                      <span className="text-muted">{timeLabel}</span>
                    </div>
                    <ProgressBar value={progress} tone={progress >= 100 ? "green" : "blue"} />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                      <span>Projetado: {goal.type === "shares" ? projectedValue.toLocaleString("pt-BR") : formatCurrency(projectedValue)}</span>
                      <span>Meta: {goal.type === "shares" ? getGoalTarget(goal).toLocaleString("pt-BR") : formatCurrency(getGoalTarget(goal))}</span>
                      <span>{formatPercentage(progress)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">Cadastre metas para acompanhar o tempo estimado automaticamente.</p>
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
