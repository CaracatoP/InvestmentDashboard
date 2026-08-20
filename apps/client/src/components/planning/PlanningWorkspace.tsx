import { AlertTriangle, BarChart3, Bell, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCopy, Coins, CreditCard, Download, Loader2, MoreHorizontal, Plus, Search, Target, TrendingUp, WalletCards } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LazyBarChart, LazyLineChart } from "../charts/LazyCharts";
import { LazyAiAnalysisPanel } from "../ai/LazyAiAnalysisPanel";
import { ConfirmDelete, ManagementField, areaClass, fieldClass, ManagementModal } from "../ui/Management";
import { PageHeader } from "../ui/PageHeader";
import { ProgressBar } from "../ui/ProgressBar";
import { StatCard } from "../ui/StatCard";
import { MoneyValue } from "../ui/ValueDisplay";
import { assetRecordsApi, cashBoxRecordsApi, monthlyPlanningApi } from "../../services/api";
import type {
  AssetRecord,
  CashBoxRecord,
  MonthlyBudgetType,
  MonthlyExpenseInvestmentDestination,
  MonthlyExpenseRecord,
  MonthlyExpenseStatus,
  MonthlyFinancialGoalRecord,
  MonthlyIncomeEntryRecord,
  MonthlyIncomeEntryStatus,
  MonthlyPlanCategoryRecord,
  MonthlyPlanningOverview,
  MonthlyPlanRecord,
  MonthlyRecurrenceFrequency
} from "../../types/management";
import { exportCsv, formatCents, formatPercentage, parseBrazilianMoneyToCents } from "../../utils/formatters";
import {
  ContributionGoalSummary,
  MissingIncomeState,
  PlanningInvestmentSummary,
  PlanningMonthlyProgress,
  PlanningOverviewSkeleton,
  PlanningPrimarySummary,
  PlanningQuickActions,
  PlanningSmartSummary
} from "./PlanningOverviewBlocks";
import { PlanningSubnav } from "./PlanningSubnav";
import {
  buildLocalTimestampFromDateTime,
  canMarkExpenseAsPaid,
  formatCompletedAt,
  getExpenseDueState,
  matchesExpenseStatusFilter,
  type ExpenseDueState,
  type ExpenseStatusFilter
} from "./planning-expense-utils";

type CategoryForm = {
  id?: string;
  name: string;
  icon: string;
  color: string;
  budgetType: MonthlyBudgetType;
  percentage: string;
  fixedAmount: string;
};

type ExpenseForm = {
  description: string;
  amount: string;
  categoryId: string;
  date: string;
  time: string;
  note: string;
  paymentMethod: string;
  expenseType: "single" | "recurring";
  recurring: boolean;
  recurrenceFrequency: MonthlyRecurrenceFrequency;
  recurrenceInterval: number;
  recurrenceDayOfMonth: number;
  recurrenceStartDate: string;
  recurrenceEndDate: string;
  editScope: "single" | "series";
  status: MonthlyExpenseStatus;
  useCurrentMoment: boolean;
  investmentDestination: MonthlyExpenseInvestmentDestination | "";
  assetId: string;
  assetSearch: string;
  quantity: string;
  price: string;
  fees: string;
  cashBoxId: string;
  idempotencyKey: string;
};

type GoalForm = {
  id?: string;
  name: string;
  target: string;
  saved: string;
  monthlyContribution: string;
  linkedSource: MonthlyFinancialGoalRecord["linkedSource"];
  linkedSourceId: string;
  active: boolean;
};

type ExpenseCompletionForm = {
  useCurrentMoment: boolean;
  completedDate: string;
  completedTime: string;
};

type IncomeEntryForm = {
  description: string;
  amount: string;
  category: string;
  date: string;
  time: string;
  note: string;
  incomeType: "single" | "recurring";
  recurring: boolean;
  recurrenceFrequency: MonthlyRecurrenceFrequency;
  recurrenceInterval: number;
  recurrenceDayOfMonth: number;
  recurrenceStartDate: string;
  recurrenceEndDate: string;
  editScope: "single" | "series";
  status: MonthlyIncomeEntryStatus;
  useCurrentMoment: boolean;
  idempotencyKey: string;
};

type IncomeEntryCompletionForm = {
  useCurrentMoment: boolean;
  receivedDate: string;
  receivedTime: string;
};

type CalendarEvent = MonthlyPlanningOverview["calendarDays"][number]["events"][number];

const categoryIcons = [
  { value: "home", label: "ðŸ  Moradia" },
  { value: "utensils", label: "ðŸ½ï¸ Alimentacao" },
  { value: "car", label: "ðŸš— Transporte" },
  { value: "smile", label: "ðŸŽ® Lazer" },
  { value: "trending-up", label: "ðŸ“ˆ Investimentos" },
  { value: "heart", label: "â¤ï¸ Saude" },
  { value: "repeat", label: "ðŸ” Assinaturas" },
  { value: "book-open", label: "ðŸ“š Educacao" },
  { value: "tag", label: "ðŸ·ï¸ Outros" }
];

const categoryColors = ["#22c55e", "#38bdf8", "#a78bfa", "#f59e0b", "#fb7185", "#14b8a6", "#3b82f6", "#8b9491"];

const statusLabels: Record<MonthlyExpenseStatus, string> = {
  completed: "Pago",
  planned: "Previsto"
};

const incomeStatusLabels: Record<MonthlyIncomeEntryStatus, string> = {
  received: "Recebido",
  planned: "Previsto",
  cancelled: "Cancelado"
};

const incomeCategoryOptions = [
  "Salario extra",
  "Freelance",
  "Comissao",
  "Bonus",
  "Hora extra",
  "Venda",
  "Reembolso",
  "Cashback",
  "Presente",
  "Rendimentos",
  "Outros"
];

const expenseStatusFilters: Array<{ value: ExpenseStatusFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendentes" },
  { value: "paid", label: "Pagos" },
  { value: "future", label: "Futuros" }
];

const recurrenceFrequencyLabels: Record<MonthlyRecurrenceFrequency, string> = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  annual: "Anual",
  custom: "Personalizado"
};

const comparisonRangeOptions = [
  { value: 1, label: "Ultimo mes" },
  { value: 3, label: "Ultimos 3 meses" },
  { value: 6, label: "Ultimos 6 meses" },
  { value: 12, label: "Ultimo ano" }
];

const paymentMethodLabels: Record<string, string> = {
  pix: "Pix",
  debito: "Debito",
  "dÃ©bito": "Debito",
  credito: "Credito",
  "crÃ©dito": "Credito",
  dinheiro: "Dinheiro",
  conta: "Conta bancaria",
  "conta bancaria": "Conta bancaria",
  "conta bancÃ¡ria": "Conta bancaria"
};

const alertToneClass = {
  success: "border-accent/30 bg-accent/10 text-accent",
  warning: "border-amber/30 bg-amber/10 text-amber",
  danger: "border-rose/30 bg-rose/10 text-rose",
  info: "border-aqua/30 bg-aqua/10 text-aqua"
};

const eventToneClass: Record<string, string> = {
  salary: "bg-accent/15 text-accent",
  income: "bg-accent/15 text-accent",
  "recurring-income": "bg-accent/15 text-accent",
  dividend: "bg-aqua/15 text-aqua",
  contribution: "bg-violet/15 text-violet",
  "investment-contribution": "bg-violet/15 text-violet",
  "cashbox-contribution": "bg-aqua/15 text-aqua",
  "recurring-expense": "bg-amber/15 text-amber",
  expense: "bg-rose/15 text-rose"
};

const eventTypeLabels: Record<string, string> = {
  salary: "Salario",
  income: "Entrada",
  "recurring-income": "Entrada recorrente",
  dividend: "Dividendo",
  contribution: "Aporte",
  "investment-contribution": "Aporte em ativo",
  "cashbox-contribution": "Caixinha",
  "recurring-expense": "Recorrente",
  expense: "Gasto"
};

const planningPageHeaders: Record<PlanningView, { title: string; description: string }> = {
  overview: {
    title: "Organizacao financeira do mes",
    description: "Uma visao limpa do mes, com resumo, alertas, insights e atalhos para as areas detalhadas."
  },
  budget: {
    title: "Orcamento mensal",
    description: "Configure renda, setores, porcentagens, valores fixos e copie o planejamento anterior."
  },
  expenses: {
    title: "Movimentacoes do mes",
    description: "Cadastre, filtre e acompanhe entradas, gastos realizados, previstos e recorrentes."
  },
  calendar: {
    title: "Calendario financeiro",
    description: "Veja salario, gastos, recorrencias, aportes e dividendos distribuidos no mes."
  },
  goals: {
    title: "Objetivos financeiros",
    description: "Crie metas, acompanhe progresso e vincule objetivos a investimentos ou caixinhas."
  },
  analytics: {
    title: "Analises do planejamento",
    description: "Compare meses, entenda formas de pagamento e abra dashboards detalhados por setor."
  }
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function getLocalDateTimeFields(date = new Date()) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absoluteOffset / 60);
  const offsetRemainder = absoluteOffset % 60;

  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    timestamp: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(offsetHours)}:${pad(offsetRemainder)}`
  };
}

function parseLocalDateTime(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function isFutureExpense(date: string, time: string) {
  return parseLocalDateTime(date, time).getTime() > Date.now();
}

function formatLocalDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function formatMonthLabel(year: number, month: number) {
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function formatMoneyInput(valueInCents: number) {
  return (valueInCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatOptionalMoneyInput(valueInCents?: number | null) {
  return valueInCents && valueInCents > 0 ? formatMoneyInput(valueInCents) : "";
}

function createExpenseIdempotencyKey() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `expense-${Date.now()}`;
}

function createIncomeEntryIdempotencyKey() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `income-${Date.now()}`;
}

function normalizeCategoryName(value?: string) {
  return value
    ?.trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") ?? "";
}

function isInvestmentCategory(category?: Pick<MonthlyPlanCategoryRecord, "id" | "name"> | null) {
  if (!category) return false;
  return category.id === "investimentos" || normalizeCategoryName(category.name) === "investimentos";
}

function formatNumberInput(value?: number | null, decimals = 2) {
  if (!Number.isFinite(value)) return "";
  return Number(value).toFixed(decimals);
}

function iconLabel(icon: string) {
  return categoryIcons.find((item) => item.value === icon)?.label.split(" ")[0] ?? "ðŸ·ï¸";
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function categoryFormFromRecord(category?: MonthlyPlanCategoryRecord): CategoryForm {
  return {
    id: category?.id,
    name: category?.name ?? "",
    icon: category?.icon ?? "tag",
    color: category?.color ?? "#22c55e",
    budgetType: category?.budgetType ?? "percentage",
    percentage: category?.percentage ? String(category.percentage) : "",
    fixedAmount: formatOptionalMoneyInput(category?.fixedAmountInCents)
  };
}

function expenseFormFromRecord(expense?: MonthlyExpenseRecord, categoryId = ""): ExpenseForm {
  const now = getLocalDateTimeFields();
  const dayOfMonth = expense?.recurrenceDayOfMonth ?? Number((expense?.date ?? now.date).slice(8, 10));
  const integration = expense?.integration;
  return {
    description: expense?.description ?? "",
    amount: expense ? formatMoneyInput(expense.amountInCents ?? 0) : "",
    categoryId: expense?.categoryId ?? categoryId,
    date: expense?.date ?? now.date,
    time: expense?.time ?? now.time,
    note: expense?.note ?? "",
    paymentMethod: expense?.paymentMethod ?? "",
    expenseType: expense?.expenseType ?? "single",
    recurring: expense?.recurring ?? false,
    recurrenceFrequency: expense?.recurrenceFrequency ?? "monthly",
    recurrenceInterval: expense?.recurrenceInterval ?? 1,
    recurrenceDayOfMonth: dayOfMonth,
    recurrenceStartDate: expense?.recurrenceStartDate ?? expense?.date ?? now.date,
    recurrenceEndDate: expense?.recurrenceEndDate ?? "",
    editScope: "single",
    status: expense?.status ?? "completed",
    useCurrentMoment: !expense,
    investmentDestination: integration?.destination ?? "",
    assetId: integration?.assetId ?? "",
    assetSearch: integration?.assetTicker ?? "",
    quantity: formatNumberInput(integration?.quantity, 6),
    price: formatNumberInput(integration?.price, 2),
    fees: expense ? formatNumberInput(integration?.fees ?? 0, 2) : "",
    cashBoxId: integration?.cashBoxId ?? "",
    idempotencyKey: integration?.idempotencyKey ?? createExpenseIdempotencyKey()
  };
}

function incomeEntryFormFromRecord(entry?: MonthlyIncomeEntryRecord): IncomeEntryForm {
  const now = getLocalDateTimeFields();
  const dayOfMonth = entry?.recurrenceDayOfMonth ?? Number((entry?.date ?? now.date).slice(8, 10));
  return {
    description: entry?.description ?? "",
    amount: entry ? formatMoneyInput(entry.amountInCents ?? 0) : "",
    category: entry?.category ?? incomeCategoryOptions[0],
    date: entry?.date ?? now.date,
    time: entry?.time ?? now.time,
    note: entry?.note ?? "",
    incomeType: entry?.incomeType ?? "single",
    recurring: entry?.recurring ?? false,
    recurrenceFrequency: entry?.recurrenceFrequency ?? "monthly",
    recurrenceInterval: entry?.recurrenceInterval ?? 1,
    recurrenceDayOfMonth: dayOfMonth,
    recurrenceStartDate: entry?.recurrenceStartDate ?? entry?.date ?? now.date,
    recurrenceEndDate: entry?.recurrenceEndDate ?? "",
    editScope: "single",
    status: entry?.status ?? "received",
    useCurrentMoment: !entry,
    idempotencyKey: entry?.idempotencyKey ?? createIncomeEntryIdempotencyKey()
  };
}

function goalFormFromRecord(goal?: MonthlyFinancialGoalRecord): GoalForm {
  return {
    id: goal?.id,
    name: goal?.name ?? "",
    target: formatOptionalMoneyInput(goal?.targetInCents),
    saved: formatOptionalMoneyInput(goal?.savedInCents),
    monthlyContribution: formatOptionalMoneyInput(goal?.monthlyContributionInCents),
    linkedSource: goal?.linkedSource ?? "manual",
    linkedSourceId: goal?.linkedSourceId ?? "",
    active: goal?.active ?? true
  };
}

function expenseCompletionFormFromRecord() {
  const now = getLocalDateTimeFields();
  return {
    useCurrentMoment: true,
    completedDate: now.date,
    completedTime: now.time
  };
}

function incomeEntryCompletionFormFromRecord() {
  const now = getLocalDateTimeFields();
  return {
    useCurrentMoment: true,
    receivedDate: now.date,
    receivedTime: now.time
  };
}

function stateTone(state: string) {
  if (state === "over-limit") return "text-rose";
  if (state === "near-limit") return "text-amber";
  if (state === "attention") return "text-aqua";
  return "text-accent";
}

function allocationTone(status: MonthlyPlanningOverview["summary"]["allocationStatus"]) {
  if (status === "over-limit") return "text-rose";
  if (status === "income-required") return "text-amber";
  if (status === "fully-distributed") return "text-accent";
  return "text-aqua";
}

function formatOptionalPercentage(value: number | null) {
  return value === null ? "Nao disponivel" : formatPercentage(value);
}

function formatIncomePercentage(value: number | null) {
  return value === null ? "Cadastre renda" : formatPercentage(value);
}

function budgetDistributionBalanceText(summary: MonthlyPlanningOverview["summary"]) {
  if (summary.allocationRequiresIncome) return "Ainda disponivel: Nao disponivel";
  if (summary.percentageOverage > 0) return `Excesso: ${formatPercentage(summary.percentageOverage)}`;
  return `Ainda disponivel: ${formatOptionalPercentage(summary.unallocatedPercentage)}`;
}

function budgetDistributionAmountText(summary: MonthlyPlanningOverview["summary"]) {
  if (summary.allocationRequiresIncome) return "Cadastre a renda mensal para calcular os percentuais dos setores fixos.";
  if (summary.percentageOverage > 0) return `Excesso em valor: ${formatCents(summary.allocationOverageAmountInCents)}`;
  return `Valor ainda disponivel: ${formatCents(summary.unallocatedAmountInCents)}`;
}

function centsToChartValue(valueInCents: number) {
  return Math.round(valueInCents) / 100;
}

function formatComparisonValue(value: number, valueType?: "money" | "percent") {
  return valueType === "percent" ? formatPercentage(value) : formatCents(value);
}

function variationTone(value: number) {
  if (value < 0) return "text-accent";
  if (value > 0) return "text-rose";
  return "text-muted";
}

function normalizePaymentMethodLabel(paymentMethod?: string | null) {
  const value = paymentMethod?.trim();
  if (!value) return "Nao informado";
  return paymentMethodLabels[value.toLowerCase()] ?? value;
}

function expenseStatusToneClass(state: ExpenseDueState["key"]) {
  if (state === "paid") return "border-accent/30 bg-accent/10 text-accent";
  if (state === "overdue") return "border-rose/30 bg-rose/10 text-rose";
  if (state === "today") return "border-amber/30 bg-amber/10 text-amber";
  if (state === "soon") return "border-aqua/30 bg-aqua/10 text-aqua";
  return "border-line bg-elevated text-muted";
}

function expenseStatusLabel(expense: MonthlyExpenseRecord, dueState: ExpenseDueState) {
  return expense.status === "completed" ? "Pago" : dueState.label;
}

function expenseStatusIcon(state: ExpenseDueState["key"]) {
  if (state === "paid") return <CheckCircle2 size={14} strokeWidth={2.25} />;
  if (state === "overdue") return <AlertTriangle size={14} strokeWidth={2.25} />;
  if (state === "today") return <Bell size={14} strokeWidth={2.25} />;
  return <CalendarDays size={14} strokeWidth={2.25} />;
}

type ExpenseStatusBadgeProps = {
  expense: MonthlyExpenseRecord;
  dueState: ExpenseDueState;
};

function ExpenseStatusBadge({ expense, dueState }: ExpenseStatusBadgeProps) {
  const statusLabel = expenseStatusLabel(expense, dueState);

  return (
    <span className={`inline-grid h-9 w-[12.5rem] max-w-full grid-cols-[0.875rem_minmax(0,1fr)] items-center gap-2 rounded-full border px-3 text-xs font-medium leading-none ${expenseStatusToneClass(dueState.key)}`}>
      <span className="flex h-3.5 w-3.5 items-center justify-center">
        {expenseStatusIcon(dueState.key)}
      </span>
      <span className="truncate text-left">{statusLabel}</span>
    </span>
  );
}

function expenseMetaLabel(expense: MonthlyExpenseRecord, categoryName: string) {
  const items = [categoryName];
  if (expense.paymentMethod) items.push(normalizePaymentMethodLabel(expense.paymentMethod));
  items.push(expense.recurring ? `Recorrente ${recurrenceFrequencyLabels[expense.recurrenceFrequency ?? "monthly"].toLowerCase()}` : "Unico");
  return items.join(" / ");
}

function expenseIntegrationLabel(expense: MonthlyExpenseRecord) {
  if (expense.allocationKind === "investment_contribution") {
    const assetTicker = expense.integration?.assetTicker?.trim();
    return assetTicker ? `Compra vinculada em ${assetTicker}` : "Compra vinculada";
  }

  if (expense.allocationKind === "cash_box_contribution") {
    return "Movimentacao vinculada em caixinha";
  }

  return "";
}

function expenseIntegrationRoute(expense: MonthlyExpenseRecord) {
  if (!expense.integration?.linkedEntityId) return "";
  if (expense.allocationKind === "investment_contribution") return "/operacoes";
  if (expense.allocationKind === "cash_box_contribution") return "/caixinhas";
  return "";
}

type ExpenseListItemProps = {
  expense: MonthlyExpenseRecord;
  categoryName: string;
  dueState: ExpenseDueState;
  isCompleting: boolean;
  onComplete: (expense: MonthlyExpenseRecord) => void;
  onEdit: (expense: MonthlyExpenseRecord) => void;
  onDelete: (expense: MonthlyExpenseRecord) => void;
  onDeleteSeries: (expense: MonthlyExpenseRecord) => void;
};

function ExpenseListItem({
  expense,
  categoryName,
  dueState,
  isCompleting,
  onComplete,
  onEdit,
  onDelete,
  onDeleteSeries
}: ExpenseListItemProps) {
  const integrationLabel = expenseIntegrationLabel(expense);
  const integrationRoute = expenseIntegrationRoute(expense);

  return (
    <article className="rounded-xl border border-line bg-elevated/60 p-3 shadow-soft sm:p-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,2.45fr)_minmax(10rem,0.9fr)_minmax(12.5rem,1fr)_minmax(8.5rem,0.75fr)_minmax(12rem,1fr)]">
        <div className="min-w-0 md:col-span-2 xl:col-span-1">
          <div className="flex items-start justify-between gap-3 md:block">
            <div className="min-w-0">
              <p title={expense.description} className="truncate text-base font-semibold text-ink">{expense.description}</p>
              <p className="mt-1 text-sm text-muted">{expenseMetaLabel(expense, categoryName)}</p>
            </div>
            <div className="text-right md:hidden">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Valor</p>
              <div className="mt-1 font-semibold text-ink">
                <MoneyValue value={formatCents(expense.amountInCents)} size="card" />
              </div>
            </div>
          </div>
          {expense.note ? <p title={expense.note} className="mt-2 truncate text-sm text-muted">{expense.note}</p> : null}
          {integrationLabel ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="rounded-full border border-line bg-panel px-2.5 py-1">{integrationLabel}</span>
              {integrationRoute ? <Link to={integrationRoute} className="text-accent transition hover:text-accent/80">Abrir destino</Link> : null}
            </div>
          ) : null}
        </div>

        <div className="grid gap-1 text-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted xl:hidden">Vencimento</p>
          <p className="font-medium text-ink">{formatLocalDate(expense.date)}</p>
          <p className="text-xs text-muted">as {expense.time}</p>
        </div>

        <div className="grid gap-2 text-sm xl:justify-items-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted xl:hidden">Status</p>
          <ExpenseStatusBadge expense={expense} dueState={dueState} />
          {expense.status === "completed" && expense.completedAt ? <p className="text-xs text-muted xl:w-[12.5rem] xl:text-center">{formatCompletedAt(expense.completedAt)}</p> : null}
        </div>

        <div className="hidden gap-1 text-sm md:grid xl:text-right">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted xl:hidden">Valor</p>
          <div className="font-semibold text-ink">
            <MoneyValue value={formatCents(expense.amountInCents)} size="table" />
          </div>
        </div>

        <div className="flex flex-col gap-2 xl:items-end">
          <p className="hidden text-[11px] font-medium uppercase tracking-[0.14em] text-muted md:block xl:hidden">Acoes</p>
          {canMarkExpenseAsPaid(expense) ? (
            <button
              type="button"
              onClick={() => onComplete(expense)}
              disabled={isCompleting}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 text-sm font-medium text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60 xl:min-w-[11rem]"
            >
              {isCompleting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              Marcar como pago
            </button>
          ) : (
            <div className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-accent/30 bg-accent/10 px-3 text-sm font-medium text-accent xl:min-w-[11rem]">
              Pago
            </div>
          )}
          <details className="relative w-full xl:w-auto">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center rounded-lg border border-line bg-panel px-3 text-sm text-muted transition hover:border-accent/40 hover:text-ink">
              <MoreHorizontal size={16} />
              <span className="sr-only">Mais acoes</span>
            </summary>
            <div className="absolute right-0 top-[calc(100%+0.5rem)] z-10 flex w-48 flex-col rounded-lg border border-line bg-panel p-2 shadow-soft">
              <button type="button" onClick={() => onEdit(expense)} className="rounded-lg px-3 py-2 text-left text-sm text-muted transition hover:bg-elevated hover:text-ink">Editar</button>
              <button type="button" onClick={() => onDelete(expense)} className="rounded-lg px-3 py-2 text-left text-sm text-muted transition hover:bg-elevated hover:text-rose">Excluir</button>
              {expense.recurring ? <button type="button" onClick={() => onDeleteSeries(expense)} className="rounded-lg px-3 py-2 text-left text-sm text-muted transition hover:bg-elevated hover:text-rose">Excluir serie</button> : null}
            </div>
          </details>
        </div>
      </div>
    </article>
  );
}

function canMarkIncomeEntryAsReceived(entry: MonthlyIncomeEntryRecord) {
  return entry.status === "planned" && Boolean(entry.id);
}

function incomeEntryStatusToneClass(status: MonthlyIncomeEntryStatus) {
  if (status === "received") return "border-accent/30 bg-accent/10 text-accent";
  if (status === "cancelled") return "border-rose/30 bg-rose/10 text-rose";
  return "border-aqua/30 bg-aqua/10 text-aqua";
}

function incomeEntryStatusIcon(status: MonthlyIncomeEntryStatus) {
  if (status === "received") return <CheckCircle2 size={14} strokeWidth={2.25} />;
  if (status === "cancelled") return <AlertTriangle size={14} strokeWidth={2.25} />;
  return <CalendarDays size={14} strokeWidth={2.25} />;
}

function incomeEntryMetaLabel(entry: MonthlyIncomeEntryRecord) {
  const items = [entry.category || "Entrada"];
  items.push(entry.recurring ? `Recorrente ${recurrenceFrequencyLabels[entry.recurrenceFrequency ?? "monthly"].toLowerCase()}` : "Unica");
  return items.join(" / ");
}

type IncomeEntryListItemProps = {
  entry: MonthlyIncomeEntryRecord;
  isReceiving: boolean;
  onReceive: (entry: MonthlyIncomeEntryRecord) => void;
  onEdit: (entry: MonthlyIncomeEntryRecord) => void;
  onDelete: (entry: MonthlyIncomeEntryRecord) => void;
  onDeleteSeries: (entry: MonthlyIncomeEntryRecord) => void;
};

function IncomeEntryListItem({
  entry,
  isReceiving,
  onReceive,
  onEdit,
  onDelete,
  onDeleteSeries
}: IncomeEntryListItemProps) {
  return (
    <article className="rounded-xl border border-line bg-elevated/60 p-3 shadow-soft sm:p-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,2.45fr)_minmax(10rem,0.9fr)_minmax(12.5rem,1fr)_minmax(8.5rem,0.75fr)_minmax(12rem,1fr)]">
        <div className="min-w-0 md:col-span-2 xl:col-span-1">
          <div className="flex items-start justify-between gap-3 md:block">
            <div className="min-w-0">
              <p title={entry.description} className="truncate text-base font-semibold text-ink">{entry.description}</p>
              <p className="mt-1 text-sm text-muted">{incomeEntryMetaLabel(entry)}</p>
            </div>
            <div className="text-right md:hidden">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Valor</p>
              <div className="mt-1 font-semibold text-accent">
                <MoneyValue value={formatCents(entry.amountInCents)} size="card" />
              </div>
            </div>
          </div>
          {entry.note ? <p title={entry.note} className="mt-2 truncate text-sm text-muted">{entry.note}</p> : null}
        </div>

        <div className="grid gap-1 text-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted xl:hidden">Data</p>
          <p className="font-medium text-ink">{formatLocalDate(entry.date)}</p>
          <p className="text-xs text-muted">as {entry.time}</p>
        </div>

        <div className="grid gap-2 text-sm xl:justify-items-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted xl:hidden">Status</p>
          <span className={`inline-grid h-9 w-[12.5rem] max-w-full grid-cols-[0.875rem_minmax(0,1fr)] items-center gap-2 rounded-full border px-3 text-xs font-medium leading-none ${incomeEntryStatusToneClass(entry.status)}`}>
            <span className="flex h-3.5 w-3.5 items-center justify-center">{incomeEntryStatusIcon(entry.status)}</span>
            <span className="truncate text-left">{incomeStatusLabels[entry.status]}</span>
          </span>
          {entry.status === "received" && entry.receivedAt ? <p className="text-xs text-muted xl:w-[12.5rem] xl:text-center">Recebido em {formatCompletedAt(entry.receivedAt).replace("Pago em ", "")}</p> : null}
        </div>

        <div className="hidden gap-1 text-sm md:grid xl:text-right">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted xl:hidden">Valor</p>
          <div className="font-semibold text-accent">
            <MoneyValue value={formatCents(entry.amountInCents)} size="table" />
          </div>
        </div>

        <div className="flex flex-col gap-2 xl:items-end">
          <p className="hidden text-[11px] font-medium uppercase tracking-[0.14em] text-muted md:block xl:hidden">Acoes</p>
          {canMarkIncomeEntryAsReceived(entry) ? (
            <button
              type="button"
              onClick={() => onReceive(entry)}
              disabled={isReceiving}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 text-sm font-medium text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60 xl:min-w-[11rem]"
            >
              {isReceiving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              Marcar recebida
            </button>
          ) : (
            <div className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-accent/30 bg-accent/10 px-3 text-sm font-medium text-accent xl:min-w-[11rem]">
              {incomeStatusLabels[entry.status]}
            </div>
          )}
          <details className="relative w-full xl:w-auto">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center rounded-lg border border-line bg-panel px-3 text-sm text-muted transition hover:border-accent/40 hover:text-ink">
              <MoreHorizontal size={16} />
              <span className="sr-only">Mais acoes</span>
            </summary>
            <div className="absolute right-0 top-[calc(100%+0.5rem)] z-10 flex w-48 flex-col rounded-lg border border-line bg-panel p-2 shadow-soft">
              <button type="button" onClick={() => onEdit(entry)} className="rounded-lg px-3 py-2 text-left text-sm text-muted transition hover:bg-elevated hover:text-ink">Editar</button>
              <button type="button" onClick={() => onDelete(entry)} className="rounded-lg px-3 py-2 text-left text-sm text-muted transition hover:bg-elevated hover:text-rose">Excluir</button>
              {entry.recurring ? <button type="button" onClick={() => onDeleteSeries(entry)} className="rounded-lg px-3 py-2 text-left text-sm text-muted transition hover:bg-elevated hover:text-rose">Excluir serie</button> : null}
            </div>
          </details>
        </div>
      </div>
    </article>
  );
}

export type PlanningView = "overview" | "budget" | "expenses" | "calendar" | "goals" | "analytics";

type PlanningWorkspaceProps = {
  view: PlanningView;
  categoryId?: string;
};

export function PlanningWorkspace({ view, categoryId }: PlanningWorkspaceProps) {
  const today = getLocalDateTimeFields();
  const [selected, setSelected] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [overview, setOverview] = useState<MonthlyPlanningOverview | null>(null);
  const [incomeInput, setIncomeInput] = useState("");
  const [monthlyContributionGoalInput, setMonthlyContributionGoalInput] = useState("");
  const [investmentSimulationInput, setInvestmentSimulationInput] = useState("");
  const [includeDividendsAsIncome, setIncludeDividendsAsIncome] = useState(false);
  const [comparisonRange, setComparisonRange] = useState(1);
  const [search, setSearch] = useState("");
  const [movementFilter, setMovementFilter] = useState<"all" | "expenses" | "income">("all");
  const [sectorFilter, setSectorFilter] = useState("Todos");
  const [statusFilter, setStatusFilter] = useState<ExpenseStatusFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState("Todos");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(categoryFormFromRecord());
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(expenseFormFromRecord());
  const [incomeEntryForm, setIncomeEntryForm] = useState<IncomeEntryForm>(incomeEntryFormFromRecord());
  const [goalForm, setGoalForm] = useState<GoalForm>(goalFormFromRecord());
  const [completeExpenseForm, setCompleteExpenseForm] = useState<ExpenseCompletionForm>(expenseCompletionFormFromRecord());
  const [receiveIncomeEntryForm, setReceiveIncomeEntryForm] = useState<IncomeEntryCompletionForm>(incomeEntryCompletionFormFromRecord());
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<MonthlyExpenseRecord | null>(null);
  const [editingIncomeEntry, setEditingIncomeEntry] = useState<MonthlyIncomeEntryRecord | null>(null);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [deleteCategory, setDeleteCategory] = useState<MonthlyPlanCategoryRecord | null>(null);
  const [deleteExpense, setDeleteExpense] = useState<MonthlyExpenseRecord | null>(null);
  const [deleteExpenseSeries, setDeleteExpenseSeries] = useState<MonthlyExpenseRecord | null>(null);
  const [deleteIncomeEntry, setDeleteIncomeEntry] = useState<MonthlyIncomeEntryRecord | null>(null);
  const [deleteIncomeEntrySeries, setDeleteIncomeEntrySeries] = useState<MonthlyIncomeEntryRecord | null>(null);
  const [deleteGoal, setDeleteGoal] = useState<MonthlyFinancialGoalRecord | null>(null);
  const [completeExpenseTarget, setCompleteExpenseTarget] = useState<MonthlyExpenseRecord | null>(null);
  const [receiveIncomeEntryTarget, setReceiveIncomeEntryTarget] = useState<MonthlyIncomeEntryRecord | null>(null);
  const [categoryDetails, setCategoryDetails] = useState<MonthlyPlanningOverview["categories"][number] | null>(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isIncomeEntryModalOpen, setIsIncomeEntryModalOpen] = useState(false);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [completingExpenseIds, setCompletingExpenseIds] = useState<string[]>([]);
  const [receivingIncomeEntryIds, setReceivingIncomeEntryIds] = useState<string[]>([]);
  const [completionMessage, setCompletionMessage] = useState("");
  const [error, setError] = useState("");
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBoxRecord[]>([]);
  const [isLoadingInvestmentTargets, setIsLoadingInvestmentTargets] = useState(false);
  const overviewRequestIdRef = useRef(0);

  function applyOverview(data: MonthlyPlanningOverview, year: number, month: number) {
    setOverview(data);
    setIncomeInput(formatOptionalMoneyInput(data.plan.incomeInCents));
    setMonthlyContributionGoalInput(formatOptionalMoneyInput(data.plan.monthlyContributionGoalInCents));
    setInvestmentSimulationInput(formatOptionalMoneyInput(data.plan.investmentSimulationAmountInCents));
    setIncludeDividendsAsIncome(data.plan.includeDividendsAsIncome ?? false);
    setSelectedCalendarDate((current) => current?.startsWith(`${year}-${pad(month)}`) ? current : data.calendarDays[0]?.date ?? `${year}-${pad(month)}-01`);
  }

  async function loadOverview(year = selected.year, month = selected.month, options: { suppressThrow?: boolean } = {}) {
    const requestId = overviewRequestIdRef.current + 1;
    overviewRequestIdRef.current = requestId;

    try {
      const data = await monthlyPlanningApi.overview(year, month, comparisonRange);
      if (requestId !== overviewRequestIdRef.current) return;
      applyOverview(data, year, month);
      setError("");
    } catch (loadError) {
      if (requestId !== overviewRequestIdRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar planejamento.");
      if (!options.suppressThrow) throw loadError;
    }
  }

  useEffect(() => {
    void loadOverview(selected.year, selected.month, { suppressThrow: true });
  }, [comparisonRange, selected.month, selected.year]);

  async function loadInvestmentTargets() {
    setIsLoadingInvestmentTargets(true);
    try {
      const [assetData, cashBoxData] = await Promise.all([assetRecordsApi.list(), cashBoxRecordsApi.list()]);
      setAssets(assetData.filter((asset) => asset.active));
      setCashBoxes(cashBoxData.filter((cashBox) => cashBox.active));
    } finally {
      setIsLoadingInvestmentTargets(false);
    }
  }

  const categoryById = useMemo(() => new Map(overview?.categories.map((category) => [category.id, category]) ?? []), [overview]);
  const selectedExpenseCategory = useMemo(() => categoryById.get(expenseForm.categoryId) ?? null, [categoryById, expenseForm.categoryId]);
  const expenseTargetsInvestments = useMemo(() => isInvestmentCategory(selectedExpenseCategory), [selectedExpenseCategory]);
  const filteredAssets = useMemo(() => {
    const term = expenseForm.assetSearch.trim().toLowerCase();
    return assets.filter((asset) => {
      if (!term) return true;
      return asset.ticker.toLowerCase().includes(term) || asset.name.toLowerCase().includes(term);
    });
  }, [assets, expenseForm.assetSearch]);
  const selectedExpenseAsset = useMemo(
    () => assets.find((asset) => asset.id === expenseForm.assetId) ?? assets.find((asset) => asset.ticker === expenseForm.assetSearch.toUpperCase()) ?? null,
    [assets, expenseForm.assetId, expenseForm.assetSearch]
  );
  const selectedExpenseCashBox = useMemo(() => cashBoxes.find((cashBox) => cashBox.id === expenseForm.cashBoxId) ?? null, [cashBoxes, expenseForm.cashBoxId]);
  const assetOperationTotalInCents = useMemo(() => {
    const quantity = Number(expenseForm.quantity.replace(",", "."));
    const price = Number(expenseForm.price.replace(",", "."));
    const fees = Number(expenseForm.fees.replace(",", "."));
    if (!(quantity > 0) || !(price > 0)) return 0;
    return Math.round((quantity * price + (Number.isFinite(fees) ? Math.max(fees, 0) : 0)) * 100);
  }, [expenseForm.fees, expenseForm.price, expenseForm.quantity]);

  useEffect(() => {
    if (!isExpenseModalOpen) return;
    if (!expenseTargetsInvestments) return;
    void loadInvestmentTargets().catch(() => undefined);
  }, [expenseTargetsInvestments, isExpenseModalOpen]);
  const expensesByCategoryId = useMemo(() => {
    const grouped = new Map<string, MonthlyExpenseRecord[]>();
    for (const expense of overview?.expenses ?? []) {
      const items = grouped.get(expense.categoryId) ?? [];
      items.push(expense);
      grouped.set(expense.categoryId, items);
    }
    return grouped;
  }, [overview?.expenses]);
  const expenseById = useMemo(
    () => new Map((overview?.expenses ?? []).filter((expense): expense is MonthlyExpenseRecord & { id: string } => Boolean(expense.id)).map((expense) => [expense.id, expense])),
    [overview?.expenses]
  );
  const incomeEntryById = useMemo(
    () => new Map((overview?.incomeEntries ?? []).filter((entry): entry is MonthlyIncomeEntryRecord & { id: string } => Boolean(entry.id)).map((entry) => [entry.id, entry])),
    [overview?.incomeEntries]
  );
  useEffect(() => {
    if (!categoryId || !overview) return;
    const category = categoryById.get(categoryId);
    if (category) setCategoryDetails(category);
  }, [categoryById, categoryId, overview]);

  const paymentOptions = useMemo(
    () => Array.from(new Set((overview?.paymentMethodStats ?? []).map((item) => normalizePaymentMethodLabel(item.paymentMethod)))),
    [overview?.paymentMethodStats]
  );
  const incomeCategoryFilterOptions = useMemo(
    () => Array.from(new Set([...(overview?.incomeCategoryStats ?? []).map((item) => item.category), ...incomeCategoryOptions])).filter(Boolean),
    [overview?.incomeCategoryStats]
  );
  const filteredExpenses = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (overview?.expenses ?? []).filter((expense) => {
      const category = categoryById.get(expense.categoryId);
      const matchesSearch = [expense.description, expense.note, expense.paymentMethod, category?.name].some((value) => value?.toLowerCase().includes(term));
      const matchesSector = sectorFilter === "Todos" || expense.categoryId === sectorFilter;
      const matchesStatus = matchesExpenseStatusFilter(expense, statusFilter);
      const matchesPayment = paymentFilter === "Todos" || normalizePaymentMethodLabel(expense.paymentMethod) === paymentFilter;
      const matchesFrom = !fromDate || expense.date >= fromDate;
      const matchesTo = !toDate || expense.date <= toDate;
      return matchesSearch && matchesSector && matchesStatus && matchesPayment && matchesFrom && matchesTo;
    });
  }, [categoryById, fromDate, overview?.expenses, paymentFilter, search, sectorFilter, statusFilter, toDate]);
  const filteredIncomeEntries = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (overview?.incomeEntries ?? []).filter((entry) => {
      const matchesSearch = [entry.description, entry.note, entry.category].some((value) => value?.toLowerCase().includes(term));
      const matchesSector = sectorFilter === "Todos" || sectorFilter === `income:${entry.category}`;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "paid" && entry.status === "received") ||
        (statusFilter === "pending" && entry.status === "planned") ||
        (statusFilter === "future" && entry.status === "planned");
      const matchesPayment = paymentFilter === "Todos";
      const matchesFrom = !fromDate || entry.date >= fromDate;
      const matchesTo = !toDate || entry.date <= toDate;
      return matchesSearch && matchesSector && matchesStatus && matchesPayment && matchesFrom && matchesTo;
    });
  }, [fromDate, overview?.incomeEntries, paymentFilter, search, sectorFilter, statusFilter, toDate]);
  const visibleExpenses = movementFilter === "income" ? [] : filteredExpenses;
  const visibleIncomeEntries = movementFilter === "expenses" ? [] : filteredIncomeEntries;
  const hasActiveExpenseFilters = movementFilter !== "all" || search.trim().length > 0 || sectorFilter !== "Todos" || paymentFilter !== "Todos" || statusFilter !== "all" || Boolean(fromDate) || Boolean(toDate);

  const selectedCalendarEvents = useMemo<CalendarEvent[]>(() => {
    if (!overview || !selectedCalendarDate) return [];
    return overview.calendarDays.find((day) => day.date === selectedCalendarDate)?.events ?? [];
  }, [overview, selectedCalendarDate]);

  const calendarCells = useMemo(() => {
    const firstDay = new Date(selected.year, selected.month - 1, 1).getDay();
    const totalDays = daysInMonth(selected.year, selected.month);
    return [
      ...Array.from({ length: firstDay }, (_, index) => ({ key: `empty-${index}`, date: "", day: "" })),
      ...Array.from({ length: totalDays }, (_, index) => {
        const day = index + 1;
        const date = `${selected.year}-${pad(selected.month)}-${pad(day)}`;
        return { key: date, date, day: String(day) };
      })
    ];
  }, [selected.month, selected.year]);

  const categoryPaymentChartData = useMemo(() => {
    if (!categoryDetails) return [];
    const totals = new Map<string, number>();
    for (const expense of overview?.expenses ?? []) {
      if (expense.categoryId !== categoryDetails.id) continue;
      const paymentMethod = normalizePaymentMethodLabel(expense.paymentMethod);
      totals.set(paymentMethod, (totals.get(paymentMethod) ?? 0) + expense.amountInCents);
    }
    return Array.from(totals.entries()).map(([paymentMethod, amount]) => ({ paymentMethod, value: centsToChartValue(amount) }));
  }, [categoryDetails, overview?.expenses]);

  const categoryEvolution = useMemo(() => overview?.categoryEvolution.find((item) => item.categoryId === categoryDetails?.id), [categoryDetails?.id, overview?.categoryEvolution]);
  const categoryMonthlyEvolutionChartData = useMemo(
    () => categoryEvolution?.monthly.map((item) => ({ month: item.month.slice(5, 7), value: centsToChartValue(item.amountInCents) })) ?? [],
    [categoryEvolution?.monthly]
  );
  const categoryAnnualEvolutionChartData = useMemo(
    () => categoryEvolution?.annual.map((item) => ({ year: item.year, value: centsToChartValue(item.amountInCents) })) ?? [],
    [categoryEvolution?.annual]
  );

  const categoryComparisonChartData = useMemo(() => {
    if (!categoryDetails) return [];
    const comparison = overview?.comparisons.find((item) => item.label === categoryDetails.name);
    return [
      { month: "Periodo anterior", value: centsToChartValue(comparison?.previousInCents ?? 0) },
      { month: "Mes atual", value: centsToChartValue(categoryDetails.completedInCents) }
    ];
  }, [categoryDetails, overview?.comparisons]);

  async function savePlanChanges(categories = overview?.plan.categories ?? [], overrides: Partial<MonthlyPlanRecord> = {}) {
    if (!overview) return;
    const incomeInCents = parseBrazilianMoneyToCents(incomeInput);
    if (incomeInCents === null) {
      setError("Informe uma renda mensal valida.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      await monthlyPlanningApi.savePlan({
        ...overview.plan,
        ...overrides,
        incomeInCents,
        categories: overrides.categories ?? categories,
        goals: overrides.goals ?? overview.plan.goals ?? []
      });
      await loadOverview();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar planejamento.");
    } finally {
      setIsSaving(false);
    }
  }

  function openCreateCategory() {
    setEditingCategoryId(null);
    setCategoryForm(categoryFormFromRecord());
    setIsCategoryModalOpen(true);
    setError("");
  }

  function openEditCategory(category: MonthlyPlanCategoryRecord) {
    setEditingCategoryId(category.id);
    setCategoryForm(categoryFormFromRecord(category));
    setIsCategoryModalOpen(true);
    setError("");
  }

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overview || isSaving) return;

    const fixedAmountInCents = categoryForm.budgetType === "fixed" ? parseBrazilianMoneyToCents(categoryForm.fixedAmount) : null;
    const percentage = Number(categoryForm.percentage.replace(",", "."));
    if (!categoryForm.name.trim()) {
      setError("Informe o nome do setor.");
      return;
    }
    if (categoryForm.budgetType === "fixed" && fixedAmountInCents === null) {
      setError("Informe um valor fixo valido.");
      return;
    }
    if (categoryForm.budgetType === "percentage" && (!(percentage >= 0) || !Number.isFinite(percentage))) {
      setError("Informe a porcentagem planejada para o setor.");
      return;
    }

    const baseId = editingCategoryId ?? (slugify(categoryForm.name) || `setor-${Date.now()}`);
    const category: MonthlyPlanCategoryRecord = {
      id: baseId,
      name: categoryForm.name.trim(),
      icon: categoryForm.icon,
      color: categoryForm.color,
      budgetType: categoryForm.budgetType,
      percentage: categoryForm.budgetType === "percentage" ? percentage : 0,
      fixedAmountInCents
    };
    const duplicate = overview.plan.categories.some((item) => item.id !== editingCategoryId && item.name.trim().toLowerCase() === category.name.toLowerCase());
    if (duplicate) {
      setError("Ja existe um setor com esse nome.");
      return;
    }

    const categories = editingCategoryId ? overview.plan.categories.map((item) => (item.id === editingCategoryId ? category : item)) : [...overview.plan.categories, category];
    await savePlanChanges(categories);
    setIsCategoryModalOpen(false);
    setEditingCategoryId(null);
  }

  async function confirmDeleteCategory() {
    if (!overview || !deleteCategory || isSaving) return;
    const categories = overview.plan.categories.filter((category) => category.id !== deleteCategory.id);
    setDeleteCategory(null);
    await savePlanChanges(categories);
  }

  function openCreateGoal() {
    setEditingGoalId(null);
    setGoalForm(goalFormFromRecord());
    setIsGoalModalOpen(true);
    setError("");
  }

  function openEditGoal(goal: MonthlyFinancialGoalRecord) {
    setEditingGoalId(goal.id);
    setGoalForm(goalFormFromRecord(goal));
    setIsGoalModalOpen(true);
    setError("");
  }

  async function submitGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overview || isSaving) return;

    const targetInCents = parseBrazilianMoneyToCents(goalForm.target);
    const savedInCents = parseBrazilianMoneyToCents(goalForm.saved);
    const monthlyContributionInCents = parseBrazilianMoneyToCents(goalForm.monthlyContribution);

    if (!goalForm.name.trim()) {
      setError("Informe o nome do objetivo.");
      return;
    }
    if (!targetInCents || targetInCents <= 0 || savedInCents === null || monthlyContributionInCents === null) {
      setError("Informe valores validos para o objetivo.");
      return;
    }

    const goal: MonthlyFinancialGoalRecord = {
      id: editingGoalId ?? `goal-${Date.now()}`,
      name: goalForm.name.trim(),
      targetInCents,
      savedInCents,
      monthlyContributionInCents,
      linkedSource: goalForm.linkedSource,
      linkedSourceId: goalForm.linkedSourceId.trim(),
      active: goalForm.active
    };
    const goals = editingGoalId ? (overview.plan.goals ?? []).map((item) => (item.id === editingGoalId ? goal : item)) : [...(overview.plan.goals ?? []), goal];
    await savePlanChanges(overview.plan.categories, { goals });
    setIsGoalModalOpen(false);
    setEditingGoalId(null);
  }

  async function confirmDeleteGoal() {
    if (!overview || !deleteGoal || isSaving) return;
    const goals = (overview.plan.goals ?? []).filter((goal) => goal.id !== deleteGoal.id);
    setDeleteGoal(null);
    await savePlanChanges(overview.plan.categories, { goals });
  }

  async function submitInvestmentSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overview || isSaving) return;

    const monthlyContributionGoalInCents = parseBrazilianMoneyToCents(monthlyContributionGoalInput);
    const investmentSimulationAmountInCents = parseBrazilianMoneyToCents(investmentSimulationInput);
    if (monthlyContributionGoalInCents === null || investmentSimulationAmountInCents === null) {
      setError("Informe valores validos para metas de investimento.");
      return;
    }

    await savePlanChanges(overview.plan.categories, {
      monthlyContributionGoalInCents,
      includeDividendsAsIncome,
      investmentSimulationAmountInCents
    });
  }

  function openCreateExpense(categoryId = "") {
    setEditingExpense(null);
    setExpenseForm(expenseFormFromRecord(undefined, categoryId || overview?.categories[0]?.id || ""));
    setIsExpenseModalOpen(true);
    setError("");
  }

  function openEditExpense(expense: MonthlyExpenseRecord) {
    setEditingExpense(expense);
    setExpenseForm(expenseFormFromRecord(expense));
    setIsExpenseModalOpen(true);
    setError("");
  }

  function openCompleteExpense(expense: MonthlyExpenseRecord) {
    setCompleteExpenseTarget(expense);
    setCompleteExpenseForm(expenseCompletionFormFromRecord());
    setCompletionMessage("");
    setError("");
  }

  function openCreateIncomeEntry() {
    setEditingIncomeEntry(null);
    setIncomeEntryForm(incomeEntryFormFromRecord());
    setIsIncomeEntryModalOpen(true);
    setError("");
  }

  function openEditIncomeEntry(entry: MonthlyIncomeEntryRecord) {
    setEditingIncomeEntry(entry);
    setIncomeEntryForm(incomeEntryFormFromRecord(entry));
    setIsIncomeEntryModalOpen(true);
    setError("");
  }

  function openReceiveIncomeEntry(entry: MonthlyIncomeEntryRecord) {
    setReceiveIncomeEntryTarget(entry);
    setReceiveIncomeEntryForm(incomeEntryCompletionFormFromRecord());
    setCompletionMessage("");
    setError("");
  }

  function updateUseCurrentMoment(useCurrentMoment: boolean) {
    const now = getLocalDateTimeFields();
    setExpenseForm((current) => ({
      ...current,
      useCurrentMoment,
      date: useCurrentMoment ? now.date : current.date,
      time: useCurrentMoment ? now.time : current.time,
      status: useCurrentMoment ? "completed" : current.status
    }));
  }

  function updateIncomeEntryUseCurrentMoment(useCurrentMoment: boolean) {
    const now = getLocalDateTimeFields();
    setIncomeEntryForm((current) => ({
      ...current,
      useCurrentMoment,
      date: useCurrentMoment ? now.date : current.date,
      time: useCurrentMoment ? now.time : current.time,
      status: useCurrentMoment ? "received" : current.status
    }));
  }

  function isCompletingExpense(expenseId?: string | null) {
    return Boolean(expenseId && completingExpenseIds.includes(expenseId));
  }

  function isReceivingIncomeEntry(entryId?: string | null) {
    return Boolean(entryId && receivingIncomeEntryIds.includes(entryId));
  }

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overview?.plan.id || isSaving) return;

    const amountInCents = expenseTargetsInvestments && expenseForm.investmentDestination === "asset"
      ? assetOperationTotalInCents
      : parseBrazilianMoneyToCents(expenseForm.amount);
    if (!expenseForm.description.trim()) {
      setError("Informe a descricao do gasto.");
      return;
    }
    if (!amountInCents || amountInCents <= 0) {
      setError("Informe um valor maior que zero.");
      return;
    }
    if (!expenseForm.categoryId) {
      setError("Selecione um setor.");
      return;
    }
    if (!expenseForm.date || !expenseForm.time) {
      setError("Informe data e horario.");
      return;
    }
    if (expenseTargetsInvestments && !expenseForm.investmentDestination) {
      setError("Escolha se este valor vai para um ativo ou para uma caixinha.");
      return;
    }

    const now = getLocalDateTimeFields();
    const date = expenseForm.useCurrentMoment ? now.date : expenseForm.date;
    const time = expenseForm.useCurrentMoment ? now.time : expenseForm.time;
    const status: MonthlyExpenseStatus = isFutureExpense(date, time) ? "planned" : expenseForm.status;
    let integration = null;

    if (expenseTargetsInvestments && expenseForm.investmentDestination === "asset") {
      const quantity = Number(expenseForm.quantity.replace(",", "."));
      const price = Number(expenseForm.price.replace(",", "."));
      const rawFees = Number(expenseForm.fees.replace(",", "."));
      const fees = Number.isFinite(rawFees) ? Math.max(rawFees, 0) : 0;

      if (!selectedExpenseAsset?.id) {
        setError("Selecione um ativo valido.");
        return;
      }
      if (!(quantity > 0) || !(price > 0)) {
        setError("Informe quantidade e preco validos para o aporte em ativo.");
        return;
      }

      integration = {
        destination: "asset" as const,
        assetId: selectedExpenseAsset.id,
        assetTicker: selectedExpenseAsset.ticker,
        operationType: "COMPRA" as const,
        quantity,
        price,
        fees,
        idempotencyKey: expenseForm.idempotencyKey
      };
    }

    if (expenseTargetsInvestments && expenseForm.investmentDestination === "cashbox") {
      if (!selectedExpenseCashBox?.id) {
        setError("Selecione uma caixinha valida.");
        return;
      }

      integration = {
        destination: "cashbox" as const,
        cashBoxId: selectedExpenseCashBox.id,
        idempotencyKey: expenseForm.idempotencyKey
      };
    }

    setIsSaving(true);
    setError("");
    try {
      const payload = {
        categoryId: expenseForm.categoryId,
        description: expenseForm.description.trim(),
        amountInCents,
        date,
        time,
        note: expenseForm.note.trim(),
        paymentMethod: expenseForm.paymentMethod.trim() || null,
        expenseType: expenseForm.recurring ? "recurring" as const : expenseForm.expenseType,
        recurring: expenseForm.recurring,
        recurrenceFrequency: expenseForm.recurring ? expenseForm.recurrenceFrequency : null,
        recurrenceInterval: expenseForm.recurring ? Math.max(Number(expenseForm.recurrenceInterval) || 1, 1) : null,
        recurrenceDayOfMonth: expenseForm.recurring ? Math.min(Math.max(Number(expenseForm.recurrenceDayOfMonth) || Number(date.slice(8, 10)), 1), 31) : null,
        recurrenceStartDate: expenseForm.recurring ? expenseForm.recurrenceStartDate || date : null,
        recurrenceEndDate: expenseForm.recurring ? expenseForm.recurrenceEndDate || null : null,
        status,
        integration,
        createdAt: editingExpense?.createdAt ?? now.timestamp,
        updatedAt: now.timestamp
      };

      if (editingExpense?.id) await monthlyPlanningApi.updateExpense(editingExpense.id, payload, expenseForm.editScope);
      else await monthlyPlanningApi.createExpense(overview.plan.id, payload);

      setIsExpenseModalOpen(false);
      setEditingExpense(null);
      setCompletionMessage(
        integration?.destination === "asset" && selectedExpenseAsset
          ? `Aporte de ${formatCents(amountInCents)} registrado em ${selectedExpenseAsset.ticker}.`
          : integration?.destination === "cashbox" && selectedExpenseCashBox
            ? `${formatCents(amountInCents)} adicionados a ${selectedExpenseCashBox.name}.`
            : ""
      );
      await loadOverview();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar gasto.");
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDeleteExpense() {
    if (!deleteExpense?.id || isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      await monthlyPlanningApi.removeExpense(deleteExpense.id);
      setDeleteExpense(null);
      await loadOverview();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Falha ao excluir gasto.");
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDeleteExpenseSeries() {
    if (!deleteExpenseSeries?.id || isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      await monthlyPlanningApi.removeExpense(deleteExpenseSeries.id, "series");
      setDeleteExpenseSeries(null);
      await loadOverview();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Falha ao excluir recorrencia.");
    } finally {
      setIsSaving(false);
    }
  }

  async function submitIncomeEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overview?.plan.id || isSaving) return;

    const amountInCents = parseBrazilianMoneyToCents(incomeEntryForm.amount);
    if (!incomeEntryForm.description.trim()) {
      setError("Informe a descricao da entrada.");
      return;
    }
    if (!amountInCents || amountInCents <= 0) {
      setError("Informe uma entrada maior que zero.");
      return;
    }
    if (!incomeEntryForm.category.trim()) {
      setError("Informe a categoria da entrada.");
      return;
    }
    if (!incomeEntryForm.date || !incomeEntryForm.time) {
      setError("Informe data e horario.");
      return;
    }

    const now = getLocalDateTimeFields();
    const date = incomeEntryForm.useCurrentMoment ? now.date : incomeEntryForm.date;
    const time = incomeEntryForm.useCurrentMoment ? now.time : incomeEntryForm.time;
    const status: MonthlyIncomeEntryStatus = isFutureExpense(date, time) ? "planned" : incomeEntryForm.status;

    setIsSaving(true);
    setError("");
    try {
      const payload = {
        description: incomeEntryForm.description.trim(),
        amountInCents,
        category: incomeEntryForm.category.trim(),
        date,
        time,
        note: incomeEntryForm.note.trim(),
        incomeType: incomeEntryForm.recurring ? "recurring" as const : incomeEntryForm.incomeType,
        recurring: incomeEntryForm.recurring,
        recurrenceFrequency: incomeEntryForm.recurring ? incomeEntryForm.recurrenceFrequency : null,
        recurrenceInterval: incomeEntryForm.recurring ? Math.max(Number(incomeEntryForm.recurrenceInterval) || 1, 1) : null,
        recurrenceDayOfMonth: incomeEntryForm.recurring ? Math.min(Math.max(Number(incomeEntryForm.recurrenceDayOfMonth) || Number(date.slice(8, 10)), 1), 31) : null,
        recurrenceStartDate: incomeEntryForm.recurring ? incomeEntryForm.recurrenceStartDate || date : null,
        recurrenceEndDate: incomeEntryForm.recurring ? incomeEntryForm.recurrenceEndDate || null : null,
        status,
        receivedAt: status === "received" ? editingIncomeEntry?.receivedAt ?? now.timestamp : null,
        sourceType: "manual",
        sourceId: null,
        idempotencyKey: incomeEntryForm.idempotencyKey,
        createdAt: editingIncomeEntry?.createdAt ?? now.timestamp,
        updatedAt: now.timestamp
      };

      if (editingIncomeEntry?.id) await monthlyPlanningApi.updateIncomeEntry(editingIncomeEntry.id, payload, incomeEntryForm.editScope);
      else await monthlyPlanningApi.createIncomeEntry(overview.plan.id, payload);

      setIsIncomeEntryModalOpen(false);
      setEditingIncomeEntry(null);
      setCompletionMessage(`Entrada de ${formatCents(amountInCents)} registrada em ${incomeEntryForm.category.trim()}.`);
      await loadOverview();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar entrada.");
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDeleteIncomeEntry() {
    if (!deleteIncomeEntry?.id || isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      await monthlyPlanningApi.removeIncomeEntry(deleteIncomeEntry.id);
      setDeleteIncomeEntry(null);
      await loadOverview();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Falha ao excluir entrada.");
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDeleteIncomeEntrySeries() {
    if (!deleteIncomeEntrySeries?.id || isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      await monthlyPlanningApi.removeIncomeEntry(deleteIncomeEntrySeries.id, "series");
      setDeleteIncomeEntrySeries(null);
      await loadOverview();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Falha ao excluir recorrencia de entrada.");
    } finally {
      setIsSaving(false);
    }
  }

  async function submitCompleteExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!completeExpenseTarget?.id || isCompletingExpense(completeExpenseTarget.id)) return;

    const completedAt = completeExpenseForm.useCurrentMoment
      ? undefined
      : buildLocalTimestampFromDateTime(completeExpenseForm.completedDate, completeExpenseForm.completedTime);

    setCompletingExpenseIds((current) => current.includes(completeExpenseTarget.id!) ? current : [...current, completeExpenseTarget.id!]);
    setError("");

    try {
      const result = await monthlyPlanningApi.completeExpense(
        completeExpenseTarget.id,
        completedAt ? { completedAt } : {},
        comparisonRange
      );
      applyOverview(result.overview, selected.year, selected.month);
      setCompleteExpenseTarget(null);
      setCompletionMessage(result.message || `${completeExpenseTarget.description} marcado como pago.`);
    } catch (completionError) {
      setError(completionError instanceof Error ? completionError.message : "Falha ao marcar gasto como pago.");
    } finally {
      setCompletingExpenseIds((current) => current.filter((expenseId) => expenseId !== completeExpenseTarget.id));
    }
  }

  function exportCategoryHistory(category: MonthlyPlanningOverview["categories"][number]) {
    const rows = (overview?.expenses ?? [])
      .filter((expense) => expense.categoryId === category.id)
      .map((expense) => ({
        data: formatLocalDate(expense.date),
        hora: expense.time,
        descricao: expense.description,
        pagamento: normalizePaymentMethodLabel(expense.paymentMethod),
        status: statusLabels[expense.status],
        valor: formatCents(expense.amountInCents)
      }));
    exportCsv(`planejamento-${category.name.toLowerCase()}-${selected.year}-${pad(selected.month)}.csv`, rows);
  }

  async function copyPrevious() {
    if (isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      await monthlyPlanningApi.copyPrevious(selected.year, selected.month);
      await loadOverview();
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "Nao foi possivel copiar o mes anterior.");
    } finally {
      setIsSaving(false);
    }
  }

  async function submitReceiveIncomeEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receiveIncomeEntryTarget?.id || isReceivingIncomeEntry(receiveIncomeEntryTarget.id)) return;

    const receivedAt = receiveIncomeEntryForm.useCurrentMoment
      ? undefined
      : buildLocalTimestampFromDateTime(receiveIncomeEntryForm.receivedDate, receiveIncomeEntryForm.receivedTime);

    setReceivingIncomeEntryIds((current) => current.includes(receiveIncomeEntryTarget.id!) ? current : [...current, receiveIncomeEntryTarget.id!]);
    setError("");

    try {
      const result = await monthlyPlanningApi.receiveIncomeEntry(
        receiveIncomeEntryTarget.id,
        receivedAt ? { receivedAt } : {},
        comparisonRange
      );
      applyOverview(result.overview, selected.year, selected.month);
      setReceiveIncomeEntryTarget(null);
      setCompletionMessage(result.message || `${receiveIncomeEntryTarget.description} marcada como recebida.`);
    } catch (receiveError) {
      setError(receiveError instanceof Error ? receiveError.message : "Falha ao marcar entrada como recebida.");
    } finally {
      setReceivingIncomeEntryIds((current) => current.filter((entryId) => entryId !== receiveIncomeEntryTarget.id));
    }
  }

  function clearExpenseFilters() {
    setSearch("");
    setMovementFilter("all");
    setSectorFilter("Todos");
    setPaymentFilter("Todos");
    setStatusFilter("all");
    setFromDate("");
    setToDate("");
  }

  const previousMonth = shiftMonth(selected.year, selected.month, -1);
  const nextMonth = shiftMonth(selected.year, selected.month, 1);
  const categoryDetailExpenses = useMemo(() => (overview?.expenses ?? []).filter((expense) => expense.categoryId === categoryDetails?.id), [categoryDetails?.id, overview?.expenses]);
  const categoryDetailAmounts = categoryDetailExpenses.map((expense) => expense.amountInCents);
  const categoryDetailTotal = categoryDetailAmounts.reduce((total, amount) => total + amount, 0);
  const categoryDetailAverage = categoryDetailExpenses.length > 0 ? Math.round(categoryDetailTotal / categoryDetailExpenses.length) : 0;
  const categoryDetailHighest = Math.max(0, ...categoryDetailAmounts);
  const categoryDetailLowest = categoryDetailAmounts.length > 0 ? Math.min(...categoryDetailAmounts) : 0;
  const pageHeader = planningPageHeaders[view];
  const isOverview = view === "overview";
  const isBudget = view === "budget";
  const isExpenses = view === "expenses";
  const isCalendar = view === "calendar";
  const isGoals = view === "goals";
  const isAnalytics = view === "analytics";
  const hasConfiguredIncome = (overview?.summary.currentTotalIncomeInCents ?? overview?.summary.incomeInCents ?? 0) > 0;
  const alertItems = isOverview ? (overview?.alerts ?? []).slice(0, 3) : (overview?.alerts ?? []);
  const insightItems = isOverview ? (overview?.insights ?? []).slice(0, 3) : (overview?.insights ?? []);

  return (
    <div>
      <PageHeader
        eyebrow="Planejamento Mensal"
        title={pageHeader.title}
        description={pageHeader.description}
      />
      <PlanningSubnav />

      <section className="mb-4 grid gap-3 rounded-lg border border-line bg-panel p-3 shadow-soft sm:p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button type="button" onClick={() => setSelected(previousMonth)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:text-ink">
            <ChevronLeft size={16} />
            {formatMonthLabel(previousMonth.year, previousMonth.month)}
          </button>
          <div className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent/10 px-4 text-sm font-semibold text-accent">
            <CalendarDays size={16} />
            {formatMonthLabel(selected.year, selected.month)}
          </div>
          <button type="button" onClick={() => setSelected(nextMonth)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:text-ink">
            {formatMonthLabel(nextMonth.year, nextMonth.month)}
            <ChevronRight size={16} />
          </button>
        </div>
        {isBudget ? (
          <button type="button" onClick={() => void copyPrevious()} disabled={isSaving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-4 text-sm text-muted transition hover:border-accent/60 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60">
            <ClipboardCopy size={16} />
            Copiar mes anterior
          </button>
        ) : null}
      </section>

      {error ? <p className="mb-4 rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-sm text-amber">{error}</p> : null}

      {isBudget ? (
        <section className="mb-4 grid gap-3 rounded-lg border border-line bg-panel p-3 shadow-soft sm:p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="grid gap-1 text-sm text-muted">
            Renda mensal disponivel
            <input value={incomeInput} onChange={(event) => setIncomeInput(event.target.value)} className={fieldClass} placeholder="Ex.: 3.500,00" inputMode="decimal" />
          </label>
          <button type="button" onClick={() => void savePlanChanges()} disabled={isSaving || !overview} className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-lg bg-accent px-4 text-sm font-medium text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60">
            <WalletCards size={16} />
            Salvar renda
          </button>
        </section>
      ) : null}

      {overview ? (
        <>
          {isOverview ? (
            <>
              <PlanningPrimarySummary overview={overview} hasConfiguredIncome={hasConfiguredIncome} />
              {!hasConfiguredIncome ? <MissingIncomeState /> : null}
              <section className="mb-4 grid gap-4 lg:grid-cols-2">
                <PlanningMonthlyProgress overview={overview} hasConfiguredIncome={hasConfiguredIncome} />
                <ContributionGoalSummary overview={overview} hasConfiguredIncome={hasConfiguredIncome} />
              </section>
              <PlanningSmartSummary alerts={alertItems} insights={insightItems} hasConfiguredIncome={hasConfiguredIncome} />
              <LazyAiAnalysisPanel year={selected.year} month={selected.month} analysisType="complete" compact />
              <PlanningQuickActions onAddExpense={() => openCreateExpense()} onAddIncomeEntry={openCreateIncomeEntry} />
              <PlanningInvestmentSummary overview={overview} />
            </>
          ) : null}

          {isBudget ? (
          <section className="stat-card-grid stat-card-grid--wide mb-4">
            <StatCard label="Renda base" value={formatCents(overview.summary.baseIncomeInCents ?? overview.summary.incomeInCents)} icon={<Coins size={18} />} />
            <StatCard label="Entradas extras" value={formatCents(overview.summary.completedExtraIncomeInCents ?? 0)} detail={`${formatCents(overview.summary.plannedExtraIncomeInCents ?? 0)} previstas`} icon={<TrendingUp size={18} />} tone="green" />
            <StatCard label="Renda projetada" value={formatCents(overview.summary.projectedTotalIncomeInCents ?? overview.summary.totalIncomeWithDividendsInCents)} detail="Base, entradas previstas e recebidas" icon={<WalletCards size={18} />} tone="blue" />
            <StatCard label="Gasto realizado" value={formatCents(overview.summary.completedInCents)} icon={<Coins size={18} />} tone="amber" />
            <StatCard label="Gastos previstos" value={formatCents(overview.summary.plannedExpensesInCents)} icon={<CalendarDays size={18} />} tone="violet" />
            <StatCard label="Restante atual" value={formatCents(overview.summary.remainingIncomeInCents)} detail="Restante da renda apos gastos realizados" icon={<Coins size={18} />} tone={overview.summary.remainingIncomeInCents < 0 ? "rose" : "green"} />
            <StatCard label="Restante apos previstos" value={formatCents(overview.summary.remainingIncomeAfterPlannedInCents)} detail="Saldo disponivel apos gastos previstos" icon={<CalendarDays size={18} />} tone={overview.summary.remainingIncomeAfterPlannedInCents < 0 ? "rose" : "blue"} />
            <StatCard label="Renda utilizada" value={formatPercentage(overview.summary.usedIncomePercent)} detail="Percentual da renda gasto ate agora" icon={<AlertTriangle size={18} />} tone={overview.summary.usedIncomePercent > 100 ? "rose" : "amber"} />
          </section>
          ) : null}

          {isAnalytics ? (
          <>
            <LazyAiAnalysisPanel year={selected.year} month={selected.month} analysisType="planning" showTypeSelector title="Analises com IA" description="Escolha o tipo de analise e gere uma leitura contextual do seu planejamento." />
            <section className="mb-4 grid gap-4 lg:grid-cols-2">
              <article className="rounded-lg border border-line bg-panel p-4 shadow-soft">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-ink">Central de alertas</h2>
                    <p className="mt-1 text-sm text-muted">Avisos gerados automaticamente pelos dados do mes.</p>
                  </div>
                  <Bell size={18} className="text-accent" />
                </div>
                <div className="mt-3 grid gap-2">
                  {alertItems.length > 0 ? alertItems.map((alert) => (
                    <p key={alert.id} className={`rounded-lg border px-3 py-2 text-sm ${alertToneClass[alert.type]}`}>{alert.message}</p>
                  )) : <p className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">Nenhum alerta para este mes.</p>}
                </div>
              </article>
              <article className="rounded-lg border border-line bg-panel p-4 shadow-soft">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-ink">Resumo Inteligente</h2>
                    <p className="mt-1 text-sm text-muted">Insights calculados a partir dos gastos, aportes e dividendos.</p>
                  </div>
                  <BarChart3 size={18} className="text-aqua" />
                </div>
                <div className="mt-3 grid gap-2">
                  {insightItems.length > 0 ? insightItems.map((insight) => (
                    <p key={insight} className="rounded-lg bg-elevated px-3 py-2 text-sm text-muted">{insight}</p>
                  )) : <p className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">Lance gastos e metas para gerar insights automaticos.</p>}
                </div>
              </article>
            </section>
          </>
          ) : null}

          {isGoals ? (
          <form onSubmit={submitInvestmentSettings} className="mb-4 grid gap-3 rounded-lg border border-line bg-panel p-3 shadow-soft sm:p-4 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
            <label className="grid gap-1 text-sm text-muted">
              Meta mensal de aporte
              <input value={monthlyContributionGoalInput} onChange={(event) => setMonthlyContributionGoalInput(event.target.value)} className={fieldClass} placeholder="Ex.: 1.500,00" inputMode="decimal" />
            </label>
            <label className="grid gap-1 text-sm text-muted">
              Simular aporte extra
              <input value={investmentSimulationInput} onChange={(event) => setInvestmentSimulationInput(event.target.value)} className={fieldClass} placeholder="Ex.: 500,00" inputMode="decimal" />
            </label>
            <label className="flex min-h-11 items-center gap-2 self-end rounded-lg border border-line bg-elevated px-3 text-sm text-muted">
              <input type="checkbox" checked={includeDividendsAsIncome} onChange={(event) => setIncludeDividendsAsIncome(event.target.checked)} className="h-4 w-4 accent-accent" />
              Dividendos como renda
            </label>
            <div className="grid gap-1 text-sm text-muted">
              Carteira
              <p className="rounded-lg bg-elevated px-3 py-2 text-ink"><MoneyValue value={formatCents(overview.investmentSummary.totalWealthInCents)} /></p>
            </div>
            <button type="submit" disabled={isSaving} className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-lg bg-accent px-4 text-sm font-medium text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60">
              <TrendingUp size={16} />
              Salvar
            </button>
          </form>
          ) : null}

          {isGoals ? (
          <section className="stat-card-grid stat-card-grid--wide mb-4">
            <StatCard label="Patrimonio" value={formatCents(overview.investmentSummary.totalWealthInCents)} icon={<TrendingUp size={18} />} tone="green" />
            <StatCard label="Rentabilidade" value={formatPercentage(overview.investmentSummary.profitabilityPercent)} icon={<TrendingUp size={18} />} tone="blue" />
            <StatCard label="Dividend Yield mensal" value={formatPercentage(overview.investmentSummary.monthlyDividendYieldPercent)} icon={<Coins size={18} />} tone="violet" />
            <StatCard label="Aportes do mes" value={formatCents(overview.investmentSummary.contributionsThisMonthInCents)} icon={<Target size={18} />} tone="amber" />
            <StatCard label="Dividendos do mes" value={formatCents(overview.investmentSummary.dividendsThisMonthInCents)} icon={<Coins size={18} />} tone="green" />
            <StatCard label="Com aporte extra" value={formatCents(overview.investmentSummary.simulatedContributionTotalInCents)} detail={`${formatPercentage(overview.investmentSummary.simulatedContributionGoalPercent)} da meta`} icon={<TrendingUp size={18} />} tone="blue" />
          </section>
          ) : null}

          {isBudget ? (
          <section className="mb-4 rounded-lg border border-line bg-panel p-3 shadow-soft sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-semibold text-ink">Controle das porcentagens</h2>
                <p className="mt-1 text-sm text-muted">
                  Total distribuido: {formatOptionalPercentage(overview.summary.allocatedPercentage)} · {budgetDistributionBalanceText(overview.summary)}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Estado: <span className={allocationTone(overview.summary.allocationStatus)}>{overview.summary.allocationStatusLabel}</span> · {budgetDistributionAmountText(overview.summary)}
                </p>
              </div>
              <button type="button" onClick={openCreateCategory} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-black transition hover:bg-accent/90">
                <Plus size={16} />
                Novo setor
              </button>
            </div>
            {overview.warnings.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {overview.warnings.map((warning) => (
                  <p key={warning} className="inline-flex items-center gap-2 rounded-lg bg-amber/10 px-3 py-2 text-sm text-amber">
                    <AlertTriangle size={16} />
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}
          </section>
          ) : null}

          {(isBudget || isAnalytics) ? (
          <section className="mb-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {overview.categories.map((category) => {
              const categoryExpenses = expensesByCategoryId.get(category.id) ?? [];
              const upcomingRecurringExpenses = categoryExpenses.filter((expense) => expense.recurring && expense.status === "planned").slice(0, 3);

              return (
                <article key={category.id} className="min-w-0 rounded-lg border border-line bg-panel p-4 shadow-soft">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-lg" style={{ background: `${category.color}22`, color: category.color }}>
                        {iconLabel(category.icon)}
                      </div>
                      <div className="min-w-0">
                        <button type="button" onClick={() => setCategoryDetails(category)} className="truncate text-left font-semibold text-ink outline-none transition hover:text-accent focus-visible:text-accent" aria-label={`Abrir dashboard do setor ${category.name}`}>{category.name}</button>
                        <p className={`mt-1 text-xs ${stateTone(category.state)}`}>{category.stateLabel}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-elevated px-2 py-1 text-xs text-muted">{category.budgetType === "percentage" ? `${category.percentage}%` : "Fixo"}</span>
                  </div>

                  <div className="mt-4 grid gap-2 text-sm text-muted">
                    <p className="flex justify-between gap-3"><span>Planejado</span><span className="text-ink"><MoneyValue value={formatCents(category.limitInCents)} /></span></p>
                    <p className="flex justify-between gap-3"><span>Realizado</span><span className="text-ink"><MoneyValue value={formatCents(category.completedInCents)} /></span></p>
                    <p className="flex justify-between gap-3"><span>Previsto</span><span className="text-ink"><MoneyValue value={formatCents(category.plannedInCents)} /></span></p>
                    <p className="flex justify-between gap-3"><span>Restante</span><span className={category.remainingInCents < 0 ? "text-rose" : "text-accent"}><MoneyValue value={formatCents(category.remainingInCents)} /></span></p>
                  </div>

                  <div className="mt-4">
                    <ProgressBar value={Math.min(category.usedPercent, 100)} tone={category.state === "over-limit" || category.state === "near-limit" ? "amber" : category.state === "ok" ? "green" : "blue"} />
                    <p className="mt-2 text-xs text-muted">Utilizado: {formatPercentage(category.usedPercent)}</p>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button type="button" onClick={() => openCreateExpense(category.id)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-3 text-sm font-medium text-black transition hover:bg-accent/90">
                      <Plus size={15} />
                      Adicionar gasto
                    </button>
                    <Link to="/planejamento-mensal/gastos" onClick={() => setSectorFilter(category.id)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink">
                      <Search size={15} />
                      Ver lancamentos
                    </Link>
                  </div>

                  <details className="mt-4 rounded-lg border border-line bg-elevated/60 px-3 py-3 text-sm text-muted">
                    <summary className="cursor-pointer list-none font-medium text-ink">Ver detalhes</summary>
                    <div className="mt-3 grid gap-2">
                      <p className="flex justify-between gap-3"><span>Restante apos previstos</span><span className={category.remainingAfterPlannedInCents < 0 ? "text-rose" : "text-ink"}><MoneyValue value={formatCents(category.remainingAfterPlannedInCents)} /></span></p>
                      <p className="flex justify-between gap-3"><span>% da renda</span><span className="text-ink">{formatIncomePercentage(category.plannedPercentOfIncome)}</span></p>
                      <p className="flex justify-between gap-3"><span>Lancamentos</span><span className="text-ink">{categoryExpenses.length}</span></p>
                      <p className="text-xs">
                        Proximas recorrencias: {upcomingRecurringExpenses.length > 0 ? upcomingRecurringExpenses.map((expense) => `${expense.description} (${formatLocalDate(expense.date)})`).join(", ") : "Nenhuma pendente neste mes."}
                      </p>
                    </div>
                  </details>

                  <details className="mt-3 rounded-lg border border-line bg-elevated/60 px-3 py-3 text-sm text-muted">
                    <summary className="cursor-pointer list-none font-medium text-ink">Acoes do setor</summary>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {isBudget ? <button type="button" onClick={() => openEditCategory(category)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-panel px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink">Editar setor</button> : null}
                      {isBudget ? <button type="button" onClick={() => setDeleteCategory(category)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-panel px-3 text-sm text-muted transition hover:border-rose/50 hover:text-rose">Excluir setor</button> : null}
                      {isAnalytics ? <button type="button" onClick={() => setCategoryDetails(category)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-panel px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink sm:col-span-2"><BarChart3 size={15} />Dashboard detalhado</button> : null}
                    </div>
                  </details>
                </article>
              );
            })}
          </section>
          ) : null}

          {isAnalytics ? (
          <section className="mb-4 grid gap-4 lg:grid-cols-2">
            <article className="rounded-lg border border-line bg-panel p-4 shadow-soft">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-ink">Comparacao com meses anteriores</h2>
                  <p className="mt-1 text-sm text-muted">Totais, economia, renda, aportes e setores.</p>
                </div>
                <select value={comparisonRange} onChange={(event) => setComparisonRange(Number(event.target.value))} className={fieldClass}>
                  {comparisonRangeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="mt-4 grid gap-2">
                {overview.comparisons.length > 0 ? overview.comparisons.map((comparison) => (
                  <div key={comparison.label} className="grid gap-2 rounded-lg bg-elevated px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                    <span className="font-medium text-ink">{comparison.label}</span>
                    <span className="text-muted">{formatComparisonValue(comparison.previousInCents, comparison.valueType)} â†’ {formatComparisonValue(comparison.currentInCents, comparison.valueType)}</span>
                    <span className={variationTone(comparison.variationPercent)}>{comparison.variationPercent > 0 ? "â–²" : comparison.variationPercent < 0 ? "â–¼" : "â€¢"} {formatPercentage(Math.abs(comparison.variationPercent))}</span>
                  </div>
                )) : <p className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">Sem mes anterior configurado para comparar.</p>}
              </div>
            </article>

            <article className="rounded-lg border border-line bg-panel p-4 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-ink">Formas de pagamento</h2>
                  <p className="mt-1 text-sm text-muted">Estatisticas automaticas e filtro do historico.</p>
                </div>
                <CreditCard size={18} className="text-aqua" />
              </div>
              <div className="mt-4 grid gap-2">
                {overview.paymentMethodStats.length > 0 ? overview.paymentMethodStats.map((item) => (
                  <button key={item.paymentMethod} type="button" onClick={() => setPaymentFilter(normalizePaymentMethodLabel(item.paymentMethod))} className="grid min-h-11 gap-2 rounded-lg bg-elevated px-3 py-2 text-left text-sm transition hover:text-ink sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                    <span className="font-medium text-ink">{normalizePaymentMethodLabel(item.paymentMethod)}</span>
                    <span className="text-muted">{item.count} lanc.</span>
                    <span className="font-medium text-ink"><MoneyValue value={formatCents(item.amountInCents)} /></span>
                  </button>
                )) : <p className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">Nenhuma forma de pagamento registrada.</p>}
              </div>
            </article>
          </section>
          ) : null}

          {isCalendar ? (
          <section className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
            <article className="rounded-lg border border-line bg-panel p-4 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-ink">Calendario financeiro</h2>
                  <p className="mt-1 text-sm text-muted">Gastos, salario, dividendos, aportes e contas recorrentes.</p>
                </div>
                <CalendarDays size={18} className="text-accent" />
              </div>
              <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs text-muted">
                {["D", "S", "T", "Q", "Q", "S", "S"].map((weekday, index) => <span key={`${weekday}-${index}`}>{weekday}</span>)}
                {calendarCells.map((cell) => {
                  const events = cell.date ? overview.calendarDays.find((day) => day.date === cell.date)?.events ?? [] : [];
                  return (
                    <button key={cell.key} type="button" disabled={!cell.date} onClick={() => setSelectedCalendarDate(cell.date)} className={`min-h-16 rounded-lg border border-line bg-elevated px-2 py-2 text-left transition disabled:opacity-0 ${selectedCalendarDate === cell.date ? "border-accent text-accent" : "text-muted hover:text-ink"}`}>
                      <span className="text-sm font-medium">{cell.day}</span>
                      <span className="mt-2 flex flex-wrap gap-1">
                        {events.slice(0, 4).map((event) => <span key={event.id} className={`h-2 w-2 rounded-full ${eventToneClass[event.type] ?? "bg-muted"}`} title={event.label} />)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </article>

            <article className="rounded-lg border border-line bg-panel p-4 shadow-soft">
              <h2 className="text-base font-semibold text-ink">{selectedCalendarDate ? `Eventos de ${formatLocalDate(selectedCalendarDate)}` : "Eventos do dia"}</h2>
              <div className="mt-4 grid gap-2">
                {selectedCalendarEvents.length > 0 ? selectedCalendarEvents.map((event) => {
                  const linkedExpense = expenseById.get(event.id);
                  const linkedIncomeEntry = incomeEntryById.get(event.id);
                  const dueState = linkedExpense ? getExpenseDueState(linkedExpense) : null;

                  return (
                    <div key={`${event.type}-${event.id}`} className="rounded-lg bg-elevated px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className={`rounded-full px-2 py-1 text-xs ${eventToneClass[event.type] ?? "bg-line text-muted"}`}>{eventTypeLabels[event.type] ?? event.type}</span>
                        <span className="font-medium text-ink"><MoneyValue value={formatCents(event.amountInCents)} /></span>
                      </div>
                      <p className="mt-2 text-muted">{event.label}</p>
                      {event.status ? <p className="mt-1 text-xs text-muted">{event.status === "planned" ? "Previsto" : linkedIncomeEntry ? "Recebido" : "Pago"}</p> : null}
                      {linkedExpense ? <p className="mt-1 text-xs text-muted">{dueState?.label}</p> : null}
                      {linkedExpense && canMarkExpenseAsPaid(linkedExpense) ? (
                        <button
                          type="button"
                          onClick={() => openCompleteExpense(linkedExpense)}
                          disabled={isCompletingExpense(linkedExpense.id)}
                          className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-panel px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isCompletingExpense(linkedExpense.id) ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                          Marcar como pago
                        </button>
                      ) : null}
                      {linkedIncomeEntry && canMarkIncomeEntryAsReceived(linkedIncomeEntry) ? (
                        <button
                          type="button"
                          onClick={() => openReceiveIncomeEntry(linkedIncomeEntry)}
                          disabled={isReceivingIncomeEntry(linkedIncomeEntry.id)}
                          className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-panel px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isReceivingIncomeEntry(linkedIncomeEntry.id) ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                          Marcar recebida
                        </button>
                      ) : null}
                    </div>
                  );
                }) : <p className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">Nenhum evento neste dia.</p>}
              </div>
            </article>
          </section>
          ) : null}

          {isGoals ? (
          <section className="mb-4 rounded-lg border border-line bg-panel p-4 shadow-soft">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-ink">Objetivos</h2>
                <p className="mt-1 text-sm text-muted">Metas financeiras vinculadas ao planejamento, carteira ou caixinhas.</p>
              </div>
              <button type="button" onClick={openCreateGoal} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-black transition hover:bg-accent/90">
                <Plus size={16} />
                Novo objetivo
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(overview.plan.goals ?? []).length > 0 ? (overview.plan.goals ?? []).map((goal) => {
                const progress = goal.targetInCents > 0 ? Math.min((goal.savedInCents / goal.targetInCents) * 100, 100) : 0;
                return (
                  <article key={goal.id} className="rounded-lg border border-line bg-elevated p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-ink">{goal.name}</h3>
                        <p className="mt-1 text-xs text-muted">{goal.linkedSource === "portfolio" ? "Vinculado a carteira" : goal.linkedSource === "cashbox" ? "Vinculado a caixinha" : "Manual"}</p>
                      </div>
                      <span className="rounded-full bg-panel px-2 py-1 text-xs text-muted">{goal.active ? "Ativo" : "Pausado"}</span>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-muted">
                      <p className="flex justify-between gap-3"><span>Meta</span><span className="text-ink"><MoneyValue value={formatCents(goal.targetInCents)} /></span></p>
                      <p className="flex justify-between gap-3"><span>Guardado</span><span className="text-ink"><MoneyValue value={formatCents(goal.savedInCents)} /></span></p>
                      <p className="flex justify-between gap-3"><span>Aporte vinculado</span><span className="text-ink"><MoneyValue value={formatCents(goal.monthlyContributionInCents ?? 0)} /></span></p>
                    </div>
                    <div className="mt-3">
                      <ProgressBar value={progress} tone={progress >= 100 ? "green" : "blue"} />
                      <p className="mt-2 text-xs text-muted">{formatPercentage(progress)} concluido</p>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <button type="button" onClick={() => openEditGoal(goal)} className="min-h-11 rounded-lg border border-line bg-panel px-3 text-sm text-muted transition hover:text-ink">Editar</button>
                      <button type="button" onClick={() => setDeleteGoal(goal)} className="min-h-11 rounded-lg border border-line bg-panel px-3 text-sm text-muted transition hover:text-rose">Excluir</button>
                    </div>
                  </article>
                );
              }) : <p className="rounded-lg bg-elevated px-3 py-4 text-sm text-muted md:col-span-2 xl:col-span-3">Nenhum objetivo cadastrado.</p>}
            </div>
          </section>
          ) : null}

          {isExpenses ? (
          <>
          <section className="mb-4 flex flex-col gap-4 rounded-lg border border-line bg-panel p-3 shadow-soft sm:p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-ink">Historico de movimentacoes</h2>
                  <span className="rounded-full bg-elevated px-2.5 py-1 text-xs text-muted">{visibleExpenses.length + visibleIncomeEntries.length} exibidos</span>
                </div>
                <p className="mt-1 text-sm text-muted">Edite, filtre e acompanhe gastos, entradas realizadas, previstas e recorrentes.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => openCreateIncomeEntry()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 text-sm font-medium text-accent transition hover:border-accent/70 hover:bg-accent/15">
                  <Plus size={16} />
                  Nova entrada
                </button>
                <button type="button" onClick={() => openCreateExpense()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-black transition hover:bg-accent/90">
                  <Plus size={16} />
                  Adicionar gasto
                </button>
              </div>
            </div>
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(12rem,0.7fr)_minmax(12rem,0.7fr)_minmax(0,1fr)_auto]">
              <label className="relative min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 w-full rounded-lg border border-line bg-elevated pl-9 pr-3 text-base text-ink outline-none transition focus:border-accent sm:text-sm" placeholder="Pesquisar descricao, setor ou observacao" />
              </label>
              <select value={sectorFilter} onChange={(event) => setSectorFilter(event.target.value)} className={fieldClass}>
                <option>Todos</option>
                {overview.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                {incomeCategoryFilterOptions.map((category) => <option key={`income:${category}`} value={`income:${category}`}>Entrada · {category}</option>)}
              </select>
              <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)} className={fieldClass}>
                <option>Todos</option>
                {paymentOptions.map((paymentMethod) => <option key={paymentMethod} value={paymentMethod}>{paymentMethod}</option>)}
              </select>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className={fieldClass} aria-label="Data inicial" />
                <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className={fieldClass} aria-label="Data final" />
              </div>
              <button
                type="button"
                onClick={clearExpenseFilters}
                disabled={!hasActiveExpenseFilters}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-elevated px-4 text-sm text-muted transition hover:border-accent/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
              >
                Limpar filtros
              </button>
            </div>
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.14em] text-muted">Filtros rapidos</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "all", label: "Todos" },
                  { value: "expenses", label: "Gastos" },
                  { value: "income", label: "Entradas" }
                ].map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setMovementFilter(filter.value as "all" | "expenses" | "income")}
                    className={`inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm transition ${
                      movementFilter === filter.value ? "border-accent bg-accent/10 text-accent" : "border-line bg-elevated text-muted hover:border-accent/40 hover:text-ink"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
                {expenseStatusFilters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setStatusFilter(filter.value)}
                    className={`inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm transition ${
                      statusFilter === filter.value ? "border-accent bg-accent/10 text-accent" : "border-line bg-elevated text-muted hover:border-accent/40 hover:text-ink"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
            {completionMessage ? <p className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">{completionMessage}</p> : null}
          </section>

          <section className="rounded-lg border border-line bg-panel p-3 shadow-soft sm:p-4">
            {visibleIncomeEntries.length > 0 ? (
              <div className={visibleExpenses.length > 0 ? "mb-6" : ""}>
                <div className="mb-3 hidden xl:grid xl:grid-cols-[minmax(0,2.45fr)_minmax(10rem,0.9fr)_minmax(12.5rem,1fr)_minmax(8.5rem,0.75fr)_minmax(12rem,1fr)] xl:gap-4 xl:px-4">
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Entrada</span>
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Data</span>
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Status</span>
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-right text-muted">Valor</span>
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-right text-muted">Acoes</span>
                </div>
                <div className="space-y-3">
                  {visibleIncomeEntries.map((entry) => (
                    <IncomeEntryListItem
                      key={entry.id ?? `${entry.date}-${entry.time}-${entry.description}`}
                      entry={entry}
                      isReceiving={isReceivingIncomeEntry(entry.id)}
                      onReceive={openReceiveIncomeEntry}
                      onEdit={openEditIncomeEntry}
                      onDelete={setDeleteIncomeEntry}
                      onDeleteSeries={setDeleteIncomeEntrySeries}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {visibleExpenses.length > 0 ? (
              <>
                <div className="mb-3 hidden xl:grid xl:grid-cols-[minmax(0,2.45fr)_minmax(10rem,0.9fr)_minmax(12.5rem,1fr)_minmax(8.5rem,0.75fr)_minmax(12rem,1fr)] xl:gap-4 xl:px-4">
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Gasto</span>
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Vencimento</span>
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Status</span>
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-right text-muted">Valor</span>
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-right text-muted">Acoes</span>
                </div>
                <div className="space-y-3">
                  {visibleExpenses.map((expense) => {
                    const category = categoryById.get(expense.categoryId);
                    const dueState = getExpenseDueState(expense);

                    return (
                      <ExpenseListItem
                        key={expense.id ?? `${expense.date}-${expense.time}-${expense.description}`}
                        expense={expense}
                        categoryName={category?.name ?? "Setor removido"}
                        dueState={dueState}
                        isCompleting={isCompletingExpense(expense.id)}
                        onComplete={openCompleteExpense}
                        onEdit={openEditExpense}
                        onDelete={setDeleteExpense}
                        onDeleteSeries={setDeleteExpenseSeries}
                      />
                    );
                  })}
                </div>
              </>
            ) : null}
            {visibleExpenses.length === 0 && visibleIncomeEntries.length === 0 ? (
              <p className="rounded-lg bg-elevated px-3 py-4 text-sm text-muted">Nenhuma movimentacao encontrada para os filtros atuais.</p>
            ) : null}
          </section>
          </>
          ) : null}
        </>
      ) : (
        isOverview ? <PlanningOverviewSkeleton /> : <p className="rounded-lg border border-line bg-panel p-4 text-sm text-muted">Carregando planejamento mensal...</p>
      )}

      <ManagementModal
        title={editingCategoryId ? "Editar setor" : "Novo setor"}
        description="Organize o orcamento em setores com nome, icone e regra de distribuicao por porcentagem ou valor fixo."
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onSubmit={submitCategory}
        submitDisabled={isSaving}
        submitLabel={isSaving ? "Salvando..." : "Salvar"}
      >
        <ManagementField label="Nome do setor" required helperText="Ex.: moradia, alimentacao, transporte ou investimentos.">
          <input required autoFocus value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} className={fieldClass} placeholder="Ex.: Faculdade" />
        </ManagementField>
        <div className="grid gap-3 sm:grid-cols-2">
          <ManagementField label="Icone" required>
            <select value={categoryForm.icon} onChange={(event) => setCategoryForm((current) => ({ ...current, icon: event.target.value }))} className={fieldClass}>
              {categoryIcons.map((icon) => <option key={icon.value} value={icon.value}>{icon.label}</option>)}
            </select>
          </ManagementField>
          <ManagementField label="Cor" required>
            <select value={categoryForm.color} onChange={(event) => setCategoryForm((current) => ({ ...current, color: event.target.value }))} className={fieldClass}>
              {categoryColors.map((color) => <option key={color} value={color}>{color}</option>)}
            </select>
          </ManagementField>
        </div>
        <ManagementField label="Tipo de orcamento" required helperText="Escolha se este setor sera planejado por porcentagem da renda ou por valor fixo.">
          <select value={categoryForm.budgetType} onChange={(event) => setCategoryForm((current) => ({ ...current, budgetType: event.target.value as MonthlyBudgetType }))} className={fieldClass}>
            <option value="percentage">Por porcentagem</option>
            <option value="fixed">Por valor fixo</option>
          </select>
        </ManagementField>
        {categoryForm.budgetType === "percentage" ? (
          <ManagementField label="Porcentagem planejada" required helperText="Informe quanto da renda mensal este setor deve consumir.">
            <input type="number" min="0" step="0.01" value={categoryForm.percentage} onChange={(event) => setCategoryForm((current) => ({ ...current, percentage: event.target.value }))} className={fieldClass} placeholder="Ex.: 15" />
          </ManagementField>
        ) : (
          <ManagementField label="Valor fixo" required helperText="Informe o valor mensal planejado para este setor.">
            <input value={categoryForm.fixedAmount} onChange={(event) => setCategoryForm((current) => ({ ...current, fixedAmount: event.target.value }))} className={fieldClass} placeholder="Ex.: 850,00" inputMode="decimal" />
          </ManagementField>
        )}
      </ManagementModal>

      <ManagementModal
        title={editingExpense ? "Editar gasto" : "Adicionar gasto"}
        description="Cadastre gastos realizados, previstos ou recorrentes. Quando o setor for de investimentos, o formulario tambem controla o destino do valor."
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        onSubmit={submitExpense}
        submitDisabled={isSaving}
        submitLabel={isSaving ? "Salvando..." : "Salvar"}
      >
        <ManagementField label="Descricao do gasto" required helperText="Ex.: faculdade, aluguel, mercado ou aporte manual.">
          <input required autoFocus value={expenseForm.description} onChange={(event) => setExpenseForm((current) => ({ ...current, description: event.target.value }))} className={fieldClass} placeholder="Ex.: Faculdade" />
        </ManagementField>
        <ManagementField
          label="Valor do gasto"
          required
          helperText={expenseTargetsInvestments && expenseForm.investmentDestination === "asset" ? "Calculado automaticamente por quantidade x preco + taxas." : "Informe o valor mensal ou pontual deste gasto."}
        >
          <input
            required
            value={expenseTargetsInvestments && expenseForm.investmentDestination === "asset" ? formatMoneyInput(assetOperationTotalInCents) : expenseForm.amount}
            onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))}
            className={fieldClass}
            placeholder={expenseTargetsInvestments && expenseForm.investmentDestination === "asset" ? "Calculado automaticamente" : "Informe o valor do gasto"}
            inputMode="decimal"
            readOnly={expenseTargetsInvestments && expenseForm.investmentDestination === "asset"}
          />
        </ManagementField>
        <ManagementField label="Setor" required helperText="Selecione a categoria do planejamento que este gasto pertence.">
          <select
            required
            value={expenseForm.categoryId}
            onChange={(event) => {
              const nextCategory = overview?.categories.find((category) => category.id === event.target.value);
              setExpenseForm((current) => ({
                ...current,
                categoryId: event.target.value,
                investmentDestination: isInvestmentCategory(nextCategory) ? current.investmentDestination : "",
                assetId: isInvestmentCategory(nextCategory) ? current.assetId : "",
                assetSearch: isInvestmentCategory(nextCategory) ? current.assetSearch : "",
                quantity: isInvestmentCategory(nextCategory) ? current.quantity : "",
                price: isInvestmentCategory(nextCategory) ? current.price : "",
                fees: isInvestmentCategory(nextCategory) ? current.fees : "",
                cashBoxId: isInvestmentCategory(nextCategory) ? current.cashBoxId : "",
                idempotencyKey: isInvestmentCategory(nextCategory) ? current.idempotencyKey : createExpenseIdempotencyKey()
              }));
            }}
            className={fieldClass}
          >
            <option value="">Selecione o setor</option>
            {overview?.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </ManagementField>
        {expenseTargetsInvestments ? (
          <fieldset className="grid gap-3 rounded-lg border border-line bg-elevated px-3 py-3 text-sm text-muted">
            <legend className="px-1 text-xs uppercase tracking-[0.14em]">Destino do investimento</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setExpenseForm((current) => ({ ...current, investmentDestination: "asset" }))}
                className={`inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm transition ${
                  expenseForm.investmentDestination === "asset" ? "border-accent bg-accent/10 text-accent" : "border-line bg-panel text-muted hover:border-accent/40 hover:text-ink"
                }`}
              >
                Aporte em ativo
              </button>
              <button
                type="button"
                onClick={() => setExpenseForm((current) => ({ ...current, investmentDestination: "cashbox" }))}
                className={`inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm transition ${
                  expenseForm.investmentDestination === "cashbox" ? "border-accent bg-accent/10 text-accent" : "border-line bg-panel text-muted hover:border-accent/40 hover:text-ink"
                }`}
              >
                Transferencia para caixinha
              </button>
            </div>

            {expenseForm.investmentDestination === "asset" ? (
              assets.length > 0 ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ManagementField label="Buscar ativo" required helperText="Procure pelo nome ou ticker do ativo que recebera este aporte.">
                      <input
                        value={expenseForm.assetSearch}
                        onChange={(event) => setExpenseForm((current) => ({ ...current, assetSearch: event.target.value }))}
                        className={fieldClass}
                        placeholder="Ex.: Bitcoin ou BTC"
                      />
                    </ManagementField>
                    <ManagementField label="Ativo" required>
                      <select
                        value={expenseForm.assetId}
                        onChange={(event) => {
                          const asset = assets.find((item) => item.id === event.target.value);
                          setExpenseForm((current) => ({
                            ...current,
                            assetId: event.target.value,
                            assetSearch: asset?.ticker ?? current.assetSearch
                          }));
                        }}
                        className={fieldClass}
                      >
                        <option value="">Selecione o ativo</option>
                        {filteredAssets.map((asset) => <option key={asset.id ?? asset.ticker} value={asset.id}>{asset.ticker} · {asset.name}</option>)}
                      </select>
                    </ManagementField>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <ManagementField label="Tipo de operacao" required>
                      <select value="COMPRA" disabled className={fieldClass}>
                        <option value="COMPRA">Compra</option>
                      </select>
                    </ManagementField>
                    <ManagementField label="Quantidade" required helperText="Use casas decimais quando o ativo permitir fracao.">
                      <input value={expenseForm.quantity} onChange={(event) => setExpenseForm((current) => ({ ...current, quantity: event.target.value }))} className={fieldClass} placeholder="Ex.: 10" inputMode="decimal" />
                    </ManagementField>
                    <ManagementField label="Preco unitario" required helperText="Informe o preco pago por unidade.">
                      <input value={expenseForm.price} onChange={(event) => setExpenseForm((current) => ({ ...current, price: event.target.value }))} className={fieldClass} placeholder="Ex.: 12,50" inputMode="decimal" />
                    </ManagementField>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ManagementField label="Taxas" optional helperText="Inclua corretagem, emolumentos ou custos extras, se houver.">
                      <input value={expenseForm.fees} onChange={(event) => setExpenseForm((current) => ({ ...current, fees: event.target.value }))} className={fieldClass} placeholder="Informe as taxas da operacao, se houver" inputMode="decimal" />
                    </ManagementField>
                    <ManagementField label="Valor total da operacao" helperText="Resumo calculado automaticamente para manter a operacao consistente com a carteira.">
                      <p className="rounded-lg border border-line bg-panel px-3 py-3 text-sm text-ink">Total da operacao: {formatCents(assetOperationTotalInCents)}</p>
                    </ManagementField>
                  </div>
                  <p className="text-xs text-muted">O valor do gasto passa a ser calculado automaticamente por quantidade x preco + taxas para manter a operacao consistente com a carteira.</p>
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-line bg-panel px-3 py-4">
                  <p className="text-sm text-ink">Voce ainda nao possui ativos cadastrados.</p>
                  <Link to="/ativos" className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/40 hover:text-ink">
                    Cadastrar ativo
                  </Link>
                </div>
              )
            ) : null}

            {expenseForm.investmentDestination === "cashbox" ? (
              cashBoxes.length > 0 ? (
                <ManagementField label="Caixinha de destino" required helperText="Escolha a reserva que recebera esta transferencia.">
                  <select value={expenseForm.cashBoxId} onChange={(event) => setExpenseForm((current) => ({ ...current, cashBoxId: event.target.value }))} className={fieldClass}>
                    <option value="">Selecione a caixinha</option>
                    {cashBoxes.map((cashBox) => <option key={cashBox.id ?? cashBox.name} value={cashBox.id}>{cashBox.name}</option>)}
                  </select>
                </ManagementField>
              ) : (
                <div className="rounded-lg border border-dashed border-line bg-panel px-3 py-4">
                  <p className="text-sm text-ink">Voce ainda nao possui caixinhas cadastradas.</p>
                  <Link to="/caixinhas" className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/40 hover:text-ink">
                    Criar caixinha
                  </Link>
                </div>
              )
            ) : null}

            {isLoadingInvestmentTargets ? <p className="text-xs text-muted">Carregando ativos e caixinhas...</p> : null}
          </fieldset>
        ) : null}
        <fieldset className="rounded-lg border border-line bg-elevated px-3 py-3 text-sm text-muted">
          <legend className="px-1 text-xs uppercase tracking-[0.14em]">Momento do gasto</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2">
              <input type="radio" checked={expenseForm.useCurrentMoment} onChange={() => updateUseCurrentMoment(true)} className="h-4 w-4 accent-accent" />
              Agora
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={!expenseForm.useCurrentMoment} onChange={() => updateUseCurrentMoment(false)} className="h-4 w-4 accent-accent" />
              Escolher data e horario
            </label>
          </div>
        </fieldset>
        {!expenseForm.useCurrentMoment ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ManagementField label="Data do gasto" required>
              <input type="date" required value={expenseForm.date} onChange={(event) => setExpenseForm((current) => ({ ...current, date: event.target.value, status: isFutureExpense(event.target.value, current.time) ? "planned" : current.status }))} className={fieldClass} />
            </ManagementField>
            <ManagementField label="Horario do gasto" required>
              <input type="time" required value={expenseForm.time} onChange={(event) => setExpenseForm((current) => ({ ...current, time: event.target.value, status: isFutureExpense(current.date, event.target.value) ? "planned" : current.status }))} className={fieldClass} />
            </ManagementField>
          </div>
        ) : (
          <p className="rounded-lg bg-elevated px-3 py-2 text-sm text-muted">Sera registrado com a data e horario atuais: {formatLocalDate(today.date)} as {today.time}.</p>
        )}
        <ManagementField label="Status do gasto" required>
          <select value={expenseForm.status} onChange={(event) => setExpenseForm((current) => ({ ...current, status: event.target.value as MonthlyExpenseStatus }))} className={fieldClass}>
            <option value="completed">Realizado</option>
            <option value="planned">Previsto</option>
          </select>
        </ManagementField>
        {isFutureExpense(expenseForm.date, expenseForm.time) ? <p className="rounded-lg bg-amber/10 px-3 py-2 text-sm text-amber">Datas futuras serao salvas automaticamente como gasto previsto.</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <ManagementField label="Forma de pagamento" optional helperText="Ex.: Pix, debito, credito, dinheiro ou conta bancaria.">
            <input value={expenseForm.paymentMethod} onChange={(event) => setExpenseForm((current) => ({ ...current, paymentMethod: event.target.value }))} className={fieldClass} placeholder="Informe a forma de pagamento, se desejar" />
          </ManagementField>
          <ManagementField label="Tipo de lancamento" required>
            <select value={expenseForm.expenseType} onChange={(event) => setExpenseForm((current) => ({ ...current, expenseType: event.target.value as "single" | "recurring", recurring: event.target.value === "recurring" }))} className={fieldClass}>
              <option value="single">Unico</option>
              <option value="recurring">Recorrente</option>
            </select>
          </ManagementField>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-line bg-elevated px-3 py-3 text-sm text-muted">
          <input type="checkbox" checked={expenseForm.recurring} onChange={(event) => setExpenseForm((current) => ({ ...current, recurring: event.target.checked, expenseType: event.target.checked ? "recurring" : "single" }))} className="h-4 w-4 accent-accent" />
          Marcar como recorrente
        </label>
        {expenseForm.recurring ? (
          <fieldset className="grid gap-3 rounded-lg border border-line bg-elevated px-3 py-3 text-sm text-muted">
            <legend className="px-1 text-xs uppercase tracking-[0.14em]">Recorrencia</legend>
            {editingExpense?.recurrenceId ? (
              <ManagementField label="Escopo da edicao" required helperText="Escolha se a alteracao vale apenas para este gasto ou para toda a recorrencia.">
                <select value={expenseForm.editScope} onChange={(event) => setExpenseForm((current) => ({ ...current, editScope: event.target.value as "single" | "series" }))} className={fieldClass}>
                  <option value="single">Editar somente este lancamento</option>
                  <option value="series">Editar toda recorrencia</option>
                </select>
              </ManagementField>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <ManagementField label="Periodicidade" required>
                <select value={expenseForm.recurrenceFrequency} onChange={(event) => setExpenseForm((current) => ({ ...current, recurrenceFrequency: event.target.value as MonthlyRecurrenceFrequency }))} className={fieldClass}>
                  {Object.entries(recurrenceFrequencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </ManagementField>
              <ManagementField label="Intervalo" required helperText="Ex.: a cada 1 mes, 2 meses ou conforme a periodicidade escolhida.">
                <input type="number" min="1" max="60" value={expenseForm.recurrenceInterval} onChange={(event) => setExpenseForm((current) => ({ ...current, recurrenceInterval: Number(event.target.value) }))} className={fieldClass} placeholder="Ex.: 1" />
              </ManagementField>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <ManagementField label="Dia do mes" required helperText="Use o dia desejado para gerar os proximos lancamentos.">
                <input type="number" min="1" max="31" value={expenseForm.recurrenceDayOfMonth} onChange={(event) => setExpenseForm((current) => ({ ...current, recurrenceDayOfMonth: Number(event.target.value) }))} className={fieldClass} placeholder="Ex.: 5" />
              </ManagementField>
              <ManagementField label="Data inicial da recorrencia" required>
                <input type="date" value={expenseForm.recurrenceStartDate} onChange={(event) => setExpenseForm((current) => ({ ...current, recurrenceStartDate: event.target.value }))} className={fieldClass} aria-label="Data inicial da recorrencia" />
              </ManagementField>
              <ManagementField label="Data final da recorrencia" optional>
                <input type="date" value={expenseForm.recurrenceEndDate} onChange={(event) => setExpenseForm((current) => ({ ...current, recurrenceEndDate: event.target.value }))} className={fieldClass} aria-label="Data final da recorrencia" />
              </ManagementField>
            </div>
            <p className="text-xs text-muted">Lancamentos futuros serao gerados como previstos, sem duplicar a recorrencia original.</p>
          </fieldset>
        ) : null}
        <ManagementField label="Observacoes" optional helperText="Adicione contexto extra sobre este gasto, se necessario.">
          <textarea value={expenseForm.note} onChange={(event) => setExpenseForm((current) => ({ ...current, note: event.target.value }))} className={areaClass} placeholder="Ex.: mensalidade do semestre, compra manual ou observacao importante" />
        </ManagementField>
      </ManagementModal>

      <ManagementModal
        title={editingIncomeEntry ? "Editar entrada" : "Nova entrada"}
        description="Cadastre entradas recebidas, previstas ou recorrentes com categoria, data e valor corretos."
        isOpen={isIncomeEntryModalOpen}
        onClose={() => setIsIncomeEntryModalOpen(false)}
        onSubmit={submitIncomeEntry}
        submitDisabled={isSaving}
        submitLabel={isSaving ? "Salvando..." : "Salvar"}
      >
        <ManagementField label="Descricao da entrada" required helperText="Ex.: salario, freelance, dividendo manual ou reembolso.">
          <input required autoFocus value={incomeEntryForm.description} onChange={(event) => setIncomeEntryForm((current) => ({ ...current, description: event.target.value }))} className={fieldClass} placeholder="Ex.: Salario" />
        </ManagementField>
        <ManagementField label="Valor recebido" required helperText="Informe o valor total desta entrada.">
          <input required value={incomeEntryForm.amount} onChange={(event) => setIncomeEntryForm((current) => ({ ...current, amount: event.target.value }))} className={fieldClass} placeholder="Informe o valor recebido" inputMode="decimal" />
        </ManagementField>
        <ManagementField label="Categoria da entrada" required helperText="Use uma categoria clara para facilitar filtros e historico.">
          <input required list="monthly-income-categories" value={incomeEntryForm.category} onChange={(event) => setIncomeEntryForm((current) => ({ ...current, category: event.target.value }))} className={fieldClass} placeholder="Ex.: Salario, Freelance, Dividendos" />
          <datalist id="monthly-income-categories">
            {incomeCategoryFilterOptions.map((category) => <option key={category} value={category} />)}
          </datalist>
        </ManagementField>
        <fieldset className="rounded-lg border border-line bg-elevated px-3 py-3 text-sm text-muted">
          <legend className="px-1 text-xs uppercase tracking-[0.14em]">Momento da entrada</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2">
              <input type="radio" checked={incomeEntryForm.useCurrentMoment} onChange={() => updateIncomeEntryUseCurrentMoment(true)} className="h-4 w-4 accent-accent" />
              Agora
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={!incomeEntryForm.useCurrentMoment} onChange={() => updateIncomeEntryUseCurrentMoment(false)} className="h-4 w-4 accent-accent" />
              Escolher data e horario
            </label>
          </div>
        </fieldset>
        {!incomeEntryForm.useCurrentMoment ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ManagementField label="Data da entrada" required>
              <input type="date" required value={incomeEntryForm.date} onChange={(event) => setIncomeEntryForm((current) => ({ ...current, date: event.target.value, status: isFutureExpense(event.target.value, current.time) ? "planned" : current.status }))} className={fieldClass} />
            </ManagementField>
            <ManagementField label="Horario da entrada" required>
              <input type="time" required value={incomeEntryForm.time} onChange={(event) => setIncomeEntryForm((current) => ({ ...current, time: event.target.value, status: isFutureExpense(current.date, event.target.value) ? "planned" : current.status }))} className={fieldClass} />
            </ManagementField>
          </div>
        ) : (
          <p className="rounded-lg bg-elevated px-3 py-2 text-sm text-muted">Sera registrada com a data e horario atuais: {formatLocalDate(today.date)} as {today.time}.</p>
        )}
        <ManagementField label="Status da entrada" required>
          <select value={incomeEntryForm.status} onChange={(event) => setIncomeEntryForm((current) => ({ ...current, status: event.target.value as MonthlyIncomeEntryStatus }))} className={fieldClass}>
            <option value="received">Recebida</option>
            <option value="planned">Prevista</option>
          </select>
        </ManagementField>
        {isFutureExpense(incomeEntryForm.date, incomeEntryForm.time) ? <p className="rounded-lg bg-amber/10 px-3 py-2 text-sm text-amber">Datas futuras serao salvas automaticamente como entrada prevista.</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <ManagementField label="Tipo de entrada" required>
            <select value={incomeEntryForm.incomeType} onChange={(event) => setIncomeEntryForm((current) => ({ ...current, incomeType: event.target.value as "single" | "recurring", recurring: event.target.value === "recurring" }))} className={fieldClass}>
              <option value="single">Unica</option>
              <option value="recurring">Recorrente</option>
            </select>
          </ManagementField>
          <label className="flex items-center gap-2 rounded-lg border border-line bg-elevated px-3 py-3 text-sm text-muted">
            <input type="checkbox" checked={incomeEntryForm.recurring} onChange={(event) => setIncomeEntryForm((current) => ({ ...current, recurring: event.target.checked, incomeType: event.target.checked ? "recurring" : "single" }))} className="h-4 w-4 accent-accent" />
            Recorrente
          </label>
        </div>
        {incomeEntryForm.recurring ? (
          <fieldset className="grid gap-3 rounded-lg border border-line bg-elevated px-3 py-3 text-sm text-muted">
            <legend className="px-1 text-xs uppercase tracking-[0.14em]">Recorrencia</legend>
            {editingIncomeEntry?.recurrenceId ? (
              <ManagementField label="Escopo da edicao" required helperText="Escolha se a alteracao vale apenas para esta entrada ou para toda a recorrencia.">
                <select value={incomeEntryForm.editScope} onChange={(event) => setIncomeEntryForm((current) => ({ ...current, editScope: event.target.value as "single" | "series" }))} className={fieldClass}>
                  <option value="single">Editar somente este lancamento</option>
                  <option value="series">Editar toda recorrencia</option>
                </select>
              </ManagementField>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <ManagementField label="Periodicidade" required>
                <select value={incomeEntryForm.recurrenceFrequency} onChange={(event) => setIncomeEntryForm((current) => ({ ...current, recurrenceFrequency: event.target.value as MonthlyRecurrenceFrequency }))} className={fieldClass}>
                  {Object.entries(recurrenceFrequencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </ManagementField>
              <ManagementField label="Intervalo" required helperText="Ex.: a cada 1 mes, 2 meses ou conforme a periodicidade escolhida.">
                <input type="number" min="1" max="60" value={incomeEntryForm.recurrenceInterval} onChange={(event) => setIncomeEntryForm((current) => ({ ...current, recurrenceInterval: Number(event.target.value) }))} className={fieldClass} placeholder="Ex.: 1" />
              </ManagementField>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <ManagementField label="Dia do mes" required helperText="Defina o dia usado para gerar os proximos recebimentos.">
                <input type="number" min="1" max="31" value={incomeEntryForm.recurrenceDayOfMonth} onChange={(event) => setIncomeEntryForm((current) => ({ ...current, recurrenceDayOfMonth: Number(event.target.value) }))} className={fieldClass} placeholder="Ex.: 5" />
              </ManagementField>
              <ManagementField label="Data inicial da recorrencia" required>
                <input type="date" value={incomeEntryForm.recurrenceStartDate} onChange={(event) => setIncomeEntryForm((current) => ({ ...current, recurrenceStartDate: event.target.value }))} className={fieldClass} aria-label="Data inicial da recorrencia" />
              </ManagementField>
              <ManagementField label="Data final da recorrencia" optional>
                <input type="date" value={incomeEntryForm.recurrenceEndDate} onChange={(event) => setIncomeEntryForm((current) => ({ ...current, recurrenceEndDate: event.target.value }))} className={fieldClass} aria-label="Data final da recorrencia" />
              </ManagementField>
            </div>
            <p className="text-xs text-muted">Entradas futuras serao geradas como previstas, sem duplicar a recorrencia original.</p>
          </fieldset>
        ) : null}
        <ManagementField label="Observacoes" optional helperText="Adicione algum detalhe sobre a origem desta entrada, se necessario.">
          <textarea value={incomeEntryForm.note} onChange={(event) => setIncomeEntryForm((current) => ({ ...current, note: event.target.value }))} className={areaClass} placeholder="Ex.: pagamento recorrente, bonus, ajuste ou observacao importante" />
        </ManagementField>
      </ManagementModal>

      <ManagementModal
        title="Marcar como pago"
        isOpen={completeExpenseTarget !== null}
        onClose={() => setCompleteExpenseTarget(null)}
        onSubmit={submitCompleteExpense}
        submitDisabled={isCompletingExpense(completeExpenseTarget?.id)}
        submitLabel={isCompletingExpense(completeExpenseTarget?.id) ? "Marcando..." : "Confirmar"}
      >
        {completeExpenseTarget ? (
          <>
            <div className="rounded-lg border border-line bg-elevated px-3 py-3 text-sm text-muted">
              <p className="font-medium text-ink">{completeExpenseTarget.description} · {categoryById.get(completeExpenseTarget.categoryId)?.name ?? "Setor removido"}</p>
              <p className="mt-2 text-ink"><MoneyValue value={formatCents(completeExpenseTarget.amountInCents)} /></p>
              <p className="mt-2">Vencimento: {formatLocalDate(completeExpenseTarget.date)} as {completeExpenseTarget.time}</p>
              {completeExpenseTarget.completedAt ? <p className="mt-1">{formatCompletedAt(completeExpenseTarget.completedAt)}</p> : null}
              {completeExpenseTarget.allocationKind === "investment_contribution" ? <p className="mt-2 text-xs text-violet">Ao confirmar, o sistema tambem registra ou atualiza a compra vinculada do ativo.</p> : null}
              {completeExpenseTarget.allocationKind === "cash_box_contribution" ? <p className="mt-2 text-xs text-aqua">Ao confirmar, o sistema tambem registra ou atualiza a movimentacao vinculada da caixinha.</p> : null}
            </div>
            <fieldset className="rounded-lg border border-line bg-elevated px-3 py-3 text-sm text-muted">
              <legend className="px-1 text-xs uppercase tracking-[0.14em]">Pagamento</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={completeExpenseForm.useCurrentMoment} onChange={() => setCompleteExpenseForm((current) => ({ ...current, useCurrentMoment: true }))} className="h-4 w-4 accent-accent" />
                  Agora
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={!completeExpenseForm.useCurrentMoment} onChange={() => setCompleteExpenseForm((current) => ({ ...current, useCurrentMoment: false }))} className="h-4 w-4 accent-accent" />
                  Escolher data e horario
                </label>
              </div>
            </fieldset>
            {completeExpenseForm.useCurrentMoment ? (
              <p className="rounded-lg bg-elevated px-3 py-2 text-sm text-muted">Pagamento: agora, com a data atual ({formatLocalDate(today.date)}) e o horario atual do dispositivo.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <input type="date" required value={completeExpenseForm.completedDate} onChange={(event) => setCompleteExpenseForm((current) => ({ ...current, completedDate: event.target.value }))} className={fieldClass} />
                <input type="time" required value={completeExpenseForm.completedTime} onChange={(event) => setCompleteExpenseForm((current) => ({ ...current, completedTime: event.target.value }))} className={fieldClass} />
              </div>
            )}
          </>
        ) : null}
      </ManagementModal>

      <ManagementModal
        title="Marcar entrada como recebida"
        isOpen={receiveIncomeEntryTarget !== null}
        onClose={() => setReceiveIncomeEntryTarget(null)}
        onSubmit={submitReceiveIncomeEntry}
        submitDisabled={isReceivingIncomeEntry(receiveIncomeEntryTarget?.id)}
        submitLabel={isReceivingIncomeEntry(receiveIncomeEntryTarget?.id) ? "Marcando..." : "Confirmar"}
      >
        {receiveIncomeEntryTarget ? (
          <>
            <div className="rounded-lg border border-line bg-elevated px-3 py-3 text-sm text-muted">
              <p className="font-medium text-ink">{receiveIncomeEntryTarget.description} · {receiveIncomeEntryTarget.category}</p>
              <p className="mt-2 text-ink"><MoneyValue value={formatCents(receiveIncomeEntryTarget.amountInCents)} /></p>
              <p className="mt-2">Previsto para: {formatLocalDate(receiveIncomeEntryTarget.date)} as {receiveIncomeEntryTarget.time}</p>
            </div>
            <fieldset className="rounded-lg border border-line bg-elevated px-3 py-3 text-sm text-muted">
              <legend className="px-1 text-xs uppercase tracking-[0.14em]">Recebimento</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={receiveIncomeEntryForm.useCurrentMoment} onChange={() => setReceiveIncomeEntryForm((current) => ({ ...current, useCurrentMoment: true }))} className="h-4 w-4 accent-accent" />
                  Agora
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={!receiveIncomeEntryForm.useCurrentMoment} onChange={() => setReceiveIncomeEntryForm((current) => ({ ...current, useCurrentMoment: false }))} className="h-4 w-4 accent-accent" />
                  Escolher data e horario
                </label>
              </div>
            </fieldset>
            {receiveIncomeEntryForm.useCurrentMoment ? (
              <p className="rounded-lg bg-elevated px-3 py-2 text-sm text-muted">Recebimento: agora, com a data atual ({formatLocalDate(today.date)}) e o horario atual do dispositivo.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <input type="date" required value={receiveIncomeEntryForm.receivedDate} onChange={(event) => setReceiveIncomeEntryForm((current) => ({ ...current, receivedDate: event.target.value }))} className={fieldClass} />
                <input type="time" required value={receiveIncomeEntryForm.receivedTime} onChange={(event) => setReceiveIncomeEntryForm((current) => ({ ...current, receivedTime: event.target.value }))} className={fieldClass} />
              </div>
            )}
          </>
        ) : null}
      </ManagementModal>

      <ManagementModal
        title={editingGoalId ? "Editar objetivo" : "Novo objetivo"}
        description="Defina quanto deseja acumular, quanto ja foi reservado e qual fonte pode ser vinculada a esse objetivo."
        isOpen={isGoalModalOpen}
        onClose={() => setIsGoalModalOpen(false)}
        onSubmit={submitGoal}
        submitDisabled={isSaving}
        submitLabel={isSaving ? "Salvando..." : "Salvar"}
      >
        <ManagementField label="Nome do objetivo" required helperText="Ex.: viagem, carro, reserva de emergencia ou liberdade financeira.">
          <input required autoFocus value={goalForm.name} onChange={(event) => setGoalForm((current) => ({ ...current, name: event.target.value }))} className={fieldClass} placeholder="Ex.: Comprar carro" />
        </ManagementField>
        <div className="grid gap-3 sm:grid-cols-3">
          <ManagementField label="Valor objetivo" required helperText="Informe quanto deseja acumular para atingir esta meta.">
            <input required value={goalForm.target} onChange={(event) => setGoalForm((current) => ({ ...current, target: event.target.value }))} className={fieldClass} placeholder="Informe o valor objetivo" inputMode="decimal" />
          </ManagementField>
          <ManagementField label="Valor ja guardado" optional helperText="Preencha quanto ja foi separado para esta meta.">
            <input value={goalForm.saved} onChange={(event) => setGoalForm((current) => ({ ...current, saved: event.target.value }))} className={fieldClass} placeholder="Informe quanto ja possui guardado" inputMode="decimal" />
          </ManagementField>
          <ManagementField label="Aporte mensal" optional helperText="Use este campo para acompanhar o ritmo mensal de acumulacao.">
            <input value={goalForm.monthlyContribution} onChange={(event) => setGoalForm((current) => ({ ...current, monthlyContribution: event.target.value }))} className={fieldClass} placeholder="Informe o aporte mensal desejado" inputMode="decimal" />
          </ManagementField>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ManagementField label="Origem vinculada" required helperText="Escolha se a meta acompanha valores manuais, carteira ou caixinha.">
            <select value={goalForm.linkedSource} onChange={(event) => setGoalForm((current) => ({ ...current, linkedSource: event.target.value as MonthlyFinancialGoalRecord["linkedSource"] }))} className={fieldClass}>
              <option value="manual">Manual</option>
              <option value="portfolio">Carteira</option>
              <option value="cashbox">Caixinha</option>
            </select>
          </ManagementField>
          <ManagementField label="Identificador vinculado" optional helperText="Informe o nome ou ID da carteira/caixinha somente se quiser vincular esta meta a uma origem especifica.">
            <input value={goalForm.linkedSourceId} onChange={(event) => setGoalForm((current) => ({ ...current, linkedSourceId: event.target.value }))} className={fieldClass} placeholder="Ex.: reserva-emergencia" />
          </ManagementField>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-line bg-elevated px-3 py-3 text-sm text-muted">
          <input type="checkbox" checked={goalForm.active} onChange={(event) => setGoalForm((current) => ({ ...current, active: event.target.checked }))} className="h-4 w-4 accent-accent" />
          Objetivo ativo
        </label>
      </ManagementModal>

      <ManagementModal title={categoryDetails ? `Dashboard do setor ${categoryDetails.name}` : "Dashboard do setor"} isOpen={categoryDetails !== null} onClose={() => setCategoryDetails(null)} onSubmit={(event) => { event.preventDefault(); setCategoryDetails(null); }} submitLabel="Fechar">
        {categoryDetails ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">
                <p>Gasto total</p>
                <p className="mt-1 font-semibold text-ink"><MoneyValue value={formatCents(categoryDetailTotal)} /></p>
              </div>
              <div className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">
                <p>Gasto medio</p>
                <p className="mt-1 font-semibold text-ink"><MoneyValue value={formatCents(categoryDetailAverage)} /></p>
              </div>
              <div className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">
                <p>Maior gasto</p>
                <p className="mt-1 font-semibold text-ink"><MoneyValue value={formatCents(categoryDetailHighest)} /></p>
              </div>
              <div className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">
                <p>Menor gasto</p>
                <p className="mt-1 font-semibold text-ink"><MoneyValue value={formatCents(categoryDetailLowest)} /></p>
              </div>
              <div className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">
                <p>Quantidade</p>
                <p className="mt-1 font-semibold text-ink">{categoryDetailExpenses.length}</p>
              </div>
              <div className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">
                <p>Utilizado</p>
                <p className="mt-1 font-semibold text-ink">{formatPercentage(categoryDetails.usedPercent)}</p>
              </div>
            </section>
            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-line bg-elevated p-3">
                <h3 className="text-sm font-semibold text-ink">Evolucao mensal</h3>
                <LazyLineChart data={categoryMonthlyEvolutionChartData} xAxisKey="month" height={180} series={[{ dataKey: "value", name: "Gastos", color: categoryDetails.color }]} />
              </div>
              <div className="rounded-lg border border-line bg-elevated p-3">
                <h3 className="text-sm font-semibold text-ink">Evolucao anual</h3>
                <LazyBarChart data={categoryAnnualEvolutionChartData} xAxisKey="year" name="Gastos" color={categoryDetails.color} height={180} />
              </div>
              <div className="rounded-lg border border-line bg-elevated p-3">
                <h3 className="text-sm font-semibold text-ink">Comparacao entre meses</h3>
                <LazyBarChart data={categoryComparisonChartData} name="Gastos" color={categoryDetails.color} height={180} />
              </div>
              <div className="rounded-lg border border-line bg-elevated p-3">
                <h3 className="text-sm font-semibold text-ink">Gastos por forma de pagamento</h3>
                <LazyBarChart data={categoryPaymentChartData} xAxisKey="paymentMethod" name="Gastos" color="#38bdf8" height={180} />
              </div>
            </section>
            <section className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink">Historico completo</h3>
                <button type="button" onClick={() => exportCategoryHistory(categoryDetails)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:text-ink">
                  <Download size={15} />
                  Exportar CSV
                </button>
              </div>
              <div className="grid max-h-64 gap-2 overflow-y-auto">
                {categoryDetailExpenses.length > 0 ? categoryDetailExpenses.map((expense) => (
                  <div key={expense.id ?? `${expense.date}-${expense.time}-${expense.description}`} className="grid gap-2 rounded-lg bg-elevated px-3 py-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                    <span className="text-muted">{formatLocalDate(expense.date)}</span>
                    <span className="text-ink">{expense.description}</span>
                    <span className="font-medium text-ink"><MoneyValue value={formatCents(expense.amountInCents)} /></span>
                  </div>
                )) : <p className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">Nenhum lancamento neste setor.</p>}
              </div>
            </section>
          </>
        ) : null}
      </ManagementModal>

      <ConfirmDelete
        isOpen={deleteCategory !== null}
        title="Excluir setor?"
        description="Voce esta prestes a remover este setor do planejamento mensal."
        details={[
          deleteCategory?.name ?? "Setor sem nome",
          "Os gastos ja lancados permanecerao no historico como setor removido."
        ]}
        confirmLabel="Excluir setor"
        onCancel={() => setDeleteCategory(null)}
        onConfirm={() => void confirmDeleteCategory()}
      />
      <ConfirmDelete
        isOpen={deleteExpense !== null}
        title="Excluir gasto?"
        description={
          deleteExpense?.allocationKind === "investment_contribution"
            ? `Este gasto esta vinculado a uma compra em ${deleteExpense.integration?.assetTicker ?? "ativo"} e a exclusao tambem removera a movimentacao vinculada.`
            : deleteExpense?.allocationKind === "cash_box_contribution"
              ? "Este gasto esta vinculado a uma movimentacao de caixinha e a exclusao tambem removera a movimentacao vinculada."
              : "Voce esta prestes a remover este gasto do planejamento mensal."
        }
        details={[
          deleteExpense?.description ?? "Gasto sem descricao",
          deleteExpense ? formatCents(deleteExpense.amountInCents) : "-",
          deleteExpense ? `${formatLocalDate(deleteExpense.date)} as ${deleteExpense.time}` : "-",
          deleteExpense?.recurring ? "A exclusao cancela apenas este lancamento da recorrencia." : "Lancamento avulso."
        ]}
        confirmLabel="Excluir gasto"
        onCancel={() => setDeleteExpense(null)}
        onConfirm={() => void confirmDeleteExpense()}
      />
      <ConfirmDelete
        isOpen={deleteExpenseSeries !== null}
        title="Excluir recorrencia de gasto?"
        description="Voce esta prestes a cancelar esta recorrencia e os proximos lancamentos gerados por ela."
        details={[
          deleteExpenseSeries?.description ?? "Gasto recorrente",
          deleteExpenseSeries ? formatCents(deleteExpenseSeries.amountInCents) : "-",
          deleteExpenseSeries ? `Inicio em ${formatLocalDate(deleteExpenseSeries.date)}` : "-"
        ]}
        confirmLabel="Excluir recorrencia"
        onCancel={() => setDeleteExpenseSeries(null)}
        onConfirm={() => void confirmDeleteExpenseSeries()}
      />
      <ConfirmDelete
        isOpen={deleteIncomeEntry !== null}
        title="Excluir entrada?"
        description="Voce esta prestes a remover esta entrada do planejamento mensal."
        details={[
          deleteIncomeEntry?.description ?? "Entrada sem descricao",
          deleteIncomeEntry ? formatCents(deleteIncomeEntry.amountInCents) : "-",
          deleteIncomeEntry ? `${formatLocalDate(deleteIncomeEntry.date)} as ${deleteIncomeEntry.time}` : "-",
          deleteIncomeEntry?.recurring ? "A exclusao cancela apenas este lancamento da recorrencia." : "Lancamento avulso."
        ]}
        confirmLabel="Excluir entrada"
        onCancel={() => setDeleteIncomeEntry(null)}
        onConfirm={() => void confirmDeleteIncomeEntry()}
      />
      <ConfirmDelete
        isOpen={deleteIncomeEntrySeries !== null}
        title="Excluir recorrencia de entrada?"
        description="Voce esta prestes a cancelar esta recorrencia e os proximos recebimentos gerados por ela."
        details={[
          deleteIncomeEntrySeries?.description ?? "Entrada recorrente",
          deleteIncomeEntrySeries ? formatCents(deleteIncomeEntrySeries.amountInCents) : "-",
          deleteIncomeEntrySeries ? `Inicio em ${formatLocalDate(deleteIncomeEntrySeries.date)}` : "-"
        ]}
        confirmLabel="Excluir recorrencia"
        onCancel={() => setDeleteIncomeEntrySeries(null)}
        onConfirm={() => void confirmDeleteIncomeEntrySeries()}
      />
      <ConfirmDelete
        isOpen={deleteGoal !== null}
        title="Excluir objetivo?"
        description="Voce esta prestes a remover este objetivo do planejamento mensal."
        details={[
          deleteGoal?.name ?? "Objetivo sem nome",
          deleteGoal ? formatCents(deleteGoal.targetInCents) : "-",
          deleteGoal?.linkedSource ? `Origem: ${deleteGoal.linkedSource}` : "Origem manual"
        ]}
        confirmLabel="Excluir objetivo"
        onCancel={() => setDeleteGoal(null)}
        onConfirm={() => void confirmDeleteGoal()}
      />
    </div>
  );
}

