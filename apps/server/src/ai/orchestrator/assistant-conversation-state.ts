export type AssistantTopic =
  | "planning"
  | "expenses"
  | "income"
  | "dividends"
  | "portfolio"
  | "market"
  | "goals"
  | "simulation"
  | "general";

export type AssistantEntityType =
  | "category"
  | "expense"
  | "income"
  | "asset"
  | "asset_class"
  | "macro_indicator"
  | "fixed_income"
  | "general";

export type AssistantAssetClass = "stock" | "fii" | "etf" | "crypto" | "cash";

export type AssistantPeriodContext =
  | {
      type: "month";
      year: number;
      month: number;
      label: string;
    }
  | {
      type: "year";
      year: number;
      label: string;
    }
  | {
      type: "range";
      from: string;
      to: string;
      label: string;
    };

export interface AssistantConversationState {
  topic: AssistantTopic;
  entityType?: AssistantEntityType | null;
  period?: AssistantPeriodContext | null;
  comparisonPeriod?: AssistantPeriodContext | null;
  categoryId?: string | null;
  categoryName?: string | null;
  descriptionQuery?: string | null;
  assetTicker?: string | null;
  assetName?: string | null;
  assetClass?: AssistantAssetClass | null;
  marketEntityType?: "crypto" | "macro_indicator" | "fixed_income" | "b3" | "unknown" | null;
  lastCapabilityNames?: string[];
  lastQueryKind?: string | null;
  updatedAt: string | Date;
  expiresAt: string | Date;
}

export const assistantConversationStateTtlMs = 20 * 60 * 1000;

export function createAssistantConversationState(
  state: Omit<AssistantConversationState, "updatedAt" | "expiresAt">,
  now = new Date()
): AssistantConversationState {
  return {
    ...state,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + assistantConversationStateTtlMs)
  };
}

export function resolveAssistantConversationState(state?: AssistantConversationState | null, now = new Date()) {
  if (!state) return null;
  const expiresAt = new Date(state.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return null;
  return state;
}
