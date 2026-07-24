export type GoalType = "wealth" | "dividend" | "shares" | "invested";

export interface Asset {
  name: string;
  ticker: string;
  category: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  dividendYield: number;
  dividendsReceived: number;
  objectiveQuantity: number;
  currency: string;
  investedValue: number;
  currentValue: number;
  profit: number;
  returnPercentage: number;
  portfolioWeight: number;
}

export interface Movement {
  id: string;
  date: string;
  type: string;
  title: string;
  description: string;
  amount: number;
  day?: number;
}

export interface AllocationComparison {
  category: string;
  targetPercentage: number;
  currentPercentage: number;
  difference: number;
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
  };
  wealthEvolution: Array<{ month: string; invested: number; current: number; dividends: number; contributions: number }>;
  categoryAllocation: AllocationComparison[];
  monthlyDividends: Array<{ month: string; value: number }>;
  monthlyContributions: Array<{ month: string; value: number }>;
  recommendation: Recommendation;
  recentMovements: Movement[];
}

export interface PortfolioResponse {
  assets: Asset[];
  allocationComparison: AllocationComparison[];
  recommendation: Recommendation;
}

export interface AssetDetails extends Asset {
  priceHistory: Array<{ month: string; price: number }>;
  dividends: Array<{ assetTicker: string; date: string; amount: number; shares: number }>;
  operations: Array<{ assetTicker: string; type: string; date: string; quantity: number; price: number; total: number; notes: string }>;
}

export interface DividendsResponse {
  totals: {
    month: number;
    year: number;
    allTime: number;
    monthlyAverage: number;
    biggestPayment: number;
  };
  table: Array<{ assetTicker: string; date: string; amount: number; shares: number }>;
  monthly: Array<{ month: string; value: number }>;
  annual: Array<{ year: string; value: number }>;
  byAsset: Array<{ ticker: string; value: number }>;
  calendar: Array<{ assetTicker: string; date: string; amount: number; shares: number }>;
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
    currency: string;
    theme: string;
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
  monthlyDividendYield?: number;
}

export interface ProjectionResponse {
  summary: {
    futureWealth: number;
    realFutureWealth: number;
    futureMonthlyDividends: number;
    years: number;
    months: number;
  };
  series: Array<{ age: number; wealth: number; realWealth: number; projectedDividends: number }>;
}
