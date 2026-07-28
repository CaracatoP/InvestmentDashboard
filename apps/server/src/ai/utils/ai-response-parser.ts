import { z } from "zod";
import {
  aiAnalysisResponseSchema,
  aiChatStructuredResponseSchema,
  aiProjectionExplanationSchema,
  type AiAnalysisResponse,
  type AiInsight,
  type AiChatStructuredResponse,
  type AiProjectionExplanation
} from "../schemas/ai.schema";

function extractJson(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

export function parseJsonWithSchema<T>(text: string, schema: z.ZodType<T>) {
  const extracted = extractJson(text);
  const parsed = JSON.parse(extracted) as unknown;
  return schema.parse(parsed);
}

export function createFallbackAnalysis(message = "A IA nao retornou uma analise estruturada valida. Tente gerar novamente."): AiAnalysisResponse {
  return {
    title: "Analise indisponivel",
    summary: message,
    status: "insufficient_data",
    insights: [],
    risks: [],
    opportunities: [],
    actionItems: [],
    disclaimer: "Analise educativa baseada nos dados cadastrados. Nao e recomendacao individual de compra ou venda."
  };
}

export function createFallbackProjectionExplanation(message = "A IA nao retornou uma explicacao estruturada valida."): AiProjectionExplanation {
  return {
    summary: message,
    assumptions: [],
    sensitivities: [],
    warnings: [],
    nextSteps: [],
    disclaimer: "Explicacao educativa baseada na simulacao informada."
  };
}

function normalizeInsight(item: Partial<AiInsight>): AiInsight {
  return {
    title: item.title ?? "Insight",
    description: item.description ?? "",
    severity: item.severity ?? "info"
  };
}

export function parseAiAnalysisStrict(text: string): AiAnalysisResponse {
  const parsed = parseJsonWithSchema(text, aiAnalysisResponseSchema);
  return {
    title: parsed.title,
    summary: parsed.summary,
    status: parsed.status ?? "insufficient_data",
    insights: (parsed.insights ?? []).map(normalizeInsight),
    risks: (parsed.risks ?? []).map(normalizeInsight),
    opportunities: (parsed.opportunities ?? []).map(normalizeInsight),
    actionItems: (parsed.actionItems ?? []).map((item) => ({
      title: item.title,
      description: item.description,
      priority: item.priority ?? "medium"
    })),
    disclaimer: parsed.disclaimer ?? "Analise educativa baseada nos dados cadastrados. Nao e recomendacao individual de compra ou venda."
  };
}

export function parseAiProjectionExplanationStrict(text: string): AiProjectionExplanation {
  const parsed = parseJsonWithSchema(text, aiProjectionExplanationSchema);
  return {
    summary: parsed.summary,
    assumptions: parsed.assumptions ?? [],
    sensitivities: parsed.sensitivities ?? [],
    warnings: parsed.warnings ?? [],
    nextSteps: parsed.nextSteps ?? [],
    disclaimer: parsed.disclaimer ?? "Explicacao educativa baseada na simulacao informada."
  };
}

export function parseAiChatStructuredResponseStrict(text: string): AiChatStructuredResponse {
  const parsed = parseJsonWithSchema(text, aiChatStructuredResponseSchema);
  return {
    message: parsed.message,
    responseType: parsed.responseType ?? "text",
    title: parsed.title,
    sections: parsed.sections ?? [],
    pendingAction: parsed.pendingAction ?? null,
    suggestions: parsed.suggestions ?? [],
    metadata: parsed.metadata ?? {}
  };
}

export function parseAiAnalysis(text: string) {
  try {
    return parseAiAnalysisStrict(text);
  } catch {
    return createFallbackAnalysis();
  }
}

export function parseAiProjectionExplanation(text: string) {
  try {
    return parseAiProjectionExplanationStrict(text);
  } catch {
    return createFallbackProjectionExplanation();
  }
}
