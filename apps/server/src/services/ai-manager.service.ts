import { env } from "../config/env";
import { getAiProvider } from "../ai/ai-provider.factory";
import { buildConversationContext } from "../ai/builders/conversation-context.builder";
import { buildFinancialAnalysisContext } from "../ai/builders/financial-context.builder";
import { buildAnalysisSystemPrompt, buildAnalysisUserPrompt } from "../ai/prompts/financial-analysis.prompt";
import { buildChatUserPrompt, chatSystemPrompt } from "../ai/prompts/financial-chat.prompt";
import { buildProjectionUserPrompt, projectionSystemPrompt } from "../ai/prompts/projection.prompt";
import type { AiAnalysisRequest, AiChatMessageRecord, AiProjectionExplanation } from "../ai/schemas/ai.schema";
import type { AiMessage } from "../ai/ai-provider.interface";
import { buildContextHash } from "../ai/utils/ai-context-hash";
import { compactText, maxAiContextTokenBudget, stringifyContextForAi } from "../ai/utils/ai-context-budget";
import { checkAiRateLimit } from "../ai/utils/ai-rate-limiter";
import {
  createFallbackAnalysis,
  createFallbackProjectionExplanation,
  parseAiAnalysisStrict,
  parseAiChatStructuredResponseStrict,
  parseAiProjectionExplanationStrict
} from "../ai/utils/ai-response-parser";
import {
  addAiChatMessage,
  createAiChatSession,
  deleteAiChatSession,
  findAiChatSessionById,
  findActiveAiPendingAction,
  findCachedAiAnalysis,
  listAiAnalyses,
  listAiChatMessages,
  listAiChatSessions,
  saveAiAnalysis,
  updateAiChatSession
} from "../repositories/ai.repository";
import { badRequest, notFound, HttpError } from "../utils/http-error";
import { handleOperationalChatMessage } from "../ai/tools/ai-action-tools";
import { createErrorResponse, createStructuredResponse, createTextResponse } from "../ai/utils/ai-structured-response";

const analysisContextTokenBudget = 1900;
const chatContextTokenBudget = 1500;
const projectionContextTokenBudget = 1400;
const chatHistoryMessageLimit = 4;
const chatHistoryMessageMaxCharacters = 420;

function cacheExpiry() {
  return new Date(Date.now() + env.aiAnalysisCacheMinutes * 60 * 1000);
}

function buildDisabledAnalysis(provider: ReturnType<typeof getAiProvider>, input: AiAnalysisRequest, contextHash: string) {
  return {
    analysis: createFallbackAnalysis("Assistente de IA desativado ou sem GROQ_API_KEY configurada."),
    provider: provider.name,
    model: provider.model,
    generatedAt: new Date().toISOString(),
    durationMs: 0,
    expiresAt: new Date().toISOString(),
    contextHash,
    fromCache: false,
    disabled: true,
    request: {
      year: input.year,
      month: input.month,
      analysisType: input.analysisType,
      categoryId: input.categoryId ?? null
    }
  };
}

function compactChatHistory(messages: AiChatMessageRecord[]): AiMessage[] {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-chatHistoryMessageLimit)
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: compactText(message.content, chatHistoryMessageMaxCharacters)
    }));
}

async function repairAnalysisJson(raw: string, provider: ReturnType<typeof getAiProvider>) {
  const repair = await provider.generateAnalysis({
    json: true,
    temperature: 0,
    maxTokens: 1000,
    messages: [
      {
        role: "system",
        content:
          "Converta o texto recebido em JSON valido exatamente no schema pedido. Responda somente com JSON valido, sem markdown."
      },
      { role: "user", content: raw }
    ]
  });
  return parseAiAnalysisStrict(repair.content);
}

async function repairProjectionJson(raw: string, provider: ReturnType<typeof getAiProvider>) {
  const repair = await provider.generateProjection({
    json: true,
    temperature: 0,
    maxTokens: 900,
    messages: [
      {
        role: "system",
        content:
          "Converta o texto recebido em JSON valido exatamente no schema pedido. Responda somente com JSON valido, sem markdown."
      },
      { role: "user", content: raw }
    ]
  });
  return parseAiProjectionExplanationStrict(repair.content);
}

async function repairChatJson(raw: string, provider: ReturnType<typeof getAiProvider>) {
  const repair = await provider.chat({
    json: true,
    temperature: 0,
    maxTokens: 900,
    messages: [
      {
        role: "system",
        content: "Converta o texto recebido em JSON valido no schema de chat estruturado. Responda somente JSON, sem markdown."
      },
      { role: "user", content: raw }
    ]
  });
  return parseAiChatStructuredResponseStrict(repair.content);
}

export async function checkAiHealth() {
  const provider = getAiProvider();
  const health = await provider.checkHealth();
  return {
    ...health,
    limits: {
      maxRequestsPerHour: env.aiMaxRequestsPerHour,
      chatMaxMessages: env.aiChatMaxMessages,
      chatMaxContextTokens: env.aiChatMaxContextTokens,
      effectiveContextTokens: Math.min(env.aiChatMaxContextTokens, maxAiContextTokenBudget),
      analysisCacheMinutes: env.aiAnalysisCacheMinutes
    }
  };
}

export async function generateFinancialAiAnalysis(input: AiAnalysisRequest) {
  const context = await buildFinancialAnalysisContext(input);
  const contextHash = buildContextHash(context);
  const provider = getAiProvider();

  if (!input.forceRefresh) {
    const cached = await findCachedAiAnalysis({
      year: input.year,
      month: input.month,
      analysisType: input.analysisType,
      categoryId: input.categoryId ?? null,
      contextHash
    });
    if (cached) {
      return {
        analysis: cached.response,
        provider: cached.provider,
        model: cached.model,
        generatedAt: cached.generatedAt,
        durationMs: cached.durationMs,
        expiresAt: cached.expiresAt,
        contextHash,
        fromCache: true,
        disabled: false,
        request: {
          year: input.year,
          month: input.month,
          analysisType: input.analysisType,
          categoryId: input.categoryId ?? null
        }
      };
    }
  }

  if (provider.name === "disabled") {
    return buildDisabledAnalysis(provider, input, contextHash);
  }

  const rateLimit = checkAiRateLimit("analysis");
  if (!rateLimit.allowed) throw new HttpError(429, `Limite de IA atingido. Tente novamente apos ${rateLimit.retryAt}.`);

  try {
    const result = await provider.generateAnalysis({
      json: true,
      temperature: 0.2,
      maxTokens: 1600,
      messages: [
        { role: "system", content: buildAnalysisSystemPrompt(input.analysisType) },
        { role: "user", content: buildAnalysisUserPrompt(stringifyContextForAi(context, analysisContextTokenBudget)) }
      ]
    });

    let analysis = createFallbackAnalysis();
    try {
      analysis = parseAiAnalysisStrict(result.content);
    } catch {
      try {
        analysis = await repairAnalysisJson(result.content, provider);
      } catch {
        analysis = createFallbackAnalysis();
      }
    }

    const generatedAt = new Date();
    const saved = await saveAiAnalysis({
      year: input.year,
      month: input.month,
      analysisType: input.analysisType,
      categoryId: input.categoryId ?? null,
      provider: result.provider,
      model: result.model,
      contextHash,
      response: analysis,
      generatedAt,
      durationMs: result.durationMs,
      expiresAt: cacheExpiry()
    });

    return {
      analysis: saved.response,
      provider: saved.provider,
      model: saved.model,
      generatedAt: saved.generatedAt,
      durationMs: saved.durationMs,
      expiresAt: saved.expiresAt,
      contextHash,
      fromCache: false,
      disabled: false,
      request: {
        year: input.year,
        month: input.month,
        analysisType: input.analysisType,
        categoryId: input.categoryId ?? null
      }
    };
  } catch (error) {
    return {
      ...buildDisabledAnalysis(provider, input, contextHash),
      disabled: false,
      error: error instanceof Error ? error.message : "Falha ao gerar analise."
    };
  }
}

export async function getFinancialAiAnalysisHistory(limit = 20) {
  return listAiAnalyses(limit);
}

export async function explainProjectionWithAi(input: { input?: Record<string, unknown>; projection: Record<string, unknown> }) {
  const provider = getAiProvider();
  const context = {
    input: input.input ?? {},
    projection: input.projection
  };

  if (provider.name === "disabled") {
    return {
      explanation: createFallbackProjectionExplanation("Assistente de IA desativado ou sem GROQ_API_KEY configurada."),
      provider: provider.name,
      model: provider.model,
      generatedAt: new Date().toISOString(),
      durationMs: 0,
      disabled: true
    };
  }

  const rateLimit = checkAiRateLimit("projection");
  if (!rateLimit.allowed) throw new HttpError(429, `Limite de IA atingido. Tente novamente apos ${rateLimit.retryAt}.`);

  try {
    const result = await provider.generateProjection({
      json: true,
      temperature: 0.2,
      maxTokens: 1100,
      messages: [
        { role: "system", content: projectionSystemPrompt },
        { role: "user", content: buildProjectionUserPrompt(stringifyContextForAi(context, projectionContextTokenBudget)) }
      ]
    });

    let explanation: AiProjectionExplanation;
    try {
      explanation = parseAiProjectionExplanationStrict(result.content);
    } catch {
      try {
        explanation = await repairProjectionJson(result.content, provider);
      } catch {
        explanation = createFallbackProjectionExplanation();
      }
    }

    return {
      explanation,
      provider: result.provider,
      model: result.model,
      generatedAt: new Date().toISOString(),
      durationMs: result.durationMs,
      disabled: false
    };
  } catch (error) {
    return {
      explanation: createFallbackProjectionExplanation(error instanceof Error ? error.message : "Falha ao explicar projecao."),
      provider: provider.name,
      model: provider.model,
      generatedAt: new Date().toISOString(),
      durationMs: 0,
      disabled: false
    };
  }
}

export async function createChatSession(title?: string) {
  return createAiChatSession(title?.trim() || "Nova conversa");
}

export async function listChatSessions() {
  return listAiChatSessions();
}

export async function getChatSession(sessionId: string) {
  const session = await findAiChatSessionById(sessionId);
  if (!session) throw notFound("Conversa de IA nao encontrada.");
  const messages = await listAiChatMessages(sessionId);
  return { session, messages };
}

export async function deleteChatSession(sessionId: string) {
  const deleted = await deleteAiChatSession(sessionId);
  if (!deleted) throw notFound("Conversa de IA nao encontrada.");
}

function buildSessionTitle(message: string) {
  const compact = message.replace(/\s+/g, " ").trim();
  return compact.length > 54 ? `${compact.slice(0, 54)}...` : compact || "Nova conversa";
}

export async function sendChatMessage(sessionId: string, content: string) {
  const session = await findAiChatSessionById(sessionId);
  if (!session) throw notFound("Conversa de IA nao encontrada.");

  const existingMessages = await listAiChatMessages(sessionId);
  const activePendingAction = await findActiveAiPendingAction(sessionId);
  if (!activePendingAction && existingMessages.filter((message) => message.role === "user").length >= env.aiChatMaxMessages) {
    throw badRequest(`Esta conversa atingiu o limite de ${env.aiChatMaxMessages} mensagens. Crie uma nova conversa.`);
  }

  const userMessage = await addAiChatMessage({ sessionId, role: "user", content });
  const operational = await handleOperationalChatMessage({ sessionId, message: content, messageId: userMessage.id });
  if (operational.handled) {
    const assistantMessage = await addAiChatMessage({
      sessionId,
      role: "assistant",
      content: operational.response.message,
      structuredResponse: operational.response,
      intent: operational.response.pendingAction?.actionType ?? "operation",
      provider: "internal-tools",
      model: "deterministic",
      durationMs: 0
    });
    await updateAiChatSession(sessionId, { title: session.title === "Nova conversa" ? buildSessionTitle(content) : session.title, updatedAt: new Date() });
    return {
      userMessage,
      assistantMessage,
      intent: assistantMessage.intent ?? "operation"
    };
  }

  const provider = getAiProvider();
  const { intent, context } = await buildConversationContext(content);

  let assistantMessage: AiChatMessageRecord;

  if (provider.name === "disabled") {
    const structuredResponse = createTextResponse("Assistente de IA desativado ou sem GROQ_API_KEY configurada.");
    assistantMessage = await addAiChatMessage({
      sessionId,
      role: "assistant",
      content: structuredResponse.message,
      structuredResponse,
      intent,
      provider: provider.name,
      model: provider.model,
      durationMs: 0
    });
  } else {
    const rateLimit = checkAiRateLimit("chat");
    if (!rateLimit.allowed) throw new HttpError(429, `Limite de IA atingido. Tente novamente apos ${rateLimit.retryAt}.`);

    try {
      const result = await provider.chat({
        json: true,
        temperature: 0.25,
        maxTokens: 1200,
        messages: [
          { role: "system", content: chatSystemPrompt },
          ...compactChatHistory(existingMessages),
          { role: "user", content: buildChatUserPrompt(stringifyContextForAi(context, chatContextTokenBudget), content) }
        ]
      });
      let structuredResponse = createStructuredResponse({
        message: result.content || "Nao consegui gerar uma resposta agora.",
        responseType: "text",
        metadata: { provider: result.provider, model: result.model, generatedAt: new Date().toISOString() }
      });
      try {
        structuredResponse = parseAiChatStructuredResponseStrict(result.content);
      } catch {
        try {
          structuredResponse = await repairChatJson(result.content, provider);
        } catch {
          structuredResponse = createStructuredResponse({
            message: result.content || "Nao consegui gerar uma resposta estruturada agora.",
            responseType: "text",
            metadata: { provider: result.provider, model: result.model, generatedAt: new Date().toISOString() }
          });
        }
      }
      structuredResponse = {
        ...structuredResponse,
        metadata: { provider: result.provider, model: result.model, generatedAt: new Date().toISOString(), ...structuredResponse.metadata }
      };

      assistantMessage = await addAiChatMessage({
        sessionId,
        role: "assistant",
        content: structuredResponse.message,
        structuredResponse,
        intent,
        provider: result.provider,
        model: result.model,
        durationMs: result.durationMs
      });
    } catch (error) {
      const structuredResponse = createErrorResponse(error instanceof Error ? `Nao consegui consultar a IA agora: ${error.message}` : "Nao consegui consultar a IA agora.");
      assistantMessage = await addAiChatMessage({
        sessionId,
        role: "assistant",
        content: structuredResponse.message,
        structuredResponse,
        intent,
        provider: provider.name,
        model: provider.model,
        durationMs: 0
      });
    }
  }

  await updateAiChatSession(sessionId, { title: session.title === "Nova conversa" ? buildSessionTitle(content) : session.title, updatedAt: new Date() });
  return {
    userMessage,
    assistantMessage,
    intent
  };
}
