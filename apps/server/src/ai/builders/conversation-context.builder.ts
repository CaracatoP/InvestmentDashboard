import { buildInvestmentContext } from "./investment-context.builder";
import { buildPlanningContext } from "./planning-context.builder";
import { DEFAULT_APP_TIME_ZONE, getTimeZoneNowFields } from "../../utils/timezone";

export type AiConversationIntent =
  | "monthly_planning"
  | "expenses"
  | "recurring"
  | "payment_methods"
  | "investments"
  | "contributions"
  | "dividends"
  | "portfolio"
  | "allocation"
  | "asset_performance"
  | "goals"
  | "projections"
  | "history"
  | "cashboxes"
  | "compare_periods"
  | "settings"
  | "general";

function nowPeriod() {
  const now = getTimeZoneNowFields(new Date(), DEFAULT_APP_TIME_ZONE);
  return { year: now.year, month: now.month };
}

function normalizeIntentText(message: string) {
  return message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function detectConversationIntent(message: string): AiConversationIntent {
  const text = normalizeIntentText(message);
  const isShortGreeting = /(oi|ola|bom dia|boa tarde|boa noite|ajuda|assistente)/.test(text) && text.length < 80;
  const hasInvestmentSignal = /(invest|carteira|patrimonio|rentab|divid|aporte|ativo|posicao|lucro|bitcoin|btc|ethereum|eth|solana|sol|cripto|criptomoeda|cotacao|preco)/.test(text);

  if (isShortGreeting && !hasInvestmentSignal) return "general";
  if (/(recorrent|assinatura|parcel|fixo)/.test(text)) return "recurring";
  if (/(cartao|pix|debito|credito|pagamento)/.test(text)) return "payment_methods";
  if (/(gastei|gasto|despesa|orcamento|planejamento|categoria|setor|livre pra gastar|livre para gastar)/.test(text)) return "expenses";
  if (/(dados atualizados|ver dados atualizados|ficaram meus aportes|meus aportes)/.test(text)) return "contributions";
  if (/(aporte|deposit)/.test(text)) return "contributions";
  if (/(dividendo|rendimento|jcp|dy)/.test(text)) return "dividends";
  if (/(alocacao|rebalance|peso ideal|distribuicao|classe)/.test(text)) return "allocation";
  if (/(investimento|investimentos|investido|investidos|patrimonio|rentabilidade|rentavel|lucro|carteira|portfolio|ativos?|posicao|posicoes|quanto tenho investido|analise minha carteira|como estao meus investimentos)/.test(text)) return "investments";
  if (/(ticker|preco|cotacao|performance|bitcoin|btc|ethereum|eth|solana|sol|cripto|criptomoeda)/.test(text)) return "asset_performance";
  if (/(meta|objetivo)/.test(text)) return "goals";
  if (/(projec|simul|independencia|futuro)/.test(text)) return "projections";
  if (/(historico|timeline|moviment)/.test(text)) return "history";
  if (/(caixinha|reserva|nubank|cdi)/.test(text)) return "cashboxes";
  if (/(compar|mes anterior|periodo)/.test(text)) return "compare_periods";
  if (/(configur|perfil|tema|moeda|preferenc|nome|status da ia|ia configurada|alocacao ideal)/.test(text)) return "settings";
  return "general";
}

export async function buildConversationContext(message: string) {
  const intent = detectConversationIntent(message);
  const period = nowPeriod();

  if (intent === "expenses" || intent === "monthly_planning") {
    return { intent, context: await buildPlanningContext(period.year, period.month, undefined, "expenses") };
  }

  if (intent === "payment_methods") {
    return { intent, context: await buildPlanningContext(period.year, period.month, undefined, "payment_methods") };
  }

  if (intent === "recurring") {
    return { intent, context: await buildPlanningContext(period.year, period.month, undefined, "recurring") };
  }

  if (intent === "compare_periods") {
    return { intent, context: await buildPlanningContext(period.year, period.month, undefined, "compare") };
  }

  if (intent === "investments") return { intent, context: await buildInvestmentContext("investments", { spotlightMessage: message }) };
  if (intent === "portfolio" || intent === "asset_performance") return { intent, context: await buildInvestmentContext("portfolio", { spotlightMessage: message }) };
  if (intent === "allocation") return { intent, context: await buildInvestmentContext("allocation") };
  if (intent === "dividends") return { intent, context: await buildInvestmentContext("dividends") };
  if (intent === "contributions") return { intent, context: await buildInvestmentContext("contributions") };
  if (intent === "goals") return { intent, context: await buildInvestmentContext("goals") };
  if (intent === "cashboxes") return { intent, context: await buildInvestmentContext("cashboxes") };
  if (intent === "history") return { intent, context: await buildInvestmentContext("history") };
  if (intent === "projections") return { intent, context: await buildInvestmentContext("projections") };
  if (intent === "settings") return { intent, context: await buildInvestmentContext("settings") };

  return {
    intent,
    context: {
      scope: "general",
      period,
      dataStatus: "no_financial_context",
      responseGuidance: "Responda como um assistente normal. Nao liste modulos como menu; se for saudacao, cumprimente e pergunte como pode ajudar."
    }
  };
}
