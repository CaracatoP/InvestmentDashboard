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
  totalValue: number;
  valuePerShare: number;
  baseDate?: string | Date;
  paymentDate: string | Date;
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
  name: string;
  type: string;
  currentBalance: number;
  cdiPercentage: number;
  createdAt: string | Date;
  active: boolean;
  movements?: CashBoxMovementRecord[];
}

export interface CashBoxMovementRecord {
  id?: string;
  type: "DEPOSITO" | "RESGATE" | "RENDIMENTO";
  value: number;
  date: string | Date;
  description?: string;
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
