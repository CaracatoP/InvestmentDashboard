export type AiRole = "system" | "user" | "assistant";

export interface AiMessage {
  role: AiRole;
  content: string;
}

export interface AiProviderHealth {
  provider: string;
  model: string;
  enabled: boolean;
  configured: boolean;
  status: "ok" | "disabled" | "missing-key" | "error";
  checkedAt: string;
  latencyMs: number | null;
  message?: string;
}

export interface AiUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AiGenerateRequest {
  messages: AiMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}

export interface AiGenerateResult {
  content: string;
  model: string;
  provider: string;
  durationMs: number;
  usage?: AiUsage;
}

export interface AiProvider {
  name: string;
  model: string;
  checkHealth(): Promise<AiProviderHealth>;
  generateAnalysis(request: AiGenerateRequest): Promise<AiGenerateResult>;
  generateProjection(request: AiGenerateRequest): Promise<AiGenerateResult>;
  chat(request: AiGenerateRequest): Promise<AiGenerateResult>;
}
