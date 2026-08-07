import { z } from "zod";

export const aiAnalysisTypes = ["complete", "planning", "investments", "category", "goals", "projections"] as const;
export type AiAnalysisType = (typeof aiAnalysisTypes)[number];

export const aiAnalysisRequestSchema = z.object({
  year: z.coerce.number().int().min(1970).max(2200),
  month: z.coerce.number().int().min(1).max(12),
  analysisType: z.enum(aiAnalysisTypes).default("complete"),
  categoryId: z.string().trim().min(1).optional(),
  forceRefresh: z.coerce.boolean().optional().default(false)
});

export const aiInsightSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(["info", "success", "warning", "danger"]).default("info")
});
export type AiInsight = z.infer<typeof aiInsightSchema>;

export const aiActionItemSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(["low", "medium", "high"]).default("medium")
});
export type AiActionItem = z.infer<typeof aiActionItemSchema>;

export const aiAnalysisResponseSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  status: z.enum(["healthy", "attention", "critical", "insufficient_data"]).default("insufficient_data"),
  insights: z.array(aiInsightSchema).default([]),
  risks: z.array(aiInsightSchema).default([]),
  opportunities: z.array(aiInsightSchema).default([]),
  actionItems: z.array(aiActionItemSchema).default([]),
  disclaimer: z.string().default("Analise educativa baseada nos dados cadastrados. Nao e recomendacao individual de compra ou venda.")
});

export type AiAnalysisRequest = z.infer<typeof aiAnalysisRequestSchema>;
export type AiAnalysisResponse = z.infer<typeof aiAnalysisResponseSchema>;

export const aiProjectionExplainSchema = z.object({
  input: z.record(z.unknown()).optional(),
  projection: z.record(z.unknown())
});

export const aiProjectionExplanationSchema = z.object({
  summary: z.string().min(1),
  assumptions: z.array(z.string()).default([]),
  sensitivities: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  nextSteps: z.array(z.string()).default([]),
  disclaimer: z.string().default("Explicacao educativa baseada na simulacao informada.")
});

export type AiProjectionExplanation = z.infer<typeof aiProjectionExplanationSchema>;

export const aiChatSessionCreateSchema = z.object({
  title: z.string().trim().min(1).max(80).optional()
});

export const aiChatMessageCreateSchema = z.object({
  message: z.string().trim().min(1).max(4000)
});

const aiMetricSchema = z.object({
  label: z.string().min(1),
  value: z.string().optional(),
  rawValue: z.union([z.number(), z.string(), z.boolean(), z.null()]).optional(),
  format: z.enum(["text", "currency", "number", "percent", "date", "boolean"]).optional(),
  status: z.enum(["neutral", "positive", "warning", "critical"]).optional()
});

const aiTableColumnSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  format: z.enum(["text", "currency", "number", "percent", "date", "boolean"]).optional()
});

const aiStructuredItemSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  severity: z.enum(["info", "success", "warning", "critical"]).optional(),
  relatedRoute: z.string().optional()
});

const aiUiActionSchema = z.object({
  id: z.string().min(1).optional(),
  label: z.string().min(1),
  type: z.enum(["navigate", "confirm", "cancel", "edit"]).optional(),
  route: z.string().optional(),
  pendingActionId: z.string().optional()
});

const aiAffectedEntitySchema = z.object({
  type: z.string().min(1),
  id: z.string().nullable().optional()
});

export const aiPendingActionFieldSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  type: z.enum(["text", "number", "currency", "date", "time", "select", "boolean"]).optional(),
  required: z.boolean().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional()
});

export const aiChatSectionSchema = z.object({
  type: z.enum(["text", "metrics", "table", "list", "alert", "actions"]),
  title: z.string().optional(),
  content: z.string().optional(),
  metrics: z.array(aiMetricSchema).optional(),
  table: z.object({
    columns: z.array(aiTableColumnSchema),
    rows: z.array(z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])))
  }).optional(),
  items: z.array(aiStructuredItemSchema).optional(),
  actions: z.array(aiUiActionSchema).optional()
});

export const aiChatPendingActionSchema = z.object({
  id: z.string(),
  actionType: z.string(),
  title: z.string(),
  status: z.enum(["collecting", "awaiting_confirmation", "confirmed", "executed", "cancelled", "expired", "failed"]),
  riskLevel: z.enum(["low", "medium", "high"]).optional(),
  fields: z.array(aiPendingActionFieldSchema).optional(),
  missingFields: z.array(aiPendingActionFieldSchema).optional(),
  confirmLabel: z.string().optional(),
  cancelLabel: z.string().optional(),
  editLabel: z.string().optional()
});

export const aiChatStructuredResponseSchema = z.object({
  message: z.string().min(1),
  responseType: z.enum(["text", "summary", "table", "cards", "confirmation", "form", "success", "error"]).default("text"),
  title: z.string().optional(),
  sections: z.array(aiChatSectionSchema).default([]),
  pendingAction: aiChatPendingActionSchema.nullable().default(null),
  suggestions: z.array(z.string()).default([]),
  metadata: z.object({
    provider: z.string().optional(),
    model: z.string().optional(),
    generatedAt: z.string().optional(),
    affectedDomains: z.array(z.string()).optional(),
    affectedEntities: z.array(aiAffectedEntitySchema).optional(),
    mutationKey: z.string().optional()
  }).default({})
});

export type AiChatStructuredResponse = z.infer<typeof aiChatStructuredResponseSchema>;

export const aiPendingActionStatuses = ["collecting", "awaiting_confirmation", "confirmed", "executed", "cancelled", "expired", "failed"] as const;
export type AiPendingActionStatus = (typeof aiPendingActionStatuses)[number];
export type AiPendingActionRiskLevel = "low" | "medium" | "high";
export type AiToolName =
  | "createMonthlyExpense"
  | "createIncomeEntry"
  | "createContribution"
  | "updateMonthlyIncome"
  | "createFinancialGoal"
  | "markExpenseAsCompleted"
  | "markIncomeEntryAsReceived"
  | "createInvestmentPurchase"
  | "createInvestmentSale"
  | "registerDividend"
  | "registerJCP"
  | "registerBonus"
  | "registerSplit"
  | "registerReverseSplit"
  | "transferAsset"
  | "updateAveragePrice"
  | "updateSettingsProfile";

export interface AiPendingActionRecord {
  id?: string;
  sessionId: string;
  actionType: string;
  toolName: AiToolName;
  extractedFields: Record<string, unknown>;
  missingFields: Array<z.infer<typeof aiPendingActionFieldSchema>>;
  preview: AiChatStructuredResponse["pendingAction"];
  status: AiPendingActionStatus;
  riskLevel: AiPendingActionRiskLevel;
  createdAt: string | Date;
  updatedAt: string | Date;
  expiresAt: string | Date;
  idempotencyKey: string;
  executionResult?: unknown;
}

export interface AiActionAuditRecord {
  id?: string;
  sessionId: string;
  messageId?: string;
  pendingActionId: string;
  actionType: string;
  toolName: string;
  targetEntity?: string;
  targetEntityId?: string;
  sanitizedInput: Record<string, unknown>;
  previousSnapshot?: unknown;
  resultSnapshot?: unknown;
  status: "prepared" | "confirmed" | "executed" | "cancelled" | "failed";
  confirmedAt?: string | Date;
  executedAt?: string | Date;
  errorCode?: string;
  createdAt: string | Date;
}

export interface AiStoredAnalysis {
  id?: string;
  year: number;
  month: number;
  analysisType: AiAnalysisType;
  categoryId?: string | null;
  provider: string;
  model: string;
  contextHash: string;
  response: AiAnalysisResponse;
  generatedAt: string | Date;
  durationMs: number;
  expiresAt: string | Date;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface AiChatSessionRecord {
  id?: string;
  title: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface AiChatMessageRecord {
  id?: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  structuredResponse?: AiChatStructuredResponse | null;
  intent?: string;
  provider?: string;
  model?: string;
  durationMs?: number;
  createdAt: string | Date;
}
