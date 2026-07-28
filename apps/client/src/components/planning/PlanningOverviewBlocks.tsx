import { BarChart3, CalendarDays, ChevronDown, Plus, Target, TrendingUp, WalletCards } from "lucide-react";
import { Link } from "react-router-dom";
import { ProgressBar } from "../ui/ProgressBar";
import { MoneyValue } from "../ui/ValueDisplay";
import type { MonthlyPlanningOverview } from "../../types/management";
import { formatCents, formatPercentage } from "../../utils/formatters";

type PlanningAlert = MonthlyPlanningOverview["alerts"][number];

interface PlanningOverviewBlockProps {
  overview: MonthlyPlanningOverview;
  hasConfiguredIncome: boolean;
}

interface PlanningSmartSummaryProps {
  alerts: PlanningAlert[];
  insights: string[];
  hasConfiguredIncome: boolean;
}

interface PlanningQuickActionsProps {
  onAddExpense: () => void;
}

function unavailable(hasConfiguredIncome: boolean, value: string) {
  return hasConfiguredIncome ? value : "Nao disponivel";
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 100);
}

function SummaryMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <article className="min-w-0 rounded-lg border border-line bg-panel p-4 shadow-soft">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-3 min-w-0 text-xl font-semibold text-ink">
        <MoneyValue value={value} size="card" />
      </p>
      {detail ? <p className="mt-2 text-xs text-muted">{detail}</p> : null}
    </article>
  );
}

function PanelRow({ label, value, tone = "text-ink" }: { label: string; value: string; tone?: string }) {
  return (
    <p className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-elevated px-3 py-2 text-sm text-muted">
      <span>{label}</span>
      <span className={`font-medium ${tone}`}>
        <MoneyValue value={value} />
      </span>
    </p>
  );
}

export function MissingIncomeState() {
  return (
    <section className="mb-4 rounded-lg border border-amber/30 bg-amber/10 p-4 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-amber">Renda mensal ainda nao configurada</h2>
          <p className="mt-1 text-sm text-muted">
            Configure sua renda mensal para calcular saldo, percentual utilizado e valor disponivel para investir.
          </p>
        </div>
        <Link to="/planejamento-mensal/orcamento" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-black transition hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <WalletCards size={16} />
          Configurar renda
        </Link>
      </div>
    </section>
  );
}

export function PlanningPrimarySummary({ overview, hasConfiguredIncome }: PlanningOverviewBlockProps) {
  return (
    <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryMetric
        label="Renda total"
        value={formatCents(overview.summary.totalIncomeWithDividendsInCents)}
        detail={hasConfiguredIncome ? (overview.plan.includeDividendsAsIncome ? "Inclui dividendos do mes" : "Renda configurada") : "Configure a renda mensal"}
      />
      <SummaryMetric label="Gastos realizados" value={formatCents(overview.summary.completedInCents)} detail="Lancamentos ja realizados" />
      <SummaryMetric label="Gastos previstos" value={formatCents(overview.summary.plannedExpensesInCents)} detail="Contas e recorrencias futuras" />
      <SummaryMetric
        label="Saldo apos previstos"
        value={unavailable(hasConfiguredIncome, formatCents(overview.summary.remainingIncomeAfterPlannedInCents))}
        detail={hasConfiguredIncome ? "Renda menos gastos realizados e previstos" : "Depende da renda mensal"}
      />
    </section>
  );
}

export function PlanningMonthlyProgress({ overview, hasConfiguredIncome }: PlanningOverviewBlockProps) {
  const progress = hasConfiguredIncome ? clampProgress(overview.summary.usedIncomePercent) : 0;

  return (
    <article className="rounded-lg border border-line bg-panel p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Progresso do mes</h2>
          <p className="mt-1 text-sm text-muted">
            {hasConfiguredIncome ? `${formatPercentage(overview.summary.usedIncomePercent)} da renda comprometida` : "Configure renda para ativar o progresso"}
          </p>
        </div>
        <CalendarDays size={18} className="text-accent" />
      </div>
      <div className="mt-4">
        <ProgressBar value={progress} tone={overview.summary.usedIncomePercent > 100 ? "amber" : "blue"} />
      </div>
      <div className="mt-4 grid gap-2">
        <PanelRow label="Restante do orcamento" value={unavailable(hasConfiguredIncome, formatCents(overview.summary.remainingBudgetAfterPlannedInCents))} />
        <PanelRow label="Pode gastar por dia" value={unavailable(hasConfiguredIncome, formatCents(overview.summary.canSpendPerDayInCents))} />
        <PanelRow label="Dias restantes" value={`${overview.summary.remainingDays}`} />
      </div>
    </article>
  );
}

export function ContributionGoalSummary({ overview, hasConfiguredIncome }: PlanningOverviewBlockProps) {
  const progress = clampProgress(overview.summary.contributionGoalPercent);

  return (
    <article className="rounded-lg border border-line bg-panel p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Meta de aporte</h2>
          <p className="mt-1 text-sm text-muted">{formatPercentage(overview.summary.contributionGoalPercent)} da meta atingida</p>
        </div>
        <Target size={18} className="text-violet" />
      </div>
      <div className="mt-4">
        <ProgressBar value={progress} tone={progress >= 100 ? "green" : "blue"} />
      </div>
      <div className="mt-4 grid gap-2">
        <PanelRow label="Meta" value={formatCents(overview.summary.monthlyContributionGoalInCents)} />
        <PanelRow label="Aportado" value={formatCents(overview.summary.contributedThisMonthInCents)} />
        <PanelRow label="Faltam" value={formatCents(overview.summary.contributionGoalRemainingInCents)} tone={overview.summary.contributionGoalRemainingInCents > 0 ? "text-amber" : "text-accent"} />
        <PanelRow label="Disponivel para investir" value={unavailable(hasConfiguredIncome, formatCents(overview.summary.availableToInvestInCents))} />
      </div>
      <Link to="/investimentos/aportes" className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <Target size={16} />
        Ver aportes
      </Link>
    </article>
  );
}

export function PlanningSmartSummary({ alerts, insights, hasConfiguredIncome }: PlanningSmartSummaryProps) {
  const messages = [
    ...(hasConfiguredIncome ? alerts.map((alert) => alert.message) : []),
    ...(hasConfiguredIncome ? insights : [])
  ].slice(0, 3);

  return (
    <article className="mb-4 rounded-lg border border-line bg-panel p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Resumo inteligente</h2>
          <p className="mt-1 text-sm text-muted">Principais sinais do mes, sem repetir cards detalhados.</p>
        </div>
        <BarChart3 size={18} className="text-aqua" />
      </div>
      <div className="mt-4 grid gap-2">
        {messages.length > 0 ? messages.map((message) => (
          <p key={message} className="rounded-lg bg-elevated px-3 py-2 text-sm text-muted">{message}</p>
        )) : (
          <p className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">
            Lance gastos, configure renda e defina metas para gerar analises automaticas.
          </p>
        )}
      </div>
      <Link to="/planejamento-mensal/analises" className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <BarChart3 size={16} />
        Ver todas as analises
      </Link>
    </article>
  );
}

export function PlanningQuickActions({ onAddExpense }: PlanningQuickActionsProps) {
  return (
    <section className="mb-4 rounded-lg border border-line bg-panel p-3 shadow-soft sm:p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <button type="button" onClick={onAddExpense} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-black transition hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <Plus size={16} />
          Adicionar gasto
        </button>
        <Link to="/planejamento-mensal/orcamento" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <WalletCards size={16} />
          Gerenciar orcamento
        </Link>
        <Link to="/planejamento-mensal/analises" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <BarChart3 size={16} />
          Ver analises
        </Link>
        <details className="relative min-w-0">
          <summary className="inline-flex min-h-11 w-full cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            Mais
            <ChevronDown size={16} />
          </summary>
          <div className="mt-2 grid min-w-48 gap-2 rounded-lg border border-line bg-panel p-2 shadow-soft lg:absolute lg:right-0 lg:z-10">
            <Link to="/planejamento-mensal/calendario" className="rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-elevated hover:text-ink">Calendario</Link>
            <Link to="/planejamento-mensal/objetivos" className="rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-elevated hover:text-ink">Objetivos</Link>
            <Link to="/planejamento-mensal/gastos" className="rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-elevated hover:text-ink">Ver gastos</Link>
          </div>
        </details>
      </div>
    </section>
  );
}

export function PlanningInvestmentSummary({ overview }: Pick<PlanningOverviewBlockProps, "overview">) {
  return (
    <article className="mb-4 rounded-lg border border-line bg-panel p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Investimentos</h2>
          <p className="mt-1 text-sm text-muted">Resumo integrado da carteira para este mes.</p>
        </div>
        <TrendingUp size={18} className="text-accent" />
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        <PanelRow label="Patrimonio" value={formatCents(overview.investmentSummary.totalWealthInCents)} />
        <PanelRow label="Rentabilidade" value={formatPercentage(overview.investmentSummary.profitabilityPercent)} />
        <PanelRow label="Aportes no mes" value={formatCents(overview.investmentSummary.contributionsThisMonthInCents)} />
        <PanelRow label="Dividendos no mes" value={formatCents(overview.investmentSummary.dividendsThisMonthInCents)} />
        <PanelRow label="Dividend Yield mensal" value={formatPercentage(overview.investmentSummary.monthlyDividendYieldPercent)} />
      </div>
      <Link to="/investimentos" className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <TrendingUp size={16} />
        Ver investimentos
      </Link>
    </article>
  );
}

export function PlanningOverviewSkeleton() {
  return (
    <div className="grid gap-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-lg border border-line bg-panel shadow-soft" />
        ))}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-lg border border-line bg-panel shadow-soft" />
        <div className="h-72 animate-pulse rounded-lg border border-line bg-panel shadow-soft" />
      </div>
      <div className="h-40 animate-pulse rounded-lg border border-line bg-panel shadow-soft" />
    </div>
  );
}
