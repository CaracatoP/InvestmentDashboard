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

export interface CdiRateRecord {
  id?: string;
  annualCdiRate: number;
  dailyCdiRate: number;
  referenceDate: string;
  source: string;
  fetchedAt: string | Date;
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
