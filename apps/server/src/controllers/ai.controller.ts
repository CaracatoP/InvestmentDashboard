import { z } from "zod";
import { aiAnalysisRequestSchema, aiChatMessageCreateSchema, aiChatSessionCreateSchema, aiProjectionExplainSchema } from "../ai/schemas/ai.schema";
import {
  checkAiHealth,
  createChatSession,
  deleteChatSession,
  explainProjectionWithAi,
  generateFinancialAiAnalysis,
  getChatSession,
  getFinancialAiAnalysisHistory,
  listChatSessions,
  sendChatMessage
} from "../services/ai-manager.service";
import { created, noContent, ok } from "../utils/api-response";
import { asyncHandler } from "../utils/async-handler";

export const showAiHealth = asyncHandler(async (_request, response) => {
  ok(response, await checkAiHealth());
});

export const createAiAnalysis = asyncHandler(async (request, response) => {
  const input = aiAnalysisRequestSchema.parse(request.body);
  ok(response, await generateFinancialAiAnalysis(input));
});

export const listAiAnalysisHistory = asyncHandler(async (request, response) => {
  const query = z.object({ limit: z.coerce.number().int().min(1).max(100).optional().default(20) }).parse(request.query);
  ok(response, await getFinancialAiAnalysisHistory(query.limit));
});

export const explainAiProjection = asyncHandler(async (request, response) => {
  const input = aiProjectionExplainSchema.parse(request.body);
  ok(response, await explainProjectionWithAi(input));
});

export const createAiChatSession = asyncHandler(async (request, response) => {
  const input = aiChatSessionCreateSchema.parse(request.body);
  created(response, await createChatSession(input.title));
});

export const listAiChatSessionRecords = asyncHandler(async (_request, response) => {
  ok(response, await listChatSessions());
});

export const showAiChatSession = asyncHandler(async (request, response) => {
  ok(response, await getChatSession(String(request.params.sessionId)));
});

export const deleteAiChatSessionRecord = asyncHandler(async (request, response) => {
  await deleteChatSession(String(request.params.sessionId));
  noContent(response);
});

export const createAiChatMessage = asyncHandler(async (request, response) => {
  const input = aiChatMessageCreateSchema.parse(request.body);
  ok(response, await sendChatMessage(String(request.params.sessionId), input.message));
});
