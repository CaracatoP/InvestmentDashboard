import { getMonthlyPlanningOverview } from "../../services/monthly-planning.service";
import { filterSensitiveData } from "../utils/ai-sensitive-data-filter";

export type PlanningContextFocus = "overview" | "expenses" | "recurring" | "payment_methods" | "category" | "compare";

function sortByAmountDesc<T extends { amountInCents: number }>(items: T[]) {
  return [...items].sort((left, right) => right.amountInCents - left.amountInCents);
}

function compactExpense(expense: {
  description: string;
  amountInCents: number;
  date: string;
  time?: string;
  categoryId: string;
  status: string;
  paymentMethod?: string | null;
  recurring?: boolean;
}) {
  return {
    description: expense.description,
    amountInCents: expense.amountInCents,
    date: expense.date,
    categoryId: expense.categoryId,
    status: expense.status,
    paymentMethod: expense.paymentMethod ?? null,
    recurring: Boolean(expense.recurring)
  };
}

function compactIncomeEntry(entry: {
  description: string;
  amountInCents: number;
  date: string;
  time?: string;
  category: string;
  status: string;
  recurring?: boolean;
}) {
  return {
    description: entry.description,
    amountInCents: entry.amountInCents,
    date: entry.date,
    category: entry.category,
    status: entry.status,
    recurring: Boolean(entry.recurring)
  };
}

export async function buildPlanningContext(year: number, month: number, categoryId?: string, focus: PlanningContextFocus = "overview") {
  const overview = await getMonthlyPlanningOverview(year, month);
  const category = categoryId ? overview.categories.find((item) => item.id === categoryId) ?? null : null;
  const scopedExpenses = categoryId ? overview.expenses.filter((expense) => expense.categoryId === categoryId) : overview.expenses;
  const largestExpenses = sortByAmountDesc(scopedExpenses).slice(0, focus === "expenses" ? 20 : 10).map(compactExpense);
  const recentExpenses = [...scopedExpenses].slice(0, focus === "expenses" ? 20 : 10).map(compactExpense);
  const recurringExpenses = scopedExpenses.filter((expense) => expense.recurring).slice(0, 15).map(compactExpense);
  const recentIncomeEntries = [...overview.incomeEntries].slice(0, focus === "expenses" ? 20 : 10).map(compactIncomeEntry);
  const categoryEvolution = categoryId
    ? overview.categoryEvolution.find((item) => item.categoryId === categoryId) ?? null
    : overview.categoryEvolution.map((item) => ({
        categoryId: item.categoryId,
        monthly: item.monthly.slice(-6),
        annual: item.annual.slice(-3)
      }));
  const categories = overview.categories
    .map((item) => ({
      id: item.id,
      name: item.name,
      limitInCents: item.limitInCents,
      completedInCents: item.completedInCents,
      plannedInCents: item.plannedInCents,
      remainingInCents: item.remainingInCents,
      usedPercent: item.usedPercent,
      state: item.state
    }))
    .sort((left, right) => right.completedInCents - left.completedInCents)
    .slice(0, focus === "overview" ? 10 : 20);
  const baseContext = {
    scope: `planning:${focus}`,
    period: { year, month },
    summary: overview.summary,
    warnings: overview.warnings.slice(0, 5),
    alerts: overview.alerts.slice(0, 5),
    insights: overview.insights.slice(0, 5),
    comparisons: overview.comparisons.slice(0, focus === "compare" ? 12 : 6),
    investmentSummary: overview.investmentSummary,
    income: {
      baseIncomeInCents: overview.summary.baseIncomeInCents,
      completedExtraIncomeInCents: overview.summary.completedExtraIncomeInCents,
      plannedExtraIncomeInCents: overview.summary.plannedExtraIncomeInCents,
      dividendIncomeInCents: overview.summary.dividendIncomeInCents,
      currentTotalIncomeInCents: overview.summary.currentTotalIncomeInCents,
      projectedTotalIncomeInCents: overview.summary.projectedTotalIncomeInCents
    }
  };

  if (focus === "payment_methods") {
    return filterSensitiveData({
      ...baseContext,
      paymentMethodStats: overview.paymentMethodStats.slice(0, 10),
      incomeCategoryStats: overview.incomeCategoryStats.slice(0, 10),
      recentIncomeEntries,
      recentExpenses,
      largestExpenses
    });
  }

  if (focus === "recurring") {
    return filterSensitiveData({
      ...baseContext,
      recurringExpenses,
      recurringIncomeEntries: recentIncomeEntries.filter((entry) => entry.recurring),
      recurringTotalInCents: recurringExpenses.reduce((total, expense) => total + expense.amountInCents, 0)
    });
  }

  if (focus === "expenses") {
    return filterSensitiveData({
      ...baseContext,
      categories,
      incomeCategoryStats: overview.incomeCategoryStats.slice(0, 10),
      recentIncomeEntries,
      recentExpenses,
      largestExpenses,
      paymentMethodStats: overview.paymentMethodStats.slice(0, 8)
    });
  }

  if (focus === "category") {
    return filterSensitiveData({
      ...baseContext,
      selectedCategory: category,
      recentIncomeEntries,
      recentExpenses,
      largestExpenses,
      categoryEvolution
    });
  }

  return filterSensitiveData({
    ...baseContext,
    categories,
    incomeCategoryStats: overview.incomeCategoryStats.slice(0, 10),
    recentIncomeEntries,
    largestExpenses,
    paymentMethodStats: overview.paymentMethodStats.slice(0, 8),
    categoryEvolution
  });
}
