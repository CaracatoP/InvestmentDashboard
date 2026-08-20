import type { AiChatStructuredResponse } from "../schemas/ai.schema";
import { createStructuredResponse } from "../utils/ai-structured-response";
import { DEFAULT_APP_TIME_ZONE, getTimeZoneNowFields, shiftDateKey } from "../../utils/timezone";
import {
  createAssistantConversationState,
  resolveAssistantConversationState,
  type AssistantAssetClass,
  type AssistantConversationState,
  type AssistantPeriodContext,
  type AssistantTopic
} from "./assistant-conversation-state";
import {
  executeAssistantCapability,
  listAssistantReadCapabilities,
  type AssistantCapabilityCall,
  type AssistantReadCapabilityName
} from "./assistant-capability-registry";

const maxAssistantCapabilityCalls = 4;

const monthNames = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro"
] as const;

const categoryLexicon = [
  { id: "alimentacao", name: "Alimentacao", aliases: ["alimentacao", "comida", "almoco", "jantar", "mercado", "restaurante"] },
  { id: "transporte", name: "Transporte", aliases: ["transporte", "gasolina", "combustivel", "uber", "onibus", "carro"] },
  { id: "moradia", name: "Moradia", aliases: ["moradia", "aluguel", "condominio", "agua", "luz", "energia"] },
  { id: "assinaturas", name: "Assinaturas", aliases: ["assinatura", "assinaturas", "spotify", "netflix", "amazon", "youtube premium"] },
  { id: "investimentos", name: "Investimentos", aliases: ["investimento", "investimentos", "aporte", "aportes"] },
  { id: "saude", name: "Saude", aliases: ["saude", "farmacia", "medico", "consulta", "academia"] },
  { id: "educacao", name: "Educacao", aliases: ["educacao", "curso", "faculdade", "escola", "livro"] },
  { id: "lazer", name: "Lazer", aliases: ["lazer", "cinema", "show", "viagem", "bar", "streaming"] }
] as const;

const availableInvestIntentPattern =
  /\b(investir|livre para investir|disponivel para investir|disponível para investir|aportar)\b/;
const availableSpendIntentPattern =
  /\b(pra gastar|para gastar|ainda posso gastar|posso gastar|sobrou do meu salario|sobrou do meu salário|sobrando|sobrou|resta do orcamento|resta do orçamento)\b/;
const balanceIntentPattern =
  /\b(saldo|quanto eu tenho hoje|quanto eu tenho\b|quanto tenho\??|dinheiro disponivel|dinheiro disponível|quanto ainda tenho esse mes|quanto ainda tenho esse mês|quanto tenho hoje)\b/;
const financialSummaryIntentPattern = /\b(me resume|minha situacao financeira|resumo financeiro)\b/;
const expenseIntentPattern = /\b(gastei|gasto|despesa|despesas|foi embora|saiu da minha conta)\b/;
const pendingExpenseIntentPattern = /\b(quais contas|faltam pagar|o que vence|quanto falta pagar)\b/;
const paymentStatusIntentPattern = /\bja paguei\b|\best[aá] pago\b/;
const dividendIntentPattern = /\b(dividendo|dividendos|jcp|rendimento)\b/;
const dividendPayoutIntentPattern = /\b(me pagou|pagou|rendeu)\b/;
const combinedFinancialSummaryIntentPattern =
  /\b(quanto(?:\s+eu)?\s+ganhei|quanto(?:\s+eu)?\s+recebi).*\b(quanto\s+gastei|quanto(?:\s+eu)?\s+gastei).*\b(sobrou|saldo|quanto tenho)\b/;

type MarketEntityType = "crypto" | "b3" | "macro_indicator" | "fixed_income" | "unknown";
type DetectedCategory = {
  id: string;
  name: string;
  matchedAlias: string;
  isCanonical: boolean;
};
type DetectedMarketEntity =
  | { entityType: "crypto"; entityQuery: string; assetTicker: string; assetName: string }
  | { entityType: "b3"; entityQuery: string; assetTicker: string; assetName: string }
  | { entityType: "macro_indicator"; entityQuery: string; assetTicker: null; assetName: string }
  | { entityType: "fixed_income"; entityQuery: string; assetTicker: null; assetName: string }
  | { entityType: "unknown"; entityQuery: string; assetTicker: null; assetName: string };
type QueryKind =
  | "financial_summary"
  | "balance"
  | "available_spend"
  | "available_invest"
  | "expense_total"
  | "expense_category_total"
  | "expense_largest"
  | "expense_top_category"
  | "expenses_pending"
  | "payment_status"
  | "income_total"
  | "dividend_total"
  | "dividend_top_asset"
  | "portfolio_overview"
  | "portfolio_position"
  | "portfolio_class_exposure"
  | "portfolio_worst_position"
  | "market_quote"
  | "portfolio_asset_market_value"
  | "goal_progress"
  | "planning_vs_portfolio"
  | "dividends_vs_portfolio"
  | "simulation";

interface AssistantReadPlan {
  topic: AssistantTopic;
  queryKind: QueryKind;
  title: string;
  capabilityCalls: AssistantCapabilityCall[];
  period?: AssistantPeriodContext | null;
  comparisonPeriod?: AssistantPeriodContext | null;
  categoryId?: string | null;
  categoryName?: string | null;
  descriptionQuery?: string | null;
  assetTicker?: string | null;
  assetName?: string | null;
  assetClass?: AssistantAssetClass | null;
  marketEntityType?: MarketEntityType | null;
  entityQuery?: string | null;
}

export interface AssistantReadOrchestrationResult {
  response: AiChatStructuredResponse;
  conversationState: AssistantConversationState;
  plan: AssistantReadPlan;
  capabilityNames: AssistantReadCapabilityName[];
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatCurrencyFromCents(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
}

function formatMarketCurrency(value: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}%`;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: value < 1 ? 4 : 0, maximumFractionDigits: 8 }).format(value);
}

function dateKey(value: string | Date) {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function formatDateBr(value: string | Date) {
  const key = dateKey(value);
  return `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;
}

function formatMonthLabel(year: number, month: number) {
  return `${monthNames[month - 1][0].toUpperCase()}${monthNames[month - 1].slice(1)}/${year}`;
}

function formatPeriodLabel(period?: AssistantPeriodContext | null) {
  if (!period) return "periodo atual";
  return period.label;
}

function currentMonthPeriod(timeZone = DEFAULT_APP_TIME_ZONE): Extract<AssistantPeriodContext, { type: "month" }> {
  const now = getTimeZoneNowFields(new Date(), timeZone);
  return { type: "month", year: now.year, month: now.month, label: formatMonthLabel(now.year, now.month) };
}

function currentYearPeriod(timeZone = DEFAULT_APP_TIME_ZONE): Extract<AssistantPeriodContext, { type: "year" }> {
  const now = getTimeZoneNowFields(new Date(), timeZone);
  return { type: "year", year: now.year, label: String(now.year) };
}

function shiftMonthPeriod(period: { year: number; month: number }, delta: number): Extract<AssistantPeriodContext, { type: "month" }> {
  const reference = new Date(Date.UTC(period.year, period.month - 1 + delta, 1, 12, 0, 0, 0));
  return {
    type: "month",
    year: reference.getUTCFullYear(),
    month: reference.getUTCMonth() + 1,
    label: formatMonthLabel(reference.getUTCFullYear(), reference.getUTCMonth() + 1)
  };
}

function monthPeriodToRange(period: Extract<AssistantPeriodContext, { type: "month" }>) {
  const from = `${period.year}-${pad(period.month)}-01`;
  const lastDay = new Date(Date.UTC(period.year, period.month, 0, 12, 0, 0, 0)).getUTCDate();
  return { from, to: `${period.year}-${pad(period.month)}-${pad(lastDay)}`, label: period.label };
}

function ensureMonthPeriod(period: AssistantPeriodContext, timeZone = DEFAULT_APP_TIME_ZONE): Extract<AssistantPeriodContext, { type: "month" }> {
  return period.type === "month" ? period : currentMonthPeriod(timeZone);
}

function parseExplicitMonth(message: string, timeZone = DEFAULT_APP_TIME_ZONE): AssistantPeriodContext | null {
  const normalized = normalizeText(message);
  const yearMatch = normalized.match(/\b(20\d{2})\b/);
  const explicitYear = yearMatch ? Number(yearMatch[1]) : null;
  const now = getTimeZoneNowFields(new Date(), timeZone);

  for (const [index, monthName] of monthNames.entries()) {
    if (normalized.includes(monthName)) {
      const month = index + 1;
      const year = explicitYear ?? now.year;
      return { type: "month", year, month, label: formatMonthLabel(year, month) };
    }
  }

  return null;
}

function parseRequestedPeriod(
  message: string,
  timeZone = DEFAULT_APP_TIME_ZONE,
  fallback?: AssistantPeriodContext | null
): AssistantPeriodContext {
  const normalized = normalizeText(message);
  const now = getTimeZoneNowFields(new Date(), timeZone);
  const explicitMonth = parseExplicitMonth(normalized, timeZone);
  if (explicitMonth) return explicitMonth;
  if (/\bano passado\b/.test(normalized)) return { type: "year", year: now.year - 1, label: String(now.year - 1) };
  if (/\b(esse|este|neste) ano\b/.test(normalized)) return { type: "year", year: now.year, label: String(now.year) };
  if (/\bmes passado\b/.test(normalized)) return shiftMonthPeriod({ year: now.year, month: now.month }, -1);
  if (/\b(esse|este|neste) mes\b/.test(normalized)) return currentMonthPeriod(timeZone);

  const trailingMonths = normalized.match(/\bultim(?:o|os|a|as)\s+(\d+)\s+mes(?:es)?\b/);
  if (trailingMonths) {
    const amount = Math.max(1, Number(trailingMonths[1]));
    const start = shiftMonthPeriod({ year: now.year, month: now.month }, -(amount - 1));
    return {
      type: "range",
      from: `${start.year}-${pad(start.month)}-01`,
      to: now.date,
      label: `Ultimos ${amount} meses`
    };
  }

  const trailingDays = normalized.match(/\bultim(?:o|os|a|as)\s+(\d+)\s+dias\b/);
  if (trailingDays) {
    const amount = Math.max(1, Number(trailingDays[1]));
    return {
      type: "range",
      from: shiftDateKey(now.date, -(amount - 1)),
      to: now.date,
      label: `Ultimos ${amount} dias`
    };
  }

  if (/\b(essa|esta|nesta) semana\b/.test(normalized)) {
    return {
      type: "range",
      from: now.date,
      to: shiftDateKey(now.date, 6),
      label: "Esta semana"
    };
  }

  return fallback ?? currentMonthPeriod(timeZone);
}

function periodToCapabilityArguments(period: AssistantPeriodContext) {
  if (period.type === "month") return { month: { year: period.year, month: period.month } };
  if (period.type === "year") return { year: period.year };
  return { range: { from: period.from, to: period.to, label: period.label } };
}

function isKnowledgeQuestion(message: string) {
  const normalized = normalizeText(message);
  return /^(o que (e|eh)|o que significa|qual a diferenca|qual a diferenca entre|como funciona|me explica)\b/.test(normalized);
}

function looksLikeFinancialQuestion(message: string) {
  const normalized = normalizeText(message);
  return (
    /^se eu\b/.test(normalized) ||
    balanceIntentPattern.test(normalized) ||
    availableSpendIntentPattern.test(normalized) ||
    availableInvestIntentPattern.test(normalized) ||
    financialSummaryIntentPattern.test(normalized) ||
    expenseIntentPattern.test(normalized) ||
    pendingExpenseIntentPattern.test(normalized) ||
    paymentStatusIntentPattern.test(normalized) ||
    /(gastar|renda|ganhei|recebi|divid|carteira|invest|cota|cotas|acao|acoes|fii|fiis|cripto|bitcoin|btc|ethereum|eth|solana|vgir11|petr4|vale3|itub4|spotify|conta|pagar|vence|meta|aporte|rentabilidade|prejuizo|cotacao|preco|cdi|selic|ipca|igp|cdb|lci|lca|tesouro)/.test(
      normalized
    )
  );
}

function detectCategory(message: string): DetectedCategory | null {
  const normalized = normalizeText(message);
  for (const category of categoryLexicon) {
    for (const alias of category.aliases) {
      const normalizedAlias = normalizeText(alias);
      if (!normalized.includes(normalizedAlias)) continue;
      return {
        id: category.id,
        name: category.name,
        matchedAlias: normalizedAlias,
        isCanonical: normalizedAlias === category.id || normalizedAlias === normalizeText(category.name)
      };
    }
  }
  return null;
}

function detectAssetClass(message: string): AssistantAssetClass | null {
  const normalized = normalizeText(message);
  if (/\b(fiis?|fundos? imobiliarios?)\b/.test(normalized)) return "fii";
  if (/\b(etfs?)\b/.test(normalized)) return "etf";
  if (/\b(acoes?|acoes brasileiras|stocks?)\b/.test(normalized)) return "stock";
  if (/\b(criptos?|criptomoedas?)\b/.test(normalized)) return "crypto";
  return null;
}

function detectMarketEntity(message: string, previousState?: AssistantConversationState | null): DetectedMarketEntity {
  const rawTicker = message.match(/\b([A-Z]{4}\d{1,2}F?)\b/)?.[1] ?? null;
  const normalized = normalizeText(message);

  if (/\b(cdi|selic|ipca|igp-m|igpm)\b/.test(normalized)) {
    const label = normalized.includes("cdi") ? "CDI" : normalized.includes("selic") ? "Selic" : normalized.includes("ipca") ? "IPCA" : "IGP-M";
    return { entityType: "macro_indicator" as const, entityQuery: label, assetTicker: null, assetName: label };
  }

  if (/\b(cdb|lci|lca|tesouro selic|tesouro direto|debenture|debentures)\b/.test(normalized)) {
    const label = normalized.includes("cdb")
      ? "CDB"
      : normalized.includes("lci")
        ? "LCI"
        : normalized.includes("lca")
          ? "LCA"
          : normalized.includes("tesouro")
            ? "Tesouro Selic"
            : "Debenture";
    return { entityType: "fixed_income" as const, entityQuery: label, assetTicker: null, assetName: label };
  }

  if (rawTicker) {
    return {
      entityType: "b3" as const,
      entityQuery: rawTicker,
      assetTicker: rawTicker,
      assetName: rawTicker
    };
  }

  const cryptoAliases = [
    ["bitcoin", "BTC", "Bitcoin"],
    ["btc", "BTC", "Bitcoin"],
    ["ethereum", "ETH", "Ethereum"],
    ["eth", "ETH", "Ethereum"],
    ["solana", "SOL", "Solana"],
    ["sol", "SOL", "Solana"]
  ] as const;
  const matchedCrypto = cryptoAliases.find(([alias]) => normalized.includes(alias));
  if (matchedCrypto) {
    return {
      entityType: "crypto" as const,
      entityQuery: matchedCrypto[2],
      assetTicker: matchedCrypto[1],
      assetName: matchedCrypto[2]
    };
  }

  if (previousState?.topic === "market" && previousState.marketEntityType === "crypto" && /\b(e|e o|e a)\b/.test(normalized)) {
    const followUpCrypto = cryptoAliases.find(([alias]) => normalized.includes(alias));
    if (followUpCrypto) {
      return {
        entityType: "crypto" as const,
        entityQuery: followUpCrypto[2],
        assetTicker: followUpCrypto[1],
        assetName: followUpCrypto[2]
      };
    }
  }

  return { entityType: "unknown" as const, entityQuery: message.trim(), assetTicker: null, assetName: message.trim() };
}

function extractDescriptionQuery(message: string) {
  const normalized = normalizeText(message);
  const paidQuery = normalized.match(/\bja paguei (?:o|a)?\s+(.+?)(?:\?|$)/);
  if (paidQuery?.[1]) return paidQuery[1].trim();
  const spentQuery = normalized.match(/\bgastei(?:\s+\w+){0,3}\s+(?:com|de)\s+(.+?)(?:\s+(?:nos?|nas?|em|esse|este|neste|ultim(?:o|os|a|as)|mes|ano)|\?|$)/);
  if (spentQuery?.[1]) return spentQuery[1].trim();
  return null;
}

function parseAmountInCents(message: string) {
  const match = message.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/i);
  if (!match) return null;
  const reais = Number(match[1].replace(/\./g, ""));
  const cents = Number((match[2] ?? "0").padEnd(2, "0"));
  const value = reais * 100 + cents;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function isFollowUpOnly(message: string) {
  const normalized = normalizeText(message);
  return /^(e|e em|e no|e na|e do|e da|e mes|e mês|e ano|e agora|e quanto|e qual)\b/.test(normalized);
}

function isPeriodContinuationFollowUp(normalized: string) {
  return /\b(mes passado|mês passado|esse mes|esse mês|este mes|este mês|neste mes|neste mês|esse ano|ano passado|ultim(?:o|os|a|as)\s+\d+\s+(mes(?:es)?|dias)|essa semana|esta semana|agora)\b/.test(
    normalized
  );
}

function buildPlanningContextState(plan: AssistantReadPlan) {
  return createAssistantConversationState({
    topic: plan.topic,
    entityType: plan.categoryId || plan.categoryName ? "category" : "general",
    period: plan.period ?? null,
    comparisonPeriod: plan.comparisonPeriod ?? null,
    categoryId: plan.categoryId ?? null,
    categoryName: plan.categoryName ?? null,
    descriptionQuery: plan.descriptionQuery ?? null,
    assetTicker: plan.assetTicker ?? null,
    assetName: plan.assetName ?? null,
    assetClass: plan.assetClass ?? null,
    marketEntityType: plan.marketEntityType ?? null,
    lastCapabilityNames: plan.capabilityCalls.map((call) => call.name),
    lastQueryKind: plan.queryKind
  });
}

function buildFollowUpPlan(
  message: string,
  timeZone: string,
  previousState?: AssistantConversationState | null
): AssistantReadPlan | null {
  const state = resolveAssistantConversationState(previousState);
  if (!state || !isFollowUpOnly(message)) return null;
  const normalized = normalizeText(message);
  const period = parseRequestedPeriod(message, timeZone, state.period ?? currentMonthPeriod(timeZone));
  const category = detectCategory(message);
  const marketEntity = detectMarketEntity(message, state);
  const specificExpenseQuery = category && !category.isCanonical ? category.matchedAlias : null;

  if ((state.topic === "expenses" || state.topic === "planning") && category?.isCanonical) {
    return {
      topic: "expenses",
      queryKind: "expense_category_total",
      title: `Gastos em ${category.name}`,
      period,
      categoryId: category.id,
      categoryName: category.name,
      capabilityCalls: [
        {
          name: "getExpenseAnalytics",
          arguments: { ...periodToCapabilityArguments(period), categoryId: category.id, categoryName: category.name, statuses: ["completed"], limit: 8 }
        }
      ]
    };
  }

  if ((state.topic === "expenses" || state.topic === "planning") && specificExpenseQuery) {
    return {
      topic: "expenses",
      queryKind: "expense_total",
      title: `Gastos com ${specificExpenseQuery}`,
      period,
      descriptionQuery: specificExpenseQuery,
      capabilityCalls: [
        {
          name: "getExpenseAnalytics",
          arguments: { ...periodToCapabilityArguments(period), textQuery: specificExpenseQuery, statuses: ["completed"], limit: 8 }
        }
      ]
    };
  }

  if (
    (state.topic === "expenses" || state.topic === "planning") &&
    state.lastQueryKind?.startsWith("expense") &&
    isPeriodContinuationFollowUp(normalized) &&
    marketEntity.entityType === "unknown"
  ) {
    return {
      topic: "expenses",
      queryKind: (state.lastQueryKind as QueryKind) ?? "expense_total",
      title: "Gastos comparados",
      period,
      categoryId: state.categoryId ?? null,
      categoryName: state.categoryName ?? null,
      descriptionQuery: state.descriptionQuery ?? null,
      capabilityCalls: [
        {
          name: "getExpenseAnalytics",
          arguments: {
            ...periodToCapabilityArguments(period),
            statuses: ["completed"],
            ...(state.categoryId ? { categoryId: state.categoryId } : {}),
            ...(state.categoryName ? { categoryName: state.categoryName } : {}),
            ...(state.descriptionQuery ? { textQuery: state.descriptionQuery } : {}),
            limit: 8
          }
        }
      ]
    };
  }

  if (state.topic === "market" && marketEntity.entityType === "crypto") {
    const cryptoEntity = marketEntity as Extract<DetectedMarketEntity, { entityType: "crypto" }>;
    return {
      topic: "market",
      queryKind: "market_quote",
      title: `Cotacao ${cryptoEntity.assetTicker ?? cryptoEntity.entityQuery}`,
      period: state.period ?? null,
      assetTicker: cryptoEntity.assetTicker,
      assetName: cryptoEntity.assetName,
      marketEntityType: cryptoEntity.entityType,
      entityQuery: cryptoEntity.entityQuery,
      capabilityCalls: [
        {
          name: "getMarketQuote",
          arguments: {
            entityQuery: cryptoEntity.entityQuery,
            entityType: cryptoEntity.entityType,
            assetTicker: cryptoEntity.assetTicker ?? undefined,
            assetName: cryptoEntity.assetName ?? undefined,
            currency: "BRL"
          }
        }
      ]
    };
  }

  return null;
}

function buildPrimaryPlan(message: string, timeZone: string, previousState?: AssistantConversationState | null): AssistantReadPlan | null {
  const normalized = normalizeText(message);
  const period = parseRequestedPeriod(message, timeZone);
  const planningMonth = ensureMonthPeriod(period, timeZone);
  const currentMonth = currentMonthPeriod(timeZone);
  const currentYear = currentYearPeriod(timeZone);
  const category = detectCategory(message);
  const assetClass = detectAssetClass(message);
  const extractedDescriptionQuery = extractDescriptionQuery(message);
  const canonicalCategory = category?.isCanonical ? category : null;
  const descriptionQuery = extractedDescriptionQuery ?? (category && !category.isCanonical ? category.matchedAlias : null);
  const marketEntity = detectMarketEntity(message, previousState);
  const amountInCents = parseAmountInCents(message);

  if (!looksLikeFinancialQuestion(message)) return null;

  if (/^se eu\b/.test(normalized) && amountInCents) {
    const scenario = /\b(receber|ganhar)\b/.test(normalized)
      ? "income"
      : /\b(investir|aportar)\b/.test(normalized)
        ? "investment"
        : "expense";
    return {
      topic: "simulation",
      queryKind: "simulation",
      title: "Simulacao financeira",
      period: currentMonth,
      capabilityCalls: [
        {
          name: "simulatePlanningImpact",
          arguments: { year: currentMonth.year, month: currentMonth.month, scenario, amountInCents }
        }
      ]
    };
  }

  if (financialSummaryIntentPattern.test(normalized)) {
    return {
      topic: "planning",
      queryKind: "financial_summary",
      title: `Resumo financeiro - ${formatPeriodLabel(currentMonth)}`,
      period: currentMonth,
      capabilityCalls: [
        { name: "getPlanningSnapshot", arguments: { year: currentMonth.year, month: currentMonth.month } },
        { name: "getPortfolioSnapshot", arguments: {} },
        { name: "getDividendAnalytics", arguments: { ...periodToCapabilityArguments(currentMonth) } }
      ]
    };
  }

  if (paymentStatusIntentPattern.test(normalized) && descriptionQuery) {
    return {
      topic: "expenses",
      queryKind: "payment_status",
      title: "Status do gasto",
      period,
      descriptionQuery,
      capabilityCalls: [
        {
          name: "getExpensePaymentStatus",
          arguments: { ...periodToCapabilityArguments(period), descriptionQuery, limit: 5 }
        }
      ]
    };
  }

  if (pendingExpenseIntentPattern.test(normalized)) {
    return {
      topic: "expenses",
      queryKind: "expenses_pending",
      title: "Contas pendentes",
      period,
      capabilityCalls: [
        {
          name: "getExpenseAnalytics",
          arguments: { ...periodToCapabilityArguments(period), statuses: ["planned"], limit: 8 }
        }
      ]
    };
  }

  if (dividendIntentPattern.test(normalized) && /\b(qual ativo|mais me pagou|maior pagador)\b/.test(normalized)) {
    return {
      topic: "dividends",
      queryKind: "dividend_top_asset",
      title: "Dividendos por ativo",
      period: /\besse ano|ano\b/.test(normalized) ? currentYear : period,
      capabilityCalls: [
        {
          name: "getDividendAnalytics",
          arguments: {
            ...periodToCapabilityArguments(/\besse ano|ano\b/.test(normalized) ? currentYear : period)
          }
        }
      ]
    };
  }

  if (dividendIntentPattern.test(normalized) && /\b(percentual do meu patrimonio|percentual do meu patrimônio)\b/.test(normalized)) {
    return {
      topic: "dividends",
      queryKind: "dividends_vs_portfolio",
      title: "Dividendos vs patrimonio",
      period: currentYear,
      capabilityCalls: [
        { name: "getDividendAnalytics", arguments: { ...periodToCapabilityArguments(currentYear) } },
        { name: "getPortfolioSnapshot", arguments: {} }
      ]
    };
  }

  if (dividendIntentPattern.test(normalized) || (marketEntity.assetTicker && dividendPayoutIntentPattern.test(normalized))) {
    return {
      topic: "dividends",
      queryKind: "dividend_total",
      title: "Dividendos",
      period: /\bano\b/.test(normalized) ? currentYear : period,
      assetTicker: marketEntity.assetTicker,
      capabilityCalls: [
        {
          name: "getDividendAnalytics",
          arguments: {
            ...periodToCapabilityArguments(/\bano\b/.test(normalized) ? currentYear : period),
            ...(marketEntity.assetTicker ? { assetTicker: marketEntity.assetTicker } : {})
          }
        }
      ]
    };
  }

  if (/\b(quanto meus?|quanto vale|minha posicao|minha posição|quantas cotas|quantos\b|qual minha quantidade)\b/.test(normalized) && marketEntity.entityType === "crypto") {
    return {
      topic: "portfolio",
      queryKind: "portfolio_asset_market_value",
      title: `${marketEntity.assetTicker} na carteira`,
      period: currentMonth,
      assetTicker: marketEntity.assetTicker,
      assetName: marketEntity.assetName,
      assetClass: "crypto",
      marketEntityType: "crypto",
      entityQuery: marketEntity.entityQuery,
      capabilityCalls: [
        {
          name: "getPortfolioSnapshot",
          arguments: { assetQuery: marketEntity.entityQuery, assetTicker: marketEntity.assetTicker ?? undefined }
        },
        {
          name: "getMarketQuote",
          arguments: {
            entityQuery: marketEntity.entityQuery,
            entityType: "crypto",
            assetTicker: marketEntity.assetTicker ?? undefined,
            assetName: marketEntity.assetName ?? undefined,
            currency: "BRL"
          }
        }
      ]
    };
  }

  if (/\b(quanto tenho investido comparado ao que tenho livre|comparado ao que tenho livre)\b/.test(normalized)) {
    return {
      topic: "planning",
      queryKind: "planning_vs_portfolio",
      title: "Investimentos vs saldo livre",
      period: currentMonth,
      capabilityCalls: [
        { name: "getPortfolioSnapshot", arguments: {} },
        { name: "getPlanningSnapshot", arguments: { year: currentMonth.year, month: currentMonth.month } }
      ]
    };
  }

  if (combinedFinancialSummaryIntentPattern.test(normalized)) {
    return {
      topic: "planning",
      queryKind: "financial_summary",
      title: `Resumo financeiro - ${formatPeriodLabel(period)}`,
      period,
      capabilityCalls: [{ name: "getPlanningSnapshot", arguments: { year: planningMonth.year, month: planningMonth.month } }]
    };
  }

  if (/\b(meta|aporte|alocacao|alocação)\b/.test(normalized) && /\b(como estou|quanto falta|onde deveria aportar)\b/.test(normalized)) {
    return {
      topic: "goals",
      queryKind: "goal_progress",
      title: "Metas e alocacao",
      period: currentMonth,
      capabilityCalls: [
        { name: "getGoalsSnapshot", arguments: {} },
        { name: "getPortfolioSnapshot", arguments: {} },
        { name: "getPlanningSnapshot", arguments: { year: currentMonth.year, month: currentMonth.month } }
      ]
    };
  }

  if (/\b(preco|preço|cotacao|cotação|quanto ta|quanto esta|quanto está)\b/.test(normalized)) {
    return {
      topic: "market",
      queryKind: "market_quote",
      title: `Cotacao ${marketEntity.entityQuery}`,
      period: currentMonth,
      assetTicker: marketEntity.assetTicker,
      assetName: marketEntity.assetName,
      marketEntityType: marketEntity.entityType,
      entityQuery: marketEntity.entityQuery,
      capabilityCalls: [
        {
          name: "getMarketQuote",
          arguments: {
            entityQuery: marketEntity.entityQuery,
            entityType: marketEntity.entityType,
            ...(marketEntity.assetTicker ? { assetTicker: marketEntity.assetTicker } : {}),
            ...(marketEntity.assetName ? { assetName: marketEntity.assetName } : {}),
            currency: "BRL"
          }
        }
      ]
    };
  }

  if (/\b(maior gasto|maior despesa)\b/.test(normalized)) {
    return {
      topic: "expenses",
      queryKind: "expense_largest",
      title: "Maior gasto",
      period,
      categoryId: canonicalCategory?.id ?? null,
      categoryName: canonicalCategory?.name ?? null,
      capabilityCalls: [
        {
          name: "getExpenseAnalytics",
          arguments: {
            ...periodToCapabilityArguments(period),
            statuses: ["completed"],
            ...(canonicalCategory ? { categoryId: canonicalCategory.id, categoryName: canonicalCategory.name } : {}),
            ...(descriptionQuery && !canonicalCategory ? { textQuery: descriptionQuery } : {}),
            limit: 8
          }
        }
      ]
    };
  }

  if (/\b(onde mais gastei|categoria mais pesou|categoria que mais pesou)\b/.test(normalized)) {
    return {
      topic: "expenses",
      queryKind: "expense_top_category",
      title: "Categoria com maior peso",
      period,
      capabilityCalls: [{ name: "getExpenseAnalytics", arguments: { ...periodToCapabilityArguments(period), statuses: ["completed"], limit: 8 } }]
    };
  }

  if (expenseIntentPattern.test(normalized)) {
    return {
      topic: "expenses",
      queryKind: canonicalCategory ? "expense_category_total" : "expense_total",
      title: canonicalCategory ? `Gastos em ${canonicalCategory.name}` : descriptionQuery ? `Gastos com ${descriptionQuery}` : "Gastos",
      period,
      categoryId: canonicalCategory?.id ?? null,
      categoryName: canonicalCategory?.name ?? null,
      descriptionQuery,
      capabilityCalls: [
        {
          name: "getExpenseAnalytics",
          arguments: {
            ...periodToCapabilityArguments(period),
            statuses: ["completed"],
            ...(canonicalCategory ? { categoryId: canonicalCategory.id, categoryName: canonicalCategory.name } : {}),
            ...(descriptionQuery && !canonicalCategory ? { textQuery: descriptionQuery } : {}),
            limit: 8
          }
        }
      ]
    };
  }

  if (/\b(ganhei|recebi|renda|receitas?)\b/.test(normalized)) {
    return {
      topic: "income",
      queryKind: "income_total",
      title: "Receitas",
      period,
      capabilityCalls: [
        {
          name: "getIncomeAnalytics",
          arguments: {
            ...periodToCapabilityArguments(period),
            ...(descriptionQuery ? { textQuery: descriptionQuery } : {}),
            limit: 8
          }
        },
        ...(period.type === "month" ? [{ name: "getPlanningSnapshot" as const, arguments: { year: period.year, month: period.month } }] : [])
      ]
    };
  }

  if (/\b(quantas cotas|quantos\b|qual minha posicao|qual minha posição|quanto tenho em|quanto tenho de)\b/.test(normalized) && (assetClass || marketEntity.assetTicker || marketEntity.entityType === "crypto")) {
    return {
      topic: "portfolio",
      queryKind: assetClass ? "portfolio_class_exposure" : "portfolio_position",
      title: assetClass ? `Exposicao em ${assetClass.toUpperCase()}` : `${marketEntity.assetTicker ?? marketEntity.entityQuery} na carteira`,
      period: currentMonth,
      assetTicker: marketEntity.assetTicker,
      assetName: marketEntity.assetName,
      assetClass,
      marketEntityType: marketEntity.entityType,
      capabilityCalls: [
        {
          name: "getPortfolioSnapshot",
          arguments: {
            ...(assetClass ? { assetClass } : {}),
            ...(marketEntity.assetTicker || marketEntity.entityQuery
              ? { assetQuery: marketEntity.entityQuery, assetTicker: marketEntity.assetTicker ?? undefined }
              : {})
          }
        }
      ]
    };
  }

  if (/\b(maior posicao|maior posição|mais prejuizo|mais prejuízo|rentabilidade|carteira|como esta minha carteira|como está minha carteira|quanto tenho investido)\b/.test(normalized)) {
    return {
      topic: "portfolio",
      queryKind: /\b(prejuizo|prejuízo)\b/.test(normalized) ? "portfolio_worst_position" : "portfolio_overview",
      title: "Carteira",
      period: currentMonth,
      capabilityCalls: [{ name: "getPortfolioSnapshot", arguments: assetClass ? { assetClass } : {} }]
    };
  }

  if (availableInvestIntentPattern.test(normalized) && !/^se eu\b/.test(normalized)) {
    return {
      topic: "planning",
      queryKind: "available_invest",
      title: "Disponivel para investir",
      period,
      capabilityCalls: [{ name: "getPlanningSnapshot", arguments: { year: currentMonth.year, month: currentMonth.month } }]
    };
  }

  if (availableSpendIntentPattern.test(normalized)) {
    return {
      topic: "planning",
      queryKind: "available_spend",
      title: "Disponivel para gastar",
      period,
      capabilityCalls: [{ name: "getPlanningSnapshot", arguments: { year: currentMonth.year, month: currentMonth.month } }]
    };
  }

  if (balanceIntentPattern.test(normalized)) {
    return {
      topic: "planning",
      queryKind: "balance",
      title: "Saldo atual",
      period,
      capabilityCalls: [{ name: "getPlanningSnapshot", arguments: { year: currentMonth.year, month: currentMonth.month } }]
    };
  }

  return null;
}

function buildMetricsSection(metrics: Array<{ label: string; value: string; status?: "neutral" | "positive" | "warning" | "critical" }>) {
  return { type: "metrics" as const, title: "Resumo", metrics };
}

function hasPlanningSnapshotData(planning?: Record<string, any>) {
  if (!planning) return false;
  const summary = planning.summary ?? {};
  return (
    [
      summary.currentBalanceInCents,
      summary.afterPlannedInCents,
      summary.availableToInvestInCents,
      summary.currentTotalIncomeInCents,
      summary.projectedTotalIncomeInCents,
      summary.baseIncomeInCents,
      summary.completedExtraIncomeInCents,
      summary.plannedExtraIncomeInCents,
      summary.dividendIncomeInCents,
      summary.completedExpensesInCents,
      summary.plannedExpensesInCents,
      summary.completedConsumptionInCents,
      summary.plannedConsumptionInCents,
      summary.contributionGoalInCents
    ].some((value) => Number(value ?? 0) > 0) || Number(planning.pendingExpensesCount ?? 0) > 0
  );
}

function buildPlanResponse(
  plan: AssistantReadPlan,
  results: Array<Awaited<ReturnType<typeof executeAssistantCapability>>>,
  timeZone: string
): AiChatStructuredResponse {
  const byName = new Map(results.map((result) => [result.capability.name, result.result]));
  const planning = byName.get("getPlanningSnapshot") as Record<string, any> | undefined;
  const expenses = byName.get("getExpenseAnalytics") as Record<string, any> | undefined;
  const incomes = byName.get("getIncomeAnalytics") as Record<string, any> | undefined;
  const dividends = byName.get("getDividendAnalytics") as Record<string, any> | undefined;
  const portfolio = byName.get("getPortfolioSnapshot") as Record<string, any> | undefined;
  const marketQuote = byName.get("getMarketQuote") as Record<string, any> | undefined;
  const goals = byName.get("getGoalsSnapshot") as Record<string, any> | undefined;
  const simulation = byName.get("simulatePlanningImpact") as Record<string, any> | undefined;
  const paymentStatus = byName.get("getExpensePaymentStatus") as Record<string, any> | undefined;

  if (plan.queryKind === "financial_summary" && planning && portfolio && dividends) {
    return createStructuredResponse({
      responseType: "summary",
      title: `Resumo financeiro - ${formatPeriodLabel(plan.period)}`,
      message: "Consultei seu planejamento, sua carteira e seus dividendos reais para resumir o periodo.",
      sections: [
        buildMetricsSection([
          { label: "Saldo atual", value: formatCurrencyFromCents(planning.summary.currentBalanceInCents) },
          { label: "Saldo apos previstos", value: formatCurrencyFromCents(planning.summary.afterPlannedInCents) },
          { label: "Gastos do mes", value: formatCurrencyFromCents(planning.summary.completedExpensesInCents) },
          { label: "Receitas do mes", value: formatCurrencyFromCents(planning.summary.currentTotalIncomeInCents) }
        ]),
        {
          type: "metrics",
          title: "Investimentos",
          metrics: [
            { label: "Patrimonio", value: formatMarketCurrency(portfolio.summary.totalWealth) },
            { label: "Resultado", value: formatMarketCurrency(portfolio.summary.totalProfit), status: portfolio.summary.totalProfit >= 0 ? "positive" : "warning" },
            { label: "Dividendos do periodo", value: formatCurrencyFromCents(dividends.totalInCents) }
          ]
        }
      ],
      suggestions: ["Quanto ainda posso gastar?", "Como esta minha carteira?"]
    });
  }

  if (plan.queryKind === "simulation" && simulation) {
    const scenarioLabel =
      simulation.scenario === "income" ? "receber" : simulation.scenario === "investment" ? "investir" : "gastar";
    return createStructuredResponse({
      responseType: "summary",
      title: "Simulacao",
      message: `Sem registrar nada no sistema, simulei o efeito de ${scenarioLabel} ${formatCurrencyFromCents(simulation.amountInCents)} neste mes.`,
      sections: [
        buildMetricsSection([
          { label: "Saldo apos previstos", value: formatCurrencyFromCents(simulation.currentBalanceAfterInCents) },
          { label: "Disponivel para investir", value: formatCurrencyFromCents(simulation.availableToInvestAfterInCents) }
        ])
      ],
      suggestions: ["Quanto ainda posso gastar?", "Quanto tenho disponivel para investir?"]
    });
  }

  if (plan.queryKind === "payment_status" && paymentStatus) {
    const first = paymentStatus.candidates?.[0];
    if (!first) {
      return createStructuredResponse({
        responseType: "summary",
        title: "Status do gasto",
        message: "Nao encontrei um gasto compativel com essa descricao no periodo consultado."
      });
    }

    return createStructuredResponse({
      responseType: "summary",
      title: "Status do gasto",
      message: `${first.description} aparece como ${String(first.statusLabel).toLowerCase()} no sistema.`,
      sections: [
        buildMetricsSection([
          { label: "Valor", value: formatCurrencyFromCents(first.amountInCents) },
          { label: "Data", value: formatDateBr(first.date) },
          { label: "Status", value: first.statusLabel }
        ])
      ]
    });
  }

  if ((plan.queryKind === "balance" || plan.queryKind === "available_spend" || plan.queryKind === "available_invest") && planning) {
    if (!hasPlanningSnapshotData(planning)) {
      return createStructuredResponse({
        responseType: "summary",
        title: `${plan.queryKind === "balance" ? "Saldo" : "Disponivel"} - ${formatPeriodLabel(plan.period)}`,
        message:
          plan.queryKind === "balance"
            ? "Ainda nao encontrei dados suficientes nesse periodo para calcular seu saldo com seguranca."
            : "Ainda nao encontrei dados suficientes nesse periodo para calcular quanto esta livre para gastar."
      });
    }
    const label =
      plan.queryKind === "balance"
        ? "Saldo"
        : plan.queryKind === "available_invest"
          ? "Disponivel para investir"
          : "Disponivel para gastar";
    const primaryAmount =
      plan.queryKind === "balance"
        ? planning.summary.currentBalanceInCents
        : plan.queryKind === "available_invest"
          ? planning.summary.availableToInvestInCents
          : planning.summary.afterPlannedInCents;
    return createStructuredResponse({
      responseType: "summary",
      title: `${label} - ${formatPeriodLabel(plan.period)}`,
      message:
        plan.queryKind === "balance"
          ? `Hoje seu saldo atual esta em ${formatCurrencyFromCents(primaryAmount)}. Considerando tambem os gastos e entradas previstos do periodo, o saldo apos previstos fica em ${formatCurrencyFromCents(planning.summary.afterPlannedInCents)}.`
          : plan.queryKind === "available_invest"
            ? `Hoje voce tem ${formatCurrencyFromCents(primaryAmount)} livres para investir neste periodo, com base no planejamento autoritativo.`
            : primaryAmount >= 0
              ? `Voce ainda tem ${formatCurrencyFromCents(primaryAmount)} livres apos considerar o que ja aconteceu e o que ainda esta previsto.`
              : `Seu planejamento esta ${formatCurrencyFromCents(Math.abs(primaryAmount))} acima do saldo disponivel quando considero realizados e previstos.`,
      sections: [
        buildMetricsSection([
          { label: "Saldo atual", value: formatCurrencyFromCents(planning.summary.currentBalanceInCents) },
          { label: "Saldo apos previstos", value: formatCurrencyFromCents(planning.summary.afterPlannedInCents) },
          { label: "Livre para investir", value: formatCurrencyFromCents(planning.summary.availableToInvestInCents) },
          { label: "Pode gastar por dia", value: formatCurrencyFromCents(planning.summary.canSpendPerDayInCents) }
        ])
      ],
      suggestions: ["Quanto gastei este mes?", "Quanto ganhei este mes?"]
    });
  }

  if ((plan.queryKind === "expense_total" || plan.queryKind === "expense_category_total") && expenses) {
    const subject = plan.categoryName ? ` em ${plan.categoryName}` : "";
    if (expenses.count === 0) {
      return createStructuredResponse({
        responseType: "summary",
        title: `Gastos${subject} - ${formatPeriodLabel(plan.period)}`,
        message: "Ainda nao encontrei dados financeiros suficientes nesse periodo para calcular seus gastos com seguranca."
      });
    }
    return createStructuredResponse({
      responseType: "summary",
      title: `Gastos${subject} - ${formatPeriodLabel(plan.period)}`,
      message: plan.categoryName
        ? `Voce ja gastou ${formatCurrencyFromCents(expenses.totalInCents)} em ${plan.categoryName} no periodo consultado.`
        : `Voce ja gastou ${formatCurrencyFromCents(expenses.totalInCents)} no periodo consultado.`,
      sections: [
        buildMetricsSection([
          { label: "Total gasto", value: formatCurrencyFromCents(expenses.totalInCents) },
          { label: "Quantidade de lancamentos", value: String(expenses.count) }
        ]),
        ...(expenses.byCategory?.length
          ? [
              {
                type: "list" as const,
                title: "Categorias",
                items: expenses.byCategory.slice(0, 4).map((item: any) => ({
                  title: item.categoryName,
                  description: formatCurrencyFromCents(item.totalInCents),
                  severity: "info" as const
                }))
              }
            ]
          : [])
      ],
      suggestions: ["Qual foi meu maior gasto?", "Onde mais gastei?"]
    });
  }

  if (plan.queryKind === "expense_largest" && expenses) {
    const largest = expenses.largest?.[0];
    if (!largest) {
      return createStructuredResponse({
        responseType: "summary",
        title: `Maior gasto - ${formatPeriodLabel(plan.period)}`,
        message: "Nao encontrei gastos para calcular o maior valor neste periodo."
      });
    }

    return createStructuredResponse({
      responseType: "summary",
      title: `Maior gasto - ${formatPeriodLabel(plan.period)}`,
      message: `${largest.description} foi o maior gasto encontrado neste periodo.`,
      sections: [
        buildMetricsSection([
          { label: "Valor", value: formatCurrencyFromCents(largest.amountInCents) },
          { label: "Data", value: formatDateBr(largest.date) }
        ])
      ]
    });
  }

  if (plan.queryKind === "expense_top_category" && expenses) {
    const category = expenses.byCategory?.[0];
    if (!category) {
      return createStructuredResponse({
        responseType: "summary",
        title: `Categorias - ${formatPeriodLabel(plan.period)}`,
        message: "Nao encontrei gastos no periodo para identificar a categoria com maior peso."
      });
    }

    return createStructuredResponse({
      responseType: "summary",
      title: `Categoria com maior peso - ${formatPeriodLabel(plan.period)}`,
      message: `${category.categoryName} foi a categoria que mais pesou no periodo consultado.`,
      sections: [
        buildMetricsSection([
          { label: "Total", value: formatCurrencyFromCents(category.totalInCents) },
          { label: "Lancamentos", value: String(category.count) }
        ])
      ]
    });
  }

  if (plan.queryKind === "expenses_pending" && expenses) {
    const pendingItems = expenses.upcoming ?? [];
    return createStructuredResponse({
      responseType: "summary",
      title: `Contas pendentes - ${formatPeriodLabel(plan.period)}`,
      message:
        pendingItems.length > 0
          ? `Voce ainda tem ${pendingItems.length} conta(s) pendente(s) nesta consulta.`
          : "Nao encontrei contas pendentes para este periodo.",
      sections: [
        buildMetricsSection([
          { label: "Falta pagar", value: formatCurrencyFromCents(expenses.totalInCents) },
          { label: "Pendencias", value: String(pendingItems.length) }
        ]),
        ...(pendingItems.length > 0
          ? [
              {
                type: "list" as const,
                title: "Proximas contas",
                items: pendingItems.slice(0, 6).map((item: any) => ({
                  title: item.description,
                  description: `${formatCurrencyFromCents(item.amountInCents)} · ${formatDateBr(item.date)}`,
                  severity: "warning" as const
                }))
              }
            ]
          : [])
      ]
    });
  }

  if (plan.queryKind === "income_total" && incomes) {
    if (plan.period?.type === "month" && planning) {
      if (!hasPlanningSnapshotData(planning) && incomes.count === 0) {
        return createStructuredResponse({
          responseType: "summary",
          title: `Receitas de ${formatPeriodLabel(plan.period)}`,
          message: "Ainda nao encontrei dados financeiros suficientes nesse periodo para calcular suas receitas com seguranca."
        });
      }

      const dividendDetail = Number(planning.summary.dividendIncomeInCents ?? 0) > 0
        ? `, incluindo ${formatCurrencyFromCents(planning.summary.dividendIncomeInCents)} de dividendos recebidos`
        : "";

      return createStructuredResponse({
        responseType: "summary",
        title: `Receitas de ${formatPeriodLabel(plan.period)}`,
        message: `Neste periodo, sua renda total considerada pelo planejamento esta em ${formatCurrencyFromCents(planning.summary.currentTotalIncomeInCents)}. Isso inclui ${formatCurrencyFromCents(planning.summary.baseIncomeInCents)} de renda base e ${formatCurrencyFromCents(planning.summary.completedExtraIncomeInCents)} de entradas extras recebidas${dividendDetail}.`,
        sections: [
          buildMetricsSection([
            { label: "Renda total", value: formatCurrencyFromCents(planning.summary.currentTotalIncomeInCents) },
            { label: "Renda base", value: formatCurrencyFromCents(planning.summary.baseIncomeInCents) },
            { label: "Entradas extras recebidas", value: formatCurrencyFromCents(planning.summary.completedExtraIncomeInCents) },
            { label: "Entradas extras previstas", value: formatCurrencyFromCents(planning.summary.plannedExtraIncomeInCents) }
          ])
        ]
      });
    }

    if (incomes.count === 0) {
      return createStructuredResponse({
        responseType: "summary",
        title: `Receitas - ${formatPeriodLabel(plan.period)}`,
        message: "Ainda nao encontrei dados financeiros cadastrados para o periodo solicitado."
      });
    }

    return createStructuredResponse({
      responseType: "summary",
      title: `Receitas - ${formatPeriodLabel(plan.period)}`,
      message: `No periodo consultado, suas receitas somaram ${formatCurrencyFromCents(incomes.totalInCents)}.`,
      sections: [
        buildMetricsSection([
          { label: "Total", value: formatCurrencyFromCents(incomes.totalInCents) },
          { label: "Recebido", value: formatCurrencyFromCents(incomes.receivedInCents) },
          { label: "Previsto", value: formatCurrencyFromCents(incomes.plannedInCents) }
        ])
      ]
    });
  }

  if ((plan.queryKind === "dividend_total" || plan.queryKind === "dividend_top_asset") && dividends) {
    return createStructuredResponse({
      responseType: "summary",
      title: `Dividendos - ${formatPeriodLabel(plan.period)}`,
      message:
        dividends.topAsset && plan.queryKind === "dividend_top_asset"
          ? `${dividends.topAsset.assetTicker} foi o ativo que mais pagou neste periodo.`
          : "Consultei os dividendos reais recebidos neste periodo.",
      sections: [
        buildMetricsSection([
          { label: "Total recebido", value: formatCurrencyFromCents(dividends.totalInCents) },
          ...(dividends.topAsset
            ? [{ label: "Maior pagador", value: `${dividends.topAsset.assetTicker} · ${formatCurrencyFromCents(dividends.topAsset.totalInCents)}` }]
            : [])
        ])
      ]
    });
  }

  if (plan.queryKind === "portfolio_asset_market_value" && portfolio && marketQuote) {
    const position = portfolio.position;
    const quote = marketQuote.quote;
    if (!position) {
      return createStructuredResponse({
        responseType: "summary",
        title: `${plan.assetTicker ?? plan.entityQuery} na carteira`,
        message: "Nao encontrei essa posicao cadastrada na sua carteira."
      });
    }

    const currentPrice = marketQuote.hasValidPrice ? Number(quote.price) : position.currentPrice ?? 0;
    const currentValue = currentPrice > 0 ? position.quantity * currentPrice : position.currentValue ?? 0;
    return createStructuredResponse({
      responseType: "summary",
      title: `${position.ticker} na carteira`,
      message: `Consultei sua posicao e a cotacao real mais recente para ${position.ticker}.`,
      sections: [
        buildMetricsSection([
          { label: "Quantidade", value: formatQuantity(position.quantity) },
          { label: "Valor atual", value: formatMarketCurrency(currentValue) },
          { label: "Preco atual", value: formatMarketCurrency(currentPrice) }
        ])
      ]
    });
  }

  if ((plan.queryKind === "portfolio_position" || plan.queryKind === "portfolio_class_exposure" || plan.queryKind === "portfolio_overview" || plan.queryKind === "portfolio_worst_position") && portfolio) {
    if (plan.queryKind === "portfolio_position" && portfolio.position) {
      return createStructuredResponse({
        responseType: "summary",
        title: `${portfolio.position.ticker} na carteira`,
        message: `Esta e a sua posicao atual em ${portfolio.position.ticker}.`,
        sections: [
          buildMetricsSection([
            { label: "Quantidade", value: formatQuantity(portfolio.position.quantity) },
            { label: "Valor atual", value: formatMarketCurrency(portfolio.position.currentValue ?? 0) },
            { label: "Preco medio", value: formatMarketCurrency(portfolio.position.averagePrice ?? 0) }
          ])
        ]
      });
    }

    if (plan.queryKind === "portfolio_class_exposure" && plan.assetClass) {
      const exposure = (portfolio.byClass ?? []).find((item: any) => item.assetClass === plan.assetClass);
      const total = Number(portfolio.summary.currentValue ?? 0) || Number(portfolio.summary.totalEquity ?? 0);
      const percent = total > 0 ? (Number(exposure?.currentValue ?? 0) / total) * 100 : 0;
      const matchingPositions = (portfolio.positions ?? []).filter((item: any) => normalizeText(item.category).includes(plan.assetClass ?? ""));
      return createStructuredResponse({
        responseType: "summary",
        title: `${String(plan.assetClass).toUpperCase()} na carteira`,
        message: `Consultei sua exposicao atual em ${String(plan.assetClass).toUpperCase()}.`,
        sections: [
          buildMetricsSection([
            { label: "Valor atual", value: formatMarketCurrency(exposure?.currentValue ?? 0) },
            { label: "Participacao", value: formatPercent(percent).replace("+", "") },
            { label: "Posicoes", value: String(exposure?.count ?? matchingPositions.length) }
          ])
        ]
      });
    }

    if (plan.queryKind === "portfolio_worst_position") {
      const worst = portfolio.worstPosition;
      if (!worst) {
        return createStructuredResponse({
          responseType: "summary",
          title: "Carteira",
          message: "Nao encontrei posicoes com dados suficientes para calcular o maior prejuizo."
        });
      }

      return createStructuredResponse({
        responseType: "summary",
        title: "Maior prejuizo da carteira",
        message: `${worst.ticker} e a posicao com pior resultado neste momento.`,
        sections: [
          buildMetricsSection([
            { label: "Resultado", value: formatMarketCurrency(worst.profit ?? 0), status: (worst.profit ?? 0) >= 0 ? "positive" : "warning" },
            { label: "Rentabilidade", value: formatPercent(worst.returnPercentage ?? 0) }
          ])
        ]
      });
    }

    return createStructuredResponse({
      responseType: "summary",
      title: "Carteira",
      message: "Consultei a situacao atual da sua carteira com base nos dados autoritativos do Invest Hub.",
      sections: [
        buildMetricsSection([
          { label: "Patrimonio", value: formatMarketCurrency(portfolio.summary.totalWealth) },
          { label: "Valor investido", value: formatMarketCurrency(portfolio.summary.investedValue) },
          { label: "Resultado", value: formatMarketCurrency(portfolio.summary.totalProfit), status: portfolio.summary.totalProfit >= 0 ? "positive" : "warning" },
          { label: "Rentabilidade", value: formatPercent(portfolio.summary.returnPercentage ?? 0) }
        ]),
        ...(portfolio.largestPosition
          ? [
              {
                type: "list" as const,
                title: "Principais posicoes",
                items: (portfolio.positions ?? []).slice(0, 4).map((position: any) => ({
                  title: `${position.ticker} - ${formatQuantity(position.quantity)}`,
                  description: formatMarketCurrency(position.currentValue ?? 0),
                  severity: "info" as const
                }))
              }
            ]
          : [])
      ]
    });
  }

  if (plan.queryKind === "market_quote" && marketQuote) {
    if (!marketQuote.integrated) {
      return createStructuredResponse({
        responseType: "summary",
        title: `Cotacao ${marketQuote.entityQuery}`,
        message: marketQuote.message
      });
    }

    if (marketQuote.entityType === "macro_indicator" && marketQuote.indicator === "CDI") {
      const updatedAt = new Intl.DateTimeFormat("pt-BR", {
        timeZone,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(marketQuote.updatedAt));

      return createStructuredResponse({
        responseType: "summary",
        title: "CDI",
        message: "Usei a fonte oficial de CDI ja integrada ao Invest Hub.",
        sections: [
          buildMetricsSection([
            { label: "Taxa anual", value: formatPercent(marketQuote.annualRatePercent).replace("+", "") },
            { label: "Data de referencia", value: formatDateBr(marketQuote.referenceDate) },
            { label: "Atualizado em", value: updatedAt }
          ])
        ]
      });
    }

    const quote = marketQuote.quote;
    if (!marketQuote.hasValidPrice) {
      const isB3 = marketQuote.entityType === "b3";
      return createStructuredResponse({
        responseType: "summary",
        title: `Cotacao ${marketQuote.entityQuery}`,
        message: isB3
          ? "Nao consegui obter uma cotacao real deste ativo B3 agora."
          : "Nao consegui atualizar a cotacao desta criptomoeda agora."
      });
    }

    const updatedAt = new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(quote.quotedAt));

    return createStructuredResponse({
      responseType: "summary",
      title: `Cotacao ${marketQuote.entityQuery}`,
      message: `Usei o provider de mercado apropriado para consultar ${marketQuote.entityQuery}.`,
      sections: [
        buildMetricsSection([
          { label: "Preco", value: formatMarketCurrency(Number(quote.price ?? 0), quote.currency ?? "BRL") },
          ...(typeof quote.change24h === "number"
            ? [
                {
                  label: "24h",
                  value: formatPercent(quote.change24h),
                  status: quote.change24h >= 0 ? ("positive" as const) : ("warning" as const)
                }
              ]
            : []),
          { label: "Atualizado em", value: updatedAt }
        ])
      ]
    });
  }

  if (plan.queryKind === "goal_progress" && goals && planning && portfolio) {
    return createStructuredResponse({
      responseType: "summary",
      title: "Metas e alocacao",
      message: "Cruzei suas metas ativas, o planejamento do mes e a carteira atual.",
      sections: [
        buildMetricsSection([
          { label: "Meta mensal de aporte", value: formatCurrencyFromCents(planning.summary.contributionGoalInCents) },
          { label: "Falta para a meta", value: formatCurrencyFromCents(planning.summary.contributionGoalRemainingInCents) },
          { label: "Patrimonio atual", value: formatMarketCurrency(portfolio.summary.totalWealth) }
        ]),
        ...(goals.topGoal
          ? [
              {
                type: "list" as const,
                title: "Meta em destaque",
                items: [
                  {
                    title: goals.topGoal.title,
                    description: `${formatPercent(goals.topGoal.progress).replace("+", "")} concluido`,
                    severity: "info" as const
                  }
                ]
              }
            ]
          : [])
      ]
    });
  }

  if (plan.queryKind === "planning_vs_portfolio" && planning && portfolio) {
    return createStructuredResponse({
      responseType: "summary",
      title: "Investimentos vs saldo livre",
      message: "Comparei o que voce tem aplicado com o que ainda esta livre neste mes.",
      sections: [
        buildMetricsSection([
          { label: "Valor investido", value: formatMarketCurrency(portfolio.summary.investedValue) },
          { label: "Livre para gastar", value: formatCurrencyFromCents(planning.summary.afterPlannedInCents) },
          { label: "Livre para investir", value: formatCurrencyFromCents(planning.summary.availableToInvestInCents) }
        ])
      ]
    });
  }

  if (plan.queryKind === "dividends_vs_portfolio" && dividends && portfolio) {
    const wealthInCents = Math.round(Number(portfolio.summary.totalWealth ?? 0) * 100);
    const percent = wealthInCents > 0 ? (dividends.totalInCents / wealthInCents) * 100 : 0;
    return createStructuredResponse({
      responseType: "summary",
      title: "Dividendos vs patrimonio",
      message: "Comparei os dividendos recebidos no ano com o patrimonio atual da carteira.",
      sections: [
        buildMetricsSection([
          { label: "Dividendos no ano", value: formatCurrencyFromCents(dividends.totalInCents) },
          { label: "Patrimonio atual", value: formatMarketCurrency(portfolio.summary.totalWealth) },
          { label: "Percentual", value: formatPercent(percent).replace("+", "") }
        ])
      ]
    });
  }

  return createStructuredResponse({
    responseType: "summary",
    title: plan.title,
    message: "Consegui montar um plano de consulta, mas ainda nao tenho uma composicao pronta para esta pergunta."
  });
}

export function listAssistantCapabilitiesForReporting() {
  return listAssistantReadCapabilities();
}

export function planAssistantReadMessage(input: {
  message: string;
  timeZone?: string;
  conversationState?: AssistantConversationState | null;
}) {
  if (isKnowledgeQuestion(input.message)) return null;
  const timeZone = input.timeZone?.trim() || DEFAULT_APP_TIME_ZONE;
  const followUpPlan = buildFollowUpPlan(input.message, timeZone, input.conversationState);
  return followUpPlan ?? buildPrimaryPlan(input.message, timeZone, input.conversationState);
}

export async function orchestrateAssistantRead(input: {
  message: string;
  timeZone?: string;
  conversationState?: AssistantConversationState | null;
}): Promise<AssistantReadOrchestrationResult | null> {
  const timeZone = input.timeZone?.trim() || DEFAULT_APP_TIME_ZONE;
  const plan = planAssistantReadMessage(input);
  if (!plan) return null;

  const capabilityCalls = plan.capabilityCalls.slice(0, maxAssistantCapabilityCalls);
  const results: Array<Awaited<ReturnType<typeof executeAssistantCapability>>> = [];

  for (const call of capabilityCalls) {
    results.push(await executeAssistantCapability(call as { name: AssistantReadCapabilityName; arguments: unknown }));
  }

  const response = buildPlanResponse({ ...plan, capabilityCalls }, results, timeZone);
  const conversationState = buildPlanningContextState({ ...plan, capabilityCalls });
  return {
    response,
    conversationState,
    plan: { ...plan, capabilityCalls },
    capabilityNames: capabilityCalls.map((call) => call.name)
  };
}
