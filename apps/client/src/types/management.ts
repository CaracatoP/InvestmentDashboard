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
