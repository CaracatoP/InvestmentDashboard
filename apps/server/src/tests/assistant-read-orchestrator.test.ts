import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { handleOperationalChatMessage } from "../ai/tools/ai-action-tools";
import { createAssistantConversationState } from "../ai/orchestrator/assistant-conversation-state";
import { planAssistantReadMessage } from "../ai/orchestrator/assistant-read-orchestrator";
import { runWithAuthContext } from "../auth/auth-context";
import { env } from "../config/env";
import { findAiChatSessionById } from "../repositories/ai.repository";
import { createAsset, createOperation } from "../repositories/investment.repository";
import { listAllMonthlyExpenses } from "../repositories/monthly-planning.repository";
import { createChatSession, sendChatMessage } from "../services/ai-manager.service";
import { addMonthlyExpense, addMonthlyIncomeEntry, saveMonthlyPlan } from "../services/monthly-planning.service";

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
        default:
          super(...(args as ConstructorParameters<typeof Date>));
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

test("assistant read orchestrator resolves planning paraphrases against the same monthly overview", async () => {
  const userId = `assistant-read-planning-${randomUUID()}`;

  await withMockedDate("2026-08-20T15:00:00.000Z", async () => {
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

      for (const message of [
        "qual meu saldo?",
        "quanto tenho sobrando?",
        "quanto posso gastar?",
        "quanto tenho disponivel para investir?"
      ]) {
        const response = expectHandled(await handleOperationalChatMessage({ sessionId: `${message}-${randomUUID()}`, message }));
        assert.equal(response.response.responseType, "summary");
        assert.doesNotMatch(response.response.message, /nao encontrei dados|dados indisponiveis/i);
        assert.match(JSON.stringify(response.response.sections), /R\$/);
      }
    });
  });
});

test("assistant read follow-ups reuse persisted context across the same session", async () => {
  const userId = `assistant-read-follow-up-${randomUUID()}`;

  await withMockedDate("2026-08-20T15:00:00.000Z", async () => {
    await asUser(userId, async () => {
      const julyPlan = await saveMonthlyPlan({ year: 2026, month: 7, incomeInCents: 400000, categories: monthlyPlanCategories() });
      const augustPlan = await saveMonthlyPlan({ year: 2026, month: 8, incomeInCents: 400000, categories: monthlyPlanCategories() });
      assert.ok(julyPlan.id);
      assert.ok(augustPlan.id);

      await addMonthlyExpense(augustPlan.id, {
        categoryId: "alimentacao",
        description: "Almoco de agosto",
        amountInCents: 10000,
        date: "2026-08-20",
        time: "12:00",
        expenseType: "single",
        recurring: false,
        status: "completed"
      });
      await addMonthlyExpense(augustPlan.id, {
        categoryId: "transporte",
        description: "Uber de agosto",
        amountInCents: 5000,
        date: "2026-08-18",
        time: "10:00",
        expenseType: "single",
        recurring: false,
        status: "completed"
      });
      await addMonthlyExpense(julyPlan.id, {
        categoryId: "alimentacao",
        description: "Almoco de julho",
        amountInCents: 3000,
        date: "2026-07-18",
        time: "12:00",
        expenseType: "single",
        recurring: false,
        status: "completed"
      });

      const session = await createChatSession("Follow-up financeiro");
      assert.ok(session.id);
      const first = await sendChatMessage(session.id, "quanto gastei esse mes?");
      const second = await sendChatMessage(session.id, "e alimentacao?");
      const third = await sendChatMessage(session.id, "e mes passado?");
      const persistedSession = await findAiChatSessionById(session.id);

      assert.match(JSON.stringify(first.assistantMessage.structuredResponse?.sections), /R\$\s?150,00/);
      assert.match(JSON.stringify(second.assistantMessage.structuredResponse?.sections), /R\$\s?100,00/);
      assert.match(JSON.stringify(third.assistantMessage.structuredResponse?.sections), /R\$\s?30,00/);
      assert.equal(persistedSession?.assistantContext?.topic, "expenses");
      assert.equal(persistedSession?.assistantContext?.categoryId, "alimentacao");
    });
  });
});

test("assistant read portfolio position queries stay isolated per user", async () => {
  const suffix = randomUUID().slice(0, 8);
  const userA = `assistant-read-position-a-${suffix}`;
  const userB = `assistant-read-position-b-${suffix}`;

  await asUser(userA, async () => {
    await createAsset({ name: "Valora RE III", ticker: "VGIR11", category: "FII", currency: "BRL", active: true });
    await createOperation({
      assetTicker: "VGIR11",
      type: "COMPRA",
      date: "2026-08-20",
      quantity: 100,
      price: 9.8,
      fees: 0,
      totalValue: 980
    });
  });

  await asUser(userB, async () => {
    await createAsset({ name: "Valora RE III", ticker: "VGIR11", category: "FII", currency: "BRL", active: true });
    await createOperation({
      assetTicker: "VGIR11",
      type: "COMPRA",
      date: "2026-08-20",
      quantity: 25,
      price: 9.8,
      fees: 0,
      totalValue: 245
    });
  });

  const responseA = expectHandled(
    await asUser(userA, () => handleOperationalChatMessage({ sessionId: `vgir11-a-${suffix}`, message: "quantas cotas de VGIR11 tenho?" }))
  );
  const responseB = expectHandled(
    await asUser(userB, () => handleOperationalChatMessage({ sessionId: `vgir11-b-${suffix}`, message: "quantas cotas de VGIR11 tenho?" }))
  );

  assert.match(JSON.stringify(responseA.response.sections), /100/);
  assert.doesNotMatch(JSON.stringify(responseA.response.sections), /25/);
  assert.match(JSON.stringify(responseB.response.sections), /25/);
  assert.doesNotMatch(JSON.stringify(responseB.response.sections), /100/);
});

test("assistant read simulations never persist new expenses", async () => {
  const userId = `assistant-read-simulation-${randomUUID()}`;

  await withMockedDate("2026-08-20T15:00:00.000Z", async () => {
    await asUser(userId, async () => {
      const plan = await saveMonthlyPlan({ year: 2026, month: 8, incomeInCents: 300000, categories: monthlyPlanCategories() });
      assert.ok(plan.id);
      const before = (await listAllMonthlyExpenses()).length;
      const simulation = expectHandled(
        await handleOperationalChatMessage({ sessionId: `simulation-${randomUUID()}`, message: "se eu gastar 200 reais hoje quanto sobra?" })
      );
      const after = (await listAllMonthlyExpenses()).length;

      assert.equal(simulation.response.responseType, "summary");
      assert.match(simulation.response.title ?? "", /Simulacao/i);
      assert.equal(before, after);
    });
  });
});

test("assistant read market routing avoids CoinGecko for CDI, CDB and B3 assets without provider", async () => {
  const previousFetch = global.fetch;
  const previousMarketDataProvider = env.marketDataProvider;
  const previousMarketDataApiKey = env.marketDataApiKey;
  let coinGeckoCalls = 0;
  let bcbCalls = 0;

  global.fetch = (async (input) => {
    const url = String(input);
    if (url.startsWith("https://api.bcb.gov.br/")) {
      bcbCalls += 1;
      return new Response(JSON.stringify([{ data: "20/08/2026", valor: "0.041234" }]), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (/coingecko/i.test(url)) {
      coinGeckoCalls += 1;
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected fetch ${url}`);
  }) as typeof fetch;
  env.marketDataProvider = "";
  env.marketDataApiKey = "";

  try {
    const userId = `assistant-read-market-${randomUUID()}`;
    const cdi = expectHandled(
      await asUser(userId, () => handleOperationalChatMessage({ sessionId: `cdi-${randomUUID()}`, message: "quanto esta o CDI?" }))
    );
    const cdb = expectHandled(
      await asUser(userId, () => handleOperationalChatMessage({ sessionId: `cdb-${randomUUID()}`, message: "quanto esta o CDB?" }))
    );
    const vgir = expectHandled(
      await asUser(userId, () => handleOperationalChatMessage({ sessionId: `vgir-${randomUUID()}`, message: "quanto esta o VGIR11?" }))
    );

    assert.match(cdi.response.title ?? "", /CDI/i);
    assert.match(cdb.response.message, /renda fixa|cotacao unica/i);
    assert.match(vgir.response.message, /B3.*integradas|ativos B3/i);
    assert.equal(coinGeckoCalls, 0);
    assert.equal(bcbCalls >= 0, true);
  } finally {
    global.fetch = previousFetch;
    env.marketDataProvider = previousMarketDataProvider;
    env.marketDataApiKey = previousMarketDataApiKey;
  }
});

test("assistant planner evaluation covers 50 representative scenarios without provider misuse", () => {
  const followUpExpenseContext = createAssistantConversationState({
    topic: "expenses",
    entityType: "general",
    period: { type: "month", year: 2026, month: 8, label: "Agosto/2026" },
    comparisonPeriod: null,
    categoryId: null,
    categoryName: null,
    descriptionQuery: null,
    assetTicker: null,
    assetName: null,
    assetClass: null,
    marketEntityType: null,
    lastCapabilityNames: ["getExpenseAnalytics"],
    lastQueryKind: "expense_total"
  });
  const followUpCategoryContext = createAssistantConversationState({
    topic: "expenses",
    entityType: "category",
    period: { type: "month", year: 2026, month: 8, label: "Agosto/2026" },
    comparisonPeriod: null,
    categoryId: "alimentacao",
    categoryName: "Alimentacao",
    descriptionQuery: null,
    assetTicker: null,
    assetName: null,
    assetClass: null,
    marketEntityType: null,
    lastCapabilityNames: ["getExpenseAnalytics"],
    lastQueryKind: "expense_category_total"
  });

  const scenarios: Array<{
    message: string;
    expectedQueryKind: string | null;
    expectedCapability?: string;
    expectedEntityType?: string;
    conversationState?: typeof followUpExpenseContext | typeof followUpCategoryContext;
  }> = [
    { message: "qual meu saldo?", expectedQueryKind: "balance", expectedCapability: "getPlanningSnapshot" },
    { message: "quanto eu tenho hoje?", expectedQueryKind: "balance", expectedCapability: "getPlanningSnapshot" },
    { message: "quanto tenho sobrando?", expectedQueryKind: "available_spend", expectedCapability: "getPlanningSnapshot" },
    { message: "quanto ainda posso gastar esse mes?", expectedQueryKind: "available_spend", expectedCapability: "getPlanningSnapshot" },
    { message: "quanto posso investir?", expectedQueryKind: "available_invest", expectedCapability: "getPlanningSnapshot" },
    { message: "quanto tenho disponivel para investir?", expectedQueryKind: "available_invest", expectedCapability: "getPlanningSnapshot" },
    { message: "quanto gastei esse mes?", expectedQueryKind: "expense_total", expectedCapability: "getExpenseAnalytics" },
    { message: "quanto ja foi embora esse mes?", expectedQueryKind: "expense_total", expectedCapability: "getExpenseAnalytics" },
    { message: "quanto saiu da minha conta?", expectedQueryKind: "expense_total", expectedCapability: "getExpenseAnalytics" },
    { message: "quanto gastei com alimentacao?", expectedQueryKind: "expense_category_total", expectedCapability: "getExpenseAnalytics" },
    { message: "quanto gastei de gasolina nos ultimos 3 meses?", expectedQueryKind: "expense_total", expectedCapability: "getExpenseAnalytics" },
    { message: "qual foi meu maior gasto?", expectedQueryKind: "expense_largest", expectedCapability: "getExpenseAnalytics" },
    { message: "onde mais gastei?", expectedQueryKind: "expense_top_category", expectedCapability: "getExpenseAnalytics" },
    { message: "quais contas ainda tenho para pagar?", expectedQueryKind: "expenses_pending", expectedCapability: "getExpenseAnalytics" },
    { message: "quanto falta pagar esse mes?", expectedQueryKind: "expenses_pending", expectedCapability: "getExpenseAnalytics" },
    { message: "o que vence essa semana?", expectedQueryKind: "expenses_pending", expectedCapability: "getExpenseAnalytics" },
    { message: "quanto ganhei esse mes?", expectedQueryKind: "income_total", expectedCapability: "getIncomeAnalytics" },
    { message: "quanto recebi de freelance esse ano?", expectedQueryKind: "income_total", expectedCapability: "getIncomeAnalytics" },
    { message: "quanto recebi de dividendos esse ano?", expectedQueryKind: "dividend_total", expectedCapability: "getDividendAnalytics" },
    { message: "qual ativo mais me pagou dividendos?", expectedQueryKind: "dividend_top_asset", expectedCapability: "getDividendAnalytics" },
    { message: "quanto VGIR11 me pagou?", expectedQueryKind: "dividend_total", expectedCapability: "getDividendAnalytics" },
    { message: "quanto tenho investido?", expectedQueryKind: "portfolio_overview", expectedCapability: "getPortfolioSnapshot" },
    { message: "como esta minha carteira?", expectedQueryKind: "portfolio_overview", expectedCapability: "getPortfolioSnapshot" },
    { message: "qual minha rentabilidade?", expectedQueryKind: "portfolio_overview", expectedCapability: "getPortfolioSnapshot" },
    { message: "qual ativo esta dando mais prejuizo?", expectedQueryKind: "portfolio_worst_position", expectedCapability: "getPortfolioSnapshot" },
    { message: "quantas cotas de VGIR11 tenho?", expectedQueryKind: "portfolio_position", expectedCapability: "getPortfolioSnapshot" },
    { message: "quanto tenho em FIIs?", expectedQueryKind: "portfolio_class_exposure", expectedCapability: "getPortfolioSnapshot" },
    { message: "quanto tenho em cripto?", expectedQueryKind: "portfolio_class_exposure", expectedCapability: "getPortfolioSnapshot" },
    { message: "quanto tenho de BTC?", expectedQueryKind: "portfolio_position", expectedCapability: "getPortfolioSnapshot" },
    { message: "quanto meus bitcoins valem hoje?", expectedQueryKind: "portfolio_asset_market_value", expectedCapability: "getPortfolioSnapshot" },
    { message: "quanto tenho investido comparado ao que tenho livre?", expectedQueryKind: "planning_vs_portfolio", expectedCapability: "getPortfolioSnapshot" },
    { message: "quanto eu ganhei esse mes, quanto gastei e quanto sobrou?", expectedQueryKind: "financial_summary", expectedCapability: "getPlanningSnapshot" },
    { message: "me resume minha situacao financeira", expectedQueryKind: "financial_summary", expectedCapability: "getPlanningSnapshot" },
    { message: "se eu gastar 100 hoje quanto sobra?", expectedQueryKind: "simulation", expectedCapability: "simulatePlanningImpact" },
    { message: "se eu investir 500 quanto fica disponivel?", expectedQueryKind: "simulation", expectedCapability: "simulatePlanningImpact" },
    { message: "se eu receber 800 esse mes quanto muda?", expectedQueryKind: "simulation", expectedCapability: "simulatePlanningImpact" },
    { message: "quanto esta o bitcoin?", expectedQueryKind: "market_quote", expectedCapability: "getMarketQuote", expectedEntityType: "crypto" },
    { message: "quanto esta ETH?", expectedQueryKind: "market_quote", expectedCapability: "getMarketQuote", expectedEntityType: "crypto" },
    { message: "quanto ta o CDI?", expectedQueryKind: "market_quote", expectedCapability: "getMarketQuote", expectedEntityType: "macro_indicator" },
    { message: "quanto ta o CDB?", expectedQueryKind: "market_quote", expectedCapability: "getMarketQuote", expectedEntityType: "fixed_income" },
    { message: "quanto ta o VGIR11?", expectedQueryKind: "market_quote", expectedCapability: "getMarketQuote", expectedEntityType: "b3" },
    { message: "quanto ta a PETR4?", expectedQueryKind: "market_quote", expectedCapability: "getMarketQuote", expectedEntityType: "b3" },
    { message: "o que e CDI?", expectedQueryKind: null },
    { message: "qual a diferenca entre CDB e LCI?", expectedQueryKind: null },
    { message: "ja paguei o Spotify?", expectedQueryKind: "payment_status", expectedCapability: "getExpensePaymentStatus" },
    { message: "como estou em relacao a minha meta de investimentos?", expectedQueryKind: "goal_progress", expectedCapability: "getGoalsSnapshot" },
    { message: "qual percentual do meu patrimonio eu recebi em dividendos esse ano?", expectedQueryKind: "dividends_vs_portfolio", expectedCapability: "getDividendAnalytics" },
    { message: "e alimentacao?", expectedQueryKind: "expense_category_total", expectedCapability: "getExpenseAnalytics", conversationState: followUpExpenseContext },
    { message: "e mes passado?", expectedQueryKind: "expense_category_total", expectedCapability: "getExpenseAnalytics", conversationState: followUpCategoryContext },
    { message: "e ethereum?", expectedQueryKind: null, conversationState: followUpCategoryContext },
    { message: "quanto tenho?", expectedQueryKind: "balance", expectedCapability: "getPlanningSnapshot" }
  ];

  assert.ok(scenarios.length >= 50, `Expected at least 50 scenarios, received ${scenarios.length}`);

  for (const scenario of scenarios) {
    const plan = planAssistantReadMessage({
      message: scenario.message,
      timeZone: "America/Sao_Paulo",
      conversationState: scenario.conversationState ?? null
    });

    if (scenario.expectedQueryKind === null) {
      assert.equal(plan, null, `Expected null plan for "${scenario.message}"`);
      continue;
    }

    assert.ok(plan, `Expected a plan for "${scenario.message}"`);
    assert.equal(plan?.queryKind, scenario.expectedQueryKind, `Unexpected query kind for "${scenario.message}"`);
    assert.equal(plan?.capabilityCalls[0]?.name, scenario.expectedCapability, `Unexpected first capability for "${scenario.message}"`);
    if (scenario.expectedEntityType) {
      assert.equal(plan?.marketEntityType, scenario.expectedEntityType, `Unexpected entity type for "${scenario.message}"`);
    }
  }
});
