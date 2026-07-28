export type AssetCategory = "FII" | "ACAO" | "ETF" | "CRIPTO" | "RENDA_FIXA";
export type OperationType = "COMPRA" | "VENDA" | "BONIFICACAO" | "DESDOBRAMENTO" | "GRUPAMENTO";
export type GoalType = "wealth" | "dividend" | "shares" | "invested";

export interface AssetRecord {
  id?: string;
  name: string;
  ticker: string;
  category: AssetCategory;
  subcategory?: string;
  sector?: string;
  currency: string;
  active: boolean;
}

export interface OperationRecord {
  id?: string;
  assetId?: string;
  assetTicker?: string;
  type: OperationType;
  quantity: number;
  price: number;
  fees: number;
  totalValue: number;
  date: string;
  notes?: string;
}

export interface DividendRecord {
  id?: string;
  assetId?: string;
  assetTicker?: string;
  totalValue: number;
  valuePerShare: number;
  baseDate?: string;
  paymentDate: string;
}

export interface ContributionRecord {
  id?: string;
  date: string;
  value: number;
  description?: string;
}

export interface CashBoxRecord {
  id?: string;
  categoryId?: string;
  name: string;
  type: string;
  initialBalance?: number;
  currentBalance: number;
  totalContributions?: number;
  totalWithdrawals?: number;
  totalYield?: number;
  cdiPercentage: number;
  annualRateOverride?: number;
  lastYieldCalculationAt?: string;
  createdAt: string;
  updatedAt?: string;
  active: boolean;
  movements?: CashBoxMovementRecord[];
}

export type CashBoxMovementType = "DEPOSITO" | "RESGATE" | "RENDIMENTO" | "contribution" | "withdrawal" | "yield" | "adjustment";

export interface CashBoxMovementRecord {
  id?: string;
  type: CashBoxMovementType;
  value: number;
  date: string;
  description?: string;
  cashBoxId?: string;
  cashBoxName?: string;
}

export interface GoalRecord {
  id?: string;
  title: string;
  description?: string;
  type: GoalType;
  targetValue?: number;
  targetQuantity?: number;
  assetTicker?: string;
  active: boolean;
  completed: boolean;
}

export type MonthlyBudgetType = "percentage" | "fixed";
export type MonthlyExpenseStatus = "completed" | "planned";
export type MonthlyExpenseType = "single" | "recurring";
export type MonthlyRecurrenceFrequency = "weekly" | "biweekly" | "monthly" | "annual" | "custom";

export interface MonthlyPlanCategoryRecord {
  id: string;
  name: string;
  icon: string;
  color: string;
  budgetType: MonthlyBudgetType;
  percentage: number;
  fixedAmountInCents?: number | null;
}

export interface MonthlyFinancialGoalRecord {
  id: string;
  name: string;
  targetInCents: number;
  savedInCents: number;
  monthlyContributionInCents?: number;
  linkedSource?: "manual" | "portfolio" | "cashbox";
  linkedSourceId?: string;
  active: boolean;
}

export interface MonthlyPlanRecord {
  id?: string;
  month: number;
  year: number;
  incomeInCents: number;
  categories: MonthlyPlanCategoryRecord[];
  monthlyContributionGoalInCents?: number;
  includeDividendsAsIncome?: boolean;
  investmentSimulationAmountInCents?: number;
  goals?: MonthlyFinancialGoalRecord[];
  createdAt?: string;
  updatedAt?: string;
}

export interface MonthlyExpenseRecord {
  id?: string;
  planId: string;
  categoryId: string;
  description: string;
  amountInCents: number;
  date: string;
  time: string;
  note?: string;
  paymentMethod?: string | null;
  expenseType: MonthlyExpenseType;
  recurring: boolean;
  recurrenceId?: string | null;
  recurrenceSourceId?: string | null;
  recurrenceFrequency?: MonthlyRecurrenceFrequency | null;
  recurrenceInterval?: number | null;
  recurrenceDayOfMonth?: number | null;
  recurrenceStartDate?: string | null;
  recurrenceEndDate?: string | null;
  recurrenceOriginalDate?: string | null;
  recurrenceCancelled?: boolean;
  status: MonthlyExpenseStatus;
  createdAt?: string;
  updatedAt?: string;
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
  plannedPercentOfIncome: number;
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
    allocatedPercentage: number;
    unallocatedPercentage: number;
    percentageOverage: number;
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
