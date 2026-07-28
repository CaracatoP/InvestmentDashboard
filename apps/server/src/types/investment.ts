export interface AssetRecord {
  id?: string;
  name: string;
  ticker: string;
  category: string;
  subcategory?: string;
  sector?: string;
  currency: string;
  active: boolean;
  createdAt?: string | Date;
  lastPrice?: number;
  lastPriceAt?: string | Date;
  priceSource?: string;
  priceStatus?: string;
}

export interface OperationRecord {
  id?: string;
  assetId?: string;
  assetTicker?: string;
  type: "COMPRA" | "VENDA" | "BONIFICACAO" | "DESDOBRAMENTO" | "GRUPAMENTO" | string;
  date: string | Date;
  quantity: number;
  price: number;
  fees: number;
  totalValue: number;
  notes?: string;
}

export interface DividendRecord {
  id?: string;
  assetId?: string;
  assetTicker?: string;
  category?: string;
  type?: "dividendo" | "jcp" | "rendimento" | "amortizacao" | "outro" | string;
  totalValue: number;
  valuePerShare: number;
  amountPerShare?: number;
  quantityEligible?: number;
  grossAmount?: number;
  netAmount?: number;
  baseDate?: string | Date;
  exDate?: string | Date;
  paymentDate: string | Date;
  referenceMonth?: string;
  status?: "announced" | "expected" | "received" | "cancelled" | string;
  source?: string;
  notes?: string;
}

export interface MarketQuoteRecord {
  id?: string;
  ticker: string;
  price?: number | null;
  quotedAt: string | Date;
  source: string;
  currency: string;
  status: "success" | "failed" | "updated" | "stale" | "unavailable" | "unsupported" | "error";
  errorMessage?: string;
  providerSymbol?: string;
  market?: string;
  assetKind?: string;
}

export interface PriceHistoryRecord {
  id?: string;
  ticker: string;
  price: number;
  capturedAt: string | Date;
  source: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  currency?: string;
  providerSymbol?: string;
  market?: string;
  assetKind?: string;
  type?: "market_history" | "intraday_snapshot" | string;
  interval?: string;
  granularity?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface ContributionRecord {
  id?: string;
  date: string | Date;
  value: number;
  description?: string;
}

export interface GoalRecord {
  id?: string;
  title: string;
  description?: string;
  type: "wealth" | "dividend" | "shares" | "invested";
  targetValue?: number;
  assetTicker?: string;
  targetQuantity?: number;
  active: boolean;
  completed: boolean;
}

export interface CategoryRecord {
  name: string;
  color: string;
  targetPercentage: number;
}

export interface AllocationRecord {
  category: string;
  targetPercentage: number;
  priority: number;
}

export interface SnapshotRecord {
  date: string | Date;
  investedValue: number;
  currentValue: number;
  dividends: number;
  contributions: number;
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
  lastYieldCalculationAt?: string | Date;
  createdAt: string | Date;
  updatedAt?: string | Date;
  active: boolean;
  movements?: CashBoxMovementRecord[];
}

export interface CashBoxMovementRecord {
  id?: string;
  type: "DEPOSITO" | "RESGATE" | "RENDIMENTO" | "contribution" | "withdrawal" | "yield" | "adjustment";
  value: number;
  date: string | Date;
  description?: string;
}

export type CdiSource = "bcb" | "fallback";

export interface CdiRateRecord {
  id?: string;
  annualCdiRate: number;
  dailyCdiRate: number;
  referenceDate: string;
  source: CdiSource | string;
  fallbackReason?: string | null;
  fetchedAt: string | Date;
}

export interface CdiRateSnapshot {
  rate: number;
  dailyRate: number;
  referenceDate: string;
  source: CdiSource;
  updatedAt: string | Date;
  fallbackReason?: string | null;
}

export interface CashBoxYieldRecord {
  id?: string;
  cashBoxId: string;
  referenceDate: string;
  openingBalance: number;
  yieldValue: number;
  closingBalance: number;
  annualCdiRate: number;
  dailyCdiRate: number;
  cdiPercentage: number;
  source: string;
  calculatedAt: string | Date;
}

export interface SettingsRecord {
  id?: string;
  theme: string;
  profileName: string;
  currency: string;
  expectedReturn: number;
  inflation: number;
  currentAge: number;
  targetAge: number;
  allocations: AllocationRecord[];
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
  createdAt?: string | Date;
  updatedAt?: string | Date;
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
  createdAt?: string | Date;
  updatedAt?: string | Date;
}
