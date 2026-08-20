import { env } from "../config/env";
import { HttpError } from "../utils/http-error";

export interface MessagingProvider {
  sendText(input: { to: string; text: string }): Promise<{ sent: boolean; providerMessageId?: string }>;
  sendInteractiveMessage(input: {
    to: string;
    text: string;
    actions: Array<{ id: string; label: string }>;
  }): Promise<{ sent: boolean; providerMessageId?: string }>;
}

class DisabledMessagingProvider implements MessagingProvider {
  async sendText(): Promise<{ sent: boolean; providerMessageId?: string }> {
    throw new HttpError(503, "Provider de mensageria desabilitado.");
  }

  async sendInteractiveMessage(): Promise<{ sent: boolean; providerMessageId?: string }> {
    throw new HttpError(503, "Provider de mensageria desabilitado.");
  }
}

class MetaWhatsAppProvider implements MessagingProvider {
  private endpoint() {
    const version = env.whatsappGraphApiVersion.replace(/^\/+|\/+$/g, "");
    return `https://graph.facebook.com/${version}/${env.whatsappPhoneNumberId}/messages`;
  }

  private assertConfigured() {
    if (!env.whatsappPhoneNumberId || !env.whatsappAccessToken) {
      throw new HttpError(503, "Provider Meta WhatsApp sem WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_ACCESS_TOKEN.");
    }
  }

  private async sendPayload(payload: Record<string, unknown>): Promise<{ sent: boolean; providerMessageId?: string }> {
    this.assertConfigured();
    const response = await fetch(this.endpoint(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.whatsappAccessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload })
    });

    const body = await response.json().catch(() => ({})) as { messages?: Array<{ id?: string }>; error?: { message?: string; code?: number } };
    if (!response.ok) {
      throw new HttpError(response.status, body.error?.message || "Falha ao enviar mensagem pelo WhatsApp Cloud API.");
    }

    return { sent: true, providerMessageId: body.messages?.[0]?.id };
  }

  async sendText(input: { to: string; text: string }): Promise<{ sent: boolean; providerMessageId?: string }> {
    return this.sendPayload({
      to: input.to,
      type: "text",
      text: {
        preview_url: false,
        body: input.text.slice(0, 4096)
      }
    });
  }

  async sendInteractiveMessage(input: {
    to: string;
    text: string;
    actions: Array<{ id: string; label: string }>;
  }): Promise<{ sent: boolean; providerMessageId?: string }> {
    const actions = input.actions.slice(0, 3);
    if (actions.length === 0) return this.sendText({ to: input.to, text: input.text });

    return this.sendPayload({
      to: input.to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: input.text.slice(0, 1024) },
        action: {
          buttons: actions.map((action) => ({
            type: "reply",
            reply: {
              id: action.id.slice(0, 256),
              title: action.label.slice(0, 20)
            }
          }))
        }
      }
    });
  }
}

export function getMessagingProvider(): MessagingProvider {
  if (!env.whatsappEnabled) return new DisabledMessagingProvider();
  return new MetaWhatsAppProvider();
}
