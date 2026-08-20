import type { AuthRole } from "../auth/auth-context";
import { runWithAuthContext } from "../auth/auth-context";
import type { AiChatMessageRecord } from "../ai/schemas/ai.schema";
import { findAiChatMessageByExternalMessageId, findAiChatSessionByExternalConversationId } from "../repositories/ai.repository";
import { badRequest, HttpError } from "../utils/http-error";
import { createChatSession, sendChatMessage } from "./ai-manager.service";

export interface AssistantCommandInput {
  userId: string;
  userRole?: AuthRole;
  userEmail?: string;
  channel: "web" | "whatsapp";
  message: string;
  externalConversationId?: string;
  externalMessageId?: string;
}

export interface AssistantCommandResult {
  status: "processed" | "duplicate";
  sessionId: string;
  userMessage?: AiChatMessageRecord;
  assistantMessage?: AiChatMessageRecord;
  intent?: string;
}

function compactSessionTitle(message: string) {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized) return "Conversa externa";
  return normalized.length > 54 ? `${normalized.slice(0, 54)}...` : normalized;
}

function validateAssistantCommandInput(input: AssistantCommandInput) {
  if (!input.userId?.trim()) throw new HttpError(401, "Usuario nao identificado para o comando.");
  if (!input.message?.trim()) throw badRequest("Mensagem vazia.");

  if (input.channel === "whatsapp") {
    if (!input.externalConversationId?.trim()) throw badRequest("Conversa externa do WhatsApp ausente.");
    if (!input.externalMessageId?.trim()) throw badRequest("Mensagem externa do WhatsApp ausente.");
  }
}

export async function handleAssistantCommand(input: AssistantCommandInput): Promise<AssistantCommandResult> {
  validateAssistantCommandInput(input);

  return runWithAuthContext(
    {
      userId: input.userId,
      role: input.userRole ?? "user",
      email: input.userEmail,
      channel: input.channel
    },
    async () => {
      if (input.externalMessageId) {
        const existingMessage = await findAiChatMessageByExternalMessageId(input.channel, input.externalMessageId);
        if (existingMessage) {
          return {
            status: "duplicate",
            sessionId: existingMessage.sessionId,
            userMessage: existingMessage
          };
        }
      }

      const existingSession = input.externalConversationId
        ? await findAiChatSessionByExternalConversationId(input.channel, input.externalConversationId)
        : null;
      const session =
        existingSession ??
        (await createChatSession(compactSessionTitle(input.message), {
          externalConversationId: input.externalConversationId
        }));

      if (!session.id) throw new HttpError(500, "Conversa de IA sem identificador.");

      const result = await sendChatMessage(session.id, input.message, {
        externalMessageId: input.externalMessageId
      });

      return {
        status: "processed",
        sessionId: session.id,
        userMessage: result.userMessage,
        assistantMessage: result.assistantMessage,
        intent: result.intent
      };
    }
  );
}
