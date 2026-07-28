export type AiAnalysisType = "complete" | "planning" | "investments" | "category" | "goals" | "projections";

export interface AiInsight {
  title: string;
  description: string;
  severity: "info" | "success" | "warning" | "danger";
}

export interface AiActionItem {
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
}

export interface AiAnalysis {
  title: string;
  summary: string;
  status: "healthy" | "attention" | "critical" | "insufficient_data";
  insights: AiInsight[];
  risks: AiInsight[];
  opportunities: AiInsight[];
  actionItems: AiActionItem[];
  disclaimer: string;
}

export interface AiAnalysisResult {
  analysis: AiAnalysis;
  provider: string;
  model: string;
  generatedAt: string;
  durationMs: number;
  expiresAt: string;
  contextHash: string;
  fromCache: boolean;
  disabled: boolean;
  error?: string;
  request: {
    year: number;
    month: number;
    analysisType: AiAnalysisType;
    categoryId?: string | null;
  };
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
  response: AiAnalysis;
  generatedAt: string;
  durationMs: number;
  expiresAt: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AiHealth {
  provider: string;
  model: string;
  enabled: boolean;
  configured: boolean;
  status: "ok" | "disabled" | "missing-key" | "error";
  checkedAt: string;
  latencyMs: number | null;
  message?: string;
  limits: {
    maxRequestsPerHour: number;
    chatMaxMessages: number;
    chatMaxContextTokens: number;
    effectiveContextTokens?: number;
    analysisCacheMinutes: number;
  };
}

export interface AiProjectionExplanation {
  summary: string;
  assumptions: string[];
  sensitivities: string[];
  warnings: string[];
  nextSteps: string[];
  disclaimer: string;
}

export interface AiProjectionExplanationResult {
  explanation: AiProjectionExplanation;
  provider: string;
  model: string;
  generatedAt: string;
  durationMs: number;
  disabled: boolean;
}

export interface AiChatSession {
  id?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiChatMessage {
  id?: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  structuredResponse?: AiChatStructuredResponse | null;
  intent?: string;
  provider?: string;
  model?: string;
  durationMs?: number;
  createdAt: string;
}

export interface AiStructuredMetric {
  label: string;
  value?: string;
  rawValue?: string | number | boolean | null;
  format?: "text" | "currency" | "number" | "percent" | "date" | "boolean";
  status?: "neutral" | "positive" | "warning" | "critical";
}

export interface AiStructuredSection {
  type: "text" | "metrics" | "table" | "list" | "alert" | "actions";
  title?: string;
  content?: string;
  metrics?: AiStructuredMetric[];
  table?: {
    columns: Array<{ key: string; label: string; format?: "text" | "currency" | "number" | "percent" | "date" | "boolean" }>;
    rows: Array<Record<string, string | number | boolean | null>>;
  };
  items?: Array<{ title: string; description?: string; severity?: "info" | "success" | "warning" | "critical"; relatedRoute?: string }>;
  actions?: Array<{ id?: string; label: string; type?: "navigate" | "confirm" | "cancel" | "edit"; route?: string; pendingActionId?: string }>;
}

export interface AiStructuredPendingAction {
  id: string;
  actionType: string;
  title: string;
  status: "collecting" | "awaiting_confirmation" | "confirmed" | "executed" | "cancelled" | "expired" | "failed";
  riskLevel?: "low" | "medium" | "high";
  fields?: Array<{ name: string; label: string; value?: string | number | boolean | null; type?: string; required?: boolean; options?: Array<{ value: string; label: string }> }>;
  missingFields?: Array<{ name: string; label: string; type?: string; required?: boolean; options?: Array<{ value: string; label: string }> }>;
  confirmLabel?: string;
  cancelLabel?: string;
  editLabel?: string;
}

export interface AiChatStructuredResponse {
  message: string;
  responseType: "text" | "summary" | "table" | "cards" | "confirmation" | "form" | "success" | "error";
  title?: string;
  sections: AiStructuredSection[];
  pendingAction: AiStructuredPendingAction | null;
  suggestions: string[];
  metadata: {
    provider?: string;
    model?: string;
    generatedAt?: string;
  };
}

export interface AiChatSessionDetails {
  session: AiChatSession;
  messages: AiChatMessage[];
}

export interface AiChatMessageResult {
  userMessage: AiChatMessage;
  assistantMessage: AiChatMessage;
  intent: string;
}
