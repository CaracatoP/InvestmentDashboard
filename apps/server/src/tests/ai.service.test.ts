import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { DisabledAiProvider } from "../ai/providers/disabled.provider";
import { buildConversationContext, detectConversationIntent } from "../ai/builders/conversation-context.builder";
import { buildContextHash } from "../ai/utils/ai-context-hash";
import { estimateAiTokens, stringifyContextForAi } from "../ai/utils/ai-context-budget";
import { createFallbackAnalysis, parseAiAnalysis, parseAiAnalysisStrict, parseAiChatStructuredResponseStrict } from "../ai/utils/ai-response-parser";
import { filterSensitiveData } from "../ai/utils/ai-sensitive-data-filter";
import { handleOperationalChatMessage } from "../ai/tools/ai-action-tools";
import { addAiChatMessage, findActiveAiPendingAction, updateAiPendingAction } from "../repositories/ai.repository";
import { resetSettingsRecord } from "../repositories/investment.repository";
import { listDividends, listOperations } from "../repositories/investment.repository";
import { listAllMonthlyIncomeEntries } from "../repositories/monthly-planning.repository";
import { createChatSession, sendChatMessage } from "../services/ai-manager.service";
import { getSettings } from "../services/portfolio.service";

beforeEach(async () => {
  await resetSettingsRecord();
});

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
  assert.equal(detectConversationIntent("analise minha carteira"), "investments");
  assert.equal(detectConversationIntent("como esta minha rentabilidade?"), "investments");
  assert.equal(detectConversationIntent("quanto tenho investido?"), "investments");
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

test("operational chat asks for missing expense category", async () => {
  const result = await handleOperationalChatMessage({ sessionId: "ai-action-expense-test", message: "Gastei R$ 60,00 com item sem categoria agora." });

  assert.equal(result.handled, true);
  assert.equal(result.response.responseType, "form");
  assert.equal(result.response.pendingAction?.status, "collecting");
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
