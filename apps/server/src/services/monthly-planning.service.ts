import { randomUUID } from "crypto";
import {
  createMonthlyExpense,
  createMonthlyExpenseIfMissing,
  createMonthlyIncomeEntry,
  createMonthlyIncomeEntryIfMissing,
  deleteMonthlyExpense,
  deleteMonthlyExpensesByRecurrenceId,
  deleteMonthlyIncomeEntriesByRecurrenceId,
  deleteMonthlyIncomeEntry,
  findMonthlyExpenseById,
  findMonthlyExpenseByIdempotencyKey,
  findMonthlyIncomeEntryById,
  findMonthlyIncomeEntryByIdempotencyKey,
  findMonthlyPlanById,
  findMonthlyPlanByMonth,
  listAllMonthlyIncomeEntries,
  listAllMonthlyExpenses,
  listMonthlyIncomeEntries,
  listMonthlyExpenses,
  listMonthlyPlans,
  updateMonthlyExpense,
  updateMonthlyExpensesByRecurrenceId,
  updateMonthlyIncomeEntriesByRecurrenceId,
  updateMonthlyIncomeEntry,
  updateMonthlyPlan,
  upsertMonthlyPlan
} from "../repositories/monthly-planning.repository";
import {
  createOperation,
  deleteOperation,
  findAssetById,
  findAssetByTicker,
  findCashBoxById,
  findOperationByPlanningExpenseId,
  findOperationById,
  listCashBoxes,
  listContributions,
  listDividends,
  updateOperation
} from "../repositories/investment.repository";
import type {
  CashBoxMovementRecord,
  CashBoxRecord,
  ContributionRecord,
  DividendRecord,
  MonthlyBudgetType,
  MonthlyExpenseAllocationKind,
  MonthlyExpenseIntegrationRecord,
  MonthlyExpenseRecord,
  MonthlyExpenseInvestmentDestination,
  MonthlyExpenseStatus,
  MonthlyExpenseType,
  MonthlyFinancialGoalRecord,
  MonthlyIncomeEntryRecord,
  MonthlyIncomeEntryStatus,
  MonthlyPlanCategoryRecord,
  MonthlyPlanRecord,
  OperationRecord
} from "../types/investment";
import { badRequest, notFound } from "../utils/http-error";
import {
  addCashBoxMovement,
  findCashBoxMovementByPlanningExpenseId,
  removeCashBoxMovement,
  updateCashBoxMovement
} from "./cash-box.service";
import { getDashboard } from "./portfolio.service";

type MonthlyPlanCategoryInput = Omit<MonthlyPlanCategoryRecord, "id"> & { id?: string };
type MonthlyFinancialGoalInput = Omit<MonthlyFinancialGoalRecord, "id"> & { id?: string };
type MonthlyPlanInput = Omit<MonthlyPlanRecord, "categories" | "goals"> & { categories: MonthlyPlanCategoryInput[]; goals?: MonthlyFinancialGoalInput[] };
type MonthlyPlanPatchInput = Partial<Omit<MonthlyPlanRecord, "categories" | "goals">> & { categories?: MonthlyPlanCategoryInput[]; goals?: MonthlyFinancialGoalInput[] };
type MonthlyExpenseInput = Omit<MonthlyExpenseRecord, "id" | "status" | "expenseType" | "recurring"> &
  Partial<Pick<MonthlyExpenseRecord, "status" | "expenseType" | "recurring">>;
type MonthlyExpenseCreateInput = Omit<MonthlyExpenseInput, "planId">;
type MonthlyExpensePatchInput = Partial<MonthlyExpenseInput>;
type MonthlyExpenseCompletionInput = Pick<MonthlyExpenseRecord, "completedAt">;
type MonthlyIncomeEntryInput = Omit<MonthlyIncomeEntryRecord, "id" | "status" | "incomeType" | "recurring"> &
  Partial<Pick<MonthlyIncomeEntryRecord, "status" | "incomeType" | "recurring">>;
type MonthlyIncomeEntryCreateInput = Omit<MonthlyIncomeEntryInput, "planId">;
type MonthlyIncomeEntryPatchInput = Partial<MonthlyIncomeEntryInput>;
type MonthlyIncomeEntryCompletionInput = Pick<MonthlyIncomeEntryRecord, "receivedAt">;
type NormalizeExpenseOptions = { allowFutureCompletion?: boolean; defaultCompletedAt?: string | null };
type NormalizeIncomeEntryOptions = { allowFutureReceived?: boolean; defaultReceivedAt?: string | null };
type ExpenseIntegrationInput = NonNullable<MonthlyExpenseRecord["integration"]>;

export interface MonthlyExpenseCompletionResult {
  expense: MonthlyExpenseRecord;
  overview: MonthlyPlanningOverview;
  summary: {
    completedExpensesInCents: number;
    plannedExpensesInCents: number;
    balanceInCents: number;
  };
  alreadyCompleted: boolean;
  message: string;
}

export interface MonthlyIncomeEntryCompletionResult {
  incomeEntry: MonthlyIncomeEntryRecord;
  overview: MonthlyPlanningOverview;
  summary: {
    receivedExtraIncomeInCents: number;
    plannedExtraIncomeInCents: number;
    currentBalanceInCents: number;
    projectedBalanceInCents: number;
  };
  alreadyReceived: boolean;
  message: string;
}

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
  incomeEntries: MonthlyIncomeEntryRecord[];
  summary: {
    incomeInCents: number;
    baseIncomeInCents: number;
    completedExtraIncomeInCents: number;
    plannedExtraIncomeInCents: number;
    dividendIncomeInCents: number;
    currentTotalIncomeInCents: number;
    projectedTotalIncomeInCents: number;
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
    completedConsumptionInCents: number;
    completedInvestmentsInCents: number;
    plannedConsumptionInCents: number;
    plannedInvestmentsInCents: number;
    canSpendPerDayInCents: number;
    remainingDays: number;
  };
  warnings: string[];
  alerts: Array<{ id: string; type: "success" | "warning" | "danger" | "info"; message: string }>;
  insights: string[];
  comparisons: Array<{ label: string; currentInCents: number; previousInCents: number; variationPercent: number; valueType?: "money" | "percent" }>;
  paymentMethodStats: Array<{ paymentMethod: string; amountInCents: number; count: number }>;
  incomeCategoryStats: Array<{ category: string; amountInCents: number; plannedInCents: number; receivedCount: number; plannedCount: number }>;
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
    assetContributionsThisMonthInCents: number;
    cashBoxContributionsThisMonthInCents: number;
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

const monthlyExpenseCompletionLocks = new Map<string, Promise<MonthlyExpenseCompletionResult>>();
const monthlyIncomeEntryCompletionLocks = new Map<string, Promise<MonthlyIncomeEntryCompletionResult>>();
const monthlyIncomeEntryMutationLocks = new Map<string, Promise<MonthlyIncomeEntryRecord>>();
const integratedExpenseMutationLocks = new Map<string, Promise<MonthlyExpenseRecord>>();

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

function trimNullable(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isInvestmentCategoryRecord(category?: Pick<MonthlyPlanCategoryRecord, "id" | "name"> | null) {
  if (!category) return false;
  return category.id === "investimentos" || normalizeText(category.name) === "investimentos";
}

function toMoneyValue(amountInCents: number) {
  return Math.round(amountInCents) / 100;
}

function expenseReferenceDate(expense: Pick<MonthlyExpenseRecord, "date" | "completedAt">) {
  return trimNullable(expense.completedAt)?.slice(0, 10) ?? expense.date;
}

function clearLinkedEntityFromIntegration(integration?: MonthlyExpenseIntegrationRecord | null): MonthlyExpenseIntegrationRecord | null {
  if (!integration) return null;

  return {
    ...integration,
    linkedEntityType: null,
    linkedEntityId: null
  };
}

function isIntegratedInvestmentExpense(expense?: MonthlyExpenseRecord | null) {
  return expense?.allocationKind === "investment_contribution" || expense?.allocationKind === "cash_box_contribution";
}

export function isFutureExpense(date: string, time: string, now = new Date()) {
  return parseLocalExpenseDate(date, time).getTime() > now.getTime();
}

function normalizeTimestampWithOffset(timestamp: string) {
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) throw badRequest("Invalid completedAt timestamp");
  return getLocalTimestampWithOffset(value);
}

function occurrenceTimestamp(date: string, time: string) {
  return getLocalTimestampWithOffset(parseLocalExpenseDate(date, time));
}

function resolveCompletedAt(
  date: string,
  time: string,
  status: MonthlyExpenseStatus,
  requestedCompletedAt: string | null | undefined,
  existing?: MonthlyExpenseRecord | null,
  options: NormalizeExpenseOptions = {}
) {
  if (status !== "completed") return null;
  if (requestedCompletedAt) return normalizeTimestampWithOffset(requestedCompletedAt);
  if (existing?.status === "completed") return existing.completedAt ?? null;
  return options.defaultCompletedAt ?? occurrenceTimestamp(date, time);
}

export function determineExpenseStatus(
  date: string,
  time: string,
  requestedStatus?: MonthlyExpenseStatus,
  now = new Date(),
  options: { allowFutureCompletion?: boolean; completedAt?: string | null; wasCompleted?: boolean } = {}
): MonthlyExpenseStatus {
  if (requestedStatus === "completed" && (options.allowFutureCompletion || options.wasCompleted || Boolean(options.completedAt))) return "completed";
  if (isFutureExpense(date, time, now)) return "planned";
  return requestedStatus ?? "completed";
}

export function isFutureIncomeEntry(date: string, time: string, now = new Date()) {
  return parseLocalExpenseDate(date, time).getTime() > now.getTime();
}

function resolveReceivedAt(
  date: string,
  time: string,
  status: MonthlyIncomeEntryStatus,
  requestedReceivedAt: string | null | undefined,
  existing?: MonthlyIncomeEntryRecord | null,
  options: NormalizeIncomeEntryOptions = {}
) {
  if (status !== "received") return null;
  if (requestedReceivedAt) return normalizeTimestampWithOffset(requestedReceivedAt);
  if (existing?.status === "received") return existing.receivedAt ?? null;
  return options.defaultReceivedAt ?? occurrenceTimestamp(date, time);
}

export function determineIncomeEntryStatus(
  date: string,
  time: string,
  requestedStatus?: MonthlyIncomeEntryStatus,
  now = new Date(),
  options: { allowFutureReceived?: boolean; receivedAt?: string | null; wasReceived?: boolean } = {}
): MonthlyIncomeEntryStatus {
  if (requestedStatus === "cancelled") return "cancelled";
  if (requestedStatus === "received" && (options.allowFutureReceived || options.wasReceived || Boolean(options.receivedAt))) return "received";
  if (isFutureIncomeEntry(date, time, now)) return "planned";
  return requestedStatus ?? "received";
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

function isCompletedAssetContributionExpense(expense: MonthlyExpenseRecord, year: number, month: number) {
  return expense.status === "completed" && expense.allocationKind === "investment_contribution" && isDateInMonth(expenseReferenceDate(expense), year, month);
}

function isCompletedCashBoxContributionExpense(expense: MonthlyExpenseRecord, year: number, month: number) {
  return expense.status === "completed" && expense.allocationKind === "cash_box_contribution" && isDateInMonth(expenseReferenceDate(expense), year, month);
}

type MonthlyCalculationContext = {
  year?: number;
  month?: number;
  previousOverview?: MonthlyPlanningOverview;
  contributions?: ContributionRecord[];
  dividends?: DividendRecord[];
  cashBoxes?: CashBoxRecord[];
  allExpenses?: MonthlyExpenseRecord[];
  incomeEntries?: MonthlyIncomeEntryRecord[];
  allIncomeEntries?: MonthlyIncomeEntryRecord[];
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

function incomeEntryReferenceDate(entry: Pick<MonthlyIncomeEntryRecord, "date" | "receivedAt">) {
  return trimNullable(entry.receivedAt)?.slice(0, 10) ?? entry.date;
}

function buildIncomeCategoryStats(incomeEntries: MonthlyIncomeEntryRecord[]) {
  const totals = new Map<string, { category: string; amountInCents: number; plannedInCents: number; receivedCount: number; plannedCount: number }>();

  for (const entry of incomeEntries) {
    const category = normalizeIncomeCategory(entry.category);
    const current = totals.get(category) ?? { category, amountInCents: 0, plannedInCents: 0, receivedCount: 0, plannedCount: 0 };
    if (entry.status === "received") {
      current.amountInCents += entry.amountInCents;
      current.receivedCount += 1;
    } else if (entry.status === "planned") {
      current.plannedInCents += entry.amountInCents;
      current.plannedCount += 1;
    }
    totals.set(category, current);
  }

  return Array.from(totals.values()).sort((left, right) => (right.amountInCents + right.plannedInCents) - (left.amountInCents + left.plannedInCents));
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
  incomeEntries: MonthlyIncomeEntryRecord[],
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
    const expenseEventType =
      expense.allocationKind === "investment_contribution"
        ? "investment-contribution"
        : expense.allocationKind === "cash_box_contribution"
          ? "cashbox-contribution"
          : expense.recurring
            ? "recurring-expense"
            : "expense";
    addEvent(expense.date, { id: expense.id ?? `${expense.date}-${expense.description}`, type: expenseEventType, label: expense.description, amountInCents: expense.amountInCents, status: expense.status });
  }
  for (const entry of incomeEntries) {
    addEvent(entry.date, {
      id: entry.id ?? `${entry.date}-${entry.description}`,
      type: entry.recurring ? "recurring-income" : "income",
      label: entry.description,
      amountInCents: entry.amountInCents,
      status: entry.status
    });
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

function normalizeExpense(input: MonthlyExpenseInput, existing?: MonthlyExpenseRecord | null, options: NormalizeExpenseOptions = {}): Omit<MonthlyExpenseRecord, "id"> {
  const timestamp = getLocalTimestampWithOffset();
  const date = input.date;
  const time = input.time;
  const status = determineExpenseStatus(date, time, input.status, new Date(), {
    allowFutureCompletion: options.allowFutureCompletion,
    completedAt: input.completedAt,
    wasCompleted: existing?.status === "completed"
  });
  const completedAt = resolveCompletedAt(date, time, status, input.completedAt, existing, options);
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
    completedAt,
    createdAt: existing?.createdAt ?? input.createdAt ?? timestamp,
    updatedAt: timestamp
  };
}

function normalizeIncomeCategory(category?: string | null) {
  const value = category?.trim();
  return value || "Outros";
}

function normalizeIncomeEntry(input: MonthlyIncomeEntryInput, existing?: MonthlyIncomeEntryRecord | null, options: NormalizeIncomeEntryOptions = {}): Omit<MonthlyIncomeEntryRecord, "id"> {
  const timestamp = getLocalTimestampWithOffset();
  const date = input.date;
  const time = input.time;
  const status = determineIncomeEntryStatus(date, time, input.status, new Date(), {
    allowFutureReceived: options.allowFutureReceived,
    receivedAt: input.receivedAt,
    wasReceived: existing?.status === "received"
  });
  const receivedAt = resolveReceivedAt(date, time, status, input.receivedAt, existing, options);
  const incomeType: MonthlyExpenseType = input.recurring ? "recurring" : input.incomeType ?? "single";
  const recurring = incomeType === "recurring" || Boolean(input.recurring);
  const recurrenceFrequency = recurring ? input.recurrenceFrequency ?? existing?.recurrenceFrequency ?? "monthly" : null;
  const recurrenceDayOfMonth = recurring ? input.recurrenceDayOfMonth ?? existing?.recurrenceDayOfMonth ?? Number(date.slice(8, 10)) : null;
  const recurrenceStartDate = recurring ? input.recurrenceStartDate ?? existing?.recurrenceStartDate ?? date : null;
  const recurrenceEndDate = recurring ? input.recurrenceEndDate ?? existing?.recurrenceEndDate ?? null : null;
  const recurrenceId = recurring ? input.recurrenceId ?? existing?.recurrenceId ?? randomUUID() : null;

  return {
    ...input,
    description: input.description.trim(),
    category: normalizeIncomeCategory(input.category),
    note: input.note ?? "",
    incomeType,
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
    receivedAt,
    sourceType: input.sourceType ?? existing?.sourceType ?? "manual",
    sourceId: input.sourceId ?? existing?.sourceId ?? null,
    idempotencyKey: input.idempotencyKey ?? existing?.idempotencyKey ?? null,
    createdAt: existing?.createdAt ?? input.createdAt ?? timestamp,
    updatedAt: timestamp
  };
}

function normalizeExpenseIntegration(
  category: MonthlyPlanCategoryRecord | undefined,
  amountInCents: number,
  inputIntegration?: MonthlyExpenseIntegrationRecord | null,
  existingIntegration?: MonthlyExpenseIntegrationRecord | null
): MonthlyExpenseIntegrationRecord | null {
  if (!isInvestmentCategoryRecord(category)) return null;

  const merged = inputIntegration ? { ...existingIntegration, ...inputIntegration } : existingIntegration ? { ...existingIntegration } : null;
  if (!merged) return existingIntegration ?? null;

  const destination = merged.destination;
  const linkedEntityType = merged.linkedEntityType ?? existingIntegration?.linkedEntityType ?? null;
  const linkedEntityId = trimNullable(merged.linkedEntityId) ?? trimNullable(existingIntegration?.linkedEntityId) ?? null;
  const integrationId = trimNullable(merged.integrationId) ?? trimNullable(existingIntegration?.integrationId) ?? null;
  const idempotencyKey = trimNullable(merged.idempotencyKey) ?? trimNullable(existingIntegration?.idempotencyKey) ?? null;

  if (destination === "asset") {
    const assetId = trimNullable(merged.assetId);
    const assetTicker = trimNullable(merged.assetTicker)?.toUpperCase() ?? null;
    const operationType = merged.operationType ?? "COMPRA";
    const quantity = Number(merged.quantity ?? 0);
    const price = Number(merged.price ?? 0);
    const fees = Math.max(Number(merged.fees ?? 0), 0);

    if (!assetId && !assetTicker) throw badRequest("Selecione um ativo valido.");
    if (operationType !== "COMPRA") {
      throw badRequest("O fluxo integrado do planejamento para ativos usa operacoes de compra.");
    }
    if (!(quantity > 0) || !(price > 0)) {
      throw badRequest("Informe quantidade e preco validos para o aporte em ativo.");
    }

    const expectedAmountInCents = Math.round((quantity * price + fees) * 100);
    if (expectedAmountInCents !== amountInCents) {
      throw badRequest("O valor do gasto precisa ser igual ao total da operacao (quantidade x preco + taxas).");
    }

    return {
      destination,
      linkedEntityType,
      linkedEntityId,
      assetId,
      assetTicker,
      cashBoxId: null,
      operationType,
      quantity,
      price,
      fees,
      integrationId,
      idempotencyKey
    };
  }

  const cashBoxId = trimNullable(merged.cashBoxId);
  if (!cashBoxId) throw badRequest("Selecione uma caixinha valida.");

  return {
    destination,
    linkedEntityType,
    linkedEntityId,
    assetId: null,
    assetTicker: null,
    cashBoxId,
    operationType: null,
    quantity: null,
    price: null,
    fees: null,
    integrationId,
    idempotencyKey
  };
}

function resolveExpenseAllocationKind(
  category: MonthlyPlanCategoryRecord | undefined,
  integration?: MonthlyExpenseIntegrationRecord | null,
  existing?: MonthlyExpenseRecord | null
): MonthlyExpenseAllocationKind {
  if (!isInvestmentCategoryRecord(category)) return "expense";
  if (!integration) return existing?.allocationKind ?? "expense";
  return integration.destination === "asset" ? "investment_contribution" : "cash_box_contribution";
}

function normalizeExpenseForPersistence(
  category: MonthlyPlanCategoryRecord | undefined,
  input: MonthlyExpenseInput,
  existing?: MonthlyExpenseRecord | null,
  options: NormalizeExpenseOptions = {}
): Omit<MonthlyExpenseRecord, "id"> {
  const normalizedExpense = normalizeExpense(input, existing, options);
  const integration = normalizeExpenseIntegration(category, normalizedExpense.amountInCents, input.integration, existing?.integration);
  if (isInvestmentCategoryRecord(category) && !integration && !existing) {
    throw badRequest("Selecione se o valor vai para um ativo ou para uma caixinha.");
  }
  const allocationKind = resolveExpenseAllocationKind(category, integration, existing);

  return {
    ...normalizedExpense,
    allocationKind,
    integration: allocationKind === "expense" ? null : integration
  };
}

function isRecurringTemplate(expense: MonthlyExpenseRecord) {
  return expense.recurring && expense.recurrenceId && !expense.recurrenceSourceId;
}

function isRecurringIncomeEntryTemplate(entry: MonthlyIncomeEntryRecord) {
  return entry.recurring && entry.recurrenceId && !entry.recurrenceSourceId;
}

function stripExpenseIdentityForClone(expense: MonthlyExpenseRecord) {
  const source = expense as MonthlyExpenseRecord & { _id?: unknown };
  const { id: _ignoredId, _id: _ignoredMongoId, ...clone } = source;
  return clone;
}

function stripIncomeEntryIdentityForClone(entry: MonthlyIncomeEntryRecord) {
  const source = entry as MonthlyIncomeEntryRecord & { _id?: unknown };
  const { id: _ignoredId, _id: _ignoredMongoId, ...clone } = source;
  return clone;
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

function buildMonthlyIncomeOccurrenceDate(template: MonthlyIncomeEntryRecord, year: number, month: number) {
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

function buildWeeklyIncomeOccurrenceDates(template: MonthlyIncomeEntryRecord, year: number, month: number) {
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

function buildIncomeOccurrenceDates(template: MonthlyIncomeEntryRecord, year: number, month: number) {
  const dates = buildWeeklyIncomeOccurrenceDates(template, year, month);
  const monthlyDate = buildMonthlyIncomeOccurrenceDate(template, year, month);
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
  const clearedIntegration = template.integration ? clearLinkedEntityFromIntegration(template.integration) : null;

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
    allocationKind: template.allocationKind ?? "expense",
    integration: clearedIntegration
      ? {
          ...clearedIntegration,
          integrationId: null,
          idempotencyKey: null
        }
      : null,
    completedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function buildGeneratedIncomeEntry(template: MonthlyIncomeEntryRecord, planId: string, date: string): Omit<MonthlyIncomeEntryRecord, "id"> {
  const timestamp = getLocalTimestampWithOffset();

  return {
    planId,
    description: template.description,
    amountInCents: template.amountInCents,
    category: template.category,
    date,
    time: template.time,
    status: "planned",
    incomeType: "recurring",
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
    receivedAt: null,
    note: template.note ?? "",
    sourceType: template.sourceType ?? "manual",
    sourceId: null,
    idempotencyKey: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function ensureExpenseIdentity(expense: MonthlyExpenseRecord) {
  if (!expense.id) throw new Error("Integrated expense requires a persisted id");
  return expense.id;
}

function applyLinkedEntityToExpense(
  expense: MonthlyExpenseRecord,
  linkedEntity: { linkedEntityType: "operation" | "cashBoxMovement"; linkedEntityId: string; assetId?: string | null; assetTicker?: string | null; cashBoxId?: string | null }
): MonthlyExpenseRecord {
  const integration = expense.integration;
  if (!integration) return expense;

  return {
    ...expense,
    integration: {
      ...integration,
      linkedEntityType: linkedEntity.linkedEntityType,
      linkedEntityId: linkedEntity.linkedEntityId,
      assetId: linkedEntity.assetId ?? integration.assetId ?? null,
      assetTicker: linkedEntity.assetTicker ?? integration.assetTicker ?? null,
      cashBoxId: linkedEntity.cashBoxId ?? integration.cashBoxId ?? null,
      integrationId: integration.integrationId ?? ensureExpenseIdentity(expense)
    }
  };
}

async function resolveAssetForExpenseIntegration(expense: MonthlyExpenseRecord) {
  const integration = expense.integration;
  if (!integration || integration.destination !== "asset") throw badRequest("Selecione um ativo valido.");

  const asset =
    (integration.assetId ? await findAssetById(integration.assetId) : null) ??
    (integration.assetTicker ? await findAssetByTicker(integration.assetTicker) : null);
  if (!asset?.id) throw badRequest("Selecione um ativo valido.");
  return asset;
}

async function resolveCashBoxForExpenseIntegration(expense: MonthlyExpenseRecord) {
  const integration = expense.integration;
  if (!integration || integration.destination !== "cashbox" || !integration.cashBoxId) {
    throw badRequest("Selecione uma caixinha valida.");
  }

  const cashBox = await findCashBoxById(integration.cashBoxId);
  if (!cashBox?.id) throw badRequest("Selecione uma caixinha valida.");
  return cashBox;
}

async function removeLinkedEntityForExpense(expense?: MonthlyExpenseRecord | null) {
  if (!expense?.integration?.linkedEntityId || !expense.integration.linkedEntityType) return;

  if (expense.integration.linkedEntityType === "operation") {
    const operation = (await findOperationByPlanningExpenseId(ensureExpenseIdentity(expense))) ?? (await findOperationById(expense.integration.linkedEntityId));
    if (operation?.id) await deleteOperation(operation.id);
    return;
  }

  const movement = await findCashBoxMovementByPlanningExpenseId(ensureExpenseIdentity(expense));
  if (movement?.movement.id && movement.cashBox.id) {
    await removeCashBoxMovement(movement.cashBox.id, movement.movement.id);
  }
}

async function syncAssetExpenseLinkedEntity(expense: MonthlyExpenseRecord) {
  const expenseId = ensureExpenseIdentity(expense);
  const integration = expense.integration;
  if (!integration || integration.destination !== "asset") throw badRequest("Selecione um ativo valido.");

  const asset = await resolveAssetForExpenseIntegration(expense);
  const quantity = Number(integration.quantity ?? 0);
  const price = Number(integration.price ?? 0);
  const fees = Math.max(Number(integration.fees ?? 0), 0);
  const date = expenseReferenceDate(expense);
  const payload: Omit<OperationRecord, "id"> = {
    assetId: asset.id,
    assetTicker: asset.ticker,
    type: "COMPRA",
    date,
    quantity,
    price,
    fees,
    totalValue: quantity * price,
    notes: trimNullable(expense.note) ?? expense.description,
    origin: "monthly-planning",
    planningLink: {
      expenseId,
      planId: expense.planId,
      integrationId: integration.integrationId ?? expenseId,
      idempotencyKey: integration.idempotencyKey ?? null
    }
  };

  const existing = (await findOperationByPlanningExpenseId(expenseId)) ?? (integration.linkedEntityId ? await findOperationById(integration.linkedEntityId) : null);
  const operation = existing?.id ? await updateOperation(existing.id, payload) : await createOperation(payload);
  if (!operation?.id) throw badRequest("Nao foi possivel registrar o aporte no ativo.");

  return {
    linkedEntityType: "operation" as const,
    linkedEntityId: operation.id,
    assetId: asset.id,
    assetTicker: asset.ticker,
    cashBoxId: null
  };
}

async function syncCashBoxExpenseLinkedEntity(expense: MonthlyExpenseRecord) {
  const expenseId = ensureExpenseIdentity(expense);
  const integration = expense.integration;
  if (!integration || integration.destination !== "cashbox") throw badRequest("Selecione uma caixinha valida.");

  const cashBox = await resolveCashBoxForExpenseIntegration(expense);
  const cashBoxId = cashBox.id;
  if (!cashBoxId) throw badRequest("Selecione uma caixinha valida.");
  const movementId = integration.linkedEntityId ?? `cashbox-movement-${randomUUID()}`;
  const payload: CashBoxMovementRecord = {
    id: movementId,
    type: "contribution",
    value: toMoneyValue(expense.amountInCents),
    date: expenseReferenceDate(expense),
    description: trimNullable(expense.note) ?? expense.description,
    origin: "monthly-planning",
    planningLink: {
      expenseId,
      planId: expense.planId,
      integrationId: integration.integrationId ?? expenseId,
      idempotencyKey: integration.idempotencyKey ?? null
    }
  };

  const existing = await findCashBoxMovementByPlanningExpenseId(expenseId);
  if (existing?.movement.id && existing.cashBox.id && existing.cashBox.id !== cashBoxId) {
    await addCashBoxMovement(cashBoxId, payload);
    await removeCashBoxMovement(existing.cashBox.id, existing.movement.id);
  } else if (existing?.movement.id && existing.cashBox.id) {
    await updateCashBoxMovement(existing.cashBox.id, existing.movement.id, payload);
  } else {
    await addCashBoxMovement(cashBoxId, payload);
  }

  return {
    linkedEntityType: "cashBoxMovement" as const,
    linkedEntityId: movementId,
    assetId: null,
    assetTicker: null,
    cashBoxId
  };
}

async function syncIntegratedExpenseEntity(expense: MonthlyExpenseRecord, previousExpense?: MonthlyExpenseRecord | null) {
  if (expense.status !== "completed" || !isIntegratedInvestmentExpense(expense) || !expense.integration) {
    if (previousExpense?.integration?.linkedEntityId) await removeLinkedEntityForExpense(previousExpense);
    return {
      ...expense,
      integration: clearLinkedEntityFromIntegration(expense.integration)
    };
  }

  const currentLink =
    expense.integration.destination === "asset"
      ? await syncAssetExpenseLinkedEntity(expense)
      : await syncCashBoxExpenseLinkedEntity(expense);

  if (
    previousExpense?.integration?.linkedEntityId &&
    previousExpense.integration.linkedEntityType &&
    previousExpense.integration.linkedEntityType !== currentLink.linkedEntityType
  ) {
    await removeLinkedEntityForExpense(previousExpense);
  }

  return applyLinkedEntityToExpense(expense, currentLink);
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
      const { expense, created: wasCreated } = await createMonthlyExpenseIfMissing(buildGeneratedExpense(template, plan.id, occurrenceDate));
      existingKeys.add(key);
      if (wasCreated) created.push(expense);
    }
  }

  return created;
}

async function ensureRecurringIncomeEntriesForMonth(plan: MonthlyPlanRecord, year: number, month: number) {
  if (!plan.id) return [];
  const [allEntries, currentEntries] = await Promise.all([listAllMonthlyIncomeEntries(), listMonthlyIncomeEntries(plan.id)]);
  const templates = allEntries.filter(isRecurringIncomeEntryTemplate);

  const existingKeys = new Set(
    currentEntries
      .filter((entry) => entry.recurrenceId)
      .map((entry) => `${entry.recurrenceId}-${entry.recurrenceOriginalDate ?? entry.date}`)
  );
  const created: MonthlyIncomeEntryRecord[] = [];

  for (const template of templates) {
    const occurrenceDates = buildIncomeOccurrenceDates(template, year, month);
    for (const occurrenceDate of occurrenceDates) {
      const key = `${template.recurrenceId}-${occurrenceDate}`;
      if (existingKeys.has(key)) continue;
      const { incomeEntry, created: wasCreated } = await createMonthlyIncomeEntryIfMissing(buildGeneratedIncomeEntry(template, plan.id, occurrenceDate));
      existingKeys.add(key);
      if (wasCreated) created.push(incomeEntry);
    }
  }

  return created;
}

async function createHiddenRecurringTemplate(expense: MonthlyExpenseRecord) {
  if (!expense.recurrenceId || expense.recurrenceSourceId) return null;

  const timestamp = getLocalTimestampWithOffset();
  return createMonthlyExpense({
    ...stripExpenseIdentityForClone(expense),
    recurrenceSourceId: null,
    recurrenceCancelled: true,
    status: "planned",
    completedAt: null,
    createdAt: expense.createdAt ?? timestamp,
    updatedAt: timestamp
  });
}

async function createHiddenRecurringIncomeEntryTemplate(entry: MonthlyIncomeEntryRecord) {
  if (!entry.recurrenceId || entry.recurrenceSourceId) return null;

  const timestamp = getLocalTimestampWithOffset();
  return createMonthlyIncomeEntry({
    ...stripIncomeEntryIdentityForClone(entry),
    recurrenceSourceId: null,
    recurrenceCancelled: true,
    status: "planned",
    receivedAt: null,
    idempotencyKey: null,
    sourceId: null,
    createdAt: entry.createdAt ?? timestamp,
    updatedAt: timestamp
  });
}

function buildCompletionSummary(overview: MonthlyPlanningOverview) {
  return {
    completedExpensesInCents: overview.summary.completedInCents,
    plannedExpensesInCents: overview.summary.plannedExpensesInCents,
    balanceInCents: overview.summary.remainingIncomeInCents
  };
}

function buildIncomeEntryCompletionSummary(overview: MonthlyPlanningOverview) {
  return {
    receivedExtraIncomeInCents: overview.summary.completedExtraIncomeInCents,
    plannedExtraIncomeInCents: overview.summary.plannedExtraIncomeInCents,
    currentBalanceInCents: overview.summary.remainingIncomeInCents,
    projectedBalanceInCents: overview.summary.remainingIncomeAfterPlannedInCents
  };
}

async function buildExpenseCompletionResult(
  expense: MonthlyExpenseRecord,
  comparisonRange: number,
  alreadyCompleted: boolean,
  message: string
): Promise<MonthlyExpenseCompletionResult> {
  const plan = await findMonthlyPlanById(expense.planId);
  if (!plan) throw notFound("Monthly plan not found");

  const overview = await getMonthlyPlanningOverview(plan.year, plan.month, comparisonRange);
  const updatedExpense = overview.expenses.find((item) => item.id === expense.id) ?? expense;

  return {
    expense: updatedExpense,
    overview,
    summary: buildCompletionSummary(overview),
    alreadyCompleted,
    message
  };
}

async function buildIncomeEntryCompletionResult(
  incomeEntry: MonthlyIncomeEntryRecord,
  comparisonRange: number,
  alreadyReceived: boolean,
  message: string
): Promise<MonthlyIncomeEntryCompletionResult> {
  const plan = await findMonthlyPlanById(incomeEntry.planId);
  if (!plan) throw notFound("Monthly plan not found");

  const overview = await getMonthlyPlanningOverview(plan.year, plan.month, comparisonRange);
  const updatedIncomeEntry = overview.incomeEntries.find((item) => item.id === incomeEntry.id) ?? incomeEntry;

  return {
    incomeEntry: updatedIncomeEntry,
    overview,
    summary: buildIncomeEntryCompletionSummary(overview),
    alreadyReceived,
    message
  };
}

export function calculateMonthlyPlanning(plan: MonthlyPlanRecord, expenses: MonthlyExpenseRecord[], context: MonthlyCalculationContext = {}): MonthlyPlanningOverview {
  const year = context.year ?? plan.year;
  const month = context.month ?? plan.month;
  const contributions = context.contributions ?? [];
  const dividends = context.dividends ?? [];
  const dashboard = context.dashboard;
  const activeExpenses = expenses.filter((expense) => !expense.recurrenceCancelled);
  const activeIncomeEntries = (context.incomeEntries ?? []).filter((entry) => !entry.recurrenceCancelled && entry.status !== "cancelled");
  const monthlyDividendsInCents = sum(dividends.filter((dividend) => isReceivedDividend(dividend) && isDateInMonth(dividend.paymentDate, year, month)).map((dividend) => toCents(dividendAmount(dividend))));
  const manualMonthlyContributionsInCents = sum(contributions.filter((contribution) => isDateInMonth(contribution.date, year, month)).map((contribution) => toCents(contributionAmount(contribution))));
  const monthlyIntegratedAssetContributionsInCents = sum(activeExpenses.filter((expense) => isCompletedAssetContributionExpense(expense, year, month)).map((expense) => expense.amountInCents));
  const monthlyIntegratedCashBoxContributionsInCents = sum(activeExpenses.filter((expense) => isCompletedCashBoxContributionExpense(expense, year, month)).map((expense) => expense.amountInCents));
  const monthlyContributionsInCents = manualMonthlyContributionsInCents + monthlyIntegratedAssetContributionsInCents;
  const completedExtraIncomeInCents = sum(activeIncomeEntries.filter((entry) => entry.status === "received" && isDateInMonth(incomeEntryReferenceDate(entry), year, month)).map((entry) => entry.amountInCents));
  const plannedExtraIncomeInCents = sum(activeIncomeEntries.filter((entry) => entry.status === "planned" && isDateInMonth(entry.date, year, month)).map((entry) => entry.amountInCents));
  const dividendIncomeInCents = plan.includeDividendsAsIncome ? monthlyDividendsInCents : 0;
  const totalIncomeWithDividendsInCents = plan.incomeInCents + completedExtraIncomeInCents + dividendIncomeInCents;
  const projectedTotalIncomeInCents = totalIncomeWithDividendsInCents + plannedExtraIncomeInCents;
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
  const completedInvestmentsInCents = sum(activeExpenses.filter((expense) => expense.status === "completed" && expense.allocationKind !== "expense").map((expense) => expense.amountInCents));
  const plannedInvestmentsInCents = sum(activeExpenses.filter((expense) => expense.status === "planned" && expense.allocationKind !== "expense").map((expense) => expense.amountInCents));
  const completedConsumptionInCents = completedInCents - completedInvestmentsInCents;
  const plannedConsumptionInCents = plannedExpensesInCents - plannedInvestmentsInCents;
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
  const remainingIncomeAfterPlannedInCents = projectedTotalIncomeInCents - completedInCents - plannedExpensesInCents;
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
    incomeEntries: [...activeIncomeEntries].sort((left, right) => `${right.date}T${right.time}`.localeCompare(`${left.date}T${left.time}`)),
    summary: {
      incomeInCents: plan.incomeInCents,
      baseIncomeInCents: plan.incomeInCents,
      completedExtraIncomeInCents,
      plannedExtraIncomeInCents,
      dividendIncomeInCents,
      currentTotalIncomeInCents: totalIncomeWithDividendsInCents,
      projectedTotalIncomeInCents,
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
      completedConsumptionInCents,
      completedInvestmentsInCents,
      plannedConsumptionInCents,
      plannedInvestmentsInCents,
      canSpendPerDayInCents: remainingDays > 0 ? Math.floor(Math.max(remainingIncomeAfterPlannedInCents, 0) / remainingDays) : Math.max(remainingIncomeAfterPlannedInCents, 0),
      remainingDays
    },
    warnings,
    alerts: [],
    insights: [],
    comparisons: [],
    paymentMethodStats: buildPaymentMethodStats(activeExpenses),
    incomeCategoryStats: buildIncomeCategoryStats(activeIncomeEntries),
    calendarDays: buildCalendarDays(year, month, activeExpenses, activeIncomeEntries, contributions, dividends, plan.incomeInCents),
    categoryEvolution: buildCategoryEvolution(plan, context, activeExpenses),
    investmentSummary: {
      totalWealthInCents: toCents(dashboard?.metrics.totalEquity ?? dashboard?.metrics.totalWealth ?? 0),
      profitabilityPercent: dashboard?.metrics.totalReturnPercent ?? dashboard?.metrics.returnPercentage ?? 0,
      monthlyDividendYieldPercent: dashboard?.metrics.currentValue ? ((dashboard.metrics.monthlyDividends ?? 0) / dashboard.metrics.currentValue) * 100 : 0,
      contributionsThisMonthInCents: monthlyContributionsInCents,
      assetContributionsThisMonthInCents: monthlyIntegratedAssetContributionsInCents,
      cashBoxContributionsThisMonthInCents: monthlyIntegratedCashBoxContributionsInCents,
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
  const [previousExpenses, previousIncomeEntries] = await Promise.all([
    listMonthlyExpenses(previousPlan.id),
    listMonthlyIncomeEntries(previousPlan.id)
  ]);
  return calculateMonthlyPlanning(previousPlan, previousExpenses, { ...context, incomeEntries: previousIncomeEntries, year: target.year, month: target.month });
}

export async function getMonthlyPlanningOverview(year: number, month: number, comparisonRange = 1) {
  const plan = await getOrCreateMonthlyPlan(year, month);
  await Promise.all([
    ensureRecurringExpensesForMonth(plan, year, month),
    ensureRecurringIncomeEntriesForMonth(plan, year, month)
  ]);
  const [expenses, incomeEntries, allExpenses, allIncomeEntries, contributions, dividends, cashBoxes, dashboard] = await Promise.all([
    plan.id ? listMonthlyExpenses(plan.id) : [],
    plan.id ? listMonthlyIncomeEntries(plan.id) : [],
    listAllMonthlyExpenses(),
    listAllMonthlyIncomeEntries(),
    listContributions(),
    listDividends(),
    listCashBoxes(),
    getDashboard()
  ]);
  const context = { allExpenses, allIncomeEntries, contributions, dividends, cashBoxes, dashboard };
  const previousOverview = await getPreviousOverview(year, month, comparisonRange, context);
  return calculateMonthlyPlanning(plan, expenses, { ...context, incomeEntries, previousOverview, year, month });
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

async function resolvePlanAndCategory(planId: string, categoryId: string) {
  const plan = await findMonthlyPlanById(planId);
  if (!plan) throw notFound("Monthly plan not found");

  const category = plan.categories.find((item) => item.id === categoryId);
  if (!category) throw badRequest("Expense category does not exist in this monthly plan");

  return { plan, category };
}

async function resolvePlanForIncomeEntry(planId: string) {
  const plan = await findMonthlyPlanById(planId);
  if (!plan) throw notFound("Monthly plan not found");
  return plan;
}

export async function addMonthlyExpense(planId: string, input: MonthlyExpenseCreateInput) {
  const { category } = await resolvePlanAndCategory(planId, input.categoryId);
  const lockKey = trimNullable(input.integration?.idempotencyKey) ?? "";
  const createWithIntegration = async () => {
    if (lockKey) {
      const existingByKey = await findMonthlyExpenseByIdempotencyKey(lockKey);
      if (existingByKey) {
        if (existingByKey.status === "completed" && isIntegratedInvestmentExpense(existingByKey)) {
          const repaired = await syncIntegratedExpenseEntity(existingByKey, existingByKey);
          if (JSON.stringify(repaired.integration) !== JSON.stringify(existingByKey.integration)) {
            const persistedRepair = await updateMonthlyExpense(existingByKey.id ?? "", {
              integration: repaired.integration,
              updatedAt: repaired.updatedAt
            });
            return persistedRepair ?? repaired;
          }
        }

        return existingByKey;
      }
    }

    const normalized = normalizeExpenseForPersistence(category, { ...input, planId });
    const created = await createMonthlyExpense({
      ...normalized,
      integration: normalized.integration
        ? {
            ...normalized.integration,
            integrationId: normalized.integration.integrationId ?? randomUUID(),
            idempotencyKey: normalized.integration.idempotencyKey ?? lockKey ?? null
          }
        : null
    });

    if (created.status !== "completed" || !isIntegratedInvestmentExpense(created)) return created;

    let synced: MonthlyExpenseRecord | null = null;
    try {
      synced = await syncIntegratedExpenseEntity(created);
      const persisted = await updateMonthlyExpense(created.id ?? "", {
        integration: synced.integration,
        allocationKind: synced.allocationKind,
        updatedAt: synced.updatedAt
      });
      return persisted ?? synced;
    } catch (error) {
      if (synced) await removeLinkedEntityForExpense(synced).catch(() => undefined);
      await deleteMonthlyExpense(created.id ?? "").catch(() => undefined);
      throw error;
    }
  };

  if (!lockKey) return createWithIntegration();

  const existingLock = integratedExpenseMutationLocks.get(lockKey);
  if (existingLock) return existingLock;

  const mutation = createWithIntegration().finally(() => {
    integratedExpenseMutationLocks.delete(lockKey);
  });
  integratedExpenseMutationLocks.set(lockKey, mutation);
  return mutation;
}

export async function addMonthlyIncomeEntry(planId: string, input: MonthlyIncomeEntryCreateInput) {
  await resolvePlanForIncomeEntry(planId);
  const lockKey = trimNullable(input.idempotencyKey) ?? "";
  const createWithIdempotency = async () => {
    if (lockKey) {
      const existingByKey = await findMonthlyIncomeEntryByIdempotencyKey(lockKey);
      if (existingByKey) return existingByKey;
    }

    return createMonthlyIncomeEntry({
      ...normalizeIncomeEntry({ ...input, planId }),
      idempotencyKey: lockKey || input.idempotencyKey || null
    });
  };

  if (!lockKey) return createWithIdempotency();

  const existingLock = monthlyIncomeEntryMutationLocks.get(lockKey);
  if (existingLock) return existingLock;

  const mutation = createWithIdempotency().finally(() => {
    monthlyIncomeEntryMutationLocks.delete(lockKey);
  });
  monthlyIncomeEntryMutationLocks.set(lockKey, mutation);
  return mutation;
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
  const { category } = await resolvePlanAndCategory(merged.planId, merged.categoryId);
  const normalized = normalizeExpenseForPersistence(category, merged, existing);
  const draft = { ...normalized, id } as MonthlyExpenseRecord;
  const synced = await syncIntegratedExpenseEntity(draft, existing);
  const { id: _ignoredId, ...payload } = synced;

  try {
    const updated = await updateMonthlyExpense(id, payload);
    if (!updated) throw notFound("Monthly expense not found");
    return updated;
  } catch (error) {
    await syncIntegratedExpenseEntity(existing, synced).catch(() => undefined);
    throw error;
  }
}

export async function editMonthlyIncomeEntry(id: string, input: MonthlyIncomeEntryPatchInput) {
  const existing = await findMonthlyIncomeEntryById(id);
  if (!existing) throw notFound("Monthly income entry not found");
  const hiddenTemplate = await createHiddenRecurringIncomeEntryTemplate(existing);
  const merged = {
    ...existing,
    ...input,
    recurrenceSourceId: hiddenTemplate?.id ?? existing.recurrenceSourceId ?? null
  } as Omit<MonthlyIncomeEntryRecord, "id">;
  await resolvePlanForIncomeEntry(merged.planId);
  const normalized = normalizeIncomeEntry(merged, existing);
  const updated = await updateMonthlyIncomeEntry(id, normalized);
  if (!updated) throw notFound("Monthly income entry not found");
  return updated;
}

export async function completeMonthlyExpense(id: string, input: MonthlyExpenseCompletionInput = {}, comparisonRange = 1) {
  const existingLock = monthlyExpenseCompletionLocks.get(id);
  if (existingLock) return existingLock;

  const completion = (async () => {
    const existing = await findMonthlyExpenseById(id);
    if (!existing) throw notFound("Monthly expense not found");
    const { category } = await resolvePlanAndCategory(existing.planId, existing.categoryId);

    const normalizedCompletedAt = input.completedAt ? normalizeTimestampWithOffset(input.completedAt) : null;
    if (existing.status === "completed" && (!normalizedCompletedAt || normalizedCompletedAt === (existing.completedAt ?? null))) {
      return buildExpenseCompletionResult(existing, comparisonRange, true, "O gasto ja estava pago.");
    }

    const normalized = normalizeExpenseForPersistence(
      category,
      {
        ...existing,
        status: "completed",
        completedAt: normalizedCompletedAt ?? undefined
      },
      existing,
      {
        allowFutureCompletion: true,
        defaultCompletedAt: normalizedCompletedAt ?? existing.completedAt ?? getLocalTimestampWithOffset()
      }
    );
    const draft = { ...normalized, id } as MonthlyExpenseRecord;
    const synced = await syncIntegratedExpenseEntity(draft, existing);
    const { id: _ignoredId, ...payload } = synced;
    let updated: MonthlyExpenseRecord | null = null;
    try {
      updated = await updateMonthlyExpense(id, payload);
    } catch (error) {
      await syncIntegratedExpenseEntity(existing, synced).catch(() => undefined);
      throw error;
    }

    if (!updated) {
      await syncIntegratedExpenseEntity(existing, synced).catch(() => undefined);
      throw notFound("Monthly expense not found");
    }

    const message = existing.status === "completed" ? "Data de pagamento atualizada." : "Gasto marcado como pago.";
    return buildExpenseCompletionResult(updated, comparisonRange, false, message);
  })().finally(() => {
    monthlyExpenseCompletionLocks.delete(id);
  });

  monthlyExpenseCompletionLocks.set(id, completion);
  return completion;
}

export async function completeMonthlyIncomeEntry(id: string, input: MonthlyIncomeEntryCompletionInput = {}, comparisonRange = 1) {
  const existingLock = monthlyIncomeEntryCompletionLocks.get(id);
  if (existingLock) return existingLock;

  const completion = (async () => {
    const existing = await findMonthlyIncomeEntryById(id);
    if (!existing) throw notFound("Monthly income entry not found");
    await resolvePlanForIncomeEntry(existing.planId);

    const normalizedReceivedAt = input.receivedAt ? normalizeTimestampWithOffset(input.receivedAt) : null;
    if (existing.status === "received" && (!normalizedReceivedAt || normalizedReceivedAt === (existing.receivedAt ?? null))) {
      return buildIncomeEntryCompletionResult(existing, comparisonRange, true, "A entrada ja estava recebida.");
    }

    const normalized = normalizeIncomeEntry(
      {
        ...existing,
        status: "received",
        receivedAt: normalizedReceivedAt ?? undefined
      },
      existing,
      {
        allowFutureReceived: true,
        defaultReceivedAt: normalizedReceivedAt ?? existing.receivedAt ?? getLocalTimestampWithOffset()
      }
    );
    const updated = await updateMonthlyIncomeEntry(id, normalized);
    if (!updated) throw notFound("Monthly income entry not found");

    const message = existing.status === "received" ? "Data de recebimento atualizada." : "Entrada marcada como recebida.";
    return buildIncomeEntryCompletionResult(updated, comparisonRange, false, message);
  })().finally(() => {
    monthlyIncomeEntryCompletionLocks.delete(id);
  });

  monthlyIncomeEntryCompletionLocks.set(id, completion);
  return completion;
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

export async function editMonthlyIncomeEntrySeries(id: string, input: MonthlyIncomeEntryPatchInput) {
  const existing = await findMonthlyIncomeEntryById(id);
  if (!existing) throw notFound("Monthly income entry not found");
  if (!existing.recurrenceId) return editMonthlyIncomeEntry(id, input);

  const merged = { ...existing, ...input, recurrenceId: existing.recurrenceId, recurring: true, incomeType: "recurring" as const } as Omit<MonthlyIncomeEntryRecord, "id">;
  const normalized = normalizeIncomeEntry(merged, existing);
  await updateMonthlyIncomeEntriesByRecurrenceId(existing.recurrenceId, {
    description: normalized.description,
    amountInCents: normalized.amountInCents,
    category: normalized.category,
    time: normalized.time,
    note: normalized.note,
    incomeType: normalized.incomeType,
    recurring: normalized.recurring,
    recurrenceFrequency: normalized.recurrenceFrequency,
    recurrenceInterval: normalized.recurrenceInterval,
    recurrenceDayOfMonth: normalized.recurrenceDayOfMonth,
    recurrenceStartDate: normalized.recurrenceStartDate,
    recurrenceEndDate: normalized.recurrenceEndDate,
    recurrenceCancelled: normalized.recurrenceCancelled,
    sourceType: normalized.sourceType,
    updatedAt: normalized.updatedAt
  });

  return findMonthlyIncomeEntryById(id);
}

export async function removeMonthlyExpense(id: string) {
  const existing = await findMonthlyExpenseById(id);
  if (!existing) throw notFound("Monthly expense not found");
  if (existing.recurrenceId) {
    await removeLinkedEntityForExpense(existing);
    await updateMonthlyExpense(id, { recurrenceCancelled: true, updatedAt: getLocalTimestampWithOffset() });
    return existing;
  }

  await removeLinkedEntityForExpense(existing);
  const deleted = await deleteMonthlyExpense(id);
  if (!deleted) throw notFound("Monthly expense not found");
  return existing;
}

export async function removeMonthlyIncomeEntry(id: string) {
  const existing = await findMonthlyIncomeEntryById(id);
  if (!existing) throw notFound("Monthly income entry not found");
  if (existing.recurrenceId) {
    await updateMonthlyIncomeEntry(id, { recurrenceCancelled: true, status: "cancelled", updatedAt: getLocalTimestampWithOffset() });
    return existing;
  }

  const deleted = await deleteMonthlyIncomeEntry(id);
  if (!deleted) throw notFound("Monthly income entry not found");
  return existing;
}

export async function removeMonthlyExpenseSeries(id: string) {
  const existing = await findMonthlyExpenseById(id);
  if (!existing) throw notFound("Monthly expense not found");
  if (!existing.recurrenceId) {
    return [await removeMonthlyExpense(id)];
  }

  const seriesExpenses = (await listAllMonthlyExpenses()).filter((expense) => expense.recurrenceId === existing.recurrenceId);
  for (const expense of seriesExpenses) {
    await removeLinkedEntityForExpense(expense);
  }
  const deleted = await deleteMonthlyExpensesByRecurrenceId(existing.recurrenceId);
  if (deleted === 0) throw notFound("Monthly expense not found");
  return seriesExpenses;
}

export async function removeMonthlyIncomeEntrySeries(id: string) {
  const existing = await findMonthlyIncomeEntryById(id);
  if (!existing) throw notFound("Monthly income entry not found");
  if (!existing.recurrenceId) {
    return [await removeMonthlyIncomeEntry(id)];
  }

  const seriesEntries = (await listAllMonthlyIncomeEntries()).filter((entry) => entry.recurrenceId === existing.recurrenceId);
  const deleted = await deleteMonthlyIncomeEntriesByRecurrenceId(existing.recurrenceId);
  if (deleted === 0) throw notFound("Monthly income entry not found");
  return seriesEntries;
}
