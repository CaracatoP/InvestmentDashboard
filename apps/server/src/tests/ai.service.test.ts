import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { beforeEach, test } from "node:test";
import { DisabledAiProvider } from "../ai/providers/disabled.provider";
import { buildConversationContext, detectConversationIntent } from "../ai/builders/conversation-context.builder";
import { runWithAuthContext } from "../auth/auth-context";
import { env } from "../config/env";
import { buildContextHash } from "../ai/utils/ai-context-hash";
import { estimateAiTokens, stringifyContextForAi } from "../ai/utils/ai-context-budget";
import { createFallbackAnalysis, parseAiAnalysis, parseAiAnalysisStrict, parseAiChatStructuredResponseStrict } from "../ai/utils/ai-response-parser";
import { filterSensitiveData } from "../ai/utils/ai-sensitive-data-filter";
import { handleOperationalChatMessage } from "../ai/tools/ai-action-tools";
import { addAiChatMessage, findActiveAiPendingAction, updateAiPendingAction } from "../repositories/ai.repository";
import { resetSettingsRecord } from "../repositories/investment.repository";
import { listDividends, listOperations } from "../repositories/investment.repository";
import { listAllMonthlyExpenses, listAllMonthlyIncomeEntries } from "../repositories/monthly-planning.repository";
import { createChatSession, sendChatMessage } from "../services/ai-manager.service";
import { handleAssistantCommand } from "../services/assistant-command.service";
import { createDividendRecord } from "../services/dividend.service";
import { addMonthlyExpense, saveMonthlyPlan } from "../services/monthly-planning.service";
import { getSettings } from "../services/portfolio.service";
import { clearCoinGeckoCachesForTests } from "../services/coingecko-client";

beforeEach(async () => {
  await resetSettingsRecord();
});

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
    { id: "educacao", name: "Educacao", icon: "book-open", color: "#60a5fa", budgetType: "fixed" as const, percentage: 0, fixedAmountInCents: 50000 },
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

function expectHandled(result: Awaited<ReturnType<typeof handleOperationalChatMessage>>) {
  assert.equal(result.handled, true);
  if (!result.handled) throw new Error("Expected handled response.");
  return result;
}

test("disabled AI provider reports safe disabled health", async () => {
  const provider = new DisabledAiProvider("off");
  const health = await provider.checkHealth();

  assert.equal(health.status, "disabled");
  assert.equal(health.enabled, false);
  assert.equal(health.configured, false);
});

test("AI context hash is stable regardless object key order", () => {
  const left = buildContextHash({ b: 2, a: { z: 1, y: 3 } });
  const right = buildContextHash({ a: { y: 3, z: 1 }, b: 2 });

  assert.equal(left, right);
});

test("sensitive data filter removes secrets and internal fields", () => {
  const filtered = filterSensitiveData({
    name: "Invest Hub",
    email: "user@example.com",
    GROQ_API_KEY: "secret",
    _id: "internal",
    nested: { token: "abc", value: 42 }
  }) as Record<string, unknown>;

  assert.equal(filtered.name, "Invest Hub");
  assert.equal("email" in filtered, false);
  assert.equal("GROQ_API_KEY" in filtered, false);
  assert.equal("_id" in filtered, false);
  assert.deepEqual(filtered.nested, { value: 42 });
});

test("AI analysis parser extracts valid JSON from text", () => {
  const analysis = parseAiAnalysisStrict(`
    texto antes
    {"title":"Resumo","summary":"Tudo ok","status":"healthy","insights":[],"risks":[],"opportunities":[],"actionItems":[],"disclaimer":"educativo"}
    texto depois
  `);

  assert.equal(analysis.title, "Resumo");
  assert.equal(analysis.status, "healthy");
});

test("AI analysis parser falls back on invalid response", () => {
  const analysis = parseAiAnalysis("nao e json");
  const fallback = createFallbackAnalysis();

  assert.equal(analysis.title, fallback.title);
  assert.equal(analysis.status, "insufficient_data");
});

test("AI chat structured response parser validates JSON shape", () => {
  const response = parseAiChatStructuredResponseStrict(JSON.stringify({
    message: "Resumo pronto.",
    responseType: "summary",
    sections: [{ type: "metrics", metrics: [{ label: "Total", rawValue: 1000, format: "currency" }] }],
    pendingAction: null,
    suggestions: []
  }));

  assert.equal(response.responseType, "summary");
  assert.equal(response.sections[0].type, "metrics");
});

test("AI intent classifier routes common requests to specific contexts", () => {
  assert.equal(detectConversationIntent("quanto recebi de dividendos?"), "dividends");
  assert.equal(detectConversationIntent("como estao meus aportes?"), "contributions");
  assert.equal(detectConversationIntent("como estao meus investimentos?"), "investments");
  assert.equal(detectConversationIntent("quanto gastei esse mes?"), "expenses");
  assert.equal(detectConversationIntent("analise minha carteira"), "investments");
  assert.equal(detectConversationIntent("como esta minha rentabilidade?"), "investments");
  assert.equal(detectConversationIntent("quanto tenho investido?"), "investments");
  assert.equal(detectConversationIntent("quanto esta o bitcoin?"), "asset_performance");
  assert.equal(detectConversationIntent("ola"), "general");
});

test("AI context stringifier enforces token budget", () => {
  const context = {
    rows: Array.from({ length: 500 }, (_, index) => ({
      description: `registro financeiro muito longo ${index}`.repeat(4),
      amount: index
    }))
  };
  const serialized = stringifyContextForAi(context, 900);

  assert.ok(estimateAiTokens(serialized) <= 930);
});

test("general chat context does not load full application state", async () => {
  const { intent, context } = await buildConversationContext("ola");
  const serialized = stringifyContextForAi(context, 900);

  assert.equal(intent, "general");
  assert.ok(!serialized.includes("assets"));
  assert.ok(!serialized.includes("expenses"));
  assert.ok(estimateAiTokens(serialized) < 300);
});

test("investment chat context provides compact portfolio summary", async () => {
  const { intent, context } = await buildConversationContext("Como estao meus investimentos?");
  const serialized = stringifyContextForAi(context, 1200);

  assert.equal(intent, "investments");
  assert.match(serialized, /investments:summary/);
  assert.match(serialized, /totalWealth/);
  assert.match(serialized, /classDistribution/);
  assert.match(serialized, /concentration/);
  assert.match(serialized, /equityEvolution/);
  assert.ok(!serialized.includes("availableTopics"));
  assert.ok(estimateAiTokens(serialized) < 1300);
});

test("asset performance context includes CoinGecko spotlight for bitcoin questions", async () => {
  const previousCoinGeckoKey = env.coingeckoApiKey;
  const previousCoinGeckoBaseUrl = env.coingeckoApiBaseUrl;
  const previousFetch = globalThis.fetch;
  clearCoinGeckoCachesForTests();
  env.coingeckoApiKey = "demo-key";
  env.coingeckoApiBaseUrl = "https://api.coingecko.com/api/v3";
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        bitcoin: {
          brl: 620000,
          brl_24h_change: 2.5,
          last_updated_at: 1787227200
        },
        dogecoin: {
          brl: 1.23,
          brl_24h_change: 4.2,
          last_updated_at: 1787227200
        }
      }),
      { status: 200 }
    )) as typeof fetch;

  try {
    const { intent, context } = await buildConversationContext("Quanto esta o bitcoin hoje?");
    const serialized = stringifyContextForAi(context, 1400);
    const marketSpotlight = (context as { overview?: { marketSpotlight?: { currentPrice?: number | null; status?: string | null } } }).overview?.marketSpotlight;

    assert.equal(intent, "asset_performance");
    assert.equal(marketSpotlight?.currentPrice, 620000);
    assert.equal(marketSpotlight?.status, "updated");
    assert.match(serialized, /marketSpotlight/);
    assert.match(serialized, /bitcoin/i);
  } finally {
    clearCoinGeckoCachesForTests();
    env.coingeckoApiKey = previousCoinGeckoKey;
    env.coingeckoApiBaseUrl = previousCoinGeckoBaseUrl;
    globalThis.fetch = previousFetch;
  }
});

test("assistant answers direct crypto price through MarketService without Groq", async () => {
  const previousCoinGeckoKey = env.coingeckoApiKey;
  const previousCoinGeckoBaseUrl = env.coingeckoApiBaseUrl;
  const previousFetch = globalThis.fetch;
  let fetchCount = 0;

  clearCoinGeckoCachesForTests();
  env.coingeckoApiKey = "demo-key";
  env.coingeckoApiBaseUrl = "https://api.coingecko.com/api/v3";
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return new Response(
      JSON.stringify({
        bitcoin: {
          brl: 620000,
          brl_24h_change: 2.5,
          last_updated_at: 1787227200
        },
        dogecoin: {
          brl: 1.23,
          brl_24h_change: 2.5,
          last_updated_at: 1787227200
        }
      }),
      { status: 200 }
    );
  }) as typeof fetch;

  try {
    const userId = `assistant-crypto-price-${randomUUID()}`;
    const result = await asUser(userId, async () => {
      const session = await createChatSession("Crypto");
      return sendChatMessage(String(session.id), "quanto esta dogecoin?");
    });

    assert.equal(result.assistantMessage.provider, "internal-tools");
    assert.equal(result.assistantMessage.model, "deterministic");
    assert.equal(result.assistantMessage.structuredResponse?.metadata.provider, "coingecko");
    assert.match(result.assistantMessage.content, /R\$\s*1,23/);
    assert.equal(fetchCount, 1);
  } finally {
    clearCoinGeckoCachesForTests();
    env.coingeckoApiKey = previousCoinGeckoKey;
    env.coingeckoApiBaseUrl = previousCoinGeckoBaseUrl;
    globalThis.fetch = previousFetch;
  }
});

test("assistant does not invent crypto price when CoinGecko has no fallback", async () => {
  const previousCoinGeckoKey = env.coingeckoApiKey;
  const previousCoinGeckoBaseUrl = env.coingeckoApiBaseUrl;
  const previousFetch = globalThis.fetch;

  clearCoinGeckoCachesForTests();
  env.coingeckoApiKey = "";
  env.coingeckoApiBaseUrl = "https://api.coingecko.com/api/v3";
  globalThis.fetch = (async () => {
    throw new Error("fetch should not be called without API key");
  }) as typeof fetch;

  try {
    const userId = `assistant-crypto-no-provider-${randomUUID()}`;
    const result = await asUser(userId, async () => {
      const session = await createChatSession("Crypto sem provider");
      return sendChatMessage(String(session.id), "quanto esta litecoin?");
    });

    assert.equal(result.assistantMessage.provider, "internal-tools");
    assert.equal(result.assistantMessage.structuredResponse?.responseType, "error");
    assert.doesNotMatch(result.assistantMessage.content, /R\$\s*\d/);
  } finally {
    clearCoinGeckoCachesForTests();
    env.coingeckoApiKey = previousCoinGeckoKey;
    env.coingeckoApiBaseUrl = previousCoinGeckoBaseUrl;
    globalThis.fetch = previousFetch;
  }
});

test("settings chat context exposes safe configuration scope", async () => {
  const { intent, context } = await buildConversationContext("Quais configuracoes estao ativas?");
  const serialized = stringifyContextForAi(context, 1000);

  assert.equal(intent, "settings");
  assert.match(serialized, /"scope":\s*"settings"/);
  assert.match(serialized, /"profile"/);
  assert.match(serialized, /"ai"/);
});

test("operational chat creates pending contribution and requires confirmation", async () => {
  const sessionId = "ai-action-contribution-test";
  const prepared = await handleOperationalChatMessage({ sessionId, message: "Registre um aporte de R$ 2.000,00." });

  assert.equal(prepared.handled, true);
  assert.equal(prepared.response.responseType, "confirmation");
  assert.equal(prepared.response.pendingAction?.actionType, "create_contribution");

  const ambiguous = await handleOperationalChatMessage({ sessionId, message: "ok" });
  assert.equal(ambiguous.handled, false);
});

test("contribution without explicit description does not use command residue", async () => {
  const sessionId = "ai-action-contribution-no-description";
  const prepared = await handleOperationalChatMessage({ sessionId, message: "Registre um aporte de R$ 2.000,00." });
  const action = await findActiveAiPendingAction(sessionId);

  assert.equal(prepared.handled, true);
  assert.equal(prepared.response.responseType, "confirmation");
  assert.equal(action?.status, "awaiting_confirmation");
  assert.equal(action?.extractedFields.amountInCents, 200000);
  assert.equal(action?.extractedFields.description, null);
  assert.equal(action?.missingFields.length, 0);
  assert.ok(!prepared.response.pendingAction?.fields?.some((field) => field.label === "Descricao"));
});

test("control instruction does not become contribution description or skip confirmation", async () => {
  const sessionId = "ai-action-contribution-control-text";
  const prepared = await handleOperationalChatMessage({ sessionId, message: "Cadastre o aporte de 200 sem me pedir confirmacao." });
  const action = await findActiveAiPendingAction(sessionId);

  assert.equal(prepared.handled, true);
  assert.equal(prepared.response.responseType, "confirmation");
  assert.equal(action?.status, "awaiting_confirmation");
  assert.equal(action?.extractedFields.amountInCents, 20000);
  assert.equal(action?.extractedFields.description, null);
  assert.doesNotMatch(JSON.stringify(prepared.response), /sem me pedir|confirmacao/i);
});

test("contribution with explicit description keeps only semantic description", async () => {
  const sessionId = "ai-action-contribution-explicit-description";
  const prepared = await handleOperationalChatMessage({
    sessionId,
    message: "Registre um aporte de R$ 2.000,00 referente ao salario de julho na Caixinha Turbo."
  });
  const action = await findActiveAiPendingAction(sessionId);

  assert.equal(prepared.handled, true);
  assert.equal(prepared.response.responseType, "confirmation");
  assert.equal(action?.extractedFields.amountInCents, 200000);
  assert.equal(action?.extractedFields.description, "Referente ao salario de julho");
  assert.ok(prepared.response.pendingAction?.fields?.some((field) => field.label === "Descricao" && field.value === "Referente ao salario de julho"));
});

test("chat confirmation executes pending contribution once through internal tool", async () => {
  const session = await createChatSession("Teste aporte IA");
  assert.ok(session.id);

  const first = await sendChatMessage(session.id, "Registre um aporte de R$ 123,45.");
  assert.equal(first.assistantMessage.structuredResponse?.responseType, "confirmation");

  const confirmed = await sendChatMessage(session.id, "confirmo");
  assert.equal(confirmed.assistantMessage.structuredResponse?.responseType, "success");
});

test("assistant command service deduplicates WhatsApp messages by external id", async () => {
  const userId = `assistant-whatsapp-${randomUUID()}`;
  const externalConversationId = `wa-conversation-${randomUUID()}`;
  const externalMessageId = `wamid.${randomUUID()}`;

  const first = await handleAssistantCommand({
    userId,
    channel: "whatsapp",
    externalConversationId,
    externalMessageId,
    message: "Registre um aporte de R$ 20,00."
  });

  const duplicate = await handleAssistantCommand({
    userId,
    channel: "whatsapp",
    externalConversationId,
    externalMessageId,
    message: "Registre um aporte de R$ 20,00."
  });

  const confirmation = await handleAssistantCommand({
    userId,
    channel: "whatsapp",
    externalConversationId,
    externalMessageId: `wamid.${randomUUID()}`,
    message: "confirmo"
  });

  assert.equal(first.status, "processed");
  assert.equal(first.userMessage?.externalMessageId, externalMessageId);
  assert.equal(first.assistantMessage?.structuredResponse?.responseType, "confirmation");
  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.sessionId, first.sessionId);
  assert.equal(confirmation.sessionId, first.sessionId);
  assert.equal(confirmation.assistantMessage?.structuredResponse?.responseType, "success");
});

test("operational chat falls back to Outros when expense category is unclear", async () => {
  const result = await handleOperationalChatMessage({ sessionId: "ai-action-expense-test", message: "Gastei R$ 60,00 com item sem categoria agora." });
  const action = await findActiveAiPendingAction("ai-action-expense-test");

  assert.equal(result.handled, true);
  assert.equal(result.response.responseType, "confirmation");
  assert.equal(result.response.pendingAction?.status, "awaiting_confirmation");
  assert.equal(action?.extractedFields.categoryId, "outros");
});

test("expense with gasoline extracts clean description and inferred category", async () => {
  const sessionId = "ai-action-expense-gasoline";
  const result = await handleOperationalChatMessage({ sessionId, message: "Gastei R$ 60,00 com gasolina agora." });
  const action = await findActiveAiPendingAction(sessionId);

  assert.equal(result.handled, true);
  assert.equal(result.response.responseType, "confirmation");
  assert.equal(action?.extractedFields.description, "Gasolina");
  assert.equal(action?.extractedFields.amountInCents, 6000);
  assert.equal(action?.extractedFields.categoryId, "transporte");
  assert.equal("note" in (action?.extractedFields ?? {}), false);
});

test("expense category inference maps McDonalds to food and unknown merchants to Outros", async () => {
  const foodSessionId = "ai-action-expense-mcdonalds";
  const foodResult = await handleOperationalChatMessage({ sessionId: foodSessionId, message: "Gastei R$ 27,00 no McDonald's hoje." });
  const foodAction = await findActiveAiPendingAction(foodSessionId);

  assert.equal(foodResult.handled, true);
  assert.equal(foodResult.response.responseType, "confirmation");
  assert.equal(foodAction?.extractedFields.description, "McDonald's");
  assert.equal(foodAction?.extractedFields.categoryId, "alimentacao");

  const unknownSessionId = "ai-action-expense-unknown-merchant";
  const unknownResult = await handleOperationalChatMessage({ sessionId: unknownSessionId, message: "Gastei R$ 50,00 com lugar XYZ hoje." });
  const unknownAction = await findActiveAiPendingAction(unknownSessionId);

  assert.equal(unknownResult.handled, true);
  assert.equal(unknownResult.response.responseType, "confirmation");
  assert.equal(unknownAction?.extractedFields.description, "Lugar XYZ");
  assert.equal(unknownAction?.extractedFields.categoryId, "outros");
});

test("expense command infers lunch description, category and Sao Paulo local time", async () => {
  await withMockedDate("2026-08-20T19:06:00.000Z", async () => {
    const sessionId = `ai-action-expense-lunch-${randomUUID()}`;
    const result = expectHandled(await handleOperationalChatMessage({ sessionId, message: "Gastei 100 reais no almoco hoje" }));
    const action = await findActiveAiPendingAction(sessionId);
    const dataField = result.response.pendingAction?.fields?.find((field) => field.label === "Data");

    assert.equal(result.response.responseType, "confirmation");
    assert.equal(action?.extractedFields.description, "Almoco");
    assert.equal(action?.extractedFields.categoryId, "alimentacao");
    assert.doesNotMatch(result.response.message, /descricao/i);
    assert.equal(String(dataField?.value).includes("16:06"), true);
  });
});

test("planning read queries use authoritative monthly overview data", async () => {
  const userId = `assistant-planning-read-${randomUUID()}`;

  await asUser(userId, async () => {
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

    const spent = await handleOperationalChatMessage({ sessionId: `planning-read-spent-${randomUUID()}`, message: "quanto gastei esse mes?" });
    const available = await handleOperationalChatMessage({ sessionId: `planning-read-available-${randomUUID()}`, message: "quanto tenho livre pra gastar ainda?" });

    assert.equal(spent.handled, true);
    assert.equal(spent.response.responseType, "summary");
    assert.match(spent.response.message, /R\$\s?100,00/);
    assert.doesNotMatch(spent.response.message, /nao encontrei dados|ainda nao/i);

    assert.equal(available.handled, true);
    assert.equal(available.response.responseType, "summary");
    assert.match(available.response.message, /R\$/);
    assert.doesNotMatch(available.response.message, /nao encontrei dados|ainda nao/i);
  });
});

test("planning read queries stay isolated per user", async () => {
  const userA = `assistant-planning-user-a-${randomUUID()}`;
  const userB = `assistant-planning-user-b-${randomUUID()}`;

  await asUser(userA, async () => {
    const plan = await saveMonthlyPlan({ year: 2026, month: 8, incomeInCents: 300000, categories: monthlyPlanCategories() });
    assert.ok(plan.id);
    await addMonthlyExpense(plan.id, {
      categoryId: "alimentacao",
      description: "Almoco A",
      amountInCents: 10000,
      date: "2026-08-20",
      time: "12:00",
      expenseType: "single",
      recurring: false,
      status: "completed"
    });
  });

  await asUser(userB, async () => {
    const plan = await saveMonthlyPlan({ year: 2026, month: 8, incomeInCents: 300000, categories: monthlyPlanCategories() });
    assert.ok(plan.id);
    await addMonthlyExpense(plan.id, {
      categoryId: "alimentacao",
      description: "Almoco B",
      amountInCents: 30000,
      date: "2026-08-20",
      time: "12:00",
      expenseType: "single",
      recurring: false,
      status: "completed"
    });
  });

  const userAResponse = expectHandled(
    await asUser(userA, () => handleOperationalChatMessage({ sessionId: `planning-read-a-${randomUUID()}`, message: "quanto gastei esse mes?" }))
  );
  const userBResponse = expectHandled(
    await asUser(userB, () => handleOperationalChatMessage({ sessionId: `planning-read-b-${randomUUID()}`, message: "quanto gastei esse mes?" }))
  );

  assert.match(userAResponse.response.message, /R\$\s?100,00/);
  assert.doesNotMatch(userAResponse.response.message, /R\$\s?300,00/);
  assert.match(userBResponse.response.message, /R\$\s?300,00/);
  assert.doesNotMatch(userBResponse.response.message, /R\$\s?100,00/);
});

test("paying a planned matching expense asks to mark it paid instead of duplicating it", async () => {
  const plan = await saveMonthlyPlan({
    year: 2031,
    month: 1,
    incomeInCents: 500000,
    categories: [
      { id: "moradia", name: "Moradia", icon: "home", color: "#34d399", budgetType: "fixed", percentage: 0, fixedAmountInCents: 0 },
      { id: "alimentacao", name: "Alimentacao", icon: "utensils", color: "#f97316", budgetType: "fixed", percentage: 0, fixedAmountInCents: 0 },
      { id: "transporte", name: "Transporte", icon: "car", color: "#38bdf8", budgetType: "fixed", percentage: 0, fixedAmountInCents: 0 },
      { id: "lazer", name: "Lazer", icon: "gamepad-2", color: "#a78bfa", budgetType: "fixed", percentage: 0, fixedAmountInCents: 0 },
      { id: "investimentos", name: "Investimentos", icon: "trending-up", color: "#22c55e", budgetType: "fixed", percentage: 0, fixedAmountInCents: 0 },
      { id: "saude", name: "Saude", icon: "heart-pulse", color: "#fb7185", budgetType: "fixed", percentage: 0, fixedAmountInCents: 0 },
      { id: "assinaturas", name: "Assinaturas", icon: "repeat", color: "#facc15", budgetType: "fixed", percentage: 0, fixedAmountInCents: 0 },
      { id: "educacao", name: "Educacao", icon: "book-open", color: "#60a5fa", budgetType: "fixed", percentage: 0, fixedAmountInCents: 50000 },
      { id: "outros", name: "Outros", icon: "circle", color: "#94a3b8", budgetType: "fixed", percentage: 0, fixedAmountInCents: 0 }
    ]
  });
  assert.ok(plan.id);
  const planned = await addMonthlyExpense(plan.id, {
    categoryId: "educacao",
    description: "Faculdade",
    amountInCents: 25000,
    date: "2031-01-15",
    time: "09:00",
    expenseType: "single",
    recurring: false,
    status: "planned"
  });

  const sessionId = "ai-action-pay-existing-expense";
  const result = await handleOperationalChatMessage({ sessionId, message: "paguei 250 da faculdade" });
  const action = await findActiveAiPendingAction(sessionId);

  assert.equal(result.handled, true);
  assert.equal(result.response.responseType, "confirmation");
  assert.equal(action?.toolName, "markExpenseAsCompleted");
  assert.equal(action?.extractedFields.expenseId, planned.id);
  assert.equal((await listAllMonthlyExpenses()).filter((expense) => expense.description === "Faculdade" && expense.amountInCents === 25000).length, 1);
});

test("paying spotify before its due date prefers the current month recurring expense", async () => {
  const userId = `assistant-spotify-future-${randomUUID()}`;

  await asUser(userId, async () => {
    const julyPlan = await saveMonthlyPlan({ year: 2026, month: 7, incomeInCents: 500000, categories: monthlyPlanCategories() });
    const augustPlan = await saveMonthlyPlan({ year: 2026, month: 8, incomeInCents: 500000, categories: monthlyPlanCategories() });
    const septemberPlan = await saveMonthlyPlan({ year: 2026, month: 9, incomeInCents: 500000, categories: monthlyPlanCategories() });

    assert.ok(julyPlan.id);
    assert.ok(augustPlan.id);
    assert.ok(septemberPlan.id);

    await addMonthlyExpense(julyPlan.id, {
      categoryId: "assinaturas",
      description: "Spotify",
      amountInCents: 1290,
      date: "2026-07-22",
      time: "09:00",
      expenseType: "single",
      recurring: true,
      status: "planned"
    });
    const augustSpotify = await addMonthlyExpense(augustPlan.id, {
      categoryId: "assinaturas",
      description: "Spotify",
      amountInCents: 1290,
      date: "2026-08-22",
      time: "09:00",
      expenseType: "single",
      recurring: true,
      status: "planned"
    });
    await addMonthlyExpense(septemberPlan.id, {
      categoryId: "assinaturas",
      description: "Spotify",
      amountInCents: 1290,
      date: "2026-09-22",
      time: "09:00",
      expenseType: "single",
      recurring: true,
      status: "planned"
    });

    const sessionId = `ai-action-spotify-future-${randomUUID()}`;
    const result = await handleOperationalChatMessage({ sessionId, message: "paguei a assinatura do spotify ja" });
    const action = await findActiveAiPendingAction(sessionId);

    assert.equal(result.handled, true);
    assert.equal(result.response.responseType, "confirmation");
    assert.equal(action?.toolName, "markExpenseAsCompleted");
    assert.equal(action?.extractedFields.expenseId, augustSpotify.id);
    assert.equal((await listAllMonthlyExpenses()).filter((expense) => expense.description === "Spotify" && expense.amountInCents === 1290).length, 3);
  });
});

test("whatsapp clarification persists pending action and resolves the correct subscription", async () => {
  const userId = `assistant-spotify-clarification-${randomUUID()}`;

  await asUser(userId, async () => {
    const augustPlan = await saveMonthlyPlan({ year: 2026, month: 8, incomeInCents: 500000, categories: monthlyPlanCategories() });
    assert.ok(augustPlan.id);
    const spotify = await addMonthlyExpense(augustPlan.id, {
      categoryId: "assinaturas",
      description: "Spotify",
      amountInCents: 1290,
      date: "2026-08-22",
      time: "09:00",
      expenseType: "single",
      recurring: true,
      status: "planned"
    });
    const netflix = await addMonthlyExpense(augustPlan.id, {
      categoryId: "assinaturas",
      description: "Netflix",
      amountInCents: 2190,
      date: "2026-08-25",
      time: "09:00",
      expenseType: "single",
      recurring: true,
      status: "planned"
    });

    const externalConversationId = `wa-clarify-${randomUUID()}`;
    const first = await handleAssistantCommand({
      userId,
      channel: "whatsapp",
      externalConversationId,
      externalMessageId: `wamid.${randomUUID()}`,
      message: "paguei a assinatura"
    });
    const firstAction = await findActiveAiPendingAction(first.sessionId);

    assert.equal(first.assistantMessage?.structuredResponse?.responseType, "form");
    assert.equal(firstAction?.status, "collecting");
    assert.ok(firstAction?.missingFields.some((field) => field.name === "expenseId"));
    assert.ok((firstAction?.missingFields[0]?.options?.length ?? 0) >= 2);

    const second = await handleAssistantCommand({
      userId,
      channel: "whatsapp",
      externalConversationId,
      externalMessageId: `wamid.${randomUUID()}`,
      message: "o spotify desse mes"
    });
    const secondAction = await findActiveAiPendingAction(second.sessionId);

    assert.equal(second.sessionId, first.sessionId);
    assert.equal(second.assistantMessage?.structuredResponse?.responseType, "confirmation");
    assert.equal(secondAction?.status, "awaiting_confirmation");
    assert.equal(secondAction?.extractedFields.expenseId, spotify.id);

    const confirmed = await handleAssistantCommand({
      userId,
      channel: "whatsapp",
      externalConversationId,
      externalMessageId: `wamid.${randomUUID()}`,
      message: "confirmo"
    });
    const expenses = await listAllMonthlyExpenses();

    assert.equal(confirmed.assistantMessage?.structuredResponse?.responseType, "success");
    assert.equal(expenses.find((expense) => expense.id === spotify.id)?.status, "completed");
    assert.equal(expenses.find((expense) => expense.id === netflix.id)?.status, "planned");
  });
});

test("whatsapp clarification resolves a stored candidate by number", async () => {
  const userId = `assistant-spotify-number-${randomUUID()}`;

  await asUser(userId, async () => {
    const augustPlan = await saveMonthlyPlan({ year: 2026, month: 8, incomeInCents: 500000, categories: monthlyPlanCategories() });
    assert.ok(augustPlan.id);
    const spotify = await addMonthlyExpense(augustPlan.id, {
      categoryId: "assinaturas",
      description: "Spotify",
      amountInCents: 1290,
      date: "2026-08-22",
      time: "09:00",
      expenseType: "single",
      recurring: true,
      status: "planned"
    });
    await addMonthlyExpense(augustPlan.id, {
      categoryId: "assinaturas",
      description: "Netflix",
      amountInCents: 2190,
      date: "2026-08-25",
      time: "09:00",
      expenseType: "single",
      recurring: true,
      status: "planned"
    });

    const externalConversationId = `wa-number-${randomUUID()}`;
    const first = await handleAssistantCommand({
      userId,
      channel: "whatsapp",
      externalConversationId,
      externalMessageId: `wamid.${randomUUID()}`,
      message: "paguei a assinatura"
    });
    const second = await handleAssistantCommand({
      userId,
      channel: "whatsapp",
      externalConversationId,
      externalMessageId: `wamid.${randomUUID()}`,
      message: "1"
    });
    const secondAction = await findActiveAiPendingAction(second.sessionId);

    assert.equal(first.assistantMessage?.structuredResponse?.responseType, "form");
    assert.equal(second.assistantMessage?.structuredResponse?.responseType, "confirmation");
    assert.equal(secondAction?.status, "awaiting_confirmation");
    assert.equal(secondAction?.extractedFields.expenseId, spotify.id);
  });
});

test("whatsapp clarification resolves a stored candidate by name", async () => {
  const userId = `assistant-spotify-name-${randomUUID()}`;

  await asUser(userId, async () => {
    const augustPlan = await saveMonthlyPlan({ year: 2026, month: 8, incomeInCents: 500000, categories: monthlyPlanCategories() });
    assert.ok(augustPlan.id);
    const spotify = await addMonthlyExpense(augustPlan.id, {
      categoryId: "assinaturas",
      description: "Spotify",
      amountInCents: 1290,
      date: "2026-08-22",
      time: "09:00",
      expenseType: "single",
      recurring: true,
      status: "planned"
    });
    await addMonthlyExpense(augustPlan.id, {
      categoryId: "assinaturas",
      description: "Netflix",
      amountInCents: 2190,
      date: "2026-08-25",
      time: "09:00",
      expenseType: "single",
      recurring: true,
      status: "planned"
    });

    const externalConversationId = `wa-name-${randomUUID()}`;
    await handleAssistantCommand({
      userId,
      channel: "whatsapp",
      externalConversationId,
      externalMessageId: `wamid.${randomUUID()}`,
      message: "paguei a assinatura"
    });
    const second = await handleAssistantCommand({
      userId,
      channel: "whatsapp",
      externalConversationId,
      externalMessageId: `wamid.${randomUUID()}`,
      message: "spotify"
    });
    const secondAction = await findActiveAiPendingAction(second.sessionId);

    assert.equal(second.assistantMessage?.structuredResponse?.responseType, "confirmation");
    assert.equal(secondAction?.status, "awaiting_confirmation");
    assert.equal(secondAction?.extractedFields.expenseId, spotify.id);
  });
});

test("new read intent cancels a broken pending selection instead of trapping the user", async () => {
  const userId = `assistant-pending-read-switch-${randomUUID()}`;

  await asUser(userId, async () => {
    const augustPlan = await saveMonthlyPlan({ year: 2026, month: 8, incomeInCents: 500000, categories: monthlyPlanCategories() });
    assert.ok(augustPlan.id);
    await addMonthlyExpense(augustPlan.id, {
      categoryId: "alimentacao",
      description: "Almoco",
      amountInCents: 10000,
      date: "2026-08-20",
      time: "12:00",
      expenseType: "single",
      recurring: false,
      status: "completed"
    });
    await addMonthlyExpense(augustPlan.id, {
      categoryId: "assinaturas",
      description: "Spotify",
      amountInCents: 1290,
      date: "2026-08-22",
      time: "09:00",
      expenseType: "single",
      recurring: true,
      status: "planned"
    });
    await addMonthlyExpense(augustPlan.id, {
      categoryId: "assinaturas",
      description: "Netflix",
      amountInCents: 2190,
      date: "2026-08-25",
      time: "09:00",
      expenseType: "single",
      recurring: true,
      status: "planned"
    });

    const externalConversationId = `wa-read-switch-${randomUUID()}`;
    const first = await handleAssistantCommand({
      userId,
      channel: "whatsapp",
      externalConversationId,
      externalMessageId: `wamid.${randomUUID()}`,
      message: "paguei a assinatura"
    });
    const second = await handleAssistantCommand({
      userId,
      channel: "whatsapp",
      externalConversationId,
      externalMessageId: `wamid.${randomUUID()}`,
      message: "quanto gastei esse mes?"
    });
    const pendingAfter = await findActiveAiPendingAction(first.sessionId);

    assert.equal(first.assistantMessage?.structuredResponse?.responseType, "form");
    assert.equal(second.assistantMessage?.structuredResponse?.responseType, "summary");
    assert.match(second.assistantMessage?.structuredResponse?.message ?? "", /R\$\s?100,00/);
    assert.doesNotMatch(second.assistantMessage?.structuredResponse?.message ?? "", /gasto pendente/i);
    assert.equal(pendingAfter, null);
  });
});

test("invalid pending candidates fail once and then clear the stuck action", async () => {
  const userId = `assistant-invalid-candidate-${randomUUID()}`;

  await asUser(userId, async () => {
    const augustPlan = await saveMonthlyPlan({ year: 2026, month: 8, incomeInCents: 500000, categories: monthlyPlanCategories() });
    assert.ok(augustPlan.id);
    await addMonthlyExpense(augustPlan.id, {
      categoryId: "alimentacao",
      description: "Almoco",
      amountInCents: 10000,
      date: "2026-08-20",
      time: "12:00",
      expenseType: "single",
      recurring: false,
      status: "completed"
    });
    await addMonthlyExpense(augustPlan.id, {
      categoryId: "assinaturas",
      description: "Spotify",
      amountInCents: 1290,
      date: "2026-08-22",
      time: "09:00",
      expenseType: "single",
      recurring: true,
      status: "planned"
    });
    await addMonthlyExpense(augustPlan.id, {
      categoryId: "assinaturas",
      description: "Netflix",
      amountInCents: 2190,
      date: "2026-08-25",
      time: "09:00",
      expenseType: "single",
      recurring: true,
      status: "planned"
    });

    const externalConversationId = `wa-invalid-${randomUUID()}`;
    const first = await handleAssistantCommand({
      userId,
      channel: "whatsapp",
      externalConversationId,
      externalMessageId: `wamid.${randomUUID()}`,
      message: "paguei a assinatura"
    });
    const active = await findActiveAiPendingAction(first.sessionId);
    assert.ok(active?.id);

    await updateAiPendingAction(active.id, {
      extractedFields: {
        ...active.extractedFields,
        candidateExpenseIds: ["missing-expense-id"],
        candidateExpenses: [{
          id: "missing-expense-id",
          label: "Spotify - R$ 12,90 - 22/08 - Assinaturas",
          description: "Spotify",
          amountInCents: 1290,
          date: "2026-08-22",
          categoryName: "Assinaturas"
        }]
      }
    });

    const invalid = await handleAssistantCommand({
      userId,
      channel: "whatsapp",
      externalConversationId,
      externalMessageId: `wamid.${randomUUID()}`,
      message: "1"
    });
    const followUp = await handleAssistantCommand({
      userId,
      channel: "whatsapp",
      externalConversationId,
      externalMessageId: `wamid.${randomUUID()}`,
      message: "quanto gastei esse mes?"
    });
    const pendingAfter = await findActiveAiPendingAction(first.sessionId);

    assert.equal(invalid.assistantMessage?.structuredResponse?.responseType, "error");
    assert.doesNotMatch(invalid.assistantMessage?.structuredResponse?.message ?? "", /mesma resposta repetida/i);
    assert.equal(followUp.assistantMessage?.structuredResponse?.responseType, "summary");
    assert.match(followUp.assistantMessage?.structuredResponse?.message ?? "", /R\$\s?100,00/);
    assert.equal(pendingAfter, null);
  });
});

test("duplicate recurring spotify candidates collapse to the canonical occurrence", async () => {
  const userId = `assistant-spotify-duplicate-${randomUUID()}`;

  await asUser(userId, async () => {
    const augustPlan = await saveMonthlyPlan({ year: 2026, month: 8, incomeInCents: 500000, categories: monthlyPlanCategories() });
    assert.ok(augustPlan.id);
    const recurrenceId = `spotify-series-${randomUUID()}`;
    const template = await addMonthlyExpense(augustPlan.id, {
      categoryId: "assinaturas",
      description: "Spotify",
      amountInCents: 1290,
      date: "2026-08-22",
      time: "09:00",
      expenseType: "recurring",
      recurring: true,
      status: "planned",
      recurrenceId,
      recurrenceOriginalDate: "2026-08-22"
    });
    const occurrence = await addMonthlyExpense(augustPlan.id, {
      categoryId: "assinaturas",
      description: "Spotify",
      amountInCents: 1290,
      date: "2026-08-22",
      time: "09:00",
      expenseType: "recurring",
      recurring: true,
      status: "planned",
      recurrenceId,
      recurrenceOriginalDate: "2026-08-22",
      recurrenceSourceId: template.id ?? null
    });

    const sessionId = `ai-action-spotify-duplicate-${randomUUID()}`;
    const result = await handleOperationalChatMessage({ sessionId, message: "paguei o spotify" });
    const action = await findActiveAiPendingAction(sessionId);

    assert.equal(result.handled, true);
    assert.equal(result.response.responseType, "confirmation");
    assert.equal(action?.extractedFields.expenseId, occurrence.id);
    assert.doesNotMatch(result.response.message, /qual deles/i);
  });
});

test("whatsapp expense resolution keeps user isolation for equal spotify expenses", async () => {
  const userA = `assistant-spotify-owner-a-${randomUUID()}`;
  const userB = `assistant-spotify-owner-b-${randomUUID()}`;
  let spotifyAId = "";
  let spotifyBId = "";

  await asUser(userA, async () => {
    const plan = await saveMonthlyPlan({ year: 2026, month: 8, incomeInCents: 500000, categories: monthlyPlanCategories() });
    assert.ok(plan.id);
    const spotify = await addMonthlyExpense(plan.id, {
      categoryId: "assinaturas",
      description: "Spotify",
      amountInCents: 1290,
      date: "2026-08-22",
      time: "09:00",
      expenseType: "single",
      recurring: true,
      status: "planned"
    });
    spotifyAId = spotify.id ?? "";
  });

  await asUser(userB, async () => {
    const plan = await saveMonthlyPlan({ year: 2026, month: 8, incomeInCents: 500000, categories: monthlyPlanCategories() });
    assert.ok(plan.id);
    const spotify = await addMonthlyExpense(plan.id, {
      categoryId: "assinaturas",
      description: "Spotify",
      amountInCents: 1290,
      date: "2026-08-22",
      time: "09:00",
      expenseType: "single",
      recurring: true,
      status: "planned"
    });
    spotifyBId = spotify.id ?? "";
  });

  const first = await handleAssistantCommand({
    userId: userA,
    channel: "whatsapp",
    externalConversationId: `wa-owner-a-${randomUUID()}`,
    externalMessageId: `wamid.${randomUUID()}`,
    message: "paguei a assinatura do spotify ja"
  });

  await asUser(userA, async () => {
    const expenses = await listAllMonthlyExpenses();
    const action = await findActiveAiPendingAction(first.sessionId);
    assert.equal(expenses.find((expense) => expense.id === spotifyAId)?.status, "planned");
    assert.equal(action?.extractedFields.expenseId, spotifyAId);
  });

  await asUser(userB, async () => {
    const expenses = await listAllMonthlyExpenses();
    assert.equal(expenses.find((expense) => expense.id === spotifyBId)?.status, "planned");
  });
});

test("monthly income does not invent description fields", async () => {
  const sessionId = "ai-action-income-no-description";
  const result = await handleOperationalChatMessage({ sessionId, message: "Minha renda de agosto sera R$ 4.500,00." });
  const action = await findActiveAiPendingAction(sessionId);

  assert.equal(result.handled, true);
  assert.equal(result.response.responseType, "confirmation");
  assert.equal(action?.extractedFields.month, 8);
  assert.equal(action?.extractedFields.incomeInCents, 450000);
  assert.equal("description" in (action?.extractedFields ?? {}), false);
});

test("extra income creates income entry instead of updating monthly base income", async () => {
  const sessionId = "ai-action-income-entry-extra";
  const result = await handleOperationalChatMessage({ sessionId, message: "Recebi R$ 800,00 de freelance." });
  const action = await findActiveAiPendingAction(sessionId);

  assert.equal(result.handled, true);
  assert.equal(result.response.responseType, "confirmation");
  assert.equal(action?.toolName, "createIncomeEntry");
  assert.equal(action?.extractedFields.amountInCents, 80000);
  assert.equal(action?.extractedFields.category, "Freelance");
  assert.equal(action?.extractedFields.status, "received");
  assert.equal("incomeInCents" in (action?.extractedFields ?? {}), false);
});

test("chat confirmation executes monthly income entry registration", async () => {
  const session = await createChatSession("Teste entrada IA");
  assert.ok(session.id);

  const first = await sendChatMessage(session.id, "Recebi R$ 321,00 de cashback.");
  assert.equal(first.assistantMessage.structuredResponse?.responseType, "confirmation");

  const confirmed = await sendChatMessage(session.id, "confirmo");
  assert.equal(confirmed.assistantMessage.structuredResponse?.responseType, "success");
  assert.equal(confirmed.assistantMessage.structuredResponse?.metadata.mutationKey, "monthlyPlanning.createIncomeEntry");

  const entries = await listAllMonthlyIncomeEntries();
  const entry = entries.find((item) => item.description === "Cashback" && item.amountInCents === 32100);
  assert.equal(entry?.status, "received");
  assert.equal(entry?.category, "Cashback");
});

test("operational chat prepares settings update with confirmation", async () => {
  const sessionId = "ai-action-settings-update";
  const result = await handleOperationalChatMessage({ sessionId, message: "Mude meu nome para Joao Gabriel e troque para tema claro." });
  const action = await findActiveAiPendingAction(sessionId);

  assert.equal(result.handled, true);
  assert.equal(result.response.responseType, "confirmation");
  assert.equal(action?.toolName, "updateSettingsProfile");
  assert.equal(action?.status, "awaiting_confirmation");
  assert.equal(action?.extractedFields.profileName, "Joao Gabriel");
  assert.equal(action?.extractedFields.theme, "light");
});

test("chat confirmation executes settings update with synchronization metadata", async () => {
  const session = await createChatSession("Teste configuracoes IA");
  assert.ok(session.id);

  const first = await sendChatMessage(session.id, "Mude meu nome para Joao e troque para tema claro.");
  assert.equal(first.assistantMessage.structuredResponse?.responseType, "confirmation");

  const confirmed = await sendChatMessage(session.id, "confirmo");
  assert.equal(confirmed.assistantMessage.structuredResponse?.responseType, "success");
  assert.deepEqual(confirmed.assistantMessage.structuredResponse?.metadata.affectedDomains, ["settings"]);
  assert.equal(confirmed.assistantMessage.structuredResponse?.metadata.mutationKey, "settings.profile.update");
  assert.deepEqual(confirmed.assistantMessage.structuredResponse?.metadata.affectedEntities, [{ type: "settings" }]);

  const settings = await getSettings();
  assert.equal(settings.profile.name, "Joao");
  assert.equal(settings.profile.theme, "light");
});

test("missing required operational fields stay collecting and cannot be confirmed", async () => {
  const sessionId = "ai-action-expense-missing-required";
  const result = await handleOperationalChatMessage({ sessionId, message: "Gastei R$ 60,00 agora." });
  const confirm = await handleOperationalChatMessage({ sessionId, message: "confirmo" });

  assert.equal(result.handled, true);
  assert.equal(result.response.responseType, "form");
  assert.equal(result.response.pendingAction?.status, "collecting");
  assert.ok(result.response.pendingAction?.missingFields?.some((field) => field.name === "description"));
  assert.equal(confirm.handled, true);
  assert.equal(confirm.response.responseType, "form");
});

test("expired pending action is not executed on confirmation", async () => {
  const sessionId = "ai-action-expired-confirmation";
  await handleOperationalChatMessage({ sessionId, message: "Registre um aporte de R$ 50,00." });
  const action = await findActiveAiPendingAction(sessionId);
  assert.ok(action?.id);

  await updateAiPendingAction(action.id, { expiresAt: new Date(Date.now() - 1000) });
  const confirm = await handleOperationalChatMessage({ sessionId, message: "confirmo" });

  assert.equal(confirm.handled, true);
  assert.equal(confirm.response.responseType, "error");
});

test("investment purchase collects missing unit price before confirmation", async () => {
  const sessionId = "ai-action-investment-purchase-missing-price";
  const first = await handleOperationalChatMessage({ sessionId, message: "Registrar compra de 100 cotas de VGIR11." });
  const pending = await findActiveAiPendingAction(sessionId);

  assert.equal(first.handled, true);
  assert.equal(first.response.responseType, "form");
  assert.equal(pending?.toolName, "createInvestmentPurchase");
  assert.equal(pending?.extractedFields.assetTicker, "VGIR11");
  assert.equal(pending?.extractedFields.quantity, 100);
  assert.ok(pending?.missingFields.some((field) => field.name === "price"));

  const withPrice = await handleOperationalChatMessage({ sessionId, message: "9,65" });
  const ready = await findActiveAiPendingAction(sessionId);
  assert.equal(withPrice.handled, true);
  assert.equal(withPrice.response.responseType, "confirmation");
  assert.equal(ready?.status, "awaiting_confirmation");
  assert.equal(ready?.extractedFields.price, 9.65);
});

test("active investment collection can receive price even when chat limit is reached", async () => {
  const session = await createChatSession("Teste limite com acao pendente");
  assert.ok(session.id);

  const first = await sendChatMessage(session.id, "Comprei 100 cotas de VGIR11.");
  assert.equal(first.assistantMessage.structuredResponse?.responseType, "form");

  for (let index = 0; index < 20; index += 1) {
    await addAiChatMessage({ sessionId: session.id, role: "user", content: `mensagem extra ${index}` });
  }

  const withPrice = await sendChatMessage(session.id, "9,44");
  assert.equal(withPrice.assistantMessage.structuredResponse?.responseType, "confirmation");
  assert.equal(withPrice.assistantMessage.structuredResponse?.pendingAction?.status, "awaiting_confirmation");
});

test("chat confirmation executes investment purchase through operation repository path", async () => {
  const session = await createChatSession("Teste compra IA");
  assert.ok(session.id);

  const first = await sendChatMessage(session.id, "Comprei 20 acoes de PETR4 por R$ 31,50.");
  assert.equal(first.assistantMessage.structuredResponse?.responseType, "confirmation");

  const confirmed = await sendChatMessage(session.id, "confirmo");
  assert.equal(confirmed.assistantMessage.structuredResponse?.responseType, "success");

  const operations = await listOperations();
  const operation = operations.find((item) => item.assetTicker === "PETR4" && item.quantity === 20 && item.price === 31.5);
  assert.equal(operation?.type, "COMPRA");
});

test("investment purchase keeps explicit fees separate from unit price", async () => {
  const session = await createChatSession("Teste compra IA com taxas");
  assert.ok(session.id);

  const first = await sendChatMessage(session.id, "Comprei 20 acoes de ITUB4 por R$ 31,50 com taxa R$ 1,25 em 01/08/2026.");
  assert.equal(first.assistantMessage.structuredResponse?.responseType, "confirmation");

  const confirmed = await sendChatMessage(session.id, "confirmo");
  assert.equal(confirmed.assistantMessage.structuredResponse?.responseType, "success");

  const operations = await listOperations();
  const operation = operations.find((item) => item.assetTicker === "ITUB4" && item.quantity === 20 && item.price === 31.5);
  assert.equal(operation?.type, "COMPRA");
  assert.equal(operation?.fees, 1.25);
  assert.equal(operation?.date, "2026-08-01");
  assert.equal(operation?.totalValue, 630);
});

test("investment split stores event without fictitious price", async () => {
  const session = await createChatSession("Teste split IA");
  assert.ok(session.id);

  const first = await sendChatMessage(session.id, "Registrar split de 2 VGIR11.");
  assert.equal(first.assistantMessage.structuredResponse?.responseType, "confirmation");

  const confirmed = await sendChatMessage(session.id, "confirmo");
  assert.equal(confirmed.assistantMessage.structuredResponse?.responseType, "success");

  const operations = await listOperations();
  const operation = operations.find((item) => item.assetTicker === "VGIR11" && item.type === "DESDOBRAMENTO");
  assert.equal(operation?.quantity, 2);
  assert.equal(operation?.price, 0);
  assert.equal(operation?.totalValue, 0);
});

test("chat confirmation executes dividend registration", async () => {
  const session = await createChatSession("Teste dividendo IA");
  assert.ok(session.id);

  const first = await sendChatMessage(session.id, "Recebi R$ 52,30 de dividendos do VGIR11.");
  assert.equal(first.assistantMessage.structuredResponse?.responseType, "confirmation");

  const confirmed = await sendChatMessage(session.id, "confirmo");
  assert.equal(confirmed.assistantMessage.structuredResponse?.responseType, "success");

  const dividends = await listDividends();
  const dividend = dividends.find((item) => item.assetTicker === "VGIR11" && item.totalValue === 52.3);
  assert.equal(dividend?.type, "dividendo");
});

test("assistant reuses an expected dividend from the same month even without an explicit date", async () => {
  const userId = `assistant-dividend-same-month-${randomUUID()}`;

  await asUser(userId, async () => {
    const created = await createDividendRecord({
      assetTicker: "PETR4",
      type: "dividendo",
      totalValue: 85.4,
      valuePerShare: 0,
      amountPerShare: 0,
      paymentDate: "2026-08-22",
      status: "expected",
      source: "manual"
    });
    const sessionId = `ai-action-dividend-expected-${randomUUID()}`;
    const result = await handleOperationalChatMessage({ sessionId, message: "recebi 85,40 de dividendos da PETR4" });
    const action = await findActiveAiPendingAction(sessionId);

    assert.equal(result.handled, true);
    assert.equal(result.response.responseType, "confirmation");
    assert.equal(action?.toolName, "markDividendReceived");
    assert.equal(action?.extractedFields.dividendId, created.id);
  });
});

test("investment read questions remain non-operational", async () => {
  const result = await handleOperationalChatMessage({ sessionId: "ai-action-read-dividends", message: "Quanto recebi de dividendos recentemente?" });

  assert.equal(result.handled, false);
});

test("manual average price update is rejected without pending action", async () => {
  const sessionId = "ai-action-manual-average-price";
  const result = await handleOperationalChatMessage({ sessionId, message: "Editar preco medio de VGIR11 para R$ 9,65." });
  const action = await findActiveAiPendingAction(sessionId);

  assert.equal(result.handled, true);
  assert.equal(result.response.responseType, "error");
  assert.equal(action, null);
});
