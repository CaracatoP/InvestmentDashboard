import { randomUUID } from "crypto";
import {
  createMonthlyExpense,
  deleteMonthlyExpense,
  deleteMonthlyExpensesByRecurrenceId,
  findMonthlyExpenseById,
  findMonthlyPlanById,
  findMonthlyPlanByMonth,
  listAllMonthlyExpenses,
  listMonthlyExpenses,
  listMonthlyPlans,
  updateMonthlyExpense,
  updateMonthlyExpensesByRecurrenceId,
  updateMonthlyPlan,
  upsertMonthlyPlan
} from "../repositories/monthly-planning.repository";
import { listCashBoxes, listContributions, listDividends } from "../repositories/investment.repository";
import type {
  CashBoxRecord,
  ContributionRecord,
  DividendRecord,
  MonthlyBudgetType,
  MonthlyExpenseRecord,
  MonthlyExpenseStatus,
  MonthlyExpenseType,
  MonthlyFinancialGoalRecord,
  MonthlyPlanCategoryRecord,
  MonthlyPlanRecord
} from "../types/investment";
import { badRequest, notFound } from "../utils/http-error";
import { getDashboard } from "./portfolio.service";

type MonthlyPlanCategoryInput = Omit<MonthlyPlanCategoryRecord, "id"> & { id?: string };
type MonthlyFinancialGoalInput = Omit<MonthlyFinancialGoalRecord, "id"> & { id?: string };
type MonthlyPlanInput = Omit<MonthlyPlanRecord, "categories" | "goals"> & { categories: MonthlyPlanCategoryInput[]; goals?: MonthlyFinancialGoalInput[] };
type MonthlyPlanPatchInput = Partial<Omit<MonthlyPlanRecord, "categories" | "goals">> & { categories?: MonthlyPlanCategoryInput[]; goals?: MonthlyFinancialGoalInput[] };
type MonthlyExpenseInput = Omit<MonthlyExpenseRecord, "id" | "status" | "expenseType" | "recurring"> &
  Partial<Pick<MonthlyExpenseRecord, "status" | "expenseType" | "recurring">>;
type MonthlyExpenseCreateInput = Omit<MonthlyExpenseInput, "planId">;
type MonthlyExpensePatchInput = Partial<MonthlyExpenseInput>;

export interface MonthlyCategorySummary extends MonthlyPlanCategoryRecord {
  limitInCents: number;
  completedInCents: number;
  plannedInCents: number;
  remainingInCents: number;
  remainingAfterPlannedInCents: number;
  usedPercent: number;
  state: "ok" | "attention" | "near-limit" | "over-limit";
  stateLabel: string;
  plannedPercentOfIncome: number | null;
}

type BudgetDistributionStatus = "within-limit" | "fully-distributed" | "over-limit" | "income-required";

export interface BudgetDistributionSummary {
  distributedPercentage: number | null;
  availablePercentage: number | null;
  excessPercentage: number;
  distributedAmountInCents: number;
  availableAmountInCents: number;
  excessAmountInCents: number;
  hasConfiguredIncome: boolean;
  hasFixedBudgetWithoutIncome: boolean;
  status: BudgetDistributionStatus;
  statusLabel: string;
}

export interface MonthlyPlanningOverview {
  plan: MonthlyPlanRecord;
  categories: MonthlyCategorySummary[];
  expenses: MonthlyExpenseRecord[];
  summary: {
    incomeInCents: number;
    totalPlannedInCents: number;
    completedInCents: number;
    plannedExpensesInCents: number;
    remainingIncomeInCents: number;
    remainingIncomeAfterPlannedInCents: number;
    remainingBudgetInCents: number;
    remainingBudgetAfterPlannedInCents: number;
    usedIncomePercent: number;
    allocatedPercentage: number | null;
    unallocatedPercentage: number | null;
    percentageOverage: number;
    allocationStatus: BudgetDistributionStatus;
    allocationStatusLabel: string;
    allocationRequiresIncome: boolean;
    allocatedAmountInCents: number;
    unallocatedAmountInCents: number;
    allocationOverageAmountInCents: number;
    totalIncomeWithDividendsInCents: number;
    availableToInvestInCents: number;
    monthlyContributionGoalInCents: number;
    contributedThisMonthInCents: number;
    contributionGoalPercent: number;
    contributionGoalRemainingInCents: number;
    canSpendPerDayInCents: number;
    remainingDays: number;
  };
  warnings: string[];
  alerts: Array<{ id: string; type: "success" | "warning" | "danger" | "info"; message: string }>;
  insights: string[];
  comparisons: Array<{ label: string; currentInCents: number; previousInCents: number; variationPercent: number; valueType?: "money" | "percent" }>;
  paymentMethodStats: Array<{ paymentMethod: string; amountInCents: number; count: number }>;
  calendarDays: Array<{ date: string; events: Array<{ id: string; type: string; label: string; amountInCents: number; status?: string }> }>;
  categoryEvolution: Array<{
    categoryId: string;
    monthly: Array<{ month: string; amountInCents: number }>;
    annual: Array<{ year: string; amountInCents: number }>;
  }>;
  investmentSummary: {
    totalWealthInCents: number;
    profitabilityPercent: number;
    monthlyDividendYieldPercent: number;
    contributionsThisMonthInCents: number;
    dividendsThisMonthInCents: number;
    plannedSimulationAmountInCents: number;
    simulatedContributionTotalInCents: number;
    simulatedContributionGoalPercent: number;
  };
}

const defaultCategories: Array<Omit<MonthlyPlanCategoryRecord, "percentage" | "fixedAmountInCents" | "budgetType"> & { percentage: number }> = [
  { id: "moradia", name: "Moradia", icon: "home", color: "#38bdf8", percentage: 0 },
  { id: "alimentacao", name: "Alimentacao", icon: "utensils", color: "#22c55e", percentage: 0 },
  { id: "transporte", name: "Transporte", icon: "car", color: "#3b82f6", percentage: 0 },
  { id: "lazer", name: "Lazer", icon: "smile", color: "#f59e0b", percentage: 0 },
  { id: "investimentos", name: "Investimentos", icon: "trending-up", color: "#a78bfa", percentage: 0 },
  { id: "saude", name: "Saude", icon: "heart", color: "#fb7185", percentage: 0 },
  { id: "assinaturas", name: "Assinaturas", icon: "repeat", color: "#14b8a6", percentage: 0 },
  { id: "educacao", name: "Educacao", icon: "book-open", color: "#60a5fa", percentage: 0 },
  { id: "outros", name: "Outros", icon: "tag", color: "#8b9491", percentage: 0 }
];

const paymentMethodLabels: Record<string, string> = {
  pix: "Pix",
  debito: "Debito",
  "débito": "Debito",
  credito: "Credito",
  "crédito": "Credito",
  dinheiro: "Dinheiro",
  conta: "Conta bancaria",
  "conta bancaria": "Conta bancaria",
  "conta bancária": "Conta bancaria"
};

export function getLocalTimestampWithOffset(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absoluteOffset / 60);
  const minutes = absoluteOffset % 60;

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(offsetHours)}:${pad(minutes)}`;
}

export function parseLocalExpenseDate(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dateKey(date: string | Date) {
  if (typeof date === "string") return date.slice(0, 10);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthKey(year: number, month: number) {
  return `${year}-${pad(month)}`;
}

function monthKeyFromDate(date: string | Date) {
  return dateKey(date).slice(0, 7);
}

function isDateInMonth(date: string | Date, year: number, month: number) {
  return monthKeyFromDate(date) === monthKey(year, month);
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function clampDay(year: number, month: number, day: number) {
  return Math.min(Math.max(day, 1), daysInMonth(year, month));
}

function buildDate(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(clampDay(year, month, day))}`;
}

function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function monthDistance(fromDate: string, year: number, month: number) {
  const [fromYear, fromMonth] = fromDate.split("-").map(Number);
  return (year - fromYear) * 12 + (month - fromMonth);
}

function normalizePaymentMethod(paymentMethod?: string | null) {
  const value = paymentMethod?.trim();
  if (!value) return "Nao informado";
  const key = value.toLowerCase();
  return paymentMethodLabels[key] ?? value;
}

export function isFutureExpense(date: string, time: string, now = new Date()) {
  return parseLocalExpenseDate(date, time).getTime() > now.getTime();
}

export function determineExpenseStatus(date: string, time: string, requestedStatus?: MonthlyExpenseStatus, now = new Date()): MonthlyExpenseStatus {
  if (isFutureExpense(date, time, now)) return "planned";
  return requestedStatus ?? "completed";
}

export function calculateCategoryLimit(category: Pick<MonthlyPlanCategoryRecord, "budgetType" | "percentage" | "fixedAmountInCents">, incomeInCents: number) {
  if (category.budgetType === "percentage") {
    return Math.round(incomeInCents * (category.percentage / 100));
  }

  return category.fixedAmountInCents ?? 0;
}

function roundPercentage(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getBudgetDistributionStatus(distributedPercentage: number | null): Pick<BudgetDistributionSummary, "status" | "statusLabel"> {
  if (distributedPercentage === null) return { status: "income-required", statusLabel: "Renda nao configurada" };
  if (distributedPercentage > 100) return { status: "over-limit", statusLabel: "Acima do limite" };
  if (distributedPercentage === 100) return { status: "fully-distributed", statusLabel: "Totalmente distribuido" };
  return { status: "within-limit", statusLabel: "Dentro do limite" };
}

export function calculateBudgetDistribution(input: {
  incomeInCents: number;
  sectors: Array<Pick<MonthlyPlanCategoryRecord, "budgetType" | "percentage" | "fixedAmountInCents">>;
}): BudgetDistributionSummary {
  const incomeInCents = Math.max(Math.round(input.incomeInCents), 0);
  const hasConfiguredIncome = incomeInCents > 0;
  const hasFixedBudget = input.sectors.some((sector) => sector.budgetType === "fixed" && (sector.fixedAmountInCents ?? 0) > 0);
  const hasFixedBudgetWithoutIncome = hasFixedBudget && !hasConfiguredIncome;
  const directPercentage = sum(input.sectors.filter((sector) => sector.budgetType === "percentage").map((sector) => sector.percentage ?? 0));
  const fixedAmountInCents = sum(input.sectors.filter((sector) => sector.budgetType === "fixed").map((sector) => sector.fixedAmountInCents ?? 0));
  const percentageAmountInCents = sum(input.sectors.filter((sector) => sector.budgetType === "percentage").map((sector) => calculateCategoryLimit(sector, incomeInCents)));
  const distributedAmountInCents = percentageAmountInCents + fixedAmountInCents;

  if (hasFixedBudgetWithoutIncome) {
    return {
      distributedPercentage: null,
      availablePercentage: null,
      excessPercentage: 0,
      distributedAmountInCents,
      availableAmountInCents: 0,
      excessAmountInCents: 0,
      hasConfiguredIncome,
      hasFixedBudgetWithoutIncome,
      ...getBudgetDistributionStatus(null)
    };
  }

  const fixedEquivalentPercentage = hasConfiguredIncome ? (fixedAmountInCents / incomeInCents) * 100 : 0;
  const distributedPercentage = roundPercentage(directPercentage + fixedEquivalentPercentage);
  const availablePercentage = roundPercentage(Math.max(100 - distributedPercentage, 0));
  const excessPercentage = roundPercentage(Math.max(distributedPercentage - 100, 0));
  const availableAmountInCents = hasConfiguredIncome ? Math.max(incomeInCents - distributedAmountInCents, 0) : 0;
  const excessAmountInCents = hasConfiguredIncome ? Math.max(distributedAmountInCents - incomeInCents, 0) : 0;

  return {
    distributedPercentage,
    availablePercentage,
    excessPercentage,
    distributedAmountInCents,
    availableAmountInCents,
    excessAmountInCents,
    hasConfiguredIncome,
    hasFixedBudgetWithoutIncome,
    ...getBudgetDistributionStatus(distributedPercentage)
  };
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function percentage(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

function getCategoryState(usedPercent: number): MonthlyCategorySummary["state"] {
  if (usedPercent > 100) return "over-limit";
  if (usedPercent >= 90) return "near-limit";
  if (usedPercent >= 75) return "attention";
  return "ok";
}

function getCategoryStateLabel(state: MonthlyCategorySummary["state"]) {
  if (state === "over-limit") return "Limite ultrapassado";
  if (state === "near-limit") return "Proximo do limite";
  if (state === "attention") return "Atencao ao consumo";
  return "Dentro do planejado";
}

function toCents(value: number) {
  return Math.round(value * 100);
}

function contributionAmount(contribution: ContributionRecord) {
  return contribution.value;
}

function dividendAmount(dividend: DividendRecord) {
  return dividend.netAmount ?? dividend.totalValue;
}

function isReceivedDividend(dividend: DividendRecord) {
  return (dividend.status ?? "received") === "received";
}

type MonthlyCalculationContext = {
  year?: number;
  month?: number;
  previousOverview?: MonthlyPlanningOverview;
  contributions?: ContributionRecord[];
  dividends?: DividendRecord[];
  cashBoxes?: CashBoxRecord[];
  allExpenses?: MonthlyExpenseRecord[];
  dashboard?: Awaited<ReturnType<typeof getDashboard>>;
};

function buildPaymentMethodStats(expenses: MonthlyExpenseRecord[]) {
  const totals = new Map<string, { paymentMethod: string; amountInCents: number; count: number }>();

  for (const expense of expenses) {
    const paymentMethod = normalizePaymentMethod(expense.paymentMethod);
    const current = totals.get(paymentMethod) ?? { paymentMethod, amountInCents: 0, count: 0 };
    current.amountInCents += expense.amountInCents;
    current.count += 1;
    totals.set(paymentMethod, current);
  }

  return Array.from(totals.values()).sort((left, right) => right.amountInCents - left.amountInCents);
}

function variationPercent(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function buildComparisons(current: MonthlyPlanningOverview, previous?: MonthlyPlanningOverview): MonthlyPlanningOverview["comparisons"] {
  if (!previous) return [];
  const categoryComparisons = current.categories.map((category) => {
    const previousCategory = previous.categories.find((item) => item.id === category.id || item.name === category.name);
    const previousValue = previousCategory?.completedInCents ?? 0;

    return {
      label: category.name,
      currentInCents: category.completedInCents,
      previousInCents: previousValue,
      variationPercent: variationPercent(category.completedInCents, previousValue)
    };
  });

  return [
    {
      label: "Total gasto",
      currentInCents: current.summary.completedInCents,
      previousInCents: previous.summary.completedInCents,
      variationPercent: variationPercent(current.summary.completedInCents, previous.summary.completedInCents)
    },
    {
      label: "Economia",
      currentInCents: current.summary.remainingIncomeInCents,
      previousInCents: previous.summary.remainingIncomeInCents,
      variationPercent: variationPercent(current.summary.remainingIncomeInCents, previous.summary.remainingIncomeInCents)
    },
    {
      label: "Renda",
      currentInCents: current.summary.incomeInCents,
      previousInCents: previous.summary.incomeInCents,
      variationPercent: variationPercent(current.summary.incomeInCents, previous.summary.incomeInCents)
    },
    {
      label: "Total investido",
      currentInCents: current.summary.contributedThisMonthInCents,
      previousInCents: previous.summary.contributedThisMonthInCents,
      variationPercent: variationPercent(current.summary.contributedThisMonthInCents, previous.summary.contributedThisMonthInCents)
    },
    {
      label: "Percentual utilizado",
      currentInCents: current.summary.usedIncomePercent,
      previousInCents: previous.summary.usedIncomePercent,
      variationPercent: variationPercent(current.summary.usedIncomePercent, previous.summary.usedIncomePercent),
      valueType: "percent"
    },
    ...categoryComparisons
  ];
}

function buildAlerts(overview: MonthlyPlanningOverview) {
  const alerts: MonthlyPlanningOverview["alerts"] = [];

  for (const category of overview.categories) {
    if (category.state === "over-limit") {
      alerts.push({ id: `over-${category.id}`, type: "danger", message: `${category.name} ultrapassou o limite planejado.` });
    } else if (category.usedPercent >= 80) {
      alerts.push({ id: `near-${category.id}`, type: "warning", message: `${category.name} ja utilizou ${category.usedPercent.toFixed(0)}% do orcamento.` });
    }
  }

  if (overview.summary.remainingIncomeInCents > 0) {
    alerts.push({ id: "saved", type: "success", message: `Voce economizou ${(overview.summary.remainingIncomeInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} este mes.` });
  }

  if (overview.summary.availableToInvestInCents > 0) {
    alerts.push({ id: "available-invest", type: "info", message: `Ainda restam ${(overview.summary.availableToInvestInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} disponiveis para investir.` });
  }

  return alerts.slice(0, 6);
}

function buildInsights(overview: MonthlyPlanningOverview) {
  const insights: string[] = [];
  const biggestCategory = [...overview.categories].sort((left, right) => right.completedInCents - left.completedInCents)[0];
  const comparison = overview.comparisons.find((item) => item.label === "Total gasto");

  if (comparison && comparison.previousInCents > 0) {
    const direction = comparison.variationPercent <= 0 ? "menos" : "mais";
    insights.push(`Voce gastou ${Math.abs(comparison.variationPercent).toFixed(0)}% ${direction} que no mes anterior.`);
  }
  if (biggestCategory && overview.summary.completedInCents > 0) {
    insights.push(`${biggestCategory.name} representa ${percentage(biggestCategory.completedInCents, overview.summary.completedInCents).toFixed(0)}% das despesas.`);
    insights.push(`Sua maior despesa continua sendo ${biggestCategory.name}.`);
  }
  if (overview.summary.availableToInvestInCents > 0) {
    insights.push(`Voce ainda pode investir ${(overview.summary.availableToInvestInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} neste mes.`);
  }
  if (overview.summary.remainingBudgetAfterPlannedInCents > 0) {
    insights.push(`Mantendo esse ritmo, voce encerrara o mes ${(overview.summary.remainingBudgetAfterPlannedInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} abaixo do orcamento.`);
  }

  return insights.slice(0, 6);
}

function buildCalendarDays(
  year: number,
  month: number,
  expenses: MonthlyExpenseRecord[],
  contributions: ContributionRecord[],
  dividends: DividendRecord[],
  incomeInCents: number
) {
  const events = new Map<string, MonthlyPlanningOverview["calendarDays"][number]["events"]>();
  const addEvent = (date: string, event: MonthlyPlanningOverview["calendarDays"][number]["events"][number]) => {
    if (!events.has(date)) events.set(date, []);
    events.get(date)?.push(event);
  };

  if (incomeInCents > 0) {
    addEvent(buildDate(year, month, 1), { id: "salary", type: "salary", label: "Renda mensal", amountInCents: incomeInCents, status: "completed" });
  }

  for (const expense of expenses) {
    addEvent(expense.date, { id: expense.id ?? `${expense.date}-${expense.description}`, type: expense.recurring ? "recurring-expense" : "expense", label: expense.description, amountInCents: expense.amountInCents, status: expense.status });
  }
  for (const contribution of contributions.filter((item) => isDateInMonth(item.date, year, month))) {
    addEvent(dateKey(contribution.date), { id: contribution.id ?? String(contribution.date), type: "contribution", label: contribution.description || "Aporte", amountInCents: toCents(contributionAmount(contribution)), status: "completed" });
  }
  for (const dividend of dividends.filter((item) => isReceivedDividend(item) && isDateInMonth(item.paymentDate, year, month))) {
    addEvent(dateKey(dividend.paymentDate), { id: dividend.id ?? `${dividend.assetTicker}-${dividend.paymentDate}`, type: "dividend", label: dividend.assetTicker || "Dividendo", amountInCents: toCents(dividendAmount(dividend)), status: "completed" });
  }

  return Array.from(events.entries())
    .map(([date, eventList]) => ({ date, events: eventList }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function buildCategoryEvolution(plan: MonthlyPlanRecord, context: MonthlyCalculationContext, currentExpenses: MonthlyExpenseRecord[]) {
  const allExpenses = (context.allExpenses ?? currentExpenses).filter((expense) => !expense.recurrenceCancelled);
  const monthlyTargets = Array.from({ length: 12 }, (_, index) => shiftMonth(plan.year, plan.month, index - 11));
  const annualTargets = Array.from({ length: 5 }, (_, index) => String(plan.year - 4 + index));

  return plan.categories.map((category) => ({
    categoryId: category.id,
    monthly: monthlyTargets.map((target) => ({
      month: monthKey(target.year, target.month),
      amountInCents: sum(allExpenses.filter((expense) => expense.categoryId === category.id && isDateInMonth(expense.date, target.year, target.month)).map((expense) => expense.amountInCents))
    })),
    annual: annualTargets.map((targetYear) => ({
      year: targetYear,
      amountInCents: sum(allExpenses.filter((expense) => expense.categoryId === category.id && dateKey(expense.date).startsWith(targetYear)).map((expense) => expense.amountInCents))
    }))
  }));
}

function ensureCategoryId(category: MonthlyPlanCategoryInput) {
  if (category.id) return category.id;
  const slug = category.name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || randomUUID();
}

function normalizeCategory(category: MonthlyPlanCategoryInput): MonthlyPlanCategoryRecord {
  const budgetType: MonthlyBudgetType = category.budgetType;

  return {
    id: ensureCategoryId(category),
    name: category.name.trim(),
    icon: category.icon || "tag",
    color: category.color || "#22c55e",
    budgetType,
    percentage: budgetType === "percentage" ? category.percentage ?? 0 : 0,
    fixedAmountInCents: budgetType === "fixed" ? category.fixedAmountInCents ?? 0 : null
  };
}

function ensureGoalId(goal: MonthlyFinancialGoalInput) {
  if (goal.id) return goal.id;
  return `goal-${randomUUID()}`;
}

function normalizeGoal(goal: MonthlyFinancialGoalInput): MonthlyFinancialGoalRecord {
  return {
    id: ensureGoalId(goal),
    name: goal.name.trim(),
    targetInCents: goal.targetInCents,
    savedInCents: goal.savedInCents ?? 0,
    monthlyContributionInCents: goal.monthlyContributionInCents ?? 0,
    linkedSource: goal.linkedSource ?? "manual",
    linkedSourceId: goal.linkedSourceId ?? "",
    active: goal.active ?? true
  };
}

function resolveGoalProgress(goal: MonthlyFinancialGoalRecord, context: MonthlyCalculationContext) {
  if (goal.linkedSource === "portfolio") {
    return toCents(context.dashboard?.metrics.totalEquity ?? 0);
  }

  if (goal.linkedSource === "cashbox") {
    const cashBox = (context.cashBoxes ?? []).find((item) => item.id === goal.linkedSourceId || item.name === goal.linkedSourceId);
    return cashBox ? toCents(cashBox.currentBalance ?? 0) : goal.savedInCents;
  }

  return goal.savedInCents;
}

function normalizePlan(input: MonthlyPlanInput, existing?: MonthlyPlanRecord | null): MonthlyPlanRecord {
  const timestamp = getLocalTimestampWithOffset();
  const categories = input.categories.length > 0 ? input.categories : (existing?.categories ?? defaultCategories.map((category) => ({
    ...category,
    budgetType: "percentage" as const,
    fixedAmountInCents: null
  })));

  return {
    ...input,
    id: existing?.id ?? input.id,
    incomeInCents: input.incomeInCents ?? existing?.incomeInCents ?? 0,
    categories: categories.map(normalizeCategory),
    monthlyContributionGoalInCents: input.monthlyContributionGoalInCents ?? existing?.monthlyContributionGoalInCents ?? 0,
    includeDividendsAsIncome: input.includeDividendsAsIncome ?? existing?.includeDividendsAsIncome ?? false,
    investmentSimulationAmountInCents: input.investmentSimulationAmountInCents ?? existing?.investmentSimulationAmountInCents ?? 0,
    goals: (input.goals ?? existing?.goals ?? []).map(normalizeGoal),
    createdAt: existing?.createdAt ?? input.createdAt ?? timestamp,
    updatedAt: timestamp
  };
}

function normalizeExpense(input: MonthlyExpenseInput, existing?: MonthlyExpenseRecord | null): Omit<MonthlyExpenseRecord, "id"> {
  const timestamp = getLocalTimestampWithOffset();
  const date = input.date;
  const time = input.time;
  const status = determineExpenseStatus(date, time, input.status);
  const expenseType: MonthlyExpenseType = input.recurring ? "recurring" : input.expenseType ?? "single";
  const recurring = expenseType === "recurring" || Boolean(input.recurring);
  const recurrenceFrequency = recurring ? input.recurrenceFrequency ?? existing?.recurrenceFrequency ?? "monthly" : null;
  const recurrenceDayOfMonth = recurring ? input.recurrenceDayOfMonth ?? existing?.recurrenceDayOfMonth ?? Number(date.slice(8, 10)) : null;
  const recurrenceStartDate = recurring ? input.recurrenceStartDate ?? existing?.recurrenceStartDate ?? date : null;
  const recurrenceEndDate = recurring ? input.recurrenceEndDate ?? existing?.recurrenceEndDate ?? null : null;
  const recurrenceId = recurring ? input.recurrenceId ?? existing?.recurrenceId ?? randomUUID() : null;

  return {
    ...input,
    description: input.description.trim(),
    note: input.note ?? "",
    paymentMethod: input.paymentMethod || null,
    expenseType,
    recurring,
    recurrenceId,
    recurrenceSourceId: input.recurrenceSourceId ?? existing?.recurrenceSourceId ?? null,
    recurrenceFrequency,
    recurrenceInterval: recurring ? input.recurrenceInterval ?? existing?.recurrenceInterval ?? 1 : null,
    recurrenceDayOfMonth,
    recurrenceStartDate,
    recurrenceEndDate,
    recurrenceOriginalDate: input.recurrenceOriginalDate ?? existing?.recurrenceOriginalDate ?? date,
    recurrenceCancelled: input.recurrenceCancelled ?? existing?.recurrenceCancelled ?? false,
    status,
    createdAt: existing?.createdAt ?? input.createdAt ?? timestamp,
    updatedAt: timestamp
  };
}

function isRecurringTemplate(expense: MonthlyExpenseRecord) {
  return expense.recurring && expense.recurrenceId && !expense.recurrenceSourceId;
}

function buildMonthlyOccurrenceDate(template: MonthlyExpenseRecord, year: number, month: number) {
  const startDate = template.recurrenceStartDate ?? template.date;
  const day = template.recurrenceDayOfMonth ?? Number(template.date.slice(8, 10));
  const distance = monthDistance(startDate, year, month);
  if (distance < 0) return null;

  const frequency = template.recurrenceFrequency ?? "monthly";
  const interval = Math.max(template.recurrenceInterval ?? 1, 1);
  if (frequency === "annual" && (month !== Number(startDate.slice(5, 7)) || distance % 12 !== 0)) return null;
  if (frequency === "monthly" && distance % interval !== 0) return null;
  if (frequency === "custom" && distance % interval !== 0) return null;
  if (frequency === "weekly" || frequency === "biweekly") return null;

  return buildDate(year, month, day);
}

function buildWeeklyOccurrenceDates(template: MonthlyExpenseRecord, year: number, month: number) {
  const frequency = template.recurrenceFrequency ?? "monthly";
  if (frequency !== "weekly" && frequency !== "biweekly") return [];

  const start = parseLocalExpenseDate(template.recurrenceStartDate ?? template.date, template.time);
  const intervalDays = frequency === "biweekly" ? 14 : 7;
  const targetStart = new Date(year, month - 1, 1);
  const targetEnd = new Date(year, month, 0, 23, 59, 59, 999);
  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor < targetStart) {
    cursor.setDate(cursor.getDate() + intervalDays);
  }

  while (cursor <= targetEnd) {
    dates.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + intervalDays);
  }

  return dates;
}

function buildOccurrenceDates(template: MonthlyExpenseRecord, year: number, month: number) {
  const dates = buildWeeklyOccurrenceDates(template, year, month);
  const monthlyDate = buildMonthlyOccurrenceDate(template, year, month);
  if (monthlyDate) dates.push(monthlyDate);

  const endDate = template.recurrenceEndDate;
  return Array.from(new Set(dates)).filter((date) => {
    if (date < (template.recurrenceStartDate ?? template.date)) return false;
    if (endDate && date > endDate) return false;
    return isDateInMonth(date, year, month);
  });
}

function buildGeneratedExpense(template: MonthlyExpenseRecord, planId: string, date: string): Omit<MonthlyExpenseRecord, "id"> {
  const timestamp = getLocalTimestampWithOffset();

  return {
    planId,
    categoryId: template.categoryId,
    description: template.description,
    amountInCents: template.amountInCents,
    date,
    time: template.time,
    note: template.note ?? "",
    paymentMethod: template.paymentMethod ?? null,
    expenseType: "recurring",
    recurring: true,
    recurrenceId: template.recurrenceId ?? randomUUID(),
    recurrenceSourceId: template.id ?? null,
    recurrenceFrequency: template.recurrenceFrequency ?? "monthly",
    recurrenceInterval: template.recurrenceInterval ?? 1,
    recurrenceDayOfMonth: template.recurrenceDayOfMonth ?? Number(template.date.slice(8, 10)),
    recurrenceStartDate: template.recurrenceStartDate ?? template.date,
    recurrenceEndDate: template.recurrenceEndDate ?? null,
    recurrenceOriginalDate: date,
    recurrenceCancelled: false,
    status: "planned",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

async function ensureRecurringExpensesForMonth(plan: MonthlyPlanRecord, year: number, month: number) {
  if (!plan.id) return [];
  const [allExpenses, currentExpenses] = await Promise.all([listAllMonthlyExpenses(), listMonthlyExpenses(plan.id)]);
  const templates = allExpenses.filter(isRecurringTemplate);

  const existingKeys = new Set(
    currentExpenses
      .filter((expense) => expense.recurrenceId)
      .map((expense) => `${expense.recurrenceId}-${expense.recurrenceOriginalDate ?? expense.date}`)
  );
  const created: MonthlyExpenseRecord[] = [];

  for (const template of templates) {
    const occurrenceDates = buildOccurrenceDates(template, year, month);
    for (const occurrenceDate of occurrenceDates) {
      const key = `${template.recurrenceId}-${occurrenceDate}`;
      if (existingKeys.has(key)) continue;
      const expense = await createMonthlyExpense(buildGeneratedExpense(template, plan.id, occurrenceDate));
      existingKeys.add(key);
      created.push(expense);
    }
  }

  return created;
}

async function createHiddenRecurringTemplate(expense: MonthlyExpenseRecord) {
  if (!expense.recurrenceId || expense.recurrenceSourceId) return null;

  const timestamp = getLocalTimestampWithOffset();
  return createMonthlyExpense({
    ...expense,
    recurrenceSourceId: null,
    recurrenceCancelled: true,
    createdAt: expense.createdAt ?? timestamp,
    updatedAt: timestamp
  });
}

export function calculateMonthlyPlanning(plan: MonthlyPlanRecord, expenses: MonthlyExpenseRecord[], context: MonthlyCalculationContext = {}): MonthlyPlanningOverview {
  const year = context.year ?? plan.year;
  const month = context.month ?? plan.month;
  const contributions = context.contributions ?? [];
  const dividends = context.dividends ?? [];
  const dashboard = context.dashboard;
  const activeExpenses = expenses.filter((expense) => !expense.recurrenceCancelled);
  const monthlyDividendsInCents = sum(dividends.filter((dividend) => isReceivedDividend(dividend) && isDateInMonth(dividend.paymentDate, year, month)).map((dividend) => toCents(dividendAmount(dividend))));
  const monthlyContributionsInCents = sum(contributions.filter((contribution) => isDateInMonth(contribution.date, year, month)).map((contribution) => toCents(contributionAmount(contribution))));
  const totalIncomeWithDividendsInCents = plan.incomeInCents + (plan.includeDividendsAsIncome ? monthlyDividendsInCents : 0);
  const monthlyContributionGoalInCents = plan.monthlyContributionGoalInCents ?? 0;
  const goalsReserveInCents = sum((plan.goals ?? []).filter((goal) => goal.active).map((goal) => goal.monthlyContributionInCents ?? 0));
  const enrichedPlan = {
    ...plan,
    goals: (plan.goals ?? []).map((goal) => ({ ...goal, savedInCents: resolveGoalProgress(goal, context) }))
  };
  const categories = plan.categories.map((category) => {
    const categoryExpenses = activeExpenses.filter((expense) => expense.categoryId === category.id);
    const completedInCents = sum(categoryExpenses.filter((expense) => expense.status === "completed").map((expense) => expense.amountInCents));
    const plannedInCents = sum(categoryExpenses.filter((expense) => expense.status === "planned").map((expense) => expense.amountInCents));
    const limitInCents = calculateCategoryLimit(category, plan.incomeInCents);
    const usedPercent = percentage(completedInCents, limitInCents);
    const state = getCategoryState(usedPercent);

    return {
      ...category,
      limitInCents,
      completedInCents,
      plannedInCents,
      remainingInCents: limitInCents - completedInCents,
      remainingAfterPlannedInCents: limitInCents - completedInCents - plannedInCents,
      usedPercent,
      state,
      stateLabel: getCategoryStateLabel(state),
      plannedPercentOfIncome: plan.incomeInCents > 0 ? roundPercentage(percentage(limitInCents, plan.incomeInCents)) : category.budgetType === "percentage" ? category.percentage : null
    };
  });

  const totalPlannedInCents = sum(categories.map((category) => category.limitInCents));
  const completedInCents = sum(activeExpenses.filter((expense) => expense.status === "completed").map((expense) => expense.amountInCents));
  const plannedExpensesInCents = sum(activeExpenses.filter((expense) => expense.status === "planned").map((expense) => expense.amountInCents));
  const budgetDistribution = calculateBudgetDistribution({ incomeInCents: plan.incomeInCents, sectors: plan.categories });
  const allocatedPercentage = budgetDistribution.distributedPercentage;
  const percentageOverage = budgetDistribution.excessPercentage;
  const warnings = [];

  if (budgetDistribution.hasFixedBudgetWithoutIncome) {
    warnings.push("Cadastre a renda mensal para calcular os percentuais dos setores fixos.");
  }
  if (percentageOverage > 0) {
    warnings.push(`O planejamento ultrapassa a renda mensal em ${percentageOverage.toFixed(2)}%.`);
  }
  if (plan.incomeInCents > 0 && totalPlannedInCents > plan.incomeInCents) {
    warnings.push("O total planejado em reais ultrapassa a renda mensal.");
  }
  const remainingIncomeAfterPlannedInCents = totalIncomeWithDividendsInCents - completedInCents - plannedExpensesInCents;
  const availableToInvestInCents = Math.max(remainingIncomeAfterPlannedInCents - goalsReserveInCents, 0);
  const now = new Date();
  const selectedMonthDays = daysInMonth(year, month);
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
  const remainingDays = isCurrentMonth ? Math.max(selectedMonthDays - now.getDate(), 0) : selectedMonthDays;
  const plannedSimulationAmountInCents = plan.investmentSimulationAmountInCents ?? 0;
  const baseOverview: MonthlyPlanningOverview = {
    plan: enrichedPlan,
    categories,
    expenses: [...activeExpenses].sort((left, right) => `${right.date}T${right.time}`.localeCompare(`${left.date}T${left.time}`)),
    summary: {
      incomeInCents: plan.incomeInCents,
      totalPlannedInCents,
      completedInCents,
      plannedExpensesInCents,
      remainingIncomeInCents: totalIncomeWithDividendsInCents - completedInCents,
      remainingIncomeAfterPlannedInCents,
      remainingBudgetInCents: totalPlannedInCents - completedInCents,
      remainingBudgetAfterPlannedInCents: totalPlannedInCents - completedInCents - plannedExpensesInCents,
      usedIncomePercent: percentage(completedInCents, totalIncomeWithDividendsInCents),
      allocatedPercentage,
      unallocatedPercentage: budgetDistribution.availablePercentage,
      percentageOverage,
      allocationStatus: budgetDistribution.status,
      allocationStatusLabel: budgetDistribution.statusLabel,
      allocationRequiresIncome: budgetDistribution.hasFixedBudgetWithoutIncome,
      allocatedAmountInCents: budgetDistribution.distributedAmountInCents,
      unallocatedAmountInCents: budgetDistribution.availableAmountInCents,
      allocationOverageAmountInCents: budgetDistribution.excessAmountInCents,
      totalIncomeWithDividendsInCents,
      availableToInvestInCents,
      monthlyContributionGoalInCents,
      contributedThisMonthInCents: monthlyContributionsInCents,
      contributionGoalPercent: percentage(monthlyContributionsInCents, monthlyContributionGoalInCents),
      contributionGoalRemainingInCents: Math.max(monthlyContributionGoalInCents - monthlyContributionsInCents, 0),
      canSpendPerDayInCents: remainingDays > 0 ? Math.floor(Math.max(remainingIncomeAfterPlannedInCents, 0) / remainingDays) : Math.max(remainingIncomeAfterPlannedInCents, 0),
      remainingDays
    },
    warnings,
    alerts: [],
    insights: [],
    comparisons: [],
    paymentMethodStats: buildPaymentMethodStats(activeExpenses),
    calendarDays: buildCalendarDays(year, month, activeExpenses, contributions, dividends, plan.incomeInCents),
    categoryEvolution: buildCategoryEvolution(plan, context, activeExpenses),
    investmentSummary: {
      totalWealthInCents: toCents(dashboard?.metrics.totalEquity ?? dashboard?.metrics.totalWealth ?? 0),
      profitabilityPercent: dashboard?.metrics.totalReturnPercent ?? dashboard?.metrics.returnPercentage ?? 0,
      monthlyDividendYieldPercent: dashboard?.metrics.currentValue ? ((dashboard.metrics.monthlyDividends ?? 0) / dashboard.metrics.currentValue) * 100 : 0,
      contributionsThisMonthInCents: monthlyContributionsInCents,
      dividendsThisMonthInCents: monthlyDividendsInCents,
      plannedSimulationAmountInCents,
      simulatedContributionTotalInCents: monthlyContributionsInCents + plannedSimulationAmountInCents,
      simulatedContributionGoalPercent: percentage(monthlyContributionsInCents + plannedSimulationAmountInCents, monthlyContributionGoalInCents)
    }
  };

  const comparisons = buildComparisons(baseOverview, context.previousOverview);
  const withComparisons = { ...baseOverview, comparisons };
  return {
    ...withComparisons,
    alerts: buildAlerts(withComparisons),
    insights: buildInsights(withComparisons)
  };
}

export async function getOrCreateMonthlyPlan(year: number, month: number) {
  const existing = await findMonthlyPlanByMonth(year, month);
  if (existing) return normalizePlan(existing, existing);

  return upsertMonthlyPlan(
    normalizePlan({
      year,
      month,
      incomeInCents: 0,
      categories: [],
      createdAt: getLocalTimestampWithOffset(),
      updatedAt: getLocalTimestampWithOffset()
    })
  );
}

async function getPreviousOverview(year: number, month: number, range: number, context: Omit<MonthlyCalculationContext, "previousOverview" | "year" | "month">) {
  const target = shiftMonth(year, month, -Math.max(range, 1));
  const previousPlan = await findMonthlyPlanByMonth(target.year, target.month);
  if (!previousPlan?.id) return undefined;
  const previousExpenses = await listMonthlyExpenses(previousPlan.id);
  return calculateMonthlyPlanning(previousPlan, previousExpenses, { ...context, year: target.year, month: target.month });
}

export async function getMonthlyPlanningOverview(year: number, month: number, comparisonRange = 1) {
  const plan = await getOrCreateMonthlyPlan(year, month);
  await ensureRecurringExpensesForMonth(plan, year, month);
  const [expenses, allExpenses, contributions, dividends, cashBoxes, dashboard] = await Promise.all([
    plan.id ? listMonthlyExpenses(plan.id) : [],
    listAllMonthlyExpenses(),
    listContributions(),
    listDividends(),
    listCashBoxes(),
    getDashboard()
  ]);
  const context = { allExpenses, contributions, dividends, cashBoxes, dashboard };
  const previousOverview = await getPreviousOverview(year, month, comparisonRange, context);
  return calculateMonthlyPlanning(plan, expenses, { ...context, previousOverview, year, month });
}

export async function saveMonthlyPlan(input: MonthlyPlanInput) {
  const existing = await findMonthlyPlanByMonth(input.year, input.month);
  return upsertMonthlyPlan(normalizePlan(input, existing));
}

export async function patchMonthlyPlan(id: string, input: MonthlyPlanPatchInput) {
  const existing = await findMonthlyPlanById(id);
  if (!existing) throw notFound("Monthly plan not found");

  const updated = normalizePlan(
    {
      ...existing,
      ...input,
      categories: input.categories ?? existing.categories,
      goals: input.goals ?? existing.goals
    },
    existing
  );

  return updateMonthlyPlan(id, updated);
}

export async function copyPreviousMonthlyPlan(year: number, month: number) {
  const previousDate = new Date(year, month - 2, 1);
  const previousMonth = previousDate.getMonth() + 1;
  const previousYear = previousDate.getFullYear();
  const previous = await findMonthlyPlanByMonth(previousYear, previousMonth);
  if (!previous) throw badRequest("Previous monthly plan not found");

  const existing = await findMonthlyPlanByMonth(year, month);
  const timestamp = getLocalTimestampWithOffset();
  const copied = normalizePlan(
    {
      id: existing?.id,
      year,
      month,
      incomeInCents: previous.incomeInCents,
      categories: previous.categories.map((category) => ({ ...category })),
      monthlyContributionGoalInCents: previous.monthlyContributionGoalInCents ?? 0,
      includeDividendsAsIncome: previous.includeDividendsAsIncome ?? false,
      investmentSimulationAmountInCents: previous.investmentSimulationAmountInCents ?? 0,
      goals: (previous.goals ?? []).map((goal) => ({ ...goal })),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    },
    existing
  );

  return upsertMonthlyPlan(copied);
}

export async function addMonthlyExpense(planId: string, input: MonthlyExpenseCreateInput) {
  const plan = await findMonthlyPlanById(planId);
  if (!plan) throw notFound("Monthly plan not found");
  if (!plan.categories.some((category) => category.id === input.categoryId)) throw badRequest("Expense category does not exist in this monthly plan");

  return createMonthlyExpense(normalizeExpense({ ...input, planId }));
}

export async function editMonthlyExpense(id: string, input: MonthlyExpensePatchInput) {
  const existing = await findMonthlyExpenseById(id);
  if (!existing) throw notFound("Monthly expense not found");
  const hiddenTemplate = await createHiddenRecurringTemplate(existing);
  const merged = {
    ...existing,
    ...input,
    recurrenceSourceId: hiddenTemplate?.id ?? existing.recurrenceSourceId ?? null
  } as Omit<MonthlyExpenseRecord, "id">;
  const plan = await findMonthlyPlanById(merged.planId);
  if (!plan) throw notFound("Monthly plan not found");
  if (!plan.categories.some((category) => category.id === merged.categoryId)) throw badRequest("Expense category does not exist in this monthly plan");

  return updateMonthlyExpense(id, normalizeExpense(merged, existing));
}

export async function editMonthlyExpenseSeries(id: string, input: MonthlyExpensePatchInput) {
  const existing = await findMonthlyExpenseById(id);
  if (!existing) throw notFound("Monthly expense not found");
  if (!existing.recurrenceId) return editMonthlyExpense(id, input);

  const merged = { ...existing, ...input, recurrenceId: existing.recurrenceId, recurring: true, expenseType: "recurring" as const } as Omit<MonthlyExpenseRecord, "id">;
  const normalized = normalizeExpense(merged, existing);
  await updateMonthlyExpensesByRecurrenceId(existing.recurrenceId, {
    categoryId: normalized.categoryId,
    description: normalized.description,
    amountInCents: normalized.amountInCents,
    time: normalized.time,
    note: normalized.note,
    paymentMethod: normalized.paymentMethod,
    expenseType: normalized.expenseType,
    recurring: normalized.recurring,
    recurrenceFrequency: normalized.recurrenceFrequency,
    recurrenceInterval: normalized.recurrenceInterval,
    recurrenceDayOfMonth: normalized.recurrenceDayOfMonth,
    recurrenceStartDate: normalized.recurrenceStartDate,
    recurrenceEndDate: normalized.recurrenceEndDate,
    recurrenceCancelled: normalized.recurrenceCancelled,
    updatedAt: normalized.updatedAt
  });

  return findMonthlyExpenseById(id);
}

export async function removeMonthlyExpense(id: string) {
  const existing = await findMonthlyExpenseById(id);
  if (!existing) throw notFound("Monthly expense not found");
  if (existing.recurrenceId) {
    await updateMonthlyExpense(id, { recurrenceCancelled: true, updatedAt: getLocalTimestampWithOffset() });
    return;
  }

  const deleted = await deleteMonthlyExpense(id);
  if (!deleted) throw notFound("Monthly expense not found");
}

export async function removeMonthlyExpenseSeries(id: string) {
  const existing = await findMonthlyExpenseById(id);
  if (!existing) throw notFound("Monthly expense not found");
  if (!existing.recurrenceId) {
    await removeMonthlyExpense(id);
    return;
  }

  const deleted = await deleteMonthlyExpensesByRecurrenceId(existing.recurrenceId);
  if (deleted === 0) throw notFound("Monthly expense not found");
}
