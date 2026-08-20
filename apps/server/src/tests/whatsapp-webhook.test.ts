import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { app } from "../app";
import { env } from "../config/env";
import { runWithAuthContext } from "../auth/auth-context";
import { listDividends } from "../repositories/investment.repository";
import { listAllMonthlyExpenses } from "../repositories/monthly-planning.repository";
import { createBootstrapAdmin, getUserForAuthContext } from "../services/auth.service";
import { addMonthlyExpense, addMonthlyIncomeEntry, saveMonthlyPlan } from "../services/monthly-planning.service";
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

function monthlyPlanCategories() {
  return [
    { id: "moradia", name: "Moradia", icon: "home", color: "#34d399", budgetType: "fixed" as const, percentage: 0, fixedAmountInCents: 0 },
    { id: "alimentacao", name: "Alimentacao", icon: "utensils", color: "#f97316", budgetType: "fixed" as const, percentage: 0, fixedAmountInCents: 0 },
    { id: "transporte", name: "Transporte", icon: "car", color: "#38bdf8", budgetType: "fixed" as const, percentage: 0, fixedAmountInCents: 0 },
    { id: "lazer", name: "Lazer", icon: "gamepad-2", color: "#a78bfa", budgetType: "fixed" as const, percentage: 0, fixedAmountInCents: 0 },
    { id: "investimentos", name: "Investimentos", icon: "trending-up", color: "#22c55e", budgetType: "fixed" as const, percentage: 0, fixedAmountInCents: 0 },
    { id: "saude", name: "Saude", icon: "heart-pulse", color: "#fb7185", budgetType: "fixed" as const, percentage: 0, fixedAmountInCents: 0 },
    { id: "assinaturas", name: "Assinaturas", icon: "repeat", color: "#facc15", budgetType: "fixed" as const, percentage: 0, fixedAmountInCents: 0 },
    { id: "educacao", name: "Educacao", icon: "book-open", color: "#60a5fa", budgetType: "fixed" as const, percentage: 0, fixedAmountInCents: 0 },
    { id: "outros", name: "Outros", icon: "circle", color: "#94a3b8", budgetType: "fixed" as const, percentage: 0, fixedAmountInCents: 0 }
  ];
}

async function withMockedDate<T>(isoDate: string, callback: () => Promise<T>) {
  const RealDate = Date;

  class MockDate extends RealDate {
    constructor(...args: any[]) {
      switch (args.length) {
        case 0:
          super(isoDate);
          break;
        case 1:
          super(args[0]);
          break;
        case 2:
          super(args[0], args[1]);
          break;
        case 3:
          super(args[0], args[1], args[2]);
          break;
        case 4:
          super(args[0], args[1], args[2], args[3]);
          break;
        case 5:
          super(args[0], args[1], args[2], args[3], args[4]);
          break;
        case 6:
          super(args[0], args[1], args[2], args[3], args[4], args[5]);
          break;
        default:
          super(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
          break;
      }
    }

    static now() {
      return new RealDate(isoDate).getTime();
    }
  }

  globalThis.Date = MockDate as DateConstructor;
  try {
    return await callback();
  } finally {
    globalThis.Date = RealDate;
  }
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

test("whatsapp webhook remains accessible without a user session or CSRF header", async () => {
  const restore = configureWhatsApp();
  const server = await listenForTest();

  try {
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;
    const response = await postWebhook(baseUrl, buildMessagePayload(`wamid.${randomUUID()}`, "5511999990000", "ola"));

    assert.equal(response.status, 200);
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
    assert.equal(sentMessages.some((message) => JSON.stringify(message.payload).includes("ainda nao conectado")), true);
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

test("whatsapp webhook keeps expense creation idempotent and sends rendered text instead of raw json", async () => {
  const restore = configureWhatsApp();
  const sentMessages: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    sentMessages.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
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
      email: `whatsapp-expense-${randomUUID()}@example.com`,
      password: "SenhaForte123!"
    })).user;
    const phone = uniqueBrazilianPhone();
    const link = await asUser(user.id, () => createWhatsAppConnectionCode());
    await postWebhook(baseUrl, buildMessagePayload(`wamid.${randomUUID()}`, phone, link.code));

    const expenseMessageId = `wamid.${randomUUID()}`;
    const expensePayload = buildMessagePayload(expenseMessageId, phone, "gastei 20 reais com gasolina");
    const first = await postWebhook(baseUrl, expensePayload);
    const duplicate = await postWebhook(baseUrl, expensePayload);
    const confirmed = await postWebhook(baseUrl, buildMessagePayload(`wamid.${randomUUID()}`, phone, "confirmo"));
    const expenses = await asUser(user.id, () => listAllMonthlyExpenses());
    const lunchExpenses = expenses.filter((expense) => expense.description === "Gasolina" && expense.amountInCents === 2000);
    const payloadBodies = sentMessages.map((message) => JSON.stringify(message));

    assert.equal(first.status, 200);
    assert.equal(duplicate.status, 200);
    assert.equal(confirmed.status, 200);
    assert.equal(lunchExpenses.length, 1);
    assert.equal(payloadBodies.some((body) => /"message"|responseType|pendingAction|metadata/.test(body)), false);
    assert.equal(payloadBodies.some((body) => body.includes("Responda com *confirmo* ou *cancelar*.")), true);
  } finally {
    restore();
    await closeServer(server);
  }
});

test("whatsapp webhook infers lunch expense details with the local Sao Paulo time", async () => {
  const restore = configureWhatsApp();
  const sentMessages: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    sentMessages.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
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
      email: `whatsapp-lunch-${randomUUID()}@example.com`,
      password: "SenhaForte123!"
    })).user;
    const phone = uniqueBrazilianPhone();
    const link = await asUser(user.id, () => createWhatsAppConnectionCode());
    await postWebhook(baseUrl, buildMessagePayload(`wamid.${randomUUID()}`, phone, link.code));

    await withMockedDate("2026-08-20T19:06:00.000Z", async () => {
      const first = await postWebhook(baseUrl, buildMessagePayload(`wamid.${randomUUID()}`, phone, "gastei 100 reais no almoco hoje"));
      const confirmed = await postWebhook(baseUrl, buildMessagePayload(`wamid.${randomUUID()}`, phone, "confirmo"));
      const expenses = await asUser(user.id, () => listAllMonthlyExpenses());
      const lunchExpense = expenses.find((expense) => expense.description === "Almoco" && expense.amountInCents === 10000);
      const payloadBodies = sentMessages.map((message) => JSON.stringify(message));

      assert.equal(first.status, 200);
      assert.equal(confirmed.status, 200);
      assert.equal(lunchExpense?.categoryId, "alimentacao");
      assert.equal(payloadBodies.some((body) => body.includes("16:06")), true);
      assert.equal(payloadBodies.some((body) => body.includes("19:06")), false);
      assert.equal(payloadBodies.some((body) => /Campo pendente|Informe: Descricao/.test(body)), false);
    });
  } finally {
    restore();
    await closeServer(server);
  }
});

test("whatsapp webhook answers planning reads with real August 2026 data", async () => {
  const restore = configureWhatsApp();
  const sentMessages: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    sentMessages.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
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
      email: `whatsapp-planning-read-${randomUUID()}@example.com`,
      password: "SenhaForte123!"
    })).user;
    const phone = uniqueBrazilianPhone();
    const link = await asUser(user.id, () => createWhatsAppConnectionCode());
    await postWebhook(baseUrl, buildMessagePayload(`wamid.${randomUUID()}`, phone, link.code));

    await asUser(user.id, async () => {
      const plan = await saveMonthlyPlan({ year: 2026, month: 8, incomeInCents: 500000, categories: monthlyPlanCategories() });
      assert.ok(plan.id);
      await addMonthlyExpense(plan.id, {
        categoryId: "alimentacao",
        description: "Almoco",
        amountInCents: 10000,
        date: "2026-08-20",
        time: "12:00",
        expenseType: "single",
        recurring: false,
        status: "completed"
      });
      await addMonthlyExpense(plan.id, {
        categoryId: "assinaturas",
        description: "Spotify",
        amountInCents: 1290,
        date: "2026-08-22",
        time: "09:00",
        expenseType: "single",
        recurring: false,
        status: "planned"
      });
      await addMonthlyIncomeEntry(plan.id, {
        description: "Freelance",
        amountInCents: 80000,
        category: "Freelance",
        date: "2026-08-20",
        time: "18:00",
        status: "received",
        incomeType: "single",
        recurring: false
      });
    });

    const spent = await postWebhook(baseUrl, buildMessagePayload(`wamid.${randomUUID()}`, phone, "quanto gastei esse mes?"));
    const available = await postWebhook(baseUrl, buildMessagePayload(`wamid.${randomUUID()}`, phone, "quanto tenho livre pra gastar ainda?"));
    const earned = await postWebhook(baseUrl, buildMessagePayload(`wamid.${randomUUID()}`, phone, "quanto ganhei esse mes?"));
    const balance = await postWebhook(baseUrl, buildMessagePayload(`wamid.${randomUUID()}`, phone, "qual meu saldo?"));
    const payloadBodies = sentMessages.map((message) => JSON.stringify(message));

    assert.equal(spent.status, 200);
    assert.equal(available.status, 200);
    assert.equal(earned.status, 200);
    assert.equal(balance.status, 200);
    assert.equal(payloadBodies.some((body) => body.includes("Voce ja gastou R$ 100,00")), true);
    assert.equal(payloadBodies.some((body) => body.includes("renda total considerada pelo planejamento esta em R$ 5.800,00")), true);
    assert.equal(payloadBodies.some((body) => body.includes("saldo atual esta em R$ 5.700,00")), true);
    assert.equal(payloadBodies.some((body) => body.includes("Ainda nao encontrei dados")), false);
  } finally {
    restore();
    await closeServer(server);
  }
});
