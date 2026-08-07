export type AssetCategory = "FII" | "ACAO" | "ETF" | "CRIPTO" | "RENDA_FIXA";
export type OperationType = "COMPRA" | "VENDA" | "BONIFICACAO" | "DESDOBRAMENTO" | "GRUPAMENTO";
export type GoalType = "wealth" | "dividend" | "shares" | "invested";
export type MonthlyExpenseAllocationKind = "expense" | "investment_contribution" | "cash_box_contribution";
export type MonthlyExpenseInvestmentDestination = "asset" | "cashbox";
export type MonthlyExpenseLinkedEntityType = "operation" | "cashBoxMovement";

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
  origin?: "manual" | "monthly-planning";
  planningLink?: {
    expenseId: string;
    planId: string;
    integrationId: string;
    idempotencyKey?: string | null;
  } | null;
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
  origin?: "manual" | "monthly-planning";
  planningLink?: {
    expenseId: string;
    planId: string;
    integrationId: string;
    idempotencyKey?: string | null;
  } | null;
}

export interface MonthlyExpenseIntegrationRecord {
  destination: MonthlyExpenseInvestmentDestination;
  linkedEntityType?: MonthlyExpenseLinkedEntityType | null;
  linkedEntityId?: string | null;
  assetId?: string | null;
  assetTicker?: string | null;
  cashBoxId?: string | null;
  operationType?: OperationType | null;
  quantity?: number | null;
  price?: number | null;
  fees?: number | null;
  integrationId?: string | null;
  idempotencyKey?: string | null;
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
export type MonthlyIncomeEntryStatus = "received" | "planned" | "cancelled";
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
  allocationKind?: MonthlyExpenseAllocationKind;
  integration?: MonthlyExpenseIntegrationRecord | null;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface MonthlyIncomeEntryRecord {
  id?: string;
  planId: string;
  description: string;
  amountInCents: number;
  category: string;
  date: string;
  time: string;
  status: MonthlyIncomeEntryStatus;
  incomeType: MonthlyExpenseType;
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
  receivedAt?: string | null;
  note?: string;
  sourceType?: "manual" | "dividend" | string | null;
  sourceId?: string | null;
  idempotencyKey?: string | null;
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
  plannedPercentOfIncome: number | null;
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
    allocationStatus: "within-limit" | "fully-distributed" | "over-limit" | "income-required";
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
