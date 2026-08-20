import { randomUUID } from "crypto";
import { getCurrentChannel, getCurrentUserId, SYSTEM_USER_ID } from "../auth/auth-context";
import { isDatabaseConnected } from "../config/database";
import { AiChatMessageModel } from "../models/ai-chat-message.model";
import { AiChatSessionModel } from "../models/ai-chat-session.model";
import { AiActionAuditModel } from "../models/ai-action-audit.model";
import { AiPendingActionModel } from "../models/ai-pending-action.model";
import { FinancialAiAnalysisModel } from "../models/financial-ai-analysis.model";
import type {
  AiActionAuditRecord,
  AiAnalysisType,
  AiChatMessageRecord,
  AiChatSessionRecord,
  AiPendingActionRecord,
  AiPendingActionStatus,
  AiStoredAnalysis
} from "../ai/schemas/ai.schema";

let localAnalyses: AiStoredAnalysis[] = [];
let localChatSessions: AiChatSessionRecord[] = [];
let localChatMessages: AiChatMessageRecord[] = [];
let localPendingActions: AiPendingActionRecord[] = [];
let localActionAudits: AiActionAuditRecord[] = [];
const emptyMongoOwnerId = "000000000000000000000000";

function currentOwnerId() {
  const userId = getCurrentUserId();
  return isDatabaseConnected() && userId === SYSTEM_USER_ID ? emptyMongoOwnerId : userId;
}

function currentAssistantChannel(): "web" | "whatsapp" {
  const channel = getCurrentChannel("web");
  return channel === "whatsapp" ? "whatsapp" : "web";
}

function ownerFilter<T extends object>(filter: T = {} as T) {
  return { ...filter, userId: currentOwnerId() };
}

function withOwner<T extends object>(input: T) {
  return { ...input, userId: currentOwnerId() };
}

function withAssistantContext<T extends object>(input: T) {
  return { ...withOwner(input), channel: currentAssistantChannel() };
}

function isOwned(record: { userId?: string }) {
  return (record.userId ?? SYSTEM_USER_ID) === currentOwnerId();
}

function withId(record: unknown) {
  const plain = record as Record<string, unknown> & { _id?: { toString: () => string } };
  return {
    ...plain,
    id: plain._id?.toString()
  };
}

function normalizeAnalysis(record: unknown): AiStoredAnalysis {
  const plain = withId(record) as AiStoredAnalysis;
  return {
    ...plain,
    categoryId: plain.categoryId ?? null
  };
}

export async function findCachedAiAnalysis(input: {
  year: number;
  month: number;
  analysisType: AiAnalysisType;
  categoryId?: string | null;
  contextHash: string;
}): Promise<AiStoredAnalysis | null> {
  const query = {
    userId: currentOwnerId(),
    year: input.year,
    month: input.month,
    analysisType: input.analysisType,
    categoryId: input.categoryId ?? null,
    contextHash: input.contextHash
  };

  if (isDatabaseConnected()) {
    const analysis = await FinancialAiAnalysisModel.findOne({ ...query, expiresAt: { $gt: new Date() } }).sort({ generatedAt: -1 }).lean();
    return analysis ? normalizeAnalysis(analysis) : null;
  }

  const now = Date.now();
  return (
    localAnalyses
      .filter(
        (analysis) =>
          analysis.year === query.year &&
          isOwned(analysis) &&
          analysis.month === query.month &&
          analysis.analysisType === query.analysisType &&
          (analysis.categoryId ?? null) === query.categoryId &&
          analysis.contextHash === query.contextHash &&
          new Date(analysis.expiresAt).getTime() > now
      )
      .sort((left, right) => new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime())[0] ?? null
  );
}

export async function saveAiAnalysis(input: Omit<AiStoredAnalysis, "id" | "createdAt" | "updatedAt">): Promise<AiStoredAnalysis> {
  if (isDatabaseConnected()) {
    const analysis = await FinancialAiAnalysisModel.create(withOwner(input)).then((record) => record.toObject());
    return normalizeAnalysis(analysis);
  }

  const timestamp = new Date();
  const analysis = {
    ...input,
    userId: currentOwnerId(),
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp
  };
  localAnalyses = [analysis, ...localAnalyses].slice(0, 100);
  return analysis;
}

export async function listAiAnalyses(limit = 20): Promise<AiStoredAnalysis[]> {
  if (isDatabaseConnected()) {
    const analyses = await FinancialAiAnalysisModel.find(ownerFilter()).sort({ generatedAt: -1 }).limit(limit).lean();
    return analyses.map(normalizeAnalysis);
  }

  return localAnalyses.filter(isOwned).sort((left, right) => new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime()).slice(0, limit);
}

export async function createAiChatSession(title: string, options: { externalConversationId?: string } = {}): Promise<AiChatSessionRecord> {
  const now = new Date();
  const input = withAssistantContext({ title, externalConversationId: options.externalConversationId ?? "", createdAt: now, updatedAt: now });

  if (isDatabaseConnected()) {
    const session = await AiChatSessionModel.create(input).then((record) => record.toObject());
    return withId(session) as unknown as AiChatSessionRecord;
  }

  const session = { ...input, id: randomUUID() };
  localChatSessions = [session, ...localChatSessions];
  return session;
}

export async function listAiChatSessions(): Promise<AiChatSessionRecord[]> {
  if (isDatabaseConnected()) {
    const sessions = await AiChatSessionModel.find(ownerFilter()).sort({ updatedAt: -1 }).lean();
    return sessions.map((session) => withId(session)) as unknown as AiChatSessionRecord[];
  }

  return localChatSessions.filter(isOwned).sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

export async function findAiChatSessionById(id: string): Promise<AiChatSessionRecord | null> {
  if (isDatabaseConnected()) {
    const session = await AiChatSessionModel.findOne(ownerFilter({ _id: id })).lean();
    return session ? (withId(session) as unknown as AiChatSessionRecord) : null;
  }

  return localChatSessions.find((session) => isOwned(session) && session.id === id) ?? null;
}

export async function findAiChatSessionByExternalConversationId(channel: "web" | "whatsapp", externalConversationId: string): Promise<AiChatSessionRecord | null> {
  const normalizedExternalConversationId = externalConversationId.trim();
  if (!normalizedExternalConversationId) return null;

  if (isDatabaseConnected()) {
    const session = await AiChatSessionModel.findOne(ownerFilter({ channel, externalConversationId: normalizedExternalConversationId }))
      .sort({ updatedAt: -1 })
      .lean();
    return session ? (withId(session) as unknown as AiChatSessionRecord) : null;
  }

  return (
    localChatSessions
      .filter(isOwned)
      .filter((session) => session.channel === channel && session.externalConversationId === normalizedExternalConversationId)
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0] ?? null
  );
}

export async function updateAiChatSession(id: string, input: Partial<Omit<AiChatSessionRecord, "id">>): Promise<AiChatSessionRecord | null> {
  if (isDatabaseConnected()) {
    const session = await AiChatSessionModel.findOneAndUpdate(ownerFilter({ _id: id }), input, { new: true }).lean();
    return session ? (withId(session) as unknown as AiChatSessionRecord) : null;
  }

  const index = localChatSessions.findIndex((session) => isOwned(session) && session.id === id);
  if (index < 0) return null;
  localChatSessions[index] = { ...localChatSessions[index], ...input };
  return localChatSessions[index];
}

export async function deleteAiChatSession(id: string): Promise<boolean> {
  if (isDatabaseConnected()) {
    const deleted = await AiChatSessionModel.findOneAndDelete(ownerFilter({ _id: id }));
    await AiChatMessageModel.deleteMany(ownerFilter({ sessionId: id }));
    return Boolean(deleted);
  }

  const before = localChatSessions.length;
  localChatSessions = localChatSessions.filter((session) => !(isOwned(session) && session.id === id));
  localChatMessages = localChatMessages.filter((message) => !(isOwned(message) && message.sessionId === id));
  return localChatSessions.length < before;
}

export async function addAiChatMessage(input: Omit<AiChatMessageRecord, "id" | "createdAt"> & { createdAt?: string | Date }): Promise<AiChatMessageRecord> {
  const messageInput = withAssistantContext({ ...input, createdAt: input.createdAt ?? new Date() });

  if (isDatabaseConnected()) {
    const message = await AiChatMessageModel.create(messageInput).then((record) => record.toObject());
    return withId(message) as unknown as AiChatMessageRecord;
  }

  const message = { ...messageInput, id: randomUUID() };
  localChatMessages = [...localChatMessages, message];
  return message;
}

export async function findAiChatMessageByExternalMessageId(channel: "web" | "whatsapp", externalMessageId: string): Promise<AiChatMessageRecord | null> {
  const normalizedExternalMessageId = externalMessageId.trim();
  if (!normalizedExternalMessageId) return null;

  if (isDatabaseConnected()) {
    const message = await AiChatMessageModel.findOne(ownerFilter({ channel, externalMessageId: normalizedExternalMessageId })).lean();
    return message ? (withId(message) as unknown as AiChatMessageRecord) : null;
  }

  return localChatMessages.find((message) => isOwned(message) && message.channel === channel && message.externalMessageId === normalizedExternalMessageId) ?? null;
}

export async function listAiChatMessages(sessionId: string, limit?: number): Promise<AiChatMessageRecord[]> {
  if (isDatabaseConnected()) {
    const query = AiChatMessageModel.find(ownerFilter({ sessionId })).sort({ createdAt: 1 });
    if (limit) query.limit(limit);
    const messages = await query.lean();
    return messages.map((message) => withId(message)) as unknown as AiChatMessageRecord[];
  }

  const messages = localChatMessages
    .filter((message) => message.sessionId === sessionId)
    .filter(isOwned)
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  return limit ? messages.slice(-limit) : messages;
}

export async function createAiPendingAction(input: Omit<AiPendingActionRecord, "id" | "createdAt" | "updatedAt">): Promise<AiPendingActionRecord> {
  const now = new Date();
  const payload = withAssistantContext({ ...input, createdAt: now, updatedAt: now });

  if (isDatabaseConnected()) {
    const action = await AiPendingActionModel.create(payload).then((record) => record.toObject());
    return withId(action) as unknown as AiPendingActionRecord;
  }

  const action = { ...payload, id: randomUUID() };
  localPendingActions = [action, ...localPendingActions];
  return action;
}

export async function findAiPendingActionById(id: string): Promise<AiPendingActionRecord | null> {
  if (isDatabaseConnected()) {
    const action = await AiPendingActionModel.findOne(ownerFilter({ _id: id })).lean();
    return action ? (withId(action) as unknown as AiPendingActionRecord) : null;
  }

  return localPendingActions.find((action) => isOwned(action) && action.id === id) ?? null;
}

export async function findActiveAiPendingAction(sessionId: string): Promise<AiPendingActionRecord | null> {
  const activeStatuses: AiPendingActionStatus[] = ["collecting", "awaiting_confirmation"];
  const now = new Date();

  if (isDatabaseConnected()) {
    const action = await AiPendingActionModel.findOne({
      userId: currentOwnerId(),
      sessionId,
      status: { $in: activeStatuses },
      expiresAt: { $gt: now }
    }).sort({ createdAt: -1 }).lean();
    return action ? (withId(action) as unknown as AiPendingActionRecord) : null;
  }

  return (
    localPendingActions
      .filter((action) => isOwned(action) && action.sessionId === sessionId && activeStatuses.includes(action.status) && new Date(action.expiresAt).getTime() > now.getTime())
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0] ?? null
  );
}

export async function findExecutedAiPendingActionByIdempotencyKey(idempotencyKey: string): Promise<AiPendingActionRecord | null> {
  if (isDatabaseConnected()) {
    const action = await AiPendingActionModel.findOne(ownerFilter({ idempotencyKey, status: "executed" })).lean();
    return action ? (withId(action) as unknown as AiPendingActionRecord) : null;
  }

  return localPendingActions.find((action) => isOwned(action) && action.idempotencyKey === idempotencyKey && action.status === "executed") ?? null;
}

export async function updateAiPendingAction(id: string, input: Partial<Omit<AiPendingActionRecord, "id" | "createdAt">>): Promise<AiPendingActionRecord | null> {
  const payload = { ...input, updatedAt: new Date() };

  if (isDatabaseConnected()) {
    const action = await AiPendingActionModel.findOneAndUpdate(ownerFilter({ _id: id }), payload, { new: true }).lean();
    return action ? (withId(action) as unknown as AiPendingActionRecord) : null;
  }

  const index = localPendingActions.findIndex((action) => isOwned(action) && action.id === id);
  if (index < 0) return null;
  localPendingActions[index] = { ...localPendingActions[index], ...payload };
  return localPendingActions[index];
}

export async function appendAiActionAudit(input: Omit<AiActionAuditRecord, "id" | "createdAt"> & { createdAt?: string | Date }): Promise<AiActionAuditRecord> {
  const payload = withAssistantContext({ ...input, createdAt: input.createdAt ?? new Date() });

  if (isDatabaseConnected()) {
    const audit = await AiActionAuditModel.create(payload).then((record) => record.toObject());
    return withId(audit) as unknown as AiActionAuditRecord;
  }

  const audit = { ...payload, id: randomUUID() };
  localActionAudits = [audit, ...localActionAudits].slice(0, 500);
  return audit;
}
