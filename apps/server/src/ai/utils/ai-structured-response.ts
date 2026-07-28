import type { AiChatStructuredResponse } from "../schemas/ai.schema";

export function createStructuredResponse(input: Partial<AiChatStructuredResponse> & { message: string }): AiChatStructuredResponse {
  return {
    message: input.message,
    responseType: input.responseType ?? "text",
    title: input.title,
    sections: input.sections ?? [],
    pendingAction: input.pendingAction ?? null,
    suggestions: input.suggestions ?? [],
    metadata: {
      generatedAt: new Date().toISOString(),
      ...input.metadata
    }
  };
}

export function createTextResponse(message: string, title?: string): AiChatStructuredResponse {
  return createStructuredResponse({
    message,
    title,
    responseType: "text"
  });
}

export function createErrorResponse(message: string): AiChatStructuredResponse {
  return createStructuredResponse({
    message,
    responseType: "error",
    title: "Nao foi possivel concluir",
    sections: [{ type: "alert", items: [{ title: "Erro", description: message, severity: "critical" }] }]
  });
}
