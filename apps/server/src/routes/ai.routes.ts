import { Router } from "express";
import {
  createAiAnalysis,
  createAiChatMessage,
  createAiChatSession,
  deleteAiChatSessionRecord,
  explainAiProjection,
  listAiAnalysisHistory,
  listAiChatSessionRecords,
  showAiChatSession,
  showAiHealth
} from "../controllers/ai.controller";

export const aiRoutes = Router();

aiRoutes.get("/health", showAiHealth);
aiRoutes.post("/analyses", createAiAnalysis);
aiRoutes.get("/analyses", listAiAnalysisHistory);
aiRoutes.post("/projections/explain", explainAiProjection);
aiRoutes.post("/chat/sessions", createAiChatSession);
aiRoutes.get("/chat/sessions", listAiChatSessionRecords);
aiRoutes.get("/chat/sessions/:sessionId", showAiChatSession);
aiRoutes.delete("/chat/sessions/:sessionId", deleteAiChatSessionRecord);
aiRoutes.post("/chat/sessions/:sessionId/messages", createAiChatMessage);
