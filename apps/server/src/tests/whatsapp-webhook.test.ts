import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { app } from "../app";
import { env } from "../config/env";
import { runWithAuthContext } from "../auth/auth-context";
import { listDividends } from "../repositories/investment.repository";
import { createBootstrapAdmin, getUserForAuthContext } from "../services/auth.service";
import { createWhatsAppConnectionCode, disconnectWhatsAppIntegration } from "../services/whatsapp-link.service";

const originalFetch = globalThis.fetch;

async function listenForTest() {
  const server = app.listen(0, "127.0.0.1");

  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  return server;
}

async function closeServer(server: ReturnType<typeof app.listen>) {
  if (!server.listening) return;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function asUser<T>(userId: string, callback: () => Promise<T>) {
  return runWithAuthContext({ userId, role: "user", channel: "web" }, callback);
}

function configureWhatsApp() {
  const previous = {
    enabled: env.whatsappEnabled,
    verifyToken: env.whatsappVerifyToken,
    appSecret: env.whatsappAppSecret,
    phoneNumberId: env.whatsappPhoneNumberId,
    accessToken: env.whatsappAccessToken,
    officialNumber: env.whatsappOfficialNumber
  };
  env.whatsappEnabled = true;
  env.whatsappVerifyToken = "test-verify-token";
  env.whatsappAppSecret = "test-app-secret";
  env.whatsappPhoneNumberId = "123456";
  env.whatsappAccessToken = "test-access-token";
  env.whatsappOfficialNumber = "+5511999999999";
  return () => {
    env.whatsappEnabled = previous.enabled;
    env.whatsappVerifyToken = previous.verifyToken;
    env.whatsappAppSecret = previous.appSecret;
    env.whatsappPhoneNumberId = previous.phoneNumberId;
    env.whatsappAccessToken = previous.accessToken;
    env.whatsappOfficialNumber = previous.officialNumber;
    globalThis.fetch = originalFetch;
  };
}

function sign(body: string) {
  return `sha256=${createHmac("sha256", env.whatsappAppSecret).update(body).digest("hex")}`;
}

function buildMessagePayload(messageId: string, from: string, text: string) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: messageId,
                  from,
                  type: "text",
                  text: { body: text }
                }
              ]
            }
          }
        ]
      }
    ]
  };
}

function uniqueBrazilianPhone() {
  const digits = randomUUID().replace(/\D/g, "").padEnd(8, "0").slice(0, 8);
  return `55119${digits}`;
}

async function postWebhook(baseUrl: string, payload: unknown, signature?: string) {
  const body = JSON.stringify(payload);
  return originalFetch(`${baseUrl}/webhooks/whatsapp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": signature ?? sign(body)
    },
    body
  });
}

test("whatsapp webhook verifies challenge and rejects invalid signatures", async () => {
  const restore = configureWhatsApp();
  const server = await listenForTest();

  try {
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    const challenge = await originalFetch(`${baseUrl}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=abc123`);
    const invalid = await postWebhook(baseUrl, buildMessagePayload(`wamid.${randomUUID()}`, "5511999990000", "ola"), "sha256=00");

    assert.equal(challenge.status, 200);
    assert.equal(await challenge.text(), "abc123");
    assert.equal(invalid.status, 401);
  } finally {
    restore();
    await closeServer(server);
  }
});

test("whatsapp webhook links code, processes a dividend command once and blocks after disconnect", async () => {
  const restore = configureWhatsApp();
  const sentMessages: Array<{ url: string; payload: Record<string, unknown> }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    sentMessages.push({ url: String(url), payload: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
    return new Response(JSON.stringify({ messages: [{ id: `sent-${sentMessages.length}` }] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;
  const server = await listenForTest();

  try {
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;
    const user = (await createBootstrapAdmin({
      email: `whatsapp-webhook-${randomUUID()}@example.com`,
      password: "SenhaForte123!"
    })).user;
    const phone = uniqueBrazilianPhone();
    const link = await asUser(user.id, () => createWhatsAppConnectionCode());

    const linkResponse = await postWebhook(baseUrl, buildMessagePayload(`wamid.${randomUUID()}`, phone, link.code));
    const commandId = `wamid.${randomUUID()}`;
    const commandPayload = buildMessagePayload(commandId, phone, "recebi R$ 85,40 de dividendos da PETR4");
    const commandResponse = await postWebhook(baseUrl, commandPayload);
    const confirmResponse = await postWebhook(baseUrl, buildMessagePayload(`wamid.${randomUUID()}`, phone, "confirmo"));
    const duplicateResponse = await postWebhook(baseUrl, commandPayload);
    const dividends = await asUser(user.id, () => listDividends());
    const linkedUser = await getUserForAuthContext(user.id);

    await asUser(user.id, () => disconnectWhatsAppIntegration());
    const blockedResponse = await postWebhook(baseUrl, buildMessagePayload(`wamid.${randomUUID()}`, phone, "quanto gastei esse mes?"));

    assert.equal(linkResponse.status, 200);
    assert.equal(linkedUser?.phoneNormalized, `+${phone}`);
    assert.equal(commandResponse.status, 200);
    assert.equal(confirmResponse.status, 200);
    assert.equal(duplicateResponse.status, 200);
    assert.equal(blockedResponse.status, 200);
    assert.equal(dividends.filter((dividend) => dividend.assetTicker === "PETR4" && dividend.totalValue === 85.4).length, 1);
    assert.equal(sentMessages.some((message) => JSON.stringify(message.payload).includes("WhatsApp conectado")), true);
    assert.equal(sentMessages.some((message) => JSON.stringify(message.payload).includes("ainda nao esta conectado")), true);
  } finally {
    restore();
    await closeServer(server);
  }
});

test("whatsapp provider send failure does not repeat a financial mutation", async () => {
  const restore = configureWhatsApp();
  let shouldFailProvider = false;
  globalThis.fetch = (async () => {
    if (shouldFailProvider) {
      return new Response(JSON.stringify({ error: { message: "Meta indisponivel" } }), {
        status: 503,
        headers: { "content-type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ messages: [{ id: `sent-${randomUUID()}` }] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;
  const server = await listenForTest();

  try {
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;
    const user = (await createBootstrapAdmin({
      email: `whatsapp-provider-fail-${randomUUID()}@example.com`,
      password: "SenhaForte123!"
    })).user;
    const phone = uniqueBrazilianPhone();
    const link = await asUser(user.id, () => createWhatsAppConnectionCode());
    await postWebhook(baseUrl, buildMessagePayload(`wamid.${randomUUID()}`, phone, link.code));
    await postWebhook(baseUrl, buildMessagePayload(`wamid.${randomUUID()}`, phone, "recebi R$ 40,00 de dividendos da BBSE3"));

    const confirmPayload = buildMessagePayload(`wamid.${randomUUID()}`, phone, "confirmo");
    shouldFailProvider = true;
    const firstConfirm = await postWebhook(baseUrl, confirmPayload);
    const duplicateConfirm = await postWebhook(baseUrl, confirmPayload);
    const dividends = await asUser(user.id, () => listDividends());

    assert.equal(firstConfirm.status, 200);
    assert.equal(duplicateConfirm.status, 200);
    assert.equal(dividends.filter((dividend) => dividend.assetTicker === "BBSE3" && dividend.totalValue === 40).length, 1);
  } finally {
    restore();
    await closeServer(server);
  }
});
