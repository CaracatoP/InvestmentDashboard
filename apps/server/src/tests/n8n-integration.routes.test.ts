import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { app } from "../app";
import { env } from "../config/env";
import { IntegrationIdempotencyKeyModel } from "../models/integration-idempotency-key.model";
import { runWithAuthContext } from "../auth/auth-context";
import { listAllMonthlyExpenses, listAllMonthlyIncomeEntries } from "../repositories/monthly-planning.repository";
import { createBootstrapAdmin } from "../services/auth.service";
import { saveMonthlyPlan } from "../services/monthly-planning.service";
import { createWhatsAppConnectionCode, verifyWhatsAppConnectionCode } from "../services/whatsapp-link.service";

type JsonResponse<T = Record<string, unknown>> = {
  success: boolean;
  idempotentReplay?: boolean;
  data?: T;
  error?: { message?: string };
};

const n8nSecret = "test-n8n-secret";

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

function configureN8n() {
  const previousSecret = env.n8nIntegrationSecret;
  env.n8nIntegrationSecret = n8nSecret;
  return () => {
    env.n8nIntegrationSecret = previousSecret;
  };
}

function asUser<T>(userId: string, callback: () => Promise<T>) {
  return runWithAuthContext({ userId, role: "user", channel: "web" }, callback);
}

function monthlyPlanCategories() {
  return [
    { id: "moradia", name: "Moradia", icon: "home", color: "#34d399", budgetType: "fixed" as const, percentage: 0, fixedAmountInCents: 0 },
    { id: "alimentacao", name: "Alimentacao", icon: "utensils", color: "#f97316", budgetType: "fixed" as const, percentage: 0, fixedAmountInCents: 300000 },
    { id: "transporte", name: "Transporte", icon: "car", color: "#38bdf8", budgetType: "fixed" as const, percentage: 0, fixedAmountInCents: 0 },
    { id: "assinaturas", name: "Assinaturas", icon: "repeat", color: "#facc15", budgetType: "fixed" as const, percentage: 0, fixedAmountInCents: 0 },
    { id: "outros", name: "Outros", icon: "circle", color: "#94a3b8", budgetType: "fixed" as const, percentage: 0, fixedAmountInCents: 0 }
  ];
}

async function createTestUser(prefix: string) {
  const result = await createBootstrapAdmin({
    email: `${prefix}-${randomUUID()}@example.com`,
    password: "SenhaForte123!"
  });
  return result.user;
}

function uniqueBrazilianPhone() {
  const digits = randomUUID().replace(/\D/g, "").padEnd(8, "0").slice(0, 8);
  return `+55119${digits}`;
}

async function createLinkedUser(prefix: string, phoneNumber = uniqueBrazilianPhone()) {
  const user = await createTestUser(prefix);
  const pending = await asUser(user.id, () => createWhatsAppConnectionCode());
  await verifyWhatsAppConnectionCode({ phoneNumber, code: pending.code });
  return { user, phoneNumber };
}

async function n8nRequest<T = Record<string, unknown>>(
  baseUrl: string,
  method: string,
  path: string,
  input: { authMode?: "bearer" | "header"; body?: unknown; idempotencyKey?: string; secret?: string } = {}
) {
  const headers: Record<string, string> = {};
  const secret = input.secret ?? n8nSecret;
  if (input.authMode === "header") {
    headers["x-n8n-integration-secret"] = secret;
  } else {
    headers.authorization = `Bearer ${secret}`;
  }
  if (input.body !== undefined) headers["content-type"] = "application/json";
  if (input.idempotencyKey) headers["Idempotency-Key"] = input.idempotencyKey;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body)
  });
  const json = await response.json() as JsonResponse<T>;
  return { response, json };
}

async function withTestServer<T>(callback: (baseUrl: string) => Promise<T>) {
  const server = await listenForTest();
  try {
    const { port } = server.address() as AddressInfo;
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await closeServer(server);
  }
}

function expenseInput(phoneNumber: string, amountInCents = 4000) {
  return {
    phoneNumber,
    year: 2026,
    month: 8,
    expense: {
      categoryId: "transporte",
      description: "Gasolina",
      amountInCents,
      date: "2026-08-20",
      time: "12:00",
      expenseType: "single",
      recurring: false,
      status: "completed"
    }
  };
}

function incomeInput(phoneNumber: string, amountInCents = 250000) {
  return {
    phoneNumber,
    year: 2026,
    month: 8,
    incomeEntry: {
      description: "Freelance",
      amountInCents,
      category: "Freelance",
      date: "2026-08-20",
      time: "18:00",
      status: "received",
      incomeType: "single",
      recurring: false
    }
  };
}

test("n8n integration requires configured and valid server-to-server secret", async () => {
  const restore = configureN8n();

  try {
    await withTestServer(async (baseUrl) => {
      const missing = await fetch(`${baseUrl}/api/integrations/n8n/users/by-phone?phoneNumber=%2B5511999990000`);
      const invalid = await n8nRequest(baseUrl, "GET", "/api/integrations/n8n/users/by-phone?phoneNumber=%2B5511999990000", { secret: "wrong-secret" });

      assert.equal(missing.status, 401);
      assert.equal(invalid.response.status, 401);
    });
  } finally {
    restore();
  }
});

test("n8n accepts both supported secret headers without requiring a user session", async () => {
  const restore = configureN8n();
  const { user, phoneNumber } = await createLinkedUser("n8n-auth-headers");

  try {
    await withTestServer(async (baseUrl) => {
      const bearer = await n8nRequest<{ user: { id: string; name: string } }>(
        baseUrl,
        "GET",
        `/api/integrations/n8n/users/by-phone?phoneNumber=${encodeURIComponent(phoneNumber)}`
      );
      const explicitHeader = await n8nRequest<{ user: { id: string; name: string } }>(
        baseUrl,
        "GET",
        `/api/integrations/n8n/users/by-phone?phoneNumber=${encodeURIComponent(phoneNumber)}`,
        { authMode: "header" }
      );
      const unknownPhone = await n8nRequest(
        baseUrl,
        "GET",
        `/api/integrations/n8n/users/by-phone?phoneNumber=${encodeURIComponent(uniqueBrazilianPhone())}`,
        { authMode: "header" }
      );

      assert.equal(bearer.response.status, 200);
      assert.equal(bearer.json.data?.user.id, user.id);
      assert.equal(bearer.json.data?.user.name, user.name);
      assert.equal(explicitHeader.response.status, 200);
      assert.equal(explicitHeader.json.data?.user.id, user.id);
      assert.equal(explicitHeader.json.data?.user.name, user.name);
      assert.equal(unknownPhone.response.status, 404);
      assert.notEqual(unknownPhone.json.error?.message, "Autenticacao obrigatoria.");
    });
  } finally {
    restore();
  }
});

test("n8n namespace does not fall through to user auth and private routes still require normal auth", async () => {
  const restore = configureN8n();

  try {
    await withTestServer(async (baseUrl) => {
      const wrongN8nPath = await n8nRequest(baseUrl, "GET", "/api/integrations/n8n/unknown-route", { authMode: "header" });
      const privateRoute = await fetch(`${baseUrl}/api/settings`, {
        headers: { "x-n8n-integration-secret": n8nSecret }
      });
      const privatePayload = await privateRoute.json() as JsonResponse;

      assert.equal(wrongN8nPath.response.status, 404);
      assert.notEqual(wrongN8nPath.json.error?.message, "Autenticacao obrigatoria.");
      assert.equal(privateRoute.status, 401);
      assert.equal(privatePayload.error?.message, "Autenticacao obrigatoria.");
    });
  } finally {
    restore();
  }
});

test("n8n can verify a WhatsApp link and resolve only the linked active user by phone", async () => {
  const restore = configureN8n();
  const user = await createTestUser("n8n-link");
  const phoneNumber = uniqueBrazilianPhone();
  const pending = await asUser(user.id, () => createWhatsAppConnectionCode());

  try {
    await withTestServer(async (baseUrl) => {
      const verified = await n8nRequest<{ linked: boolean; user: { id: string; name: string; phoneNormalized: string } | null }>(
        baseUrl,
        "POST",
        "/api/integrations/n8n/whatsapp/link/verify",
        { body: { phoneNumber, code: pending.code } }
      );
      const resolved = await n8nRequest<{ user: { id: string; name: string; phoneNormalized: string } }>(
        baseUrl,
        "GET",
        `/api/integrations/n8n/users/by-phone?phoneNumber=${encodeURIComponent(phoneNumber)}`
      );
      const unknown = await n8nRequest(baseUrl, "GET", `/api/integrations/n8n/users/by-phone?phoneNumber=${encodeURIComponent(uniqueBrazilianPhone())}`);

      assert.equal(verified.response.status, 200);
      assert.equal(verified.json.data?.linked, true);
      assert.equal(verified.json.data?.user?.id, user.id);
      assert.equal(verified.json.data?.user?.name, user.name);
      assert.equal(resolved.response.status, 200);
      assert.equal(resolved.json.data?.user.id, user.id);
      assert.equal(resolved.json.data?.user.name, user.name);
      assert.equal(unknown.response.status, 404);
    });
  } finally {
    restore();
  }
});

test("n8n summary uses the phone owner scope and does not leak another user's planning data", async () => {
  const restore = configureN8n();
  const userA = await createLinkedUser("n8n-summary-a");
  const userB = await createLinkedUser("n8n-summary-b");

  await asUser(userA.user.id, async () => {
    const plan = await saveMonthlyPlan({ year: 2026, month: 8, incomeInCents: 500000, categories: monthlyPlanCategories() });
    assert.ok(plan.id);
  });
  await asUser(userB.user.id, async () => {
    const plan = await saveMonthlyPlan({ year: 2026, month: 8, incomeInCents: 900000, categories: monthlyPlanCategories() });
    assert.ok(plan.id);
  });

  try {
    await withTestServer(async (baseUrl) => {
      const summary = await n8nRequest<{ user: { id: string; name: string }; financialSummary: { income: { baseIncomeInCents: number } } }>(
        baseUrl,
        "GET",
        `/api/integrations/n8n/monthly-planning/summary?phoneNumber=${encodeURIComponent(userA.phoneNumber)}&year=2026&month=8`
      );

      assert.equal(summary.response.status, 200);
      assert.equal(summary.json.data?.user.id, userA.user.id);
      assert.equal(summary.json.data?.user.name, userA.user.name);
      assert.equal(summary.json.data?.financialSummary.income.baseIncomeInCents, 500000);
      assert.notEqual(summary.json.data?.financialSummary.income.baseIncomeInCents, 900000);
    });
  } finally {
    restore();
  }
});

test("n8n expense creation accepts the documented payload without time", async () => {
  const restore = configureN8n();
  const phoneNumber = "+554497370903";
  const { user } = await createLinkedUser("n8n-expense-contract", phoneNumber);

  await asUser(user.id, async () => {
    const plan = await saveMonthlyPlan({ year: 2026, month: 9, incomeInCents: 500000, categories: monthlyPlanCategories() });
    assert.ok(plan.id);
  });

  try {
    await withTestServer(async (baseUrl) => {
      const result = await n8nRequest<{ expense: { id: string; description: string; time: string } }>(
        baseUrl,
        "POST",
        "/api/integrations/n8n/monthly-planning/expenses",
        {
          idempotencyKey: `whatsapp:wamid.${randomUUID()}`,
          body: {
            phoneNumber,
            year: 2026,
            month: 9,
            expense: {
              categoryId: "transporte",
              description: "Gasolina",
              amountInCents: 4000,
              date: "2026-09-01",
              expenseType: "single",
              recurring: false,
              status: "completed"
            }
          }
        }
      );
      const expenses = await asUser(user.id, () => listAllMonthlyExpenses());

      assert.equal(result.response.status, 201);
      assert.equal(result.json.data?.expense.description, "Gasolina");
      assert.equal(result.json.data?.expense.time, "00:00");
      assert.equal(expenses.filter((expense) => expense.description === "Gasolina").length, 1);
    });
  } finally {
    restore();
  }
});

test("n8n expense writes are persisted-idempotent for retries, concurrency and duplicate WhatsApp messages", async () => {
  const restore = configureN8n();
  const { user, phoneNumber } = await createLinkedUser("n8n-expense");

  await asUser(user.id, async () => {
    const plan = await saveMonthlyPlan({ year: 2026, month: 8, incomeInCents: 500000, categories: monthlyPlanCategories() });
    assert.ok(plan.id);
  });

  try {
    await withTestServer(async (baseUrl) => {
      const duplicateMessageKey = `whatsapp:wamid.${randomUUID()}`;
      const first = await n8nRequest<{ expense: { id: string } }>(baseUrl, "POST", "/api/integrations/n8n/monthly-planning/expenses", {
        idempotencyKey: duplicateMessageKey,
        body: expenseInput(phoneNumber)
      });
      const replay = await n8nRequest<{ expense: { id: string } }>(baseUrl, "POST", "/api/integrations/n8n/monthly-planning/expenses", {
        idempotencyKey: duplicateMessageKey,
        body: expenseInput(phoneNumber)
      });
      const concurrentKey = `whatsapp:wamid.${randomUUID()}`;
      const [concurrentA, concurrentB] = await Promise.all([
        n8nRequest<{ expense: { id: string } }>(baseUrl, "POST", "/api/integrations/n8n/monthly-planning/expenses", {
          idempotencyKey: concurrentKey,
          body: expenseInput(phoneNumber, 4100)
        }),
        n8nRequest<{ expense: { id: string } }>(baseUrl, "POST", "/api/integrations/n8n/monthly-planning/expenses", {
          idempotencyKey: concurrentKey,
          body: expenseInput(phoneNumber, 4100)
        })
      ]);
      const distinct = await n8nRequest<{ expense: { id: string } }>(baseUrl, "POST", "/api/integrations/n8n/monthly-planning/expenses", {
        idempotencyKey: `whatsapp:wamid.${randomUUID()}`,
        body: expenseInput(phoneNumber, 4200)
      });
      const conflict = await n8nRequest(baseUrl, "POST", "/api/integrations/n8n/monthly-planning/expenses", {
        idempotencyKey: duplicateMessageKey,
        body: expenseInput(phoneNumber, 9900)
      });
      const missingKey = await n8nRequest(baseUrl, "POST", "/api/integrations/n8n/monthly-planning/expenses", {
        body: expenseInput(phoneNumber, 4300)
      });
      const expenses = await asUser(user.id, () => listAllMonthlyExpenses());

      assert.equal(first.response.status, 201);
      assert.equal(first.json.idempotentReplay, false);
      assert.equal(replay.response.status, 200);
      assert.equal(replay.json.idempotentReplay, true);
      assert.equal(replay.json.data?.expense.id, first.json.data?.expense.id);
      assert.equal(concurrentA.json.data?.expense.id, concurrentB.json.data?.expense.id);
      assert.equal([concurrentA.json.idempotentReplay, concurrentB.json.idempotentReplay].filter(Boolean).length, 1);
      assert.notEqual(distinct.json.data?.expense.id, first.json.data?.expense.id);
      assert.equal(conflict.response.status, 409);
      assert.equal(missingKey.response.status, 400);
      assert.equal(expenses.filter((expense) => expense.description === "Gasolina").length, 3);
    });
  } finally {
    restore();
  }
});

test("n8n income writes and completion mutations replay the original result without duplicating", async () => {
  const restore = configureN8n();
  const { user, phoneNumber } = await createLinkedUser("n8n-income");

  await asUser(user.id, async () => {
    const plan = await saveMonthlyPlan({ year: 2026, month: 8, incomeInCents: 500000, categories: monthlyPlanCategories() });
    assert.ok(plan.id);
  });

  try {
    await withTestServer(async (baseUrl) => {
      const incomeKey = `whatsapp:wamid.${randomUUID()}`;
      const firstIncome = await n8nRequest<{ incomeEntry: { id: string } }>(baseUrl, "POST", "/api/integrations/n8n/monthly-planning/income-entries", {
        idempotencyKey: incomeKey,
        body: incomeInput(phoneNumber)
      });
      const replayIncome = await n8nRequest<{ incomeEntry: { id: string } }>(baseUrl, "POST", "/api/integrations/n8n/monthly-planning/income-entries", {
        idempotencyKey: incomeKey,
        body: incomeInput(phoneNumber)
      });
      const plannedExpense = await n8nRequest<{ expense: { id: string; status: string } }>(baseUrl, "POST", "/api/integrations/n8n/monthly-planning/expenses", {
        idempotencyKey: `whatsapp:wamid.${randomUUID()}`,
        body: { ...expenseInput(phoneNumber, 1200), expense: { ...expenseInput(phoneNumber, 1200).expense, status: "planned" } }
      });
      const completeKey = `whatsapp:wamid.${randomUUID()}`;
      const completed = await n8nRequest<{ expense: { id: string; status: string }; alreadyCompleted: boolean }>(
        baseUrl,
        "PATCH",
        `/api/integrations/n8n/monthly-planning/expenses/${plannedExpense.json.data?.expense.id}/complete`,
        { idempotencyKey: completeKey, body: { phoneNumber, completedAt: "2026-08-20T15:00:00.000Z" } }
      );
      const completedReplay = await n8nRequest<{ expense: { id: string; status: string }; alreadyCompleted: boolean }>(
        baseUrl,
        "PATCH",
        `/api/integrations/n8n/monthly-planning/expenses/${plannedExpense.json.data?.expense.id}/complete`,
        { idempotencyKey: completeKey, body: { phoneNumber, completedAt: "2026-08-20T15:00:00.000Z" } }
      );
      const entries = await asUser(user.id, () => listAllMonthlyIncomeEntries());
      const expenses = await asUser(user.id, () => listAllMonthlyExpenses());

      assert.equal(firstIncome.response.status, 201);
      assert.equal(replayIncome.response.status, 200);
      assert.equal(replayIncome.json.idempotentReplay, true);
      assert.equal(replayIncome.json.data?.incomeEntry.id, firstIncome.json.data?.incomeEntry.id);
      assert.equal(entries.filter((entry) => entry.description === "Freelance").length, 1);
      assert.equal(completed.response.status, 200);
      assert.equal(completedReplay.json.idempotentReplay, true);
      assert.equal(completedReplay.json.data?.expense.id, completed.json.data?.expense.id);
      assert.equal(expenses.find((expense) => expense.id === plannedExpense.json.data?.expense.id)?.status, "completed");
    });
  } finally {
    restore();
  }
});

test("n8n idempotency is backed by a persistent unique model index and old Meta webhook is not mounted", async () => {
  const indexes = IntegrationIdempotencyKeyModel.schema.indexes();
  const uniqueUserKeyIndex = indexes.some(([fields, options]) =>
    fields.userId === 1 && fields.idempotencyKey === 1 && options?.unique === true
  );

  assert.equal(uniqueUserKeyIndex, true);

  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhooks/whatsapp`);
    assert.equal(response.status, 404);
  });
});
