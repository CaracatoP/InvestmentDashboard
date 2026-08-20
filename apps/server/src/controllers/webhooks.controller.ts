import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env";
import { handleAssistantCommand } from "../services/assistant-command.service";
import { getMessagingProvider } from "../services/messaging-provider.service";
import { formatWhatsAppAssistantResponse } from "../services/whatsapp-response-formatter.service";
import {
  beginWhatsAppWebhookEvent,
  completeWhatsAppWebhookEvent,
  findVerifiedWhatsAppUserByPhoneNumber,
  verifyWhatsAppConnectionCode
} from "../services/whatsapp-link.service";
import { asyncHandler } from "../utils/async-handler";
import { HttpError } from "../utils/http-error";

interface MetaTextMessage {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: {
    body?: string;
  };
}

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: MetaTextMessage[];
        statuses?: unknown[];
      };
    }>;
  }>;
}

const connectionCodePattern = /^IH-[0-9A-F]{12}$/i;

function ensureWhatsAppConfiguredForWebhook() {
  if (!env.whatsappVerifyToken || !env.whatsappAppSecret || !env.whatsappPhoneNumberId || !env.whatsappAccessToken) {
    throw new HttpError(503, "WhatsApp Cloud API nao configurado.");
  }
}

function verifyMetaSignature(rawBody: Buffer | undefined, signatureHeader: unknown) {
  if (!env.whatsappAppSecret) throw new HttpError(503, "WHATSAPP_APP_SECRET nao configurado.");
  if (!rawBody || rawBody.length === 0) throw new HttpError(400, "Payload bruto ausente para validar assinatura.");
  if (typeof signatureHeader !== "string" || !signatureHeader.startsWith("sha256=")) {
    throw new HttpError(401, "Assinatura Meta ausente.");
  }

  const receivedSignature = Buffer.from(signatureHeader.slice("sha256=".length), "hex");
  const expectedSignature = Buffer.from(createHmac("sha256", env.whatsappAppSecret).update(rawBody).digest("hex"), "hex");

  if (receivedSignature.length !== expectedSignature.length || !timingSafeEqual(receivedSignature, expectedSignature)) {
    throw new HttpError(401, "Assinatura Meta invalida.");
  }
}

function extractTextMessages(payload: MetaWebhookPayload) {
  const messages: Array<{ id: string; from: string; text: string }> = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (message.type !== "text") continue;
        const id = message.id?.trim();
        const from = message.from?.trim();
        const text = message.text?.body?.trim();
        if (!id || !from || !text) continue;
        messages.push({ id, from, text });
      }
    }
  }

  return messages;
}

async function safeSendText(to: string, text: string) {
  try {
    await getMessagingProvider().sendText({ to, text });
  } catch (error) {
    console.warn(
      JSON.stringify({
        operation: "whatsapp-send-failed",
        statusCode: error instanceof HttpError ? error.statusCode : undefined,
        message: error instanceof Error ? error.message : "Falha ao enviar resposta WhatsApp"
      })
    );
  }
}

async function processConnectionCode(message: { id: string; from: string; text: string }) {
  try {
    const result = await verifyWhatsAppConnectionCode({
      phoneNumber: message.from,
      code: message.text,
      externalMessageId: message.id
    });
    if (!result.duplicated) {
      await safeSendText(message.from, "✅ WhatsApp conectado ao Invest Hub. Agora voce pode enviar comandos financeiros por aqui.");
    }
    return { processed: result.duplicated ? 0 : 1, ignored: result.duplicated ? 1 : 0 };
  } catch (error) {
    if (error instanceof HttpError) {
      await completeWhatsAppWebhookEvent({ externalMessageId: message.id, status: "failed" });
      await safeSendText(message.from, "Nao consegui vincular esse codigo. Abra Configuracoes → WhatsApp e gere um novo codigo.");
      return { processed: 0, ignored: 1 };
    }
    throw error;
  }
}

async function processAssistantMessage(message: { id: string; from: string; text: string }) {
  const event = await beginWhatsAppWebhookEvent({ externalMessageId: message.id });
  if (event.duplicate) return { processed: 0, ignored: 1 };

  const user = await findVerifiedWhatsAppUserByPhoneNumber(message.from);
  if (!user) {
    await completeWhatsAppWebhookEvent({ externalMessageId: message.id, status: "ignored" });
    await safeSendText(message.from, "Seu WhatsApp ainda nao esta conectado ao Invest Hub. Abra Configuracoes → WhatsApp e faca a vinculacao.");
    return { processed: 0, ignored: 1 };
  }

  try {
    const result = await handleAssistantCommand({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      channel: "whatsapp",
      externalConversationId: message.from,
      externalMessageId: message.id,
      message: message.text
    });
    await completeWhatsAppWebhookEvent({ externalMessageId: message.id, status: "processed", userId: user.id });
    if (result.status !== "duplicate") await safeSendText(message.from, formatWhatsAppAssistantResponse(result.assistantMessage));
    return { processed: result.status === "duplicate" ? 0 : 1, ignored: result.status === "duplicate" ? 1 : 0 };
  } catch (error) {
    await completeWhatsAppWebhookEvent({ externalMessageId: message.id, status: "failed", userId: user.id });
    await safeSendText(message.from, "Nao consegui processar sua mensagem com seguranca. Tente novamente com mais detalhes.");
    return { processed: 0, ignored: 1 };
  }
}

export const getWhatsAppWebhook = asyncHandler(async (request, response) => {
  if (!env.whatsappEnabled) {
    throw new HttpError(404, "WhatsApp webhook desabilitado.");
  }

  const mode = request.query["hub.mode"];
  const token = request.query["hub.verify_token"];
  const challenge = request.query["hub.challenge"];

  if (mode !== "subscribe" || token !== env.whatsappVerifyToken || typeof challenge !== "string") {
    throw new HttpError(403, "Webhook nao verificado.");
  }

  response.status(200).send(challenge);
});

export const postWhatsAppWebhook = asyncHandler(async (request, response) => {
  if (!env.whatsappEnabled) {
    throw new HttpError(404, "WhatsApp webhook desabilitado.");
  }
  ensureWhatsAppConfiguredForWebhook();
  verifyMetaSignature(request.rawBody, request.header("x-hub-signature-256"));

  const messages = extractTextMessages(request.body as MetaWebhookPayload);
  let processed = 0;
  let ignored = 0;

  for (const message of messages) {
    const result = connectionCodePattern.test(message.text)
      ? await processConnectionCode(message)
      : await processAssistantMessage(message);
    processed += result.processed;
    ignored += result.ignored;
  }

  response.status(200).json({ success: true, data: { received: true, processed, ignored } });
});
