export type GoalType = "wealth" | "dividend" | "shares" | "invested";

export interface Asset {
  assetId?: string;
  name: string;
  ticker: string;
  categoryId?: string;
  categoryLabel?: string;
  category: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number | null;
  lastPriceAt?: string | null;
  priceSource?: string;
  priceStatus?: string;
  dividendYield: number;
  yieldOnCost?: number;
  dividendsReceived: number;
  objectiveQuantity: number;
  currency: string;
  totalInvested?: number;
  investedValue: number;
  currentValue: number | null;
  unrealizedProfit?: number | null;
  profit: number | null;
  profitabilityPercent?: number | null;
  returnPercentage: number | null;
  weightPercent?: number;
  portfolioWeight: number;
  hasPosition?: boolean;
}

export interface Movement {
  id: string;
  date: string;
  type: string;
  title: string;
  description: string;
  amount: number;
  day?: number;
  eventType?: string;
  assetTicker?: string;
  assetCategory?: string;
  sector?: string;
  status?: "completed" | "planned" | "cancelled" | string;
  statusLabel?: string;
  paymentMethod?: string;
  source?: string;
  sourceType?: "operation" | "dividend" | "contribution" | "cashbox-movement" | "monthly-expense" | "monthly-goal" | string;
  sourceId?: string;
  seriesId?: string | null;
  occurrenceId?: string | null;
  occurrenceDate?: string | null;
  completedAt?: string | null;
  canonicalId?: string;
}

export interface AllocationComparison {
  categoryId?: string;
  category: string;
  targetPercentage: number;
  currentPercentage: number;
  difference: number;
  differenceValue?: number;
  differencePercent?: number;
  status?: "deficit" | "excess" | "balanced";
  value?: number;
  targetValue?: number;
  missingValue?: number;
  color?: string;
}

export interface Recommendation {
  ticker: string;
  name: string;
  category: string;
  reason: string;
  action: string;
  comparison: AllocationComparison[];
  allocation?: AllocationSummary;
}

export interface AllocationCategorySummary {
  categoryId: string;
  label: string;
  currentValue: number;
  currentPercent: number;
  targetPercent: number;
  idealValue: number;
  differenceValue: number;
  differencePercent: number;
  amountNeeded: number;
  status: "deficit" | "excess" | "balanced";
}

export interface AllocationSummary {
  totalEquity: number;
  categories: AllocationCategorySummary[];
  recommendation: {
    categoryId: string;
    label: string;
    assetId?: string;
    ticker?: string;
    cashBoxId?: string;
    amountNeeded: number;
    percentageDeficit: number;
    reason: string;
  };
  largestDeficit: AllocationCategorySummary | null;
  largestExcess: AllocationCategorySummary | null;
  targetTotalPercent: number;
}

export interface DashboardResponse {
  metrics: {
    totalWealth: number;
    totalProfit: number;
    returnPercentage: number;
    monthlyDividends: number;
    yearlyDividends: number;
    monthlyContributions: number;
    yearlyContributions: number;
    assetCount: number;
    investedValue: number;
    currentValue: number;
    netProfit: number;
    cashBoxValue?: number;
    totalEquity?: number;
    marketAssetsValue?: number;
    cashboxesBalance?: number;
    investedCapital?: number;
    marketInvestedCapital?: number;
    cashboxesNetContributions?: number;
    unrealizedMarketProfit?: number;
    cashboxesYield?: number;
    receivedDividends?: number;
    totalReturnPercent?: number;
    cashboxCount?: number;
    positionCount?: number;
    dividendsThisMonth?: number;
    dividendsThisYear?: number;
    contributionsThisMonth?: number;
    withdrawalsThisMonth?: number;
    cashboxYieldThisMonth?: number;
    nextContributionRecommendation?: AllocationSummary["recommendation"];
    allocationByCategory?: AllocationSummary["categories"];
    targetAllocation?: Array<{ categoryId: string; label: string; targetPercent: number; idealValue: number }>;
    allocationDifference?: Array<{ categoryId: string; label: string; differenceValue: number; differencePercent: number; status: string }>;
    lastMarketRefreshAt?: string | null;
    lastCdiRefreshAt?: string | null;
    lastDashboardCalculationAt?: string;
  };
  wealthEvolution: Array<{ month: string; invested: number; current: number; dividends: number; contributions: number }>;
  portfolioHistory?: Array<{ month: string; invested: number; current: number; dividends: number; contributions: number }>;
  categoryAllocation: AllocationComparison[];
  monthlyDividends: Array<{ month: string; value: number }>;
  monthlyContributions: Array<{ month: string; value: number }>;
  monthlyWithdrawals?: Array<{ month: string; value: number }>;
  monthlyCashBoxYield?: Array<{ month: string; value: number }>;
  recommendation: Recommendation;
  allocation?: AllocationSummary;
  recentMovements: Movement[];
}

export interface PortfolioResponse {
  assets: Asset[];
  allocationComparison: AllocationComparison[];
  recommendation: Recommendation;
  allocation?: AllocationSummary;
}

export interface AssetDetails extends Asset {
  priceHistory: Array<{ month: string; price: number }>;
  dividends: Array<{ assetTicker: string; date: string; amount: number; amountPerShare?: number; shares: number; status?: string; source?: string; notes?: string }>;
  operations: Array<{ assetTicker: string; type: string; date: string; quantity: number; price: number; total: number; notes: string }>;
}

export interface AssetPriceHistoryPoint {
  timestamp: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
  valueInCents?: number;
}

export interface AssetPriceHistoryResponse {
  assetId?: string;
  ticker: string;
  period?: string;
  range: string;
  interval: string;
  source: string;
  currency: string;
  points: AssetPriceHistoryPoint[];
  lastUpdatedAt: string | null;
  updatedAt?: string | null;
  cached?: boolean;
  status: "updated" | "cached" | "stale" | "unavailable" | "unsupported" | "error";
  message?: string;
}

export interface DividendsResponse {
  totals: {
    month: number;
    year: number;
    allTime: number;
    monthlyAverage: number;
    biggestPayment: number;
  };
  table: Array<{ assetTicker: string; date: string; amount: number; amountPerShare?: number; shares: number; status?: string; source?: string; notes?: string }>;
  monthly: Array<{ month: string; value: number }>;
  annual: Array<{ year: string; value: number }>;
  byAsset: Array<{ ticker: string; value: number }>;
  calendar: Array<{ assetTicker: string; date: string; amount: number; amountPerShare?: number; shares: number; status?: string; source?: string; notes?: string }>;
}

export interface ContributionsResponse {
  totals: {
    invested: number;
    year: number;
    monthlyAverage: number;
  };
  table: Array<{ date: string; amount: number; category: string; notes: string }>;
  monthly: Array<{ month: string; value: number }>;
  annual: Array<{ year: string; value: number }>;
}

export interface Goal {
  id?: string;
  title: string;
  type: GoalType;
  target: number;
  current: number;
  description?: string;
  category?: string;
  assetTicker?: string;
  active?: boolean;
  completed?: boolean;
  dueDate?: string;
  progress: number;
}

export interface SettingsResponse {
  profile: {
    name: string;
    currency: "BRL";
    theme: "dark" | "light" | "system";
  };
  allocations: Array<{ category: string; targetPercentage: number; priority: number }>;
  categories: Array<{ name: string; color: string; targetPercentage: number }>;
  projections?: {
    expectedReturn: number;
    inflation: number;
    currentAge: number;
    targetAge: number;
  };
}

export interface ProjectionInput {
  wealth: number;
  monthlyContribution: number;
  expectedReturn: number;
  inflation: number;
  currentAge: number;
  targetAge: number;
  reinvestDividends: boolean;
  annualDividendYield?: number;
}

export interface ProjectionResponse {
  summary: {
    futureWealth: number;
    realFutureWealth: number;
    futureMonthlyDividends: number;
    accumulatedDividends: number;
    years: number;
    months: number;
  };
  series: Array<{ age: number; wealth: number; realWealth: number; projectedDividends: number; accumulatedDividends: number }>;
}

export interface MarketRefreshResponse {
  provider: string;
  refreshedAt: string;
  total: number;
  requested: number;
  updated: number;
  stale: number;
  failed: number;
  unsupported: number;
}

export type CdiSource = "bcb" | "fallback";

export interface CdiRateSnapshot {
  rate: number;
  dailyRate: number;
  referenceDate: string;
  source: CdiSource;
  updatedAt: string;
  fallbackReason?: string | null;
}

export interface CdiStatusResponse extends CdiRateSnapshot {
  provider: CdiSource;
  timezone: string;
  updateHour: number;
  schedulersEnabled: boolean;
  fallbackAnnualRate: number;
  history: CdiRateSnapshot[];
}

export interface CdiRefreshResponse {
  rate: CdiRateSnapshot;
  recalculation: {
    applied: number;
    skipped: number;
    cashBoxCount: number;
    referenceDate: string;
  };
}
