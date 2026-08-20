import { randomUUID } from "crypto";
import {
  addMonthlyExpense,
  addMonthlyIncomeEntry,
  completeMonthlyExpense,
  completeMonthlyIncomeEntry,
  getLocalTimestampWithOffset,
  getMonthlyPlanningOverview,
  getOrCreateMonthlyPlan,
  parseLocalExpenseDate,
  saveMonthlyPlan
} from "../../services/monthly-planning.service";
import { getAuthContext, SYSTEM_USER_ID } from "../../auth/auth-context";
import { getUserForAuthContext } from "../../services/auth.service";
import { getPortfolio, registerContribution, registerGoal, updateSettings } from "../../services/portfolio.service";
import { findMatchingExpectedDividend, markDividendReceived, registerReceivedDividend } from "../../services/dividend.service";
import { getCryptoMarketQuoteByQuery } from "../../services/market-data.service";
import { findMonthlyPlanById, listAllMonthlyExpenses, listAllMonthlyIncomeEntries } from "../../repositories/monthly-planning.repository";
import {
  createOperation,
  listAssets,
  listCashBoxes
} from "../../repositories/investment.repository";
import {
  appendAiActionAudit,
  createAiPendingAction,
  findActiveAiPendingAction,
  findExecutedAiPendingActionByIdempotencyKey,
  updateAiPendingAction
} from "../../repositories/ai.repository";
import { contributionSchema } from "../../validators/contribution.validator";
import { dividendSchema } from "../../validators/dividend.validator";
import { goalSchema } from "../../validators/goal.validator";
import { monthlyExpenseSchema, monthlyIncomeEntrySchema, monthlyPlanSchema } from "../../validators/monthly-planning.validator";
import { operationSchema } from "../../validators/operation.validator";
import { settingsUpdateSchema } from "../../validators/settings.validator";
import type {
  AiChatStructuredResponse,
  AiPendingActionRecord,
  AiPendingActionRiskLevel,
  AiToolName
} from "../schemas/ai.schema";
import { createErrorResponse, createStructuredResponse } from "../utils/ai-structured-response";
import { DEFAULT_APP_TIME_ZONE, getTimeZoneNowFields, shiftDateKey } from "../../utils/timezone";
import { aiToolCatalog, getAiToolCatalogEntry, getAiToolPrimaryRoute } from "./ai-tool-catalog";
import { findKnownCryptoByQuery } from "../../services/ticker.service";

type PreparedAction = {
  handled: true;
  response: AiChatStructuredResponse;
};

type NoAction = {
  handled: false;
};

type ToolInput = {
  sessionId: string;
  message: string;
  messageId?: string;
};

type ExtractedFields = Record<string, unknown>;
type MissingField = AiPendingActionRecord["missingFields"][number];
type AiAffectedEntity = NonNullable<AiChatStructuredResponse["metadata"]["affectedEntities"]>[number];
type TimeZoneNow = ReturnType<typeof getTimeZoneNowFields>;

type PendingExpenseCandidate = {
  id: string;
  label: string;
  description: string;
  amountInCents: number;
  date: string;
  categoryName: string;
  recurrenceId?: string | null;
  recurrenceOriginalDate?: string | null;
  recurrenceSourceId?: string | null;
};

type PendingIncomeCandidate = {
  id: string;
  label: string;
  description: string;
  amountInCents: number;
  date: string;
  category: string;
  recurrenceId?: string | null;
  recurrenceOriginalDate?: string | null;
  recurrenceSourceId?: string | null;
};

const pendingActionTtlMs = 15 * 60 * 1000;
const confirmationPattern = /^(confirmo|pode registrar|pode confirmar|confirmar|sim,?\s*pode|sim pode|ok pode|pode executar)(\s|$)/i;
const cancelPattern = /^(cancelar|cancele|nao confirmar|não confirmar|desistir)(\s|$)/i;
const writeIntentPattern = /(registre|registrar|cadastre|cadastrar|adicione|adicionar|crie|criar|marque|paga|pago|paguei|pagar|alterar|altere|atualize|minha renda|gastei|gasto|despesa|aporte|meta|compre|comprei|compra|vendi|venda|dividendo|jcp|juros sobre capital|bonifica|desdobramento|split|grupamento|reverse split|transferir|transferencia|preco medio|quantidade|recebi|receber|entrada|freelance|comissao|bonus|cashback|reembolso|presente|hora extra)/i;

const settingsWriteIntentPattern = /(tema|moeda|configur|perfil|nome)/i;

const toolRequirements = Object.fromEntries(
  (Object.keys(aiToolCatalog) as AiToolName[]).map((toolName) => {
    const entry = getAiToolCatalogEntry(toolName);
    return [toolName, { required: [...entry.required], optional: [...entry.optional] }];
  })
) as Record<AiToolName, { required: string[]; optional: string[] }>;

const missingFieldDefinitions: Record<string, MissingField> = {
  amountInCents: { name: "amountInCents", label: "Valor", type: "currency", required: true },
  date: { name: "date", label: "Data", type: "date", required: true },
  time: { name: "time", label: "Horario", type: "text", required: true },
  description: { name: "description", label: "Descricao", type: "text", required: true },
  category: { name: "category", label: "Categoria", type: "select", required: true },
  categoryId: { name: "categoryId", label: "Setor", type: "select", required: true },
  investmentDestination: {
    name: "investmentDestination",
    label: "Destino",
    type: "select",
    required: true,
    options: [
      { value: "asset", label: "Aporte em ativo" },
      { value: "cashbox", label: "Transferencia para caixinha" }
    ]
  },
  planId: { name: "planId", label: "Planejamento mensal", type: "text", required: true },
  year: { name: "year", label: "Ano", type: "number", required: true },
  month: { name: "month", label: "Mes", type: "number", required: true },
  incomeInCents: { name: "incomeInCents", label: "Renda", type: "currency", required: true },
  title: { name: "title", label: "Nome da meta", type: "text", required: true },
  type: { name: "type", label: "Tipo da meta", type: "select", required: true },
  targetInCents: { name: "targetInCents", label: "Valor alvo", type: "currency", required: true },
  expenseId: { name: "expenseId", label: "Gasto", type: "select", required: true },
  incomeEntryId: { name: "incomeEntryId", label: "Entrada", type: "select", required: true },
  dividendId: { name: "dividendId", label: "Dividendo previsto", type: "select", required: true },
  assetTicker: { name: "assetTicker", label: "Ativo", type: "select", required: true },
  quantity: { name: "quantity", label: "Quantidade", type: "number", required: true },
  price: { name: "price", label: "Preco unitario", type: "currency", required: true },
  fees: { name: "fees", label: "Taxas", type: "currency", required: false },
  paymentDate: { name: "paymentDate", label: "Data de pagamento", type: "date", required: true },
  amountPerShare: { name: "amountPerShare", label: "Valor por cota", type: "currency", required: false },
  cashBoxId: { name: "cashBoxId", label: "Caixinha", type: "select", required: true },
  fromWalletId: { name: "fromWalletId", label: "Carteira origem", type: "select", required: true },
  toWalletId: { name: "toWalletId", label: "Carteira destino", type: "select", required: true },
  averagePrice: { name: "averagePrice", label: "Preco medio", type: "currency", required: true },
  profileName: { name: "profileName", label: "Nome", type: "text", required: false },
  theme: {
    name: "theme",
    label: "Tema",
    type: "select",
    required: false,
    options: [
      { value: "dark", label: "Escuro" },
      { value: "light", label: "Claro" },
      { value: "system", label: "Sistema" }
    ]
  },
  currency: {
    name: "currency",
    label: "Moeda",
    type: "select",
    required: false,
    options: [{ value: "BRL", label: "Real brasileiro (BRL)" }]
  }
};

const controlPhrasePatterns = [
  /sem\s+me\s+pedir\s+confirma[cç][aã]o/gi,
  /sem\s+confirma[cç][aã]o/gi,
  /n[aã]o\s+precisa\s+(?:me\s+)?(?:pedir\s+)?confirmar?/gi,
  /n[aã]o\s+(?:me\s+)?pergunte/gi,
  /fa[cç]a\s+direto/gi,
  /cadastre\s+automaticamente/gi,
  /confirme\s+automaticamente/gi,
  /pode\s+(?:registrar|cadastrar|confirmar|executar)/gi
];

const descriptionStopWords = new Set([
  "a", "ao", "aos", "as", "com", "da", "de", "do", "dos", "e", "em", "na", "nas", "no", "nos", "o", "os", "para", "por", "um", "uma",
  "registre", "registrar", "cadastre", "cadastrar", "adicione", "adicionar", "informe", "informar", "lance", "lancar", "lançar", "crie", "criar",
  "faca", "faça", "fiz", "quero", "aporte", "aportes", "gasto", "despesa", "agora", "hoje", "ontem", "confirmacao", "confirmação", "confirmar",
  "confirme", "automaticamente"
]);

const monthNames: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  março: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12
};

const selectionSearchStopWords = new Set([
  "a", "ao", "aos", "as", "com", "da", "de", "do", "dos", "das", "e", "em", "na", "nas", "no", "nos", "o", "os", "para", "por", "um", "uma",
  "ja", "já", "desse", "deste", "esse", "esta", "este", "mes", "mês", "meses", "qual", "quais", "dele", "dela", "deles", "delas",
  "marque", "marcar", "paga", "pago", "paguei", "pagar", "recebi", "recebido", "recebida", "entrada", "gasto", "despesa", "prevista", "previsto",
  "agora", "hoje", "ontem"
]);

const explicitReadIntentPattern = /^(quanto|como|quais|qual|analise|mostre|liste|listar|ver)\b/i;
const explicitWriteSwitchPattern = /^(gastei|gasto|despesa|recebi|vou receber|receber|registre|registrar|cadastre|cadastrar|adicione|adicionar|crie|criar|marque|paguei|pagar|comprei|compre|vendi|venda|mude|troque|altere|atualize|minha renda|renda mensal)\b/i;
const shortSelectionReplyPattern = /^(?:\d+|o\s+primeiro|o\s+segundo|o\s+terceiro|o\s+quarto|o\s+quinto|o\s+sexto|o\s+setimo|o\s+oitavo|primeiro|segundo|terceiro|quarto|quinto|sexto|setimo|s[eé]timo|oitavo|esse|esse\s+mes|desse\s+mes|o\s+desse\s+mes)$/i;
const spendingReadPattern = /\b(quanto\s+(?:ja\s+)?gastei|gastei\s+quanto|total\s+gasto|gastos?\s+deste?\s+mes)\b/i;
const availableBudgetReadPattern = /\b(livre\s+pra\s+gastar|livre\s+para\s+gastar|quanto\s+tenho\s+livre|quanto\s+ainda\s+posso\s+gastar|posso\s+gastar\s+por\s+dia)\b/i;

const semanticCategoryGroups = [
  {
    key: "alimentacao",
    aliases: ["alimentacao", "alimentar", "comida", "refeicao", "restaurante", "mercado", "supermercado"],
    keywords: ["almoco", "jantar", "lanche", "cafe", "cafeteria", "restaurante", "ifood", "pizza", "hamburguer", "hamburger", "mercado", "supermercado", "padaria", "comida", "refeicao", "mcdonald", "mcdonald", "mc donald"]
  },
  {
    key: "transporte",
    aliases: ["transporte", "mobilidade", "locomocao", "combustivel", "combustivel"],
    keywords: ["gasolina", "etanol", "diesel", "combustivel", "combustível", "posto", "uber", "taxi", "taxi", "onibus", "ônibus", "metro", "metrô", "estacionamento", "pedagio", "pedágio", "99", "passagem"]
  },
  {
    key: "assinaturas",
    aliases: ["assinaturas", "assinatura", "servicos", "servicos recorrentes", "recorrentes"],
    keywords: ["spotify", "netflix", "youtube premium", "prime video", "deezer", "apple music", "amazon prime", "railway", "vercel", "hosting", "dominio", "domínio", "chatgpt"]
  },
  {
    key: "moradia",
    aliases: ["moradia", "casa", "residencia", "residência"],
    keywords: ["aluguel", "condominio", "condomínio", "energia", "luz", "agua", "água", "internet", "aluguer"]
  },
  {
    key: "saude",
    aliases: ["saude", "saúde", "medico", "médico", "farmacia", "farmácia"],
    keywords: ["farmacia", "farmácia", "medico", "médico", "consulta", "exame", "dentista", "remedio", "remédio", "plano de saude"]
  },
  {
    key: "educacao",
    aliases: ["educacao", "educação", "estudos", "faculdade", "curso"],
    keywords: ["faculdade", "curso", "escola", "livro", "mensalidade", "educacao", "educação"]
  },
  {
    key: "lazer",
    aliases: ["lazer", "entretenimento", "diversao", "diversão"],
    keywords: ["cinema", "show", "viagem", "passeio", "festa", "jogo", "lazer"]
  },
  {
    key: "investimentos",
    aliases: ["investimentos", "investimento", "aporte", "carteira", "caixinha"],
    keywords: ["aporte", "investimento", "investir", "ativo", "fii", "acao", "ação", "caixinha", "carteira"]
  },
  {
    key: "outros",
    aliases: ["outros", "outras", "diversos"],
    keywords: []
  }
] as const;

type RankedExpenseCandidate = {
  expense: Awaited<ReturnType<typeof listAllMonthlyExpenses>>[number];
  score: number;
  samePeriod: boolean;
  directMatch: boolean;
  matchedTokens: number;
  categoryName: string;
};

type RankedIncomeEntryCandidate = {
  entry: Awaited<ReturnType<typeof listAllMonthlyIncomeEntries>>[number];
  score: number;
  samePeriod: boolean;
  directMatch: boolean;
  matchedTokens: number;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

async function resolveCurrentAssistantTimeZone() {
  const auth = getAuthContext();
  if (!auth?.userId || auth.userId === SYSTEM_USER_ID) {
    return DEFAULT_APP_TIME_ZONE;
  }

  const user = await getUserForAuthContext(auth.userId);
  return typeof user?.timezone === "string" && user.timezone.trim().length > 0
    ? user.timezone.trim()
    : DEFAULT_APP_TIME_ZONE;
}

function nowFields(timeZone = DEFAULT_APP_TIME_ZONE, referenceDate = new Date()) {
  return getTimeZoneNowFields(referenceDate, timeZone);
}

function logAssistantDiagnostic(event: string, details: Record<string, unknown>) {
  const auth = getAuthContext();
  console.info(
    JSON.stringify({
      operation: "assistant-diagnostic",
      event,
      userId: auth?.userId ?? null,
      channel: auth?.channel ?? null,
      ...details
    })
  );
}

function shiftMonthPeriod(year: number, month: number, delta: number) {
  const reference = new Date(Date.UTC(year, month - 1 + delta, 1, 12, 0, 0, 0));
  return { year: reference.getUTCFullYear(), month: reference.getUTCMonth() + 1 };
}

function parseSelectionIndex(message: string, maxOptions: number) {
  const normalized = normalizeText(message);
  const numeric = normalized.match(/\b([1-9]\d*)\b/)?.[1];
  const ordinalMap: Record<string, number> = {
    primeiro: 1,
    segunda: 2,
    segundo: 2,
    terceira: 3,
    terceiro: 3,
    quarta: 4,
    quarto: 4,
    quinta: 5,
    quinto: 5,
    sexta: 6,
    sexto: 6,
    setima: 7,
    setimo: 7,
    oitava: 8,
    oitavo: 8
  };
  const ordinal = Object.entries(ordinalMap).find(([label]) => new RegExp(`\\b${label}\\b`).test(normalized))?.[1];
  const resolved = numeric ? Number(numeric) : ordinal ?? null;
  if (!resolved || resolved < 1 || resolved > maxOptions) return null;
  return resolved - 1;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseMoneyToCents(message: string) {
  const match = message.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/i);
  if (!match) return null;
  const reais = Number(match[1].replace(/\./g, ""));
  const cents = Number((match[2] ?? "0").padEnd(2, "0"));
  const value = reais * 100 + cents;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function parseBrazilianNumber(value: string) {
  const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseQuantity(message: string) {
  const quantityMatch =
    message.match(/(\d+(?:[.,]\d+)?)\s*(?:cotas?|a[cç][oõ]es?|acoes?|unidades?|units?)/i) ??
    message.match(/\b(?:comprei|compre|vendi|venda|bonifica[cç][aã]o(?:\s+de)?|split\s+de|desdobramento\s+de|grupamento\s+de)\s+(\d+(?:[.,]\d+)?)/i);
  if (!quantityMatch) return null;
  const quantity = parseBrazilianNumber(quantityMatch[1]);
  return quantity && quantity > 0 ? quantity : null;
}

function parseInvestmentPrice(message: string) {
  const priceMatch =
    message.match(/\b(?:por|a|pre[cç]o(?:\s+unit[aá]rio)?(?:\s+de)?|preco(?:\s+unitario)?(?:\s+de)?)\s*(?:r\$\s*)?(\d+(?:[.,]\d+)?)/i) ??
    message.match(/(?:r\$\s*)(\d+(?:[.,]\d+)?)(?!\s*(?:de|em)?\s*(?:dividendos?|jcp|juros|rendimento))/i);
  if (!priceMatch) return null;
  const price = parseBrazilianNumber(priceMatch[1]);
  return price && price > 0 ? price : null;
}

function parseFeesToCents(message: string) {
  const feeMatch = message.match(/\b(?:taxas?|corretagem|emolumentos?|custos?)\s*(?:de|foi|foram|:)?\s*(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/i);
  if (!feeMatch) return null;
  const reais = Number(feeMatch[1].replace(/\./g, ""));
  const cents = Number((feeMatch[2] ?? "0").padEnd(2, "0"));
  const value = reais * 100 + cents;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function extractTicker(message: string) {
  const match = message.toUpperCase().match(/\b([A-Z]{4}\d{1,2}F?|[A-Z]{3,5}11|BTC|ETH|SOL)\b/);
  return match?.[1] ?? null;
}

function operationTypeLabel(type: string) {
  const labels: Record<string, string> = {
    COMPRA: "Compra",
    VENDA: "Venda",
    BONIFICACAO: "Bonificacao",
    DESDOBRAMENTO: "Desdobramento",
    GRUPAMENTO: "Grupamento"
  };
  return labels[type] ?? type;
}

function formatCurrencyFromCents(valueInCents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valueInCents / 100);
}

function formatMarketCurrency(value: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8
  }).format(value);
}

function formatSignedPercent(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Indisponivel";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "exceptZero"
  }).format(value) + "%";
}

function formatDateBr(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function parseTargetMonth(message: string, timeZone = DEFAULT_APP_TIME_ZONE, referenceDate = new Date()) {
  const normalized = normalizeText(message);
  const now = nowFields(timeZone, referenceDate);
  if (/\b(esse|este|desse|deste)\s+mes\b/.test(normalized)) {
    return { year: now.year, month: now.month };
  }
  if (/\b(mes|mês)\s+passado\b|\bultimo\s+mes\b|\búltimo\s+m[eê]s\b/.test(normalized)) {
    return shiftMonthPeriod(now.year, now.month, -1);
  }
  if (/\bproximo\s+mes\b|\bpr[oó]ximo\s+m[eê]s\b|\bmes\s+que\s+vem\b|\bm[eê]s\s+seguinte\b/.test(normalized)) {
    return shiftMonthPeriod(now.year, now.month, 1);
  }
  for (const [name, month] of Object.entries(monthNames)) {
    if (normalized.includes(normalizeText(name))) {
      return { year: now.year, month };
    }
  }
  return { year: now.year, month: now.month };
}

function monthKey(year: number, month: number) {
  return `${year}-${pad(month)}`;
}

function dateMonthKey(value?: string | null) {
  if (!value || value.length < 7) return "";
  return value.slice(0, 7);
}

function monthDistance(value: string, targetYear: number, targetMonth: number) {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return Number.MAX_SAFE_INTEGER;
  return Math.abs((year - targetYear) * 12 + (month - targetMonth));
}

function absoluteDayDistance(left: string, right: string) {
  const leftDate = new Date(`${left}T00:00:00`);
  const rightDate = new Date(`${right}T00:00:00`);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) return Number.MAX_SAFE_INTEGER;
  return Math.abs(leftDate.getTime() - rightDate.getTime()) / (24 * 60 * 60 * 1000);
}

function tokenizeSelectionSearch(value: string) {
  const tokens = normalizeText(value)
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !selectionSearchStopWords.has(token));
  return [...new Set(tokens)];
}

function pickResolvedCandidate<T extends { score: number; samePeriod: boolean; directMatch: boolean; matchedTokens: number }>(candidates: T[]) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const [first, second] = candidates;
  if (!second) return first;
  if (first.score >= second.score + 80) return first;
  if (first.samePeriod && !second.samePeriod && first.score >= second.score + 35) return first;
  if (first.directMatch && !second.directMatch && first.score >= second.score + 30) return first;
  if (first.matchedTokens > second.matchedTokens && first.score >= second.score + 25) return first;
  return null;
}

function formatShortDateBr(date: string) {
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;
  return `${day}/${month}`;
}

function buildSelectionOptionLabel(parts: Array<string | null | undefined>) {
  return parts.filter((part) => typeof part === "string" && part.trim().length > 0).join(" - ");
}

function titleCaseDescription(value: string) {
  const trimmed = value.trim();
  return trimmed ? `${trimmed[0].toUpperCase()}${trimmed.slice(1)}` : trimmed;
}

function stripControlInstructions(value: string) {
  return controlPhrasePatterns.reduce((current, pattern) => current.replace(pattern, " "), value);
}

function stripExtractedScalars(value: string) {
  return value
    .replace(/(?:r\$\s*)?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?/gi, " ")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, " ")
    .replace(/\b([01]?\d|2[0-3]):[0-5]\d\b/g, " ");
}

function sanitizeExtractedDescription(value?: string | null) {
  if (!value) return null;
  const cleaned = stripExtractedScalars(stripControlInstructions(value))
    .replace(/\b(registre|registrar|cadastre|cadastrar|adicione|adicionar|informe|informar|lance|lan[cç]ar|crie|criar|fa[cç]a|fiz|quero\s+registrar|informe\s+que\s+fiz)\b/gi, " ")
    .replace(/\b(aporte|aportes|gasto|despesa|lan[cç]amento)\b/gi, " ")
    .replace(/\b(agora|hoje|ontem)\b/gi, " ")
    .replace(/^[\s,.;:!?()[\]{}"'`´“”‘’\-–—/\\]+|[\s,.;:!?()[\]{}"'`´“”‘’\-–—/\\]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;
  const meaningfulWords = normalizeText(cleaned)
    .split(/\s+/)
    .filter((word) => word && !descriptionStopWords.has(word));
  if (meaningfulWords.length === 0) return null;
  if (meaningfulWords.join(" ").length < 3) return null;
  return titleCaseDescription(cleaned);
}

function extractExplicitContributionDescription(message: string) {
  const withoutControl = stripControlInstructions(message);
  const match = withoutControl.match(/\b(referente\s+(?:ao|a|à|aos|às)?\s+.+)$/i) ?? withoutControl.match(/\b(?:descri[cç][aã]o|observa[cç][aã]o|obs)\s*:?\s*(.+)$/i);
  if (!match) return null;
  const candidate = match[0]
    .replace(/\s+(?:na|no|em)\s+(?:caixinha|carteira|ativo|fundo)\b.+$/i, "")
    .replace(/\s+para\s+(?:a\s+)?(?:caixinha|carteira|ativo|fundo)\b.+$/i, "");
  return sanitizeExtractedDescription(candidate);
}

function sanitizeProfileName(value?: string | null) {
  if (!value) return null;
  const cleaned = stripControlInstructions(value)
    .replace(/\s+e\s+(?:troque|mude|altere|atualize)\b.+$/i, "")
    .replace(/^[\s,.;:!?()[\]{}"'`-]+|[\s,.;:!?()[\]{}"'`-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned
    ? cleaned
        .split(" ")
        .filter(Boolean)
        .map((part) => titleCaseDescription(part))
        .join(" ")
    : null;
}

function extractProfileName(message: string) {
  const match =
    message.match(/\b(?:atualize|altere|mude|troque)?\s*(?:o\s+)?(?:meu\s+)?nome(?:\s+do\s+perfil)?(?:\s+(?:para|como))\s+(.+)$/i) ??
    message.match(/\bme\s+chame\s+de\s+(.+)$/i);
  return sanitizeProfileName(match?.[1] ?? null);
}

function parseThemePreference(message: string): "dark" | "light" | "system" | null {
  const normalized = normalizeText(message);
  if (/(tema|modo).*(escuro)|\bdark\b/.test(normalized)) return "dark";
  if (/(tema|modo).*(claro)|\blight\b/.test(normalized)) return "light";
  if (/(tema|modo).*(sistema)|seguir.*sistema|\bsystem\b/.test(normalized)) return "system";
  return null;
}

function parseCurrencyPreference(message: string): "BRL" | null {
  const normalized = normalizeText(message);
  return /\b(brl|real|reais|moeda brasileira)\b/.test(normalized) ? "BRL" : null;
}

function themeLabel(theme: string) {
  if (theme === "dark") return "Escuro";
  if (theme === "light") return "Claro";
  if (theme === "system") return "Sistema";
  return theme;
}

function currencyLabel(currency: string) {
  return currency === "BRL" ? "Real brasileiro (BRL)" : currency;
}

function buildSettingsPreviewFields(fields: ExtractedFields) {
  return [
    ...(typeof fields.profileName === "string" ? [{ label: "Nome", value: fields.profileName }] : []),
    ...(typeof fields.theme === "string" ? [{ label: "Tema", value: themeLabel(fields.theme) }] : []),
    ...(typeof fields.currency === "string" ? [{ label: "Moeda", value: currencyLabel(fields.currency) }] : [])
  ];
}

function resolveSemanticGroups(message: string, description?: string | null) {
  const searchable = normalizeText([message, description ?? ""].filter(Boolean).join(" "));
  return semanticCategoryGroups.filter((group) => group.keywords.some((keyword) => searchable.includes(normalizeText(keyword))));
}

function resolveCategoryScore(category: { id: string; name: string }, message: string, description?: string | null) {
  const searchable = normalizeText([message, description ?? ""].filter(Boolean).join(" "));
  const categoryText = normalizeText(`${category.id} ${category.name}`);
  const categoryTokens = tokenizeSelectionSearch(categoryText);
  let score = 0;

  if (searchable.includes(normalizeText(category.name))) score += 140;
  if (searchable.includes(normalizeText(category.id))) score += 120;
  score += categoryTokens.filter((token) => searchable.includes(token)).length * 22;

  for (const group of resolveSemanticGroups(message, description)) {
    if (group.aliases.some((alias) => categoryText.includes(normalizeText(alias)))) {
      score += 95;
    }
  }

  return score;
}

function resolvePlanCategoryFromMessage(
  categories: Array<{ id: string; name: string }>,
  message: string,
  description?: string | null
) {
  const scored = categories
    .map((category) => ({ category, score: resolveCategoryScore(category, message, description) }))
    .sort((left, right) => right.score - left.score || left.category.name.localeCompare(right.category.name));

  if ((scored[0]?.score ?? 0) > 0) {
    return { category: scored[0].category, reason: "semantic" as const };
  }

  const fallback = categories.find((category) => /(^| )(outros|outras|diversos)( |$)/.test(normalizeText(`${category.id} ${category.name}`)));
  if (fallback) {
    return { category: fallback, reason: "fallback" as const };
  }

  return { category: null, reason: "missing" as const };
}

function extractExpenseDescription(message: string) {
  const withoutControl = stripControlInstructions(message);
  const contextualMatch =
    withoutControl.match(/\bcom\s+(.+?)(?:,|\s+agora\b|\s+hoje\b|\s+ontem\b|\s+amanh[aã]\b|$)/i) ??
    withoutControl.match(/\b(?:no|na|num|numa)\s+(.+?)(?:,|\s+agora\b|\s+hoje\b|\s+ontem\b|\s+amanh[aã]\b|$)/i) ??
    withoutControl.match(/\b(?:de|da|do)\s+(.+?)(?:,|\s+agora\b|\s+hoje\b|\s+ontem\b|\s+amanh[aã]\b|$)/i);
  if (contextualMatch) {
    const description = sanitizeExtractedDescription(contextualMatch[1]);
    if (description) return description;
  }
  const normalized = normalizeText(withoutControl);
  if (/\balmoco\b/.test(normalized)) return "Almoco";
  if (/\bjantar\b/.test(normalized)) return "Jantar";
  if (/\blanche\b/.test(normalized)) return "Lanche";
  if (/\bifood\b/.test(normalized)) return "Ifood";
  if (normalized.includes("gasolina")) return "Gasolina";
  if (normalized.includes("spotify")) return "Spotify";
  if (normalized.includes("mercado")) return "Mercado";
  if (normalized.includes("uber")) return "Uber";
  if (/(mcdonald|mc donald|mcdonalds|mc donalds)/.test(normalized)) return "McDonald's";
  return null;
}

function extractExpenseNote(message: string, description?: string | null) {
  const noteMatch = message.match(/,\s+(.+)$/);
  if (!noteMatch) return null;
  const note = sanitizeExtractedDescription(noteMatch[1]);
  if (!note) return null;
  return normalizeText(note) === normalizeText(description ?? "") ? null : note;
}

function inferCategoryName(message: string, description?: string | null) {
  const matchedGroup = resolveSemanticGroups(message, description)[0];
  if (!matchedGroup) return "";
  if (matchedGroup.key === "alimentacao") return "Alimentacao";
  if (matchedGroup.key === "transporte") return "Transporte";
  if (matchedGroup.key === "assinaturas") return "Assinaturas";
  if (matchedGroup.key === "investimentos") return "Investimentos";
  if (matchedGroup.key === "moradia") return "Moradia";
  if (matchedGroup.key === "saude") return "Saude";
  if (matchedGroup.key === "educacao") return "Educacao";
  if (matchedGroup.key === "lazer") return "Lazer";
  return "";
}

function buildPendingExpenseSearchText(message: string) {
  return tokenizeSelectionSearch(
    normalizeText(message)
      .replace(/(?:r\$\s*)?\d[\d.,]*/gi, " ")
      .replace(/\b(?:real|reais)\b/g, " ")
  ).join(" ");
}

async function buildExpenseCategoryNameMap(expenses: Awaited<ReturnType<typeof listAllMonthlyExpenses>>) {
  const planIds = [...new Set(expenses.map((expense) => expense.planId).filter(Boolean))];
  const plans = await Promise.all(planIds.map(async (planId) => [planId, await findMonthlyPlanById(planId)] as const));
  const categoryNamesByPlanId = new Map(
    plans.map(([planId, plan]) => [
      planId,
      new Map((plan?.categories ?? []).map((category) => [category.id, category.name]))
    ])
  );

  const categoryNames = new Map<string, string>();
  for (const expense of expenses) {
    if (!expense.id) continue;
    const categoryName = categoryNamesByPlanId.get(expense.planId)?.get(expense.categoryId ?? "") ?? expense.categoryId ?? "";
    categoryNames.set(expense.id, categoryName);
  }

  return categoryNames;
}

function compareRankedExpenseCandidates(left: RankedExpenseCandidate, right: RankedExpenseCandidate) {
  return right.score - left.score || left.expense.date.localeCompare(right.expense.date) || left.expense.description.localeCompare(right.expense.description);
}

function compareRankedIncomeCandidates(left: RankedIncomeEntryCandidate, right: RankedIncomeEntryCandidate) {
  return right.score - left.score || left.entry.date.localeCompare(right.entry.date) || left.entry.description.localeCompare(right.entry.description);
}

function buildPendingExpenseCandidate(candidate: RankedExpenseCandidate): PendingExpenseCandidate {
  return {
    id: candidate.expense.id ?? "",
    label: buildSelectionOptionLabel([
      candidate.expense.description,
      formatCurrencyFromCents(candidate.expense.amountInCents),
      formatShortDateBr(candidate.expense.date),
      candidate.categoryName || null
    ]),
    description: candidate.expense.description,
    amountInCents: candidate.expense.amountInCents,
    date: candidate.expense.date,
    categoryName: candidate.categoryName,
    recurrenceId: candidate.expense.recurrenceId ?? null,
    recurrenceOriginalDate: candidate.expense.recurrenceOriginalDate ?? candidate.expense.date,
    recurrenceSourceId: candidate.expense.recurrenceSourceId ?? null
  };
}

function buildPendingIncomeCandidate(candidate: RankedIncomeEntryCandidate): PendingIncomeCandidate {
  return {
    id: candidate.entry.id ?? "",
    label: buildSelectionOptionLabel([
      candidate.entry.description,
      formatCurrencyFromCents(candidate.entry.amountInCents),
      formatShortDateBr(candidate.entry.date),
      candidate.entry.category
    ]),
    description: candidate.entry.description,
    amountInCents: candidate.entry.amountInCents,
    date: candidate.entry.date,
    category: candidate.entry.category,
    recurrenceId: candidate.entry.recurrenceId ?? null,
    recurrenceOriginalDate: candidate.entry.recurrenceOriginalDate ?? candidate.entry.date,
    recurrenceSourceId: candidate.entry.recurrenceSourceId ?? null
  };
}

function expenseCandidateOccurrenceKey(candidate: RankedExpenseCandidate) {
  if (candidate.expense.recurrenceId && (candidate.expense.recurrenceOriginalDate ?? candidate.expense.date)) {
    return `${candidate.expense.recurrenceId}:${candidate.expense.recurrenceOriginalDate ?? candidate.expense.date}`;
  }

  return candidate.expense.id ?? `expense:${candidate.expense.description}:${candidate.expense.date}:${candidate.expense.amountInCents}`;
}

function incomeCandidateOccurrenceKey(candidate: RankedIncomeEntryCandidate) {
  if (candidate.entry.recurrenceId && (candidate.entry.recurrenceOriginalDate ?? candidate.entry.date)) {
    return `${candidate.entry.recurrenceId}:${candidate.entry.recurrenceOriginalDate ?? candidate.entry.date}`;
  }

  return candidate.entry.id ?? `income:${candidate.entry.description}:${candidate.entry.date}:${candidate.entry.amountInCents}`;
}

function shouldReplaceExpenseCandidate(current: RankedExpenseCandidate, next: RankedExpenseCandidate) {
  const currentPreference = Number(Boolean(current.expense.recurrenceSourceId)) * 40 + current.score;
  const nextPreference = Number(Boolean(next.expense.recurrenceSourceId)) * 40 + next.score;
  return nextPreference > currentPreference;
}

function dedupeRankedExpenseCandidates(candidates: RankedExpenseCandidate[]) {
  const deduped = new Map<string, RankedExpenseCandidate>();
  const duplicateGroups = new Map<string, string[]>();

  for (const candidate of candidates) {
    const key = expenseCandidateOccurrenceKey(candidate);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, candidate);
      duplicateGroups.set(key, [candidate.expense.id ?? ""]);
      continue;
    }

    duplicateGroups.get(key)?.push(candidate.expense.id ?? "");
    if (shouldReplaceExpenseCandidate(existing, candidate)) {
      deduped.set(key, candidate);
    }
  }

  const duplicatedKeys = [...duplicateGroups.entries()].filter(([, ids]) => ids.filter(Boolean).length > 1);
  if (duplicatedKeys.length > 0) {
    logAssistantDiagnostic("expense-candidate-duplicates-collapsed", {
      duplicateGroups: duplicatedKeys.map(([key, ids]) => ({ key, ids }))
    });
  }

  return [...deduped.values()].sort(compareRankedExpenseCandidates);
}

function dedupeRankedIncomeCandidates(candidates: RankedIncomeEntryCandidate[]) {
  const deduped = new Map<string, RankedIncomeEntryCandidate>();

  for (const candidate of candidates) {
    const key = incomeCandidateOccurrenceKey(candidate);
    const existing = deduped.get(key);
    if (!existing || candidate.score > existing.score) {
      deduped.set(key, candidate);
    }
  }

  return [...deduped.values()].sort(compareRankedIncomeCandidates);
}

async function rankExpenseCompletionCandidates(
  message: string,
  expenses: Awaited<ReturnType<typeof listAllMonthlyExpenses>>,
  timeZone = DEFAULT_APP_TIME_ZONE
) {
  const normalized = normalizeText(message);
  const candidateText = buildPendingExpenseSearchText(message);
  const tokens = tokenizeSelectionSearch(candidateText);
  const amountInCents = parseMoneyToCents(message);
  const period = parseTargetMonth(message, timeZone);
  const targetPeriodKey = monthKey(period.year, period.month);
  const now = nowFields(timeZone);
  const categoryNames = await buildExpenseCategoryNameMap(expenses);

  const ranked = expenses
    .filter((expense) => expense.status !== "completed" && !expense.recurrenceCancelled)
    .map((expense) => {
      const categoryName = categoryNames.get(expense.id ?? "") ?? "";
      const searchable = normalizeText([expense.description, expense.note ?? "", categoryName].filter(Boolean).join(" "));
      const description = normalizeText(expense.description);
      const directMatch = !candidateText || normalized.includes(description) || description.includes(candidateText) || candidateText.includes(description);
      const matchedTokens = tokens.filter((token) => searchable.includes(token)).length;
      const hasTextMatch = !candidateText || directMatch || matchedTokens > 0;
      const matchesAmount = !amountInCents || expense.amountInCents === amountInCents;
      if (!matchesAmount || !hasTextMatch) return null;

      const samePeriod = dateMonthKey(expense.date) === targetPeriodKey;
      let score = 0;
      if (amountInCents) score += 80;
      if (directMatch) score += 75;
      score += matchedTokens * 28;
      if (tokens.length > 0 && matchedTokens === tokens.length) score += 30;
      if (samePeriod) score += 140;
      else score += Math.max(0, 55 - monthDistance(expense.date, period.year, period.month) * 20);
      score += Math.max(0, 24 - absoluteDayDistance(expense.date, now.date));
      if (expense.recurring) score += 8;

      return { expense, score, samePeriod, directMatch, matchedTokens, categoryName } satisfies RankedExpenseCandidate;
    })
    .filter((candidate): candidate is RankedExpenseCandidate => candidate !== null)
    .sort(compareRankedExpenseCandidates);

  return dedupeRankedExpenseCandidates(ranked);
}

function buildExpenseSelectionMissingField(candidates: RankedExpenseCandidate[]): MissingField {
  return {
    ...fieldDefinition("expenseId"),
    options: candidates.slice(0, 8).map((candidate) => {
      const pendingCandidate = buildPendingExpenseCandidate(candidate);
      return { value: pendingCandidate.id, label: pendingCandidate.label };
    })
  };
}

function buildExpenseCompletionPreviewFields(expense: RankedExpenseCandidate["expense"], completedAt?: string | null, categoryName?: string) {
  return [
    { label: "Descricao", value: expense.description },
    { label: "Valor", value: formatCurrencyFromCents(expense.amountInCents) },
    { label: "Vencimento", value: formatDateBr(expense.date) },
    ...(categoryName ? [{ label: "Categoria", value: categoryName }] : []),
    ...(completedAt ? [{ label: "Pago em", value: formatDateBr(String(completedAt).slice(0, 10)) }] : [])
  ];
}

async function updateExpenseSelectionAction(
  action: AiPendingActionRecord,
  candidates: RankedExpenseCandidate[],
  completedAt?: string | null,
  message = "Encontrei mais de um gasto. Qual deles voce pagou?"
) {
  const missingFields = [buildExpenseSelectionMissingField(candidates)];
  const extractedFields: ExtractedFields = {
    ...(action.extractedFields as Record<string, unknown>),
    expenseId: null,
    candidateExpenseIds: candidates.map((candidate) => candidate.expense.id).filter(Boolean),
    candidateExpenses: candidates.map(buildPendingExpenseCandidate),
    ...(completedAt ? { completedAt } : {})
  };
  const updated = await updateAiPendingAction(action.id ?? "", { extractedFields, missingFields, status: "collecting" });
  if (!updated) return createErrorResponse("Nao consegui atualizar a selecao pendente.");
  const preview = buildPreview(
    updated,
    completedAt ? [{ label: "Pago em", value: formatDateBr(String(completedAt).slice(0, 10)) }] : [],
    "Escolher gasto para marcar como pago"
  );
  const withPreview = await updateAiPendingAction(action.id ?? "", { preview });
  return actionResponse(withPreview ?? { ...updated, preview }, message);
}

async function finalizeExpenseCompletionSelection(action: AiPendingActionRecord, candidate: RankedExpenseCandidate, completedAt?: string | null) {
  const extractedFields: ExtractedFields = {
    ...(action.extractedFields as Record<string, unknown>),
    expenseId: candidate.expense.id,
    description: candidate.expense.description,
    amountInCents: candidate.expense.amountInCents,
    expenseDate: candidate.expense.date,
    categoryName: candidate.categoryName,
    candidateExpenseIds: [candidate.expense.id].filter(Boolean),
    candidateExpenses: [buildPendingExpenseCandidate(candidate)],
    ...(completedAt ? { completedAt } : {})
  };
  const missingFields = getMissingRequiredFields(action.toolName, extractedFields);
  const status = missingFields.length ? "collecting" : "awaiting_confirmation";
  const updated = await updateAiPendingAction(action.id ?? "", { extractedFields, missingFields, status });
  if (!updated) return createErrorResponse("Nao consegui atualizar a acao pendente.");
  const preview = buildPreview(updated, buildExpenseCompletionPreviewFields(candidate.expense, completedAt, candidate.categoryName), "Marcar gasto como pago");
  const withPreview = await updateAiPendingAction(action.id ?? "", { preview });
  return actionResponse(withPreview ?? { ...updated, preview }, "Confirme para marcar este gasto como pago.");
}

function buildPendingIncomeSearchText(message: string) {
  return tokenizeSelectionSearch(
    normalizeText(message)
      .replace(/(?:r\$\s*)?\d[\d.,]*/gi, " ")
      .replace(/\b(?:entrada|receita|recebimento|real|reais)\b/g, " ")
  ).join(" ");
}

function rankIncomeEntryCandidates(
  message: string,
  entries: Awaited<ReturnType<typeof listAllMonthlyIncomeEntries>>,
  timeZone = DEFAULT_APP_TIME_ZONE
) {
  const normalized = normalizeText(message);
  const candidateText = buildPendingIncomeSearchText(message);
  const tokens = tokenizeSelectionSearch(candidateText);
  const amountInCents = parseMoneyToCents(message);
  const category = inferIncomeCategory(message);
  const period = parseTargetMonth(message, timeZone);
  const targetPeriodKey = monthKey(period.year, period.month);
  const now = nowFields(timeZone);

  const ranked = entries
    .filter((entry) => entry.status === "planned" && !entry.recurrenceCancelled)
    .map((entry) => {
      const searchable = normalizeText([entry.description, entry.category, entry.note ?? ""].filter(Boolean).join(" "));
      const description = normalizeText(entry.description);
      const categoryText = normalizeText(entry.category);
      const directMatch = !candidateText || description.includes(candidateText) || candidateText.includes(description) || categoryText.includes(candidateText);
      const matchedTokens = tokens.filter((token) => searchable.includes(token)).length;
      const hasTextMatch = !candidateText || directMatch || matchedTokens > 0;
      const matchesAmount = !amountInCents || entry.amountInCents === amountInCents;
      const matchesCategory = category === "Outros" || categoryText.includes(normalizeText(category));
      if (!matchesAmount || (!hasTextMatch && !matchesCategory)) return null;

      const samePeriod = dateMonthKey(entry.date) === targetPeriodKey;
      let score = 0;
      if (amountInCents) score += 80;
      if (directMatch) score += 70;
      if (matchesCategory) score += 28;
      score += matchedTokens * 24;
      if (tokens.length > 0 && matchedTokens === tokens.length) score += 24;
      if (samePeriod) score += 120;
      else score += Math.max(0, 48 - monthDistance(entry.date, period.year, period.month) * 18);
      score += Math.max(0, 20 - absoluteDayDistance(entry.date, now.date));

      return { entry, score, samePeriod, directMatch, matchedTokens } satisfies RankedIncomeEntryCandidate;
    })
    .filter((candidate): candidate is RankedIncomeEntryCandidate => candidate !== null)
    .sort(compareRankedIncomeCandidates);

  return dedupeRankedIncomeCandidates(ranked);
}

function buildIncomeEntrySelectionMissingField(candidates: RankedIncomeEntryCandidate[]): MissingField {
  return {
    ...fieldDefinition("incomeEntryId"),
    options: candidates.slice(0, 8).map((candidate) => {
      const pendingCandidate = buildPendingIncomeCandidate(candidate);
      return { value: pendingCandidate.id, label: pendingCandidate.label };
    })
  };
}

function buildIncomeEntryReceiptPreviewFields(entry: RankedIncomeEntryCandidate["entry"], receivedAt?: string | null) {
  return [
    { label: "Descricao", value: entry.description },
    { label: "Valor", value: formatCurrencyFromCents(entry.amountInCents) },
    { label: "Categoria", value: entry.category },
    { label: "Data prevista", value: formatDateBr(entry.date) },
    ...(receivedAt ? [{ label: "Recebido em", value: formatDateBr(String(receivedAt).slice(0, 10)) }] : [])
  ];
}

async function updateIncomeEntrySelectionAction(
  action: AiPendingActionRecord,
  candidates: RankedIncomeEntryCandidate[],
  receivedAt?: string | null,
  message = "Encontrei mais de uma entrada prevista. Qual delas voce recebeu?"
) {
  const missingFields = [buildIncomeEntrySelectionMissingField(candidates)];
  const extractedFields: ExtractedFields = {
    ...(action.extractedFields as Record<string, unknown>),
    incomeEntryId: null,
    candidateIncomeEntryIds: candidates.map((candidate) => candidate.entry.id).filter(Boolean),
    candidateIncomeEntries: candidates.map(buildPendingIncomeCandidate),
    ...(receivedAt ? { receivedAt } : {})
  };
  const updated = await updateAiPendingAction(action.id ?? "", { extractedFields, missingFields, status: "collecting" });
  if (!updated) return createErrorResponse("Nao consegui atualizar a selecao pendente.");
  const preview = buildPreview(
    updated,
    receivedAt ? [{ label: "Recebido em", value: formatDateBr(String(receivedAt).slice(0, 10)) }] : [],
    "Escolher entrada prevista"
  );
  const withPreview = await updateAiPendingAction(action.id ?? "", { preview });
  return actionResponse(withPreview ?? { ...updated, preview }, message);
}

async function finalizeIncomeEntrySelection(action: AiPendingActionRecord, candidate: RankedIncomeEntryCandidate, receivedAt?: string | null) {
  const extractedFields: ExtractedFields = {
    ...(action.extractedFields as Record<string, unknown>),
    incomeEntryId: candidate.entry.id,
    description: candidate.entry.description,
    category: candidate.entry.category,
    amountInCents: candidate.entry.amountInCents,
    incomeDate: candidate.entry.date,
    candidateIncomeEntryIds: [candidate.entry.id].filter(Boolean),
    candidateIncomeEntries: [buildPendingIncomeCandidate(candidate)],
    ...(receivedAt ? { receivedAt } : {})
  };
  const missingFields = getMissingRequiredFields(action.toolName, extractedFields);
  const status = missingFields.length ? "collecting" : "awaiting_confirmation";
  const updated = await updateAiPendingAction(action.id ?? "", { extractedFields, missingFields, status });
  if (!updated) return createErrorResponse("Nao consegui atualizar a acao pendente.");
  const preview = buildPreview(updated, buildIncomeEntryReceiptPreviewFields(candidate.entry, receivedAt), "Marcar entrada como recebida");
  const withPreview = await updateAiPendingAction(action.id ?? "", { preview });
  return actionResponse(withPreview ?? { ...updated, preview }, "Confirme para marcar esta entrada como recebida.");
}

async function resolveBudgetCategory(year: number, month: number, message: string, description?: string | null) {
  const plan = await getOrCreateMonthlyPlan(year, month);
  const resolved = resolvePlanCategoryFromMessage(plan.categories, message, description);
  if (resolved.category) {
    logAssistantDiagnostic("assistant-category-resolution", {
      period: `${year}-${pad(month)}`,
      description: description ?? null,
      categoryId: resolved.category.id,
      categoryName: resolved.category.name,
      resolution: resolved.reason
    });
    return { plan, categoryId: resolved.category.id, missing: [] };
  }

  logAssistantDiagnostic("assistant-category-resolution", {
    period: `${year}-${pad(month)}`,
    description: description ?? null,
    categoryId: null,
    resolution: "missing"
  });

  return {
    plan,
    categoryId: null,
    missing: [
      {
        name: "categoryId",
        label: "Setor",
        type: "select" as const,
        required: true,
        options: plan.categories.map((category) => ({ value: category.id, label: category.name }))
      }
    ]
  };
}

function isInvestmentPlanCategory(plan: Awaited<ReturnType<typeof getOrCreateMonthlyPlan>>, categoryId?: unknown) {
  if (typeof categoryId !== "string" || !categoryId) return false;
  const category = plan.categories.find((item) => item.id === categoryId);
  if (!category) return false;
  return normalizeText(category.id) === "investimentos" || normalizeText(category.name) === "investimentos";
}

function isPresent(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function fieldDefinition(name: string): MissingField {
  return missingFieldDefinitions[name] ?? { name, label: name, type: "text", required: true };
}

async function assetMissingField(): Promise<MissingField> {
  const assets = await listAssets();
  return {
    ...fieldDefinition("assetTicker"),
    options: assets.slice(0, 12).map((asset) => ({ value: asset.ticker, label: asset.ticker }))
  };
}

async function cashBoxMissingField(): Promise<MissingField> {
  const cashBoxes = await listCashBoxes();
  return {
    ...fieldDefinition("cashBoxId"),
    options: cashBoxes.slice(0, 12).map((cashBox) => ({ value: String(cashBox.id ?? cashBox.name), label: cashBox.name }))
  };
}

async function expenseCustomMissingFields(fields: ExtractedFields, timeZone = DEFAULT_APP_TIME_ZONE) {
  const currentPeriod = nowFields(timeZone);
  const plan = await getOrCreateMonthlyPlan(currentPeriod.year, currentPeriod.month);
  if (!isInvestmentPlanCategory(plan, fields.categoryId)) return [];

  const destination = typeof fields.investmentDestination === "string" ? fields.investmentDestination : "";
  if (!destination) return [fieldDefinition("investmentDestination")];

  if (destination === "asset") {
    const missing: MissingField[] = [];
    if (!isPresent(fields.assetTicker)) missing.push(await assetMissingField());
    if (!isPresent(fields.quantity)) missing.push(fieldDefinition("quantity"));
    if (!isPresent(fields.price)) missing.push(fieldDefinition("price"));
    return missing;
  }

  if (destination === "cashbox" && !isPresent(fields.cashBoxId)) {
    return [await cashBoxMissingField()];
  }

  return [];
}

function buildExpenseIntegrationFromFields(fields: ExtractedFields, idempotencyKey?: string) {
  const destination = typeof fields.investmentDestination === "string" ? fields.investmentDestination : "";
  if (destination === "asset") {
    return {
      destination: "asset" as const,
      assetTicker: typeof fields.assetTicker === "string" ? fields.assetTicker : undefined,
      operationType: "COMPRA" as const,
      quantity: isPresent(fields.quantity) ? Number(fields.quantity) : undefined,
      price: isPresent(fields.price) ? Number(fields.price) : undefined,
      fees: isPresent(fields.fees) ? Number(fields.fees) : 0,
      idempotencyKey
    };
  }

  if (destination === "cashbox") {
    return {
      destination: "cashbox" as const,
      cashBoxId: typeof fields.cashBoxId === "string" ? fields.cashBoxId : undefined,
      idempotencyKey
    };
  }

  return undefined;
}

function buildMonthlyExpenseToolPayload(fields: ExtractedFields, idempotencyKey?: string) {
  return {
    ...fields,
    integration: buildExpenseIntegrationFromFields(fields, idempotencyKey)
  };
}

function buildMonthlyIncomeEntryToolPayload(fields: ExtractedFields, idempotencyKey?: string) {
  return {
    ...fields,
    category: typeof fields.category === "string" ? fields.category : "Outros",
    incomeType: fields.recurring ? "recurring" : fields.incomeType ?? "single",
    recurring: Boolean(fields.recurring),
    sourceType: "manual",
    sourceId: null,
    idempotencyKey
  };
}

function getMissingRequiredFields(toolName: AiToolName, fields: ExtractedFields, customMissing: MissingField[] = []) {
  const customNames = new Set(customMissing.map((field) => field.name));
  const requiredMissing = toolRequirements[toolName].required
    .filter((field) => !customNames.has(field) && !isPresent(fields[field]))
    .map(fieldDefinition);

  return [...customMissing, ...requiredMissing].filter((field, index, all) => all.findIndex((item) => item.name === field.name) === index);
}

function validateToolFieldsForPreview(toolName: AiToolName, fields: ExtractedFields) {
  if (toolName === "createContribution") {
    contributionSchema.parse({
      date: String(fields.date),
      value: Number(fields.amountInCents) / 100,
      description: typeof fields.description === "string" ? fields.description : undefined
    });
    return;
  }

  if (toolName === "createMonthlyExpense") {
    monthlyExpenseSchema.parse(buildMonthlyExpenseToolPayload(fields));
    return;
  }

  if (toolName === "createIncomeEntry") {
    monthlyIncomeEntrySchema.parse(buildMonthlyIncomeEntryToolPayload(fields));
    return;
  }

  if (toolName === "updateMonthlyIncome") {
    const month = Number(fields.month);
    const year = Number(fields.year);
    const incomeInCents = Number(fields.incomeInCents);
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("Invalid month");
    if (!Number.isInteger(year) || year < 1970 || year > 2200) throw new Error("Invalid year");
    if (!Number.isInteger(incomeInCents) || incomeInCents < 0) throw new Error("Invalid income");
    return;
  }

  if (toolName === "createFinancialGoal") {
    goalSchema.parse({
      title: String(fields.title),
      type: fields.type,
      target: Number(fields.targetInCents) / 100,
      active: true,
      completed: false
    });
    return;
  }

  if (toolName === "markExpenseAsCompleted" && !isPresent(fields.expenseId)) {
    throw new Error("Expense id is required");
  }

  if (toolName === "markIncomeEntryAsReceived" && !isPresent(fields.incomeEntryId)) {
    throw new Error("Income entry id is required");
  }

  if (
    toolName === "createInvestmentPurchase" ||
    toolName === "createInvestmentSale" ||
    toolName === "registerBonus" ||
    toolName === "registerSplit" ||
    toolName === "registerReverseSplit"
  ) {
    const type = toolName === "createInvestmentPurchase"
      ? "COMPRA"
      : toolName === "createInvestmentSale"
        ? "VENDA"
        : toolName === "registerBonus"
          ? "BONIFICACAO"
          : toolName === "registerSplit"
            ? "DESDOBRAMENTO"
            : "GRUPAMENTO";
    operationSchema.parse({
      assetTicker: String(fields.assetTicker),
      type,
      quantity: Number(fields.quantity),
      price: Number(fields.price ?? 0),
      fees: Number(fields.fees ?? 0),
      totalValue: Number(fields.quantity) * Number(fields.price ?? 0),
      date: String(fields.date),
      notes: typeof fields.notes === "string" ? fields.notes : undefined
    });
    return;
  }

  if (toolName === "registerDividend" || toolName === "registerJCP") {
    dividendSchema.parse({
      assetTicker: String(fields.assetTicker),
      type: toolName === "registerJCP" ? "jcp" : "dividendo",
      totalValue: Number(fields.amountInCents) / 100,
      amountPerShare: isPresent(fields.amountPerShare) ? Number(fields.amountPerShare) : undefined,
      quantityEligible: isPresent(fields.quantityEligible) ? Number(fields.quantityEligible) : undefined,
      paymentDate: String(fields.paymentDate),
      status: "received",
      source: "manual",
      notes: typeof fields.notes === "string" ? fields.notes : undefined
    });
    return;
  }

  if (toolName === "markDividendReceived") {
    if (!isPresent(fields.dividendId)) throw new Error("Dividend id is required");
    return;
  }

  if (toolName === "updateSettingsProfile") {
    const parsed = settingsUpdateSchema.parse(fields);
    if (Object.keys(parsed).length === 0) {
      throw new Error("At least one settings field is required");
    }
  }
}

function meaningfulPreviewFields(fields: Array<{ label: string; value: string }>) {
  return fields.filter((field) => sanitizeExtractedDescription(field.value) || /valor|data|horario|periodo|renda|entrada|categoria|setor|tipo|ativo|quantidade|preco|taxas|total|evento/i.test(normalizeText(field.label)));
}

function buildPreview(action: AiPendingActionRecord, fields: Array<{ label: string; value: string }>, title: string): NonNullable<AiChatStructuredResponse["pendingAction"]> {
  return {
    id: action.id ?? "",
    actionType: action.actionType,
    title,
    status: action.status,
    riskLevel: action.riskLevel,
    fields: meaningfulPreviewFields(fields).map((field) => ({ name: field.label, label: field.label, value: field.value, type: "text", required: false })),
    missingFields: action.missingFields,
    confirmLabel: action.riskLevel === "high" ? "Confirmar alteracao sensivel" : "Confirmar operacao",
    cancelLabel: "Cancelar",
    editLabel: "Editar"
  };
}

async function createPendingAction(input: {
  sessionId: string;
  actionType: string;
  toolName: AiToolName;
  extractedFields: ExtractedFields;
  missingFields?: AiPendingActionRecord["missingFields"];
  riskLevel?: AiPendingActionRiskLevel;
  title: string;
  previewFields: Array<{ label: string; value: string }>;
}) {
  const missingFields = getMissingRequiredFields(input.toolName, input.extractedFields, input.missingFields ?? []);
  if (missingFields.length === 0) validateToolFieldsForPreview(input.toolName, input.extractedFields);
  const status = missingFields.length ? "collecting" : "awaiting_confirmation";
  const idempotencyKey = `${input.sessionId}:${input.toolName}:${randomUUID()}`;
  const action = await createAiPendingAction({
    sessionId: input.sessionId,
    actionType: input.actionType,
    toolName: input.toolName,
    extractedFields: input.extractedFields,
    missingFields,
    preview: null,
    status,
    riskLevel: input.riskLevel ?? getAiToolCatalogEntry(input.toolName).risk,
    expiresAt: new Date(Date.now() + pendingActionTtlMs),
    idempotencyKey
  });
  const preview = buildPreview(action, input.previewFields, input.title);
  const saved = action.id ? await updateAiPendingAction(action.id, { preview }) : action;
  return saved ? { ...saved, preview } : { ...action, preview };
}

function actionResponse(action: AiPendingActionRecord, message: string): AiChatStructuredResponse {
  if (action.status === "collecting") {
    const selectField = action.missingFields.find((field) => field.type === "select" && (field.options?.length ?? 0) > 0);
    return createStructuredResponse({
      responseType: "form",
      title: action.preview?.title ?? (selectField ? "Escolha uma opcao" : "Preciso de mais uma informacao"),
      message,
      pendingAction: action.preview,
      sections: [
        { type: "alert", items: [{ title: "Campo pendente", description: message, severity: "info" }] },
        ...(selectField
          ? [
              {
                type: "list" as const,
                title: selectField.label,
                items: (selectField.options ?? []).slice(0, 8).map((option) => ({ title: option.label, severity: "info" as const }))
              }
            ]
          : [])
      ],
      suggestions: selectField ? ["Responda com o numero ou com o nome", "cancelar"] : []
    });
  }

  return createStructuredResponse({
    responseType: "confirmation",
    title: action.preview?.title ?? "Confirmar operacao",
    message,
    pendingAction: action.preview,
    sections: [
      {
        type: "metrics",
        metrics: (action.preview?.fields ?? []).map((field) => ({
          label: field.label,
          value: String(field.value ?? ""),
          format: field.type === "currency" ? "currency" : "text",
          status: "neutral"
        }))
      }
    ]
  });
}

function inferEntityId(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.id === "string" && record.id.length > 0) return record.id;
  if (typeof record._id === "string" && record._id.length > 0) return record._id;
  return undefined;
}

function normalizeAffectedEntities(entities: AiAffectedEntity[]) {
  const unique = new Map<string, AiAffectedEntity>();

  for (const entity of entities) {
    if (!entity.type) continue;
    const id = entity.id ?? undefined;
    const key = `${entity.type}:${id ?? ""}`;
    if (!unique.has(key)) unique.set(key, id ? { type: entity.type, id } : { type: entity.type });
  }

  return [...unique.values()];
}

function inferAffectedEntities(action: AiPendingActionRecord, result: unknown): AiAffectedEntity[] {
  const fields = action.extractedFields;

  if (action.toolName === "createContribution") {
    return normalizeAffectedEntities([{ type: "contribution", id: inferEntityId(result) }]);
  }

  if (action.toolName === "createMonthlyExpense") {
    const expenseRecord = result as { id?: string; integration?: { linkedEntityType?: string | null; linkedEntityId?: string | null; assetTicker?: string | null; cashBoxId?: string | null } } | null;
    return normalizeAffectedEntities([
      { type: "monthlyExpense", id: inferEntityId(result) },
      ...(expenseRecord?.integration?.linkedEntityType === "operation"
        ? [
            { type: "operation", id: expenseRecord.integration.linkedEntityId ?? undefined },
            { type: "asset", id: expenseRecord.integration.assetTicker ?? undefined }
          ]
        : []),
      ...(expenseRecord?.integration?.linkedEntityType === "cashBoxMovement"
        ? [
            { type: "cashBoxMovement", id: expenseRecord.integration.linkedEntityId ?? undefined },
            { type: "cashBox", id: expenseRecord.integration.cashBoxId ?? undefined }
          ]
        : [])
    ]);
  }

  if (action.toolName === "createIncomeEntry") {
    return normalizeAffectedEntities([{ type: "monthlyIncomeEntry", id: inferEntityId(result) }]);
  }

  if (action.toolName === "updateMonthlyIncome") {
    return normalizeAffectedEntities([{ type: "monthlyPlan", id: inferEntityId(result) }]);
  }

  if (action.toolName === "createFinancialGoal") {
    return normalizeAffectedEntities([{ type: "goal", id: inferEntityId(result) }]);
  }

  if (action.toolName === "markExpenseAsCompleted") {
    const completionResult = result as { expense?: unknown } | null;
    return normalizeAffectedEntities([
      {
        type: "monthlyExpense",
        id: inferEntityId(completionResult?.expense) ?? (typeof fields.expenseId === "string" ? fields.expenseId : undefined)
      }
    ]);
  }

  if (action.toolName === "markIncomeEntryAsReceived") {
    const completionResult = result as { incomeEntry?: unknown } | null;
    return normalizeAffectedEntities([
      {
        type: "monthlyIncomeEntry",
        id: inferEntityId(completionResult?.incomeEntry) ?? (typeof fields.incomeEntryId === "string" ? fields.incomeEntryId : undefined)
      }
    ]);
  }

  if (
    action.toolName === "createInvestmentPurchase" ||
    action.toolName === "createInvestmentSale" ||
    action.toolName === "registerBonus" ||
    action.toolName === "registerSplit" ||
    action.toolName === "registerReverseSplit"
  ) {
    return normalizeAffectedEntities([
      { type: "operation", id: inferEntityId(result) },
      { type: "asset", id: typeof fields.assetTicker === "string" ? fields.assetTicker : undefined }
    ]);
  }

  if (action.toolName === "registerDividend" || action.toolName === "registerJCP" || action.toolName === "markDividendReceived") {
    return normalizeAffectedEntities([
      { type: "dividend", id: inferEntityId(result) ?? (typeof fields.dividendId === "string" ? fields.dividendId : undefined) },
      { type: "asset", id: typeof fields.assetTicker === "string" ? fields.assetTicker : undefined }
    ]);
  }

  if (action.toolName === "updateSettingsProfile") {
    return normalizeAffectedEntities([{ type: "settings" }]);
  }

  return [];
}

function successSuggestions(route?: string) {
  if (route === "/investimentos/aportes") return ["Como ficaram meus aportes?"];
  if (route === "/operacoes") return ["Como ficou minha carteira?"];
  if (route === "/dividendos") return ["Como ficaram meus dividendos?"];
  if (route === "/configuracoes") return ["Quais configuracoes estao ativas agora?"];
  return [];
}

function resolveSuccessRouteLabel(route?: string) {
  if (route === "/investimentos/aportes") return "Ver aportes";
  if (route === "/operacoes") return "Ver operacoes";
  if (route === "/dividendos") return "Ver dividendos";
  if (route === "/planejamento-mensal/gastos") return "Ver movimentacoes";
  if (route === "/metas") return "Ver metas";
  if (route === "/planejamento-mensal/orcamento") return "Ver orcamento";
  if (route === "/configuracoes") return "Ver configuracoes";
  return "Ver dados";
}

function successResponse(message: string, action: AiPendingActionRecord, result: unknown, route?: string): AiChatStructuredResponse {
  const catalogEntry = getAiToolCatalogEntry(action.toolName);
  const resolvedRoute = route ?? getAiToolPrimaryRoute(action.toolName);
  const affectedEntities = inferAffectedEntities(action, result);
  const dynamicDomains = new Set(catalogEntry.affectedDomains);

  if (action.toolName === "createMonthlyExpense" || action.toolName === "markExpenseAsCompleted") {
    const expenseRecord =
      action.toolName === "markExpenseAsCompleted"
        ? ((result as { expense?: { allocationKind?: string } | null } | null)?.expense ?? null)
        : (result as { allocationKind?: string } | null);
    if (expenseRecord?.allocationKind === "investment_contribution") {
      dynamicDomains.add("dashboard");
      dynamicDomains.add("portfolio");
      dynamicDomains.add("operations");
    }
    if (expenseRecord?.allocationKind === "cash_box_contribution") {
      dynamicDomains.add("dashboard");
      dynamicDomains.add("portfolio");
      dynamicDomains.add("cashBoxes");
    }
  }

  return createStructuredResponse({
    responseType: "success",
    title: "Operacao concluida",
    message,
    sections: [
      { type: "alert", items: [{ title: "Sucesso", description: message, severity: "success" }] },
      {
        type: "metrics",
        metrics: (action.preview?.fields ?? []).map((field) => ({
          label: field.label,
          value: String(field.value ?? ""),
          format: "text",
          status: "neutral"
        }))
      },
      ...(resolvedRoute
        ? [{
            type: "actions" as const,
            actions: [{
              id: catalogEntry.uiActionId ?? "view-result",
              label: resolveSuccessRouteLabel(resolvedRoute),
              type: "navigate" as const,
              route: resolvedRoute
            }]
          }]
        : [])
    ],
    suggestions: successSuggestions(resolvedRoute),
    metadata: {
      generatedAt: new Date().toISOString(),
      affectedDomains: [...dynamicDomains],
      affectedEntities,
      mutationKey: catalogEntry.clientMutationKey
    },
    pendingAction: {
      ...(action.preview ?? {
        id: action.id ?? "",
        actionType: action.actionType,
        title: action.actionType,
        status: "executed",
        riskLevel: action.riskLevel,
        fields: [],
        missingFields: [],
        confirmLabel: "Confirmar operacao",
        cancelLabel: "Cancelar",
        editLabel: "Editar"
      }),
      status: "executed"
    }
  });
}

function formatMonthPeriodLabel(year: number, month: number, timeZone = DEFAULT_APP_TIME_ZONE) {
  return titleCaseDescription(
    new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone
    }).format(new Date(Date.UTC(year, month - 1, 1, 12, 0, 0, 0)))
  );
}

function hasPlanningData(overview: Awaited<ReturnType<typeof getMonthlyPlanningOverview>>) {
  return overview.plan.incomeInCents > 0 || overview.expenses.length > 0 || overview.incomeEntries.length > 0;
}

async function buildSpentSummaryResponse(message: string, timeZone = DEFAULT_APP_TIME_ZONE) {
  const period = parseTargetMonth(message, timeZone);
  const overview = await getMonthlyPlanningOverview(period.year, period.month);
  logAssistantDiagnostic("assistant-planning-read", {
    kind: "spent",
    period: `${period.year}-${pad(period.month)}`,
    timezone: timeZone,
    hasData: hasPlanningData(overview),
    expenseCount: overview.expenses.length
  });

  if (!hasPlanningData(overview)) {
    return createStructuredResponse({
      responseType: "summary",
      title: `Gastos de ${formatMonthPeriodLabel(period.year, period.month, timeZone)}`,
      message: "Ainda nao encontrei dados financeiros suficientes nesse periodo para calcular seus gastos com seguranca."
    });
  }

  const title = `Gastos de ${formatMonthPeriodLabel(period.year, period.month, timeZone)}`;
  const topCategories = overview.categories
    .filter((category) => category.completedInCents > 0)
    .sort((left, right) => right.completedInCents - left.completedInCents)
    .slice(0, 3);

  return createStructuredResponse({
    responseType: "summary",
    title,
    message: `Voce ja gastou ${formatCurrencyFromCents(overview.summary.completedConsumptionInCents)} no periodo consultado.`,
    sections: [
      {
        type: "metrics",
        title: "Resumo",
        metrics: [
          { label: "Gasto realizado", value: formatCurrencyFromCents(overview.summary.completedConsumptionInCents), format: "currency" },
          { label: "Previstos restantes", value: formatCurrencyFromCents(overview.summary.plannedConsumptionInCents), format: "currency" },
          { label: "Restante atual", value: formatCurrencyFromCents(overview.summary.remainingIncomeInCents), format: "currency" }
        ]
      },
      ...(topCategories.length > 0
        ? [{
            type: "list" as const,
            title: "Categorias com mais gasto",
            items: topCategories.map((category) => ({
              title: category.name,
              description: formatCurrencyFromCents(category.completedInCents),
              severity: "info" as const
            }))
          }]
        : [])
    ],
    suggestions: ["Quanto tenho livre pra gastar ainda?", "Mostrar gastos previstos"]
  });
}

async function buildAvailableBudgetSummaryResponse(message: string, timeZone = DEFAULT_APP_TIME_ZONE) {
  const period = parseTargetMonth(message, timeZone);
  const overview = await getMonthlyPlanningOverview(period.year, period.month);
  logAssistantDiagnostic("assistant-planning-read", {
    kind: "available-budget",
    period: `${period.year}-${pad(period.month)}`,
    timezone: timeZone,
    hasData: hasPlanningData(overview),
    remainingIncomeAfterPlannedInCents: overview.summary.remainingIncomeAfterPlannedInCents
  });

  if (!hasPlanningData(overview)) {
    return createStructuredResponse({
      responseType: "summary",
      title: `Disponivel em ${formatMonthPeriodLabel(period.year, period.month, timeZone)}`,
      message: "Ainda nao encontrei dados suficientes nesse periodo para calcular quanto esta livre para gastar."
    });
  }

  const title = `Disponivel em ${formatMonthPeriodLabel(period.year, period.month, timeZone)}`;
  const available = overview.summary.remainingIncomeAfterPlannedInCents;

  return createStructuredResponse({
    responseType: "summary",
    title,
    message:
      available >= 0
        ? `Voce ainda tem ${formatCurrencyFromCents(available)} livres apos considerar o que ja aconteceu e o que ainda esta previsto.`
        : `Seu planejamento esta ${formatCurrencyFromCents(Math.abs(available))} acima do saldo disponivel quando considero realizados e previstos.`,
    sections: [
      {
        type: "metrics",
        title: "Resumo",
        metrics: [
          { label: "Livre para gastar", value: formatCurrencyFromCents(available), format: "currency" },
          { label: "Pode gastar por dia", value: formatCurrencyFromCents(overview.summary.canSpendPerDayInCents), format: "currency" },
          { label: "Dias restantes", value: String(overview.summary.remainingDays), format: "number" }
        ]
      }
    ],
    suggestions: ["Quanto gastei esse mes?", "Mostrar maiores gastos"]
  });
}

async function handlePlanningReadMessage(message: string, timeZone = DEFAULT_APP_TIME_ZONE) {
  const normalized = normalizeText(message);
  if (spendingReadPattern.test(normalized)) {
    return buildSpentSummaryResponse(message, timeZone);
  }

  if (availableBudgetReadPattern.test(normalized)) {
    return buildAvailableBudgetSummaryResponse(message, timeZone);
  }

  return null;
}

async function prepareContribution(sessionId: string, message: string) {
  const amountInCents = parseMoneyToCents(message);
  if (!amountInCents) return null;
  const timeZone = await resolveCurrentAssistantTimeZone();
  const now = nowFields(timeZone);
  const description = extractExplicitContributionDescription(message);
  const fields = {
    amountInCents,
    date: now.date,
    description
  };
  const action = await createPendingAction({
    sessionId,
    actionType: "create_contribution",
    toolName: "createContribution",
    extractedFields: fields,
    title: "Registrar aporte",
    previewFields: [
      { label: "Valor", value: formatCurrencyFromCents(amountInCents) },
      { label: "Data", value: formatDateBr(now.date) },
      ...(description ? [{ label: "Descricao", value: description }] : [])
    ]
  });
  return actionResponse(action, "Confirme o registro deste aporte.");
}

async function prepareExpense(sessionId: string, message: string) {
  const amountInCents = parseMoneyToCents(message);
  if (!amountInCents) return null;
  const description = extractExpenseDescription(message);
  const timeZone = await resolveCurrentAssistantTimeZone();
  const now = nowFields(timeZone);
  const category = await resolveBudgetCategory(now.year, now.month, message, description);
  const note = extractExpenseNote(message, description);
  const fields = {
    planId: category.plan.id,
    categoryId: category.categoryId,
    description,
    amountInCents,
    date: now.date,
    time: now.time,
    paymentMethod: null,
    expenseType: /assinatura|recorrent/i.test(message) ? "recurring" : "single",
    recurring: /assinatura|recorrent/i.test(message),
    status: "completed",
    ...(note ? { note } : {})
  };
  const customMissing = [...category.missing, ...(await expenseCustomMissingFields(fields, timeZone))];
  const action = await createPendingAction({
    sessionId,
    actionType: "create_monthly_expense",
    toolName: fields.recurring ? "createMonthlyExpense" : "createMonthlyExpense",
    extractedFields: fields,
    missingFields: customMissing,
    title: "Registrar gasto",
    previewFields: [
      ...(description ? [{ label: "Descricao", value: description }] : []),
      { label: "Valor", value: formatCurrencyFromCents(amountInCents) },
      { label: "Data", value: `${formatDateBr(now.date)} ${now.time}` },
      { label: "Setor", value: category.plan.categories.find((item) => item.id === category.categoryId)?.name ?? "Pendente" },
      ...(note ? [{ label: "Observacao", value: note }] : [])
    ]
  });
  const missingNames = new Set(action.missingFields.map((field) => field.name));
  const messageText = missingNames.has("categoryId")
    ? "Em qual setor deseja registrar este gasto?"
    : missingNames.has("investmentDestination")
      ? "Esse valor foi para um aporte em ativo ou para uma caixinha?"
      : missingNames.has("assetTicker")
        ? "Em qual ativo deseja registrar este aporte?"
        : missingNames.has("cashBoxId")
          ? "Em qual caixinha deseja registrar essa transferencia?"
          : missingNames.has("quantity")
            ? "Qual foi a quantidade comprada?"
            : missingNames.has("price")
              ? "Qual foi o preco unitario?"
    : missingNames.has("description")
      ? "Qual descricao deseja usar para este gasto?"
      : "Confirme o registro deste gasto.";
  return actionResponse(action, messageText);
}

function inferIncomeCategory(message: string) {
  const normalized = normalizeText(message);
  if (/(freelance|freela|servico|servico)/.test(normalized)) return "Freelance";
  if (/(comissao|comissao)/.test(normalized)) return "Comissao";
  if (/(bonus|bonus|premio|premio)/.test(normalized)) return "Bonus";
  if (/(hora extra|extra)/.test(normalized)) return "Hora extra";
  if (/(venda|vendido|vendi)/.test(normalized)) return "Venda";
  if (/(reembolso|ressarcimento)/.test(normalized)) return "Reembolso";
  if (/(cashback)/.test(normalized)) return "Cashback";
  if (/(presente|pix)/.test(normalized)) return "Presente";
  if (/(rendimento|rendimentos)/.test(normalized)) return "Rendimentos";
  if (/(salario extra|bico)/.test(normalized)) return "Salario extra";
  return "Outros";
}

function extractIncomeEntryDescription(message: string, category: string) {
  const explicit =
    message.match(/\b(?:de|por|referente a)\s+(.+?)(?:,|\s+hoje\b|\s+ontem\b|\s+amanh[aã]\b|$)/i)?.[1] ??
    message.match(/\b(?:entrada|recebi|receber)\s+(?:de\s+)?(.+?)(?:,|\s+hoje\b|\s+ontem\b|\s+amanh[aã]\b|$)/i)?.[1];
  const description = sanitizeExtractedDescription(explicit);
  if (description && !/^\d/.test(description)) return description;
  return category === "Outros" ? "Entrada extra" : category;
}

function isPlannedIncomeMessage(message: string, date: string, timeZone = DEFAULT_APP_TIME_ZONE) {
  const normalized = normalizeText(message);
  const today = nowFields(timeZone).date;
  return date > today || /(vou receber|receberei|irei receber|previsto|prevista|agendad|amanha|proximo|proxima)/.test(normalized);
}

async function prepareIncomeEntry(sessionId: string, message: string) {
  const amountInCents = parseMoneyToCents(message);
  if (!amountInCents) return null;

  const timeZone = await resolveCurrentAssistantTimeZone();
  const period = parseTargetMonth(message, timeZone);
  const plan = await getOrCreateMonthlyPlan(period.year, period.month);
  const now = nowFields(timeZone);
  const category = inferIncomeCategory(message);
  const description = extractIncomeEntryDescription(message, category);
  const date = parseDateInput(message, timeZone) ?? now.date;
  const time = now.time;
  const status = isPlannedIncomeMessage(message, date, timeZone) ? "planned" : "received";
  const recurring = /recorrent|todo mes|mensal/i.test(message);
  const fields = {
    planId: plan.id,
    description,
    amountInCents,
    category,
    date,
    time,
    status,
    incomeType: recurring ? "recurring" : "single",
    recurring,
    recurrenceFrequency: recurring ? "monthly" : null,
    recurrenceInterval: recurring ? 1 : null,
    recurrenceDayOfMonth: recurring ? Number(date.slice(8, 10)) : null,
    recurrenceStartDate: recurring ? date : null,
    recurrenceEndDate: null,
    receivedAt: status === "received" ? getLocalTimestampWithOffset(new Date(), timeZone) : null
  };

  const action = await createPendingAction({
    sessionId,
    actionType: "create_income_entry",
    toolName: "createIncomeEntry",
    extractedFields: fields,
    title: "Registrar entrada",
    previewFields: [
      { label: "Descricao", value: description },
      { label: "Valor", value: formatCurrencyFromCents(amountInCents) },
      { label: "Categoria", value: category },
      { label: "Data", value: `${formatDateBr(date)} ${time}` },
      { label: "Status", value: status === "received" ? "Recebida" : "Prevista" }
    ]
  });
  return actionResponse(action, "Confirme o registro desta entrada.");
}

async function prepareIncome(sessionId: string, message: string) {
  const incomeInCents = parseMoneyToCents(message);
  if (!incomeInCents) return null;
  const timeZone = await resolveCurrentAssistantTimeZone();
  const period = parseTargetMonth(message, timeZone);
  const fields = { ...period, incomeInCents };
  const action = await createPendingAction({
    sessionId,
    actionType: "update_monthly_income",
    toolName: "updateMonthlyIncome",
    extractedFields: fields,
    riskLevel: "medium",
    title: "Alterar renda mensal",
    previewFields: [
      { label: "Periodo", value: `${pad(period.month)}/${period.year}` },
      { label: "Renda", value: formatCurrencyFromCents(incomeInCents) }
    ]
  });
  return actionResponse(action, "Confirme a alteracao da renda mensal.");
}

async function prepareGoal(sessionId: string, message: string) {
  const targetInCents = parseMoneyToCents(message);
  if (!targetInCents) return null;
  const normalized = message.replace(/(?:r\$\s*)?\d[\d.,]*/i, "").replace(/^(crie|criar|cadastre|cadastrar)\s+(uma\s+)?meta\s+(de|para)?/i, "").trim();
  const title = sanitizeExtractedDescription(normalized.replace(/^para\s+/i, ""));
  const fields = { title, type: "wealth", targetInCents };
  const action = await createPendingAction({
    sessionId,
    actionType: "create_financial_goal",
    toolName: "createFinancialGoal",
    extractedFields: fields,
    title: "Criar meta financeira",
    previewFields: [
      ...(title ? [{ label: "Meta", value: title }] : []),
      { label: "Valor alvo", value: formatCurrencyFromCents(targetInCents) },
      { label: "Tipo", value: "Patrimonio" }
    ]
  });
  return actionResponse(action, action.status === "collecting" ? "Qual nome deseja usar para esta meta?" : "Confirme a criacao desta meta financeira.");
}

async function prepareSettingsUpdate(sessionId: string, message: string) {
  const extractedFields: ExtractedFields = {};
  const profileName = extractProfileName(message);
  const theme = parseThemePreference(message);
  const currency = parseCurrencyPreference(message);

  if (profileName) extractedFields.profileName = profileName;
  if (theme) extractedFields.theme = theme;
  if (currency) extractedFields.currency = currency;

  if (Object.keys(extractedFields).length === 0) {
    if (!settingsWriteIntentPattern.test(message)) return null;

    return createStructuredResponse({
      responseType: "form",
      title: "Qual configuracao deseja alterar?",
      message: "Posso atualizar nome, tema ou moeda com confirmacao. Diga, por exemplo: mude meu nome para Joao ou troque para tema claro.",
      pendingAction: null,
      suggestions: ["Mudar meu nome", "Trocar para tema claro", "Usar moeda BRL"]
    });
  }

  const action = await createPendingAction({
    sessionId,
    actionType: "update_settings_profile",
    toolName: "updateSettingsProfile",
    extractedFields,
    title: "Atualizar configuracoes",
    previewFields: buildSettingsPreviewFields(extractedFields)
  });
  return actionResponse(action, "Confirme a atualizacao dessas configuracoes.");
}

async function prepareMarkExpenseCompleted(sessionId: string, message: string) {
  const normalized = normalizeText(message);
  if (!/(marque|paga|pago|paguei)/.test(normalized)) return null;
  const timeZone = await resolveCurrentAssistantTimeZone();
  const completedAt = parseCompletedAtInput(message, timeZone);
  const rankedCandidates = await rankExpenseCompletionCandidates(message, await listAllMonthlyExpenses(), timeZone);
  const resolved = pickResolvedCandidate(rankedCandidates);

  if (!resolved && rankedCandidates.length === 0) {
    return createStructuredResponse({
      responseType: "form",
      title: "Escolha o gasto",
      message: "Nao encontrei um gasto pendente correspondente.",
      pendingAction: null
    });
  }

  if (!resolved) {
    const action = await createPendingAction({
      sessionId,
      actionType: "mark_expense_completed",
      toolName: "markExpenseAsCompleted",
      extractedFields: {
        expenseId: null,
        candidateExpenseIds: rankedCandidates.map((candidate) => candidate.expense.id).filter(Boolean),
        candidateExpenses: rankedCandidates.map(buildPendingExpenseCandidate),
        completedAt
      },
      missingFields: [buildExpenseSelectionMissingField(rankedCandidates)],
      riskLevel: "medium",
      title: "Escolher gasto para marcar como pago",
      previewFields: completedAt ? [{ label: "Pago em", value: formatDateBr(String(completedAt).slice(0, 10)) }] : []
    });
    return actionResponse(action, "Encontrei mais de um gasto. Qual deles voce pagou?");
  }

  const expense = resolved.expense;
  const action = await createPendingAction({
    sessionId,
    actionType: "mark_expense_completed",
    toolName: "markExpenseAsCompleted",
    extractedFields: {
      expenseId: expense.id,
      description: expense.description,
      amountInCents: expense.amountInCents,
      expenseDate: expense.date,
      categoryName: resolved.categoryName,
      completedAt
    },
    riskLevel: "medium",
    title: "Marcar gasto como pago",
    previewFields: buildExpenseCompletionPreviewFields(expense, completedAt, resolved.categoryName)
  });
  return actionResponse(action, "Confirme para marcar este gasto como pago.");
}

async function prepareMarkIncomeEntryReceived(sessionId: string, message: string) {
  const normalized = normalizeText(message);
  if (!/(marque|recebi|recebida|recebido|entrada)/.test(normalized)) return null;
  const timeZone = await resolveCurrentAssistantTimeZone();
  const receivedAt = parseCompletedAtInput(message, timeZone);
  const rankedCandidates = rankIncomeEntryCandidates(message, await listAllMonthlyIncomeEntries(), timeZone);
  const resolved = pickResolvedCandidate(rankedCandidates);

  if (!resolved && rankedCandidates.length === 0) {
    return createStructuredResponse({
      responseType: "form",
      title: "Escolha a entrada",
      message: "Nao encontrei uma entrada prevista correspondente.",
      pendingAction: null
    });
  }

  if (!resolved) {
    const action = await createPendingAction({
      sessionId,
      actionType: "mark_income_entry_received",
      toolName: "markIncomeEntryAsReceived",
      extractedFields: {
        incomeEntryId: null,
        candidateIncomeEntryIds: rankedCandidates.map((candidate) => candidate.entry.id).filter(Boolean),
        candidateIncomeEntries: rankedCandidates.map(buildPendingIncomeCandidate),
        receivedAt
      },
      missingFields: [buildIncomeEntrySelectionMissingField(rankedCandidates)],
      riskLevel: "low",
      title: "Escolher entrada prevista",
      previewFields: receivedAt ? [{ label: "Recebido em", value: formatDateBr(String(receivedAt).slice(0, 10)) }] : []
    });
    return actionResponse(action, "Encontrei mais de uma entrada prevista. Qual delas voce recebeu?");
  }

  const entry = resolved.entry;
  const action = await createPendingAction({
    sessionId,
    actionType: "mark_income_entry_received",
    toolName: "markIncomeEntryAsReceived",
    extractedFields: {
      incomeEntryId: entry.id,
      description: entry.description,
      category: entry.category,
      amountInCents: entry.amountInCents,
      incomeDate: entry.date,
      receivedAt
    },
    riskLevel: "low",
    title: "Marcar entrada como recebida",
    previewFields: buildIncomeEntryReceiptPreviewFields(entry, receivedAt)
  });
  return actionResponse(action, "Confirme para marcar esta entrada como recebida.");
}

function expenseCollectingMessage(missingFields: MissingField[]) {
  const missingNames = new Set(missingFields.map((field) => field.name));
  if (missingNames.has("categoryId")) return "Em qual setor deseja registrar este gasto?";
  if (missingNames.has("investmentDestination")) return "Esse valor foi para um aporte em ativo ou para uma caixinha?";
  if (missingNames.has("assetTicker")) return "Em qual ativo deseja registrar este aporte?";
  if (missingNames.has("cashBoxId")) return "Em qual caixinha deseja registrar essa transferencia?";
  if (missingNames.has("quantity")) return "Qual foi a quantidade comprada?";
  if (missingNames.has("price")) return "Qual foi o preco unitario?";
  if (missingNames.has("description")) return "Qual descricao deseja usar para este gasto?";
  return "Confirme o registro deste gasto.";
}

async function refreshExpenseCollectingAction(
  action: AiPendingActionRecord,
  extractedFields: ExtractedFields,
  categoryName?: string,
  timeZone = DEFAULT_APP_TIME_ZONE
) {
  const customMissing = await expenseCustomMissingFields(extractedFields, timeZone);
  const missingFields = getMissingRequiredFields(action.toolName, extractedFields, customMissing);
  if (missingFields.length === 0) validateToolFieldsForPreview(action.toolName, extractedFields);
  const status = missingFields.length ? "collecting" : "awaiting_confirmation";
  const updated = await updateAiPendingAction(action.id ?? "", { extractedFields, missingFields, status });
  if (!updated) return null;
  const currentPeriod = nowFields(timeZone);
  const plan = await getOrCreateMonthlyPlan(currentPeriod.year, currentPeriod.month);
  const resolvedCategoryName = categoryName ?? plan.categories.find((item) => item.id === extractedFields.categoryId)?.name ?? "Pendente";
  const preview = buildPreview(updated, [
    ...(isPresent(extractedFields.description) ? [{ label: "Descricao", value: String(extractedFields.description) }] : []),
    { label: "Valor", value: formatCurrencyFromCents(Number(extractedFields.amountInCents)) },
    { label: "Data", value: `${formatDateBr(String(extractedFields.date))} ${String(extractedFields.time ?? "")}` },
    { label: "Setor", value: resolvedCategoryName },
    ...(typeof extractedFields.investmentDestination === "string"
      ? [{ label: "Destino", value: extractedFields.investmentDestination === "asset" ? "Aporte em ativo" : "Caixinha" }]
      : []),
    ...(typeof extractedFields.assetTicker === "string" ? [{ label: "Ativo", value: extractedFields.assetTicker }] : []),
    ...(typeof extractedFields.cashBoxId === "string" ? [{ label: "Caixinha", value: extractedFields.cashBoxId }] : []),
    ...(isPresent(extractedFields.quantity) ? [{ label: "Quantidade", value: String(extractedFields.quantity) }] : []),
    ...(isPresent(extractedFields.price) ? [{ label: "Preco", value: formatCurrencyFromCents(Math.round(Number(extractedFields.price) * 100)) }] : []),
    ...(isPresent(extractedFields.note) ? [{ label: "Observacao", value: String(extractedFields.note) }] : [])
  ], "Registrar gasto");
  const withPreview = await updateAiPendingAction(action.id ?? "", { preview });
  return { action: withPreview ?? { ...updated, preview }, missingFields, status };
}

async function prepareInvestmentOperation(sessionId: string, message: string, operationType: "COMPRA" | "VENDA" | "BONIFICACAO" | "DESDOBRAMENTO" | "GRUPAMENTO") {
  const timeZone = await resolveCurrentAssistantTimeZone();
  const now = nowFields(timeZone);
  const date = parseDateInput(message, timeZone) ?? now.date;
  const ticker = extractTicker(message);
  const quantity = parseQuantity(message);
  const price = operationType === "BONIFICACAO" || operationType === "DESDOBRAMENTO" || operationType === "GRUPAMENTO" ? 0 : parseInvestmentPrice(message);
  const feesInCents = parseFeesToCents(message);
  const toolName: AiToolName =
    operationType === "COMPRA"
      ? "createInvestmentPurchase"
      : operationType === "VENDA"
        ? "createInvestmentSale"
        : operationType === "DESDOBRAMENTO"
          ? "registerSplit"
          : operationType === "GRUPAMENTO"
            ? "registerReverseSplit"
            : "registerBonus";

  const extractedFields: ExtractedFields = {
    assetTicker: ticker,
    type: operationType,
    quantity,
    price,
    fees: feesInCents ? feesInCents / 100 : 0,
    date,
    notes: sanitizeExtractedDescription(message.match(/\b(?:obs|observa[cç][aã]o|nota)\s*:?\s*(.+)$/i)?.[1] ?? null)
  };

  const customMissing: MissingField[] = [];
  if (!ticker) customMissing.push(await assetMissingField());
  const title = operationType === "COMPRA" ? "Registrar compra" : operationType === "VENDA" ? "Registrar venda" : `Registrar ${operationTypeLabel(operationType).toLowerCase()}`;
  const total = quantity && price ? quantity * price + Number(extractedFields.fees ?? 0) : null;
  const previewFields = [
    ...(ticker ? [{ label: "Ativo", value: ticker }] : []),
    ...(quantity ? [{ label: "Quantidade", value: String(quantity) }] : []),
    ...(operationType !== "BONIFICACAO" && price ? [{ label: "Preco", value: formatCurrencyFromCents(Math.round(price * 100)) }] : []),
    ...(Number(extractedFields.fees) > 0 ? [{ label: "Taxas", value: formatCurrencyFromCents(Math.round(Number(extractedFields.fees) * 100)) }] : []),
    ...(total ? [{ label: "Total", value: formatCurrencyFromCents(Math.round(total * 100)) }] : []),
    { label: "Data", value: formatDateBr(date) },
    { label: "Evento", value: operationTypeLabel(operationType) }
  ];

  const action = await createPendingAction({
    sessionId,
    actionType: operationType === "COMPRA" ? "create_investment_purchase" : operationType === "VENDA" ? "create_investment_sale" : `register_${operationType.toLowerCase()}`,
    toolName,
    extractedFields,
    missingFields: customMissing,
    title,
    previewFields
  });
  const missingNames = new Set(action.missingFields.map((field) => field.name));
  const messageText = missingNames.has("assetTicker")
    ? "Qual ativo deseja usar?"
    : missingNames.has("quantity")
      ? "Qual foi a quantidade?"
      : missingNames.has("price")
        ? "Qual foi o preco unitario?"
        : `Confirme ${operationType === "COMPRA" ? "esta compra" : operationType === "VENDA" ? "esta venda" : "este evento"}.`;
  return actionResponse(action, messageText);
}

async function prepareDividendIncome(sessionId: string, message: string, type: "dividendo" | "jcp") {
  const timeZone = await resolveCurrentAssistantTimeZone();
  const now = nowFields(timeZone);
  const explicitPaymentDate = parseDateInput(message, timeZone);
  const paymentDate = explicitPaymentDate ?? now.date;
  const ticker = extractTicker(message);
  const amountInCents = parseMoneyToCents(message);
  const matchingDividend = await findMatchingExpectedDividend({
    assetTicker: ticker,
    amountInCents,
    paymentDate: explicitPaymentDate,
    referenceMonth: paymentDate.slice(0, 7),
    type
  });
  const extractedFields: ExtractedFields = {
    ...(matchingDividend?.id ? { dividendId: matchingDividend.id } : {}),
    assetTicker: ticker,
    amountInCents,
    paymentDate,
    receivedAt: paymentDate,
    type,
    notes: sanitizeExtractedDescription(message.match(/\b(?:obs|observa[cç][aã]o|nota)\s*:?\s*(.+)$/i)?.[1] ?? null)
  };
  const customMissing: MissingField[] = [];
  if (!ticker) customMissing.push(await assetMissingField());
  const title = matchingDividend ? "Marcar dividendo como recebido" : type === "jcp" ? "Registrar JCP" : "Registrar dividendo";
  const toolName: AiToolName = matchingDividend ? "markDividendReceived" : type === "jcp" ? "registerJCP" : "registerDividend";
  const action = await createPendingAction({
    sessionId,
    actionType: matchingDividend ? "mark_dividend_received" : type === "jcp" ? "register_jcp" : "register_dividend",
    toolName,
    extractedFields,
    missingFields: customMissing,
    title,
    previewFields: [
      ...(ticker ? [{ label: "Ativo", value: ticker }] : []),
      ...(amountInCents ? [{ label: "Valor", value: formatCurrencyFromCents(amountInCents) }] : []),
      { label: "Data", value: formatDateBr(paymentDate) },
      { label: "Tipo", value: type === "jcp" ? "JCP" : "Dividendo" },
      ...(matchingDividend ? [{ label: "Origem", value: "Previsto existente" }] : [])
    ]
  });
  const missingNames = new Set(action.missingFields.map((field) => field.name));
  const messageText = missingNames.has("assetTicker")
    ? "De qual ativo foi esse recebimento?"
    : missingNames.has("amountInCents")
      ? "Qual foi o valor recebido?"
      : "Confirme este recebimento.";
  return actionResponse(action, messageText);
}

function unsupportedInvestmentAction(message: string) {
  return createStructuredResponse({
    responseType: "error",
    title: "Operacao ainda indisponivel",
    message,
    pendingAction: null,
    sections: [{ type: "alert", items: [{ title: "Nao executei nada", description: message, severity: "warning" }] }],
    suggestions: ["Registrar compra", "Registrar venda", "Registrar dividendo"]
  });
}

function parseDateInput(message: string, timeZone = DEFAULT_APP_TIME_ZONE) {
  const normalized = normalizeText(message);
  const current = nowFields(timeZone);
  if (/\b(hoje|agora)\b/.test(normalized)) return current.date;
  if (/\bontem\b/.test(normalized)) {
    return shiftDateKey(current.date, -1);
  }
  const iso = message.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const br = message.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (!br) return null;
  const year = br[3] ? Number(br[3].length === 2 ? `20${br[3]}` : br[3]) : current.year;
  return `${year}-${pad(Number(br[2]))}-${pad(Number(br[1]))}`;
}

function parseCompletedAtInput(message: string, timeZone = DEFAULT_APP_TIME_ZONE) {
  const normalized = normalizeText(message);
  if (!/\b(agora|hoje|ontem)\b/.test(normalized) && !parseDateInput(message, timeZone)) return undefined;
  if (/\bagora\b/.test(normalized)) return getLocalTimestampWithOffset(new Date(), timeZone);

  const paymentDate = parseDateInput(message, timeZone);
  if (!paymentDate) return undefined;

  const current = nowFields(timeZone);
  return getLocalTimestampWithOffset(parseLocalExpenseDate(paymentDate, current.time, timeZone), timeZone);
}

function parseLooseNumber(message: string) {
  const match = message.match(/(\d+(?:[.,]\d+)?)/);
  return match ? parseBrazilianNumber(match[1]) : null;
}

function investmentToolTitle(toolName: AiToolName) {
  const titles: Partial<Record<AiToolName, string>> = {
    createInvestmentPurchase: "Registrar compra",
    createInvestmentSale: "Registrar venda",
    registerBonus: "Registrar bonificacao",
    registerSplit: "Registrar desdobramento",
    registerReverseSplit: "Registrar grupamento",
    registerDividend: "Registrar dividendo",
    registerJCP: "Registrar JCP"
  };
  return titles[toolName] ?? "Registrar investimento";
}

function investmentPreviewFields(toolName: AiToolName, fields: ExtractedFields) {
  const quantity = Number(fields.quantity);
  const price = Number(fields.price);
  const fees = Number(fields.fees ?? 0);
  const amountInCents = Number(fields.amountInCents);
  const total = Number.isFinite(quantity) && Number.isFinite(price) && price > 0 ? quantity * price + fees : null;
  return [
    ...(isPresent(fields.assetTicker) ? [{ label: "Ativo", value: String(fields.assetTicker) }] : []),
    ...(isPresent(fields.quantity) ? [{ label: "Quantidade", value: String(fields.quantity) }] : []),
    ...(price > 0 ? [{ label: "Preco", value: formatCurrencyFromCents(Math.round(price * 100)) }] : []),
    ...(fees > 0 ? [{ label: "Taxas", value: formatCurrencyFromCents(Math.round(fees * 100)) }] : []),
    ...(total ? [{ label: "Total", value: formatCurrencyFromCents(Math.round(total * 100)) }] : []),
    ...(Number.isFinite(amountInCents) && amountInCents > 0 ? [{ label: "Valor", value: formatCurrencyFromCents(amountInCents) }] : []),
    ...(isPresent(fields.date) ? [{ label: "Data", value: formatDateBr(String(fields.date)) }] : []),
    ...(isPresent(fields.paymentDate) ? [{ label: "Data", value: formatDateBr(String(fields.paymentDate)) }] : []),
    ...(toolName === "registerDividend" ? [{ label: "Tipo", value: "Dividendo" }] : []),
    ...(toolName === "registerJCP" ? [{ label: "Tipo", value: "JCP" }] : [])
  ];
}

function messageForMissingField(field?: MissingField) {
  if (!field) return "Confirme a operacao.";
  if (field.name === "assetTicker") return "Qual ativo deseja usar?";
  if (field.name === "quantity") return "Qual foi a quantidade?";
  if (field.name === "price") return "Qual foi o preco unitario?";
  if (field.name === "amountInCents") return "Qual foi o valor recebido?";
  if (field.name === "paymentDate" || field.name === "date") return "Qual foi a data?";
  return `Informe ${field.label.toLowerCase()} para continuar.`;
}

function isInvestmentTool(toolName: AiToolName) {
  return [
    "createInvestmentPurchase",
    "createInvestmentSale",
    "registerBonus",
    "registerSplit",
    "registerReverseSplit",
    "registerDividend",
    "registerJCP",
    "markDividendReceived"
  ].includes(toolName);
}

async function resolveTickerFromMessage(message: string) {
  const ticker = extractTicker(message);
  if (ticker) return ticker;
  const normalized = normalizeText(message).trim();
  const assets = await listAssets();
  const selected = assets.find((asset) => normalizeText(asset.ticker) === normalized || normalizeText(asset.name) === normalized || normalized.includes(normalizeText(asset.ticker)));
  return selected?.ticker ?? null;
}

async function resolveCashBoxFromMessage(message: string) {
  const normalized = normalizeText(message).trim();
  const cashBoxes = await listCashBoxes();
  const selected = cashBoxes.find(
    (cashBox) =>
      normalizeText(cashBox.name) === normalized ||
      normalized.includes(normalizeText(cashBox.name)) ||
      normalizeText(cashBox.type).includes(normalized)
  );
  return selected?.id ?? null;
}

async function updateInvestmentCollectingAction(action: AiPendingActionRecord, message: string) {
  const field = action.missingFields[0];
  if (!field) return actionResponse(action, "Confirme a operacao.");
  const timeZone = await resolveCurrentAssistantTimeZone();
  const extractedFields: ExtractedFields = { ...(action.extractedFields as Record<string, unknown>) };

  if (field.name === "assetTicker") {
    const ticker = await resolveTickerFromMessage(message);
    if (!ticker) return actionResponse(action, "Nao encontrei esse ativo. Informe o ticker, por exemplo VGIR11.");
    extractedFields.assetTicker = ticker;
  } else if (field.name === "quantity") {
    const quantity = parseQuantity(message) ?? parseLooseNumber(message);
    if (!quantity || quantity <= 0) return actionResponse(action, "Informe uma quantidade maior que zero.");
    extractedFields.quantity = quantity;
  } else if (field.name === "price") {
    const price = parseInvestmentPrice(message) ?? parseLooseNumber(message);
    if (!price || price <= 0) return actionResponse(action, "Informe um preco unitario maior que zero.");
    extractedFields.price = price;
  } else if (field.name === "amountInCents") {
    const amountInCents = parseMoneyToCents(message);
    if (!amountInCents) return actionResponse(action, "Informe um valor recebido maior que zero.");
    extractedFields.amountInCents = amountInCents;
  } else if (field.name === "date" || field.name === "paymentDate") {
    const date = parseDateInput(message, timeZone);
    if (!date) return actionResponse(action, "Informe uma data valida, por exemplo hoje ou 28/07/2026.");
    extractedFields[field.name] = date;
  }

  const missingFields = getMissingRequiredFields(action.toolName, extractedFields);
  if (missingFields.length === 0) validateToolFieldsForPreview(action.toolName, extractedFields);
  const status = missingFields.length ? "collecting" : "awaiting_confirmation";
  const updated = await updateAiPendingAction(action.id ?? "", { extractedFields, missingFields, status });
  if (!updated) return createErrorResponse("Nao consegui atualizar a acao pendente.");
  const preview = buildPreview(updated, investmentPreviewFields(action.toolName, extractedFields), investmentToolTitle(action.toolName));
  const withPreview = await updateAiPendingAction(action.id ?? "", { preview });
  return actionResponse(withPreview ?? { ...updated, preview }, status === "collecting" ? messageForMissingField(missingFields[0]) : "Confirme esta operacao.");
}

async function executeTool(action: AiPendingActionRecord, messageId?: string) {
  if (!action.id) throw new Error("Pending action without id");
  if (new Date(action.expiresAt).getTime() <= Date.now()) {
    await updateAiPendingAction(action.id, { status: "expired" });
    return createErrorResponse("Esta acao pendente expirou. Envie o pedido novamente.");
  }

  const existing = await findExecutedAiPendingActionByIdempotencyKey(action.idempotencyKey);
  if (existing?.executionResult) {
    return successResponse("Esta operacao ja tinha sido executada. Nao criei duplicidade.", existing, existing.executionResult);
  }

  await updateAiPendingAction(action.id, { status: "confirmed" });
  await appendAiActionAudit({
    sessionId: action.sessionId,
    messageId,
    pendingActionId: action.id,
    actionType: action.actionType,
    toolName: action.toolName,
    sanitizedInput: action.extractedFields,
    status: "confirmed",
    confirmedAt: new Date()
  });

  let result: unknown;
  let route = "";
  const fields = action.extractedFields;

  if (action.toolName === "createContribution") {
    const parsed = contributionSchema.parse({
      date: String(fields.date),
      value: Number(fields.amountInCents) / 100,
      description: typeof fields.description === "string" ? fields.description : undefined
    });
    result = await registerContribution({ date: String(parsed.date), amount: parsed.value, notes: parsed.description });
    route = "/investimentos/aportes";
  } else if (action.toolName === "createMonthlyExpense") {
    const parsed = monthlyExpenseSchema.parse(buildMonthlyExpenseToolPayload(fields, action.idempotencyKey));
    result = await addMonthlyExpense(String(parsed.planId), parsed);
    route = "/planejamento-mensal/gastos";
  } else if (action.toolName === "createIncomeEntry") {
    const parsed = monthlyIncomeEntrySchema.parse(buildMonthlyIncomeEntryToolPayload(fields, action.idempotencyKey));
    result = await addMonthlyIncomeEntry(String(parsed.planId), parsed);
    route = "/planejamento-mensal/gastos";
  } else if (action.toolName === "updateMonthlyIncome") {
    const plan = await getOrCreateMonthlyPlan(Number(fields.year), Number(fields.month));
    const parsed = monthlyPlanSchema.parse({ ...plan, incomeInCents: Number(fields.incomeInCents) });
    result = await saveMonthlyPlan(parsed);
    route = "/planejamento-mensal/orcamento";
  } else if (action.toolName === "createFinancialGoal") {
    const parsed = goalSchema.parse({
      title: String(fields.title),
      type: "wealth",
      target: Number(fields.targetInCents) / 100,
      active: true,
      completed: false
    });
    result = await registerGoal({ title: parsed.title, type: parsed.type, target: parsed.targetValue ?? 0, category: parsed.description });
    route = "/metas";
  } else if (action.toolName === "markExpenseAsCompleted") {
    result = await completeMonthlyExpense(String(fields.expenseId), { completedAt: fields.completedAt ? String(fields.completedAt) : undefined });
    route = "/planejamento-mensal/gastos";
  } else if (action.toolName === "markIncomeEntryAsReceived") {
    result = await completeMonthlyIncomeEntry(String(fields.incomeEntryId), { receivedAt: fields.receivedAt ? String(fields.receivedAt) : undefined });
    route = "/planejamento-mensal/gastos";
  } else if (
    action.toolName === "createInvestmentPurchase" ||
    action.toolName === "createInvestmentSale" ||
    action.toolName === "registerBonus" ||
    action.toolName === "registerSplit" ||
    action.toolName === "registerReverseSplit"
  ) {
    const type =
      action.toolName === "createInvestmentPurchase"
        ? "COMPRA"
        : action.toolName === "createInvestmentSale"
          ? "VENDA"
          : action.toolName === "registerBonus"
            ? "BONIFICACAO"
            : action.toolName === "registerSplit"
              ? "DESDOBRAMENTO"
              : "GRUPAMENTO";
    const parsed = operationSchema.parse({
      assetTicker: String(fields.assetTicker),
      type,
      quantity: Number(fields.quantity),
      price: Number(fields.price ?? 0),
      fees: Number(fields.fees ?? 0),
      totalValue: Number(fields.quantity) * Number(fields.price ?? 0),
      date: String(fields.date),
      notes: typeof fields.notes === "string" ? fields.notes : undefined
    });
    result = await createOperation({ ...parsed, totalValue: parsed.quantity * parsed.price });
    route = "/operacoes";
  } else if (action.toolName === "registerDividend" || action.toolName === "registerJCP") {
    const parsed = dividendSchema.parse({
      assetTicker: String(fields.assetTicker),
      type: action.toolName === "registerJCP" ? "jcp" : "dividendo",
      totalValue: Number(fields.amountInCents) / 100,
      amountPerShare: isPresent(fields.amountPerShare) ? Number(fields.amountPerShare) : undefined,
      quantityEligible: isPresent(fields.quantityEligible) ? Number(fields.quantityEligible) : undefined,
      paymentDate: String(fields.paymentDate),
      receivedAt: fields.receivedAt ? String(fields.receivedAt) : String(fields.paymentDate),
      status: "received",
      source: "manual",
      notes: typeof fields.notes === "string" ? fields.notes : undefined
    });
    result = await registerReceivedDividend({
      assetTicker: String(parsed.assetTicker),
      type: parsed.type,
      totalValue: parsed.totalValue,
      paymentDate: String(parsed.paymentDate),
      amountPerShare: parsed.amountPerShare,
      quantityEligible: parsed.quantityEligible,
      notes: parsed.notes,
      source: parsed.source
    });
    route = "/dividendos";
  } else if (action.toolName === "markDividendReceived") {
    result = await markDividendReceived(String(fields.dividendId), {
      totalValue: isPresent(fields.amountInCents) ? Number(fields.amountInCents) / 100 : undefined,
      paymentDate: fields.paymentDate ? String(fields.paymentDate) : undefined,
      receivedAt: fields.receivedAt ? String(fields.receivedAt) : fields.paymentDate ? String(fields.paymentDate) : undefined,
      notes: typeof fields.notes === "string" ? fields.notes : undefined
    });
    route = "/dividendos";
  } else if (action.toolName === "updateSettingsProfile") {
    const parsed = settingsUpdateSchema.parse(fields);
    result = await updateSettings(parsed);
    route = "/configuracoes";
  } else {
    throw new Error(`Ferramenta nao autorizada: ${action.toolName}`);
  }

  const executed = await updateAiPendingAction(action.id, { status: "executed", executionResult: result });
  await appendAiActionAudit({
    sessionId: action.sessionId,
    messageId,
    pendingActionId: action.id,
    actionType: action.actionType,
    toolName: action.toolName,
    sanitizedInput: action.extractedFields,
    resultSnapshot: result,
    status: "executed",
    executedAt: new Date()
  });

  return successResponse(getAiToolCatalogEntry(action.toolName).successMessage, executed ?? action, result, route);
}

async function discardPendingAction(
  action: AiPendingActionRecord,
  status: "cancelled" | "failed",
  reason: string,
  messageId?: string
) {
  if (!action.id) return;

  await updateAiPendingAction(action.id, { status });
  await appendAiActionAudit({
    sessionId: action.sessionId,
    messageId,
    pendingActionId: action.id,
    actionType: action.actionType,
    toolName: action.toolName,
    sanitizedInput: action.extractedFields,
    status,
    errorCode: reason
  });
  logAssistantDiagnostic("pending-action-discarded", {
    pendingActionId: action.id,
    toolName: action.toolName,
    status,
    reason
  });
}

function extractPendingExpenseIds(action: AiPendingActionRecord) {
  const storedCandidates = Array.isArray(action.extractedFields.candidateExpenses)
    ? action.extractedFields.candidateExpenses
        .filter((candidate): candidate is PendingExpenseCandidate => typeof candidate === "object" && candidate !== null && typeof (candidate as PendingExpenseCandidate).id === "string")
        .map((candidate) => candidate.id)
    : [];

  if (storedCandidates.length > 0) return storedCandidates;

  return Array.isArray(action.extractedFields.candidateExpenseIds)
    ? action.extractedFields.candidateExpenseIds.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];
}

function extractPendingIncomeIds(action: AiPendingActionRecord) {
  const storedCandidates = Array.isArray(action.extractedFields.candidateIncomeEntries)
    ? action.extractedFields.candidateIncomeEntries
        .filter((candidate): candidate is PendingIncomeCandidate => typeof candidate === "object" && candidate !== null && typeof (candidate as PendingIncomeCandidate).id === "string")
        .map((candidate) => candidate.id)
    : [];

  if (storedCandidates.length > 0) return storedCandidates;

  return Array.isArray(action.extractedFields.candidateIncomeEntryIds)
    ? action.extractedFields.candidateIncomeEntryIds.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];
}

async function loadPendingExpenseCandidates(action: AiPendingActionRecord) {
  const orderedIds = extractPendingExpenseIds(action);
  if (orderedIds.length === 0) return [];

  const liveExpenses = (await listAllMonthlyExpenses()).filter(
    (expense) => expense.id && orderedIds.includes(expense.id) && expense.status !== "completed" && !expense.recurrenceCancelled
  );
  const categoryNames = await buildExpenseCategoryNameMap(liveExpenses);
  const byId = new Map<string, RankedExpenseCandidate>(
    liveExpenses.map((expense): [string, RankedExpenseCandidate] => [
      expense.id ?? "",
      {
        expense,
        score: 0,
        samePeriod: false,
        directMatch: false,
        matchedTokens: 0,
        categoryName: categoryNames.get(expense.id ?? "") ?? ""
      }
    ])
  );

  return orderedIds.map((id) => byId.get(id)).filter((candidate): candidate is RankedExpenseCandidate => candidate !== undefined);
}

async function loadPendingIncomeCandidates(action: AiPendingActionRecord) {
  const orderedIds = extractPendingIncomeIds(action);
  if (orderedIds.length === 0) return [];

  const liveEntries = (await listAllMonthlyIncomeEntries()).filter(
    (entry) => entry.id && orderedIds.includes(entry.id) && entry.status === "planned" && !entry.recurrenceCancelled
  );
  const byId = new Map<string, RankedIncomeEntryCandidate>(
    liveEntries.map((entry): [string, RankedIncomeEntryCandidate] => [
      entry.id ?? "",
      {
        entry,
        score: 0,
        samePeriod: false,
        directMatch: false,
        matchedTokens: 0
      }
    ])
  );

  return orderedIds.map((id) => byId.get(id)).filter((candidate): candidate is RankedIncomeEntryCandidate => candidate !== undefined);
}

function isExplicitIntentSwitchDuringCollection(message: string) {
  const normalized = normalizeText(message.trim());
  if (!normalized) return false;
  if (shortSelectionReplyPattern.test(normalized)) return false;
  if (explicitReadIntentPattern.test(normalized)) return true;
  if (spendingReadPattern.test(normalized) || availableBudgetReadPattern.test(normalized)) return true;
  return explicitWriteSwitchPattern.test(normalized);
}

async function updateCollectingAction(action: AiPendingActionRecord, message: string) {
  if (!action.id) return createErrorResponse("Acao pendente invalida.");
  const timeZone = await resolveCurrentAssistantTimeZone();

  if (isInvestmentTool(action.toolName)) {
    return updateInvestmentCollectingAction(action, message);
  }

  if (action.toolName === "markExpenseAsCompleted" && action.missingFields.some((field) => field.name === "expenseId")) {
    const orderedCandidates = await loadPendingExpenseCandidates(action);
    logAssistantDiagnostic("pending-action-consume-expense", {
      pendingActionId: action.id,
      candidateIds: extractPendingExpenseIds(action),
      candidateCount: orderedCandidates.length
    });
    if (orderedCandidates.length === 0) {
      await discardPendingAction(action, "failed", "expense_candidates_missing");
      return createErrorResponse("Nao encontrei mais esse gasto pendente. Envie o pedido novamente.");
    }

    const selectionIndex = parseSelectionIndex(message, orderedCandidates.length);
    const completedAt =
      parseCompletedAtInput(message, timeZone) ?? (typeof action.extractedFields.completedAt === "string" ? action.extractedFields.completedAt : undefined);
    const selectedByIndex = selectionIndex !== null ? orderedCandidates[selectionIndex] : null;
    if (selectedByIndex) {
      return finalizeExpenseCompletionSelection(action, selectedByIndex, completedAt);
    }

    const allCandidates = await rankExpenseCompletionCandidates(
      message,
      orderedCandidates.map((candidate) => candidate.expense),
      timeZone
    );
    if (allCandidates.length === 0) {
      await discardPendingAction(action, "failed", "expense_candidate_unresolved");
      return createErrorResponse("Nao consegui mais identificar esse gasto pendente. Envie o pedido novamente.");
    }

    const resolved = pickResolvedCandidate(allCandidates);
    if (resolved) {
      return finalizeExpenseCompletionSelection(action, resolved, completedAt);
    }

    return updateExpenseSelectionAction(action, allCandidates, completedAt, "Ainda encontrei mais de um gasto compatível. Qual deles voce pagou?");
  }

  if (action.toolName === "markIncomeEntryAsReceived" && action.missingFields.some((field) => field.name === "incomeEntryId")) {
    const orderedCandidates = await loadPendingIncomeCandidates(action);
    logAssistantDiagnostic("pending-action-consume-income", {
      pendingActionId: action.id,
      candidateIds: extractPendingIncomeIds(action),
      candidateCount: orderedCandidates.length
    });
    if (orderedCandidates.length === 0) {
      await discardPendingAction(action, "failed", "income_candidates_missing");
      return createErrorResponse("Nao encontrei mais essa entrada prevista. Envie o pedido novamente.");
    }

    const selectionIndex = parseSelectionIndex(message, orderedCandidates.length);
    const receivedAt =
      parseCompletedAtInput(message, timeZone) ?? (typeof action.extractedFields.receivedAt === "string" ? action.extractedFields.receivedAt : undefined);
    const selectedByIndex = selectionIndex !== null ? orderedCandidates[selectionIndex] : null;
    if (selectedByIndex) {
      return finalizeIncomeEntrySelection(action, selectedByIndex, receivedAt);
    }

    const allCandidates = rankIncomeEntryCandidates(
      message,
      orderedCandidates.map((candidate) => candidate.entry),
      timeZone
    );
    if (allCandidates.length === 0) {
      await discardPendingAction(action, "failed", "income_candidate_unresolved");
      return createErrorResponse("Nao consegui mais identificar essa entrada pendente. Envie o pedido novamente.");
    }

    const resolved = pickResolvedCandidate(allCandidates);
    if (resolved) {
      return finalizeIncomeEntrySelection(action, resolved, receivedAt);
    }

    return updateIncomeEntrySelectionAction(action, allCandidates, receivedAt, "Ainda encontrei mais de uma entrada prevista compatível. Qual delas voce recebeu?");
  }

  if (action.toolName === "createMonthlyExpense" && action.missingFields.some((field) => field.name === "categoryId")) {
    const planId = String(action.extractedFields.planId ?? "");
    const currentPeriod = nowFields(timeZone);
    const plan = await getOrCreateMonthlyPlan(currentPeriod.year, currentPeriod.month);
    const normalized = normalizeText(message);
    const selected = plan.categories.find((category) => normalizeText(category.name) === normalized || normalized.includes(normalizeText(category.name)));
    if (!selected) return actionResponse(action, "Nao encontrei esse setor. Escolha uma das opcoes exibidas.");
    const extractedFields: ExtractedFields = { ...(action.extractedFields as Record<string, unknown>), planId: planId || plan.id, categoryId: selected.id };
    const refreshed = await refreshExpenseCollectingAction(action, extractedFields, selected.name, timeZone);
    if (!refreshed) return createErrorResponse("Nao consegui atualizar a acao pendente.");
    return actionResponse(refreshed.action, expenseCollectingMessage(refreshed.missingFields));
  }

  if (action.toolName === "createMonthlyExpense" && action.missingFields.some((field) => field.name === "description")) {
    const description = sanitizeExtractedDescription(message);
    if (!description) return actionResponse(action, "Informe uma descricao curta e clara para este gasto.");
    const extractedFields: ExtractedFields = { ...(action.extractedFields as Record<string, unknown>), description };
    const refreshed = await refreshExpenseCollectingAction(action, extractedFields, undefined, timeZone);
    if (!refreshed) return createErrorResponse("Nao consegui atualizar a acao pendente.");
    return actionResponse(refreshed.action, expenseCollectingMessage(refreshed.missingFields));
  }

  if (
    action.toolName === "createMonthlyExpense" &&
    action.missingFields.some((field) => ["investmentDestination", "assetTicker", "cashBoxId", "quantity", "price"].includes(field.name))
  ) {
    const extractedFields: ExtractedFields = { ...(action.extractedFields as Record<string, unknown>) };
    const normalized = normalizeText(message);

    if (action.missingFields.some((field) => field.name === "investmentDestination")) {
      if (/(caixinha|reserva|cash)/.test(normalized)) extractedFields.investmentDestination = "cashbox";
      else if (/(ativo|acao|acao|fii|etf|ticker|compra|carteira)/.test(normalized)) extractedFields.investmentDestination = "asset";
      else return actionResponse(action, "Responda com ativo ou caixinha para eu seguir com o destino correto.");
    }

    if (action.missingFields.some((field) => field.name === "assetTicker") && extractedFields.investmentDestination === "asset") {
      const ticker = await resolveTickerFromMessage(message);
      if (!ticker) return actionResponse(action, "Nao encontrei esse ativo. Informe o ticker, por exemplo VGIR11.");
      extractedFields.assetTicker = ticker;
    }

    if (action.missingFields.some((field) => field.name === "cashBoxId") && extractedFields.investmentDestination === "cashbox") {
      const cashBoxId = await resolveCashBoxFromMessage(message);
      if (!cashBoxId) return actionResponse(action, "Nao encontrei essa caixinha. Informe o nome exato da reserva.");
      extractedFields.cashBoxId = cashBoxId;
    }

    if (action.missingFields.some((field) => field.name === "quantity") && extractedFields.investmentDestination === "asset") {
      const quantity = parseQuantity(message) ?? parseLooseNumber(message);
      if (!quantity || quantity <= 0) return actionResponse(action, "Informe uma quantidade maior que zero.");
      extractedFields.quantity = quantity;
    }

    if (action.missingFields.some((field) => field.name === "price") && extractedFields.investmentDestination === "asset") {
      const price = parseInvestmentPrice(message) ?? parseLooseNumber(message);
      if (!price || price <= 0) return actionResponse(action, "Informe um preco unitario maior que zero.");
      extractedFields.price = price;
    }

    const refreshed = await refreshExpenseCollectingAction(action, extractedFields, undefined, timeZone);
    if (!refreshed) return createErrorResponse("Nao consegui atualizar a acao pendente.");
    return actionResponse(refreshed.action, expenseCollectingMessage(refreshed.missingFields));
  }

  if (action.toolName === "createFinancialGoal" && action.missingFields.some((field) => field.name === "title")) {
    const title = sanitizeExtractedDescription(message);
    if (!title) return actionResponse(action, "Informe um nome curto para esta meta.");
    const extractedFields: ExtractedFields = { ...(action.extractedFields as Record<string, unknown>), title };
    const missingFields = getMissingRequiredFields(action.toolName, extractedFields);
    if (missingFields.length === 0) validateToolFieldsForPreview(action.toolName, extractedFields);
    const status = missingFields.length ? "collecting" : "awaiting_confirmation";
    const updated = await updateAiPendingAction(action.id, { extractedFields, missingFields, status });
    if (!updated) return createErrorResponse("Nao consegui atualizar a acao pendente.");
    const preview = buildPreview(updated, [
      { label: "Meta", value: title },
      { label: "Valor alvo", value: formatCurrencyFromCents(Number(extractedFields.targetInCents)) },
      { label: "Tipo", value: "Patrimonio" }
    ], "Criar meta financeira");
    const withPreview = await updateAiPendingAction(action.id, { preview });
    return actionResponse(withPreview ?? { ...updated, preview }, "Confirme a criacao desta meta financeira.");
  }

  return actionResponse(action, "Ainda preciso de mais informacoes para continuar.");
}

function isCryptoReadMessage(message: string) {
  const normalized = normalizeText(message);
  const priceQuestion = /(quanto|preco|preço|cotacao|cotação|valor|vale|esta|est[aá]|posição|posicao|tenho|carteira)/.test(normalized);
  if (!priceQuestion) return false;

  const hasCryptoSignal = Boolean(findKnownCryptoByQuery(message)) || /\b(cripto|criptomoeda|bitcoin|btc|ethereum|eth|solana|sol)\b/.test(normalized);
  const hasUnknownCryptoSymbol = /\b[A-Z]{2,10}\b/.test(message) && !/\b[A-Z]{4}\d{1,2}F?\b/.test(message);
  return hasCryptoSignal || hasUnknownCryptoSymbol;
}

function isCryptoPortfolioQuestion(message: string) {
  const normalized = normalizeText(message);
  return /(quanto\s+(?:tenho|meus|minha)|carteira\s+de\s+cripto|criptos?\s+(?:valem|vale)|posicao|posição)/.test(normalized);
}

function cryptoAssetMatchesQuestion(asset: Awaited<ReturnType<typeof getPortfolio>>["assets"][number], message: string) {
  const normalized = normalizeText(message);
  return [asset.ticker, asset.name, asset.coingeckoId]
    .filter(Boolean)
    .some((value) => normalized.includes(normalizeText(String(value))));
}

function extractCryptoQuoteQuery(message: string) {
  const known = findKnownCryptoByQuery(message);
  if (known) return known.coingeckoId;

  const explicitSymbol = message.match(/\b([A-Z]{2,10})\b/);
  if (explicitSymbol && !/^[A-Z]{4}\d{1,2}F?$/.test(explicitSymbol[1])) return explicitSymbol[1];

  return message;
}

function buildCryptoQuoteSections(quote: Extract<Awaited<ReturnType<typeof getCryptoMarketQuoteByQuery>>, { status: "resolved" }>["quote"]) {
  return [
    {
      type: "metrics" as const,
      title: "Cotacao",
      metrics: [
        { label: "Preco", value: formatMarketCurrency(quote.price, quote.currency), status: quote.stale ? "warning" as const : "neutral" as const },
        { label: "24h", value: formatSignedPercent(quote.change24h), status: (quote.change24h ?? 0) >= 0 ? "positive" as const : "warning" as const },
        { label: "Atualizado", value: new Date(quote.lastUpdatedAt).toLocaleString("pt-BR"), status: quote.stale ? "warning" as const : "neutral" as const }
      ]
    }
  ];
}

async function buildSingleCryptoReadResponse(message: string) {
  const lookup = await getCryptoMarketQuoteByQuery(extractCryptoQuoteQuery(message));

  if (lookup.status === "not_found") {
    return createStructuredResponse({
      responseType: "error",
      title: "Criptomoeda nao encontrada",
      message: lookup.message,
      suggestions: ["Pergunte: quanto esta o bitcoin?", "Pergunte: preco do ethereum"]
    });
  }

  if (lookup.status === "ambiguous") {
    return createStructuredResponse({
      responseType: "summary",
      title: "Escolha a criptomoeda",
      message: lookup.message,
      sections: [
        {
          type: "list",
          title: "Possibilidades",
          items: lookup.results.slice(0, 5).map((result) => ({
            title: `${result.name} (${result.symbol})`,
            description: result.coingeckoId,
            severity: "info"
          }))
        }
      ],
      suggestions: lookup.results.slice(0, 3).map((result) => `quanto esta ${result.coingeckoId}?`)
    });
  }

  if (lookup.status === "unavailable") {
    return createStructuredResponse({
      responseType: "error",
      title: "Cotacao indisponivel",
      message: `Nao consegui obter uma cotacao real de ${lookup.asset.name} agora. ${lookup.message}`,
      metadata: { provider: "coingecko" }
    });
  }

  const { quote } = lookup;
  const portfolio = await getPortfolio();
  const position = portfolio.assets.find((asset) => cryptoAssetMatchesQuestion(asset, message));
  const quantity = position?.quantity ?? 0;
  const currentValue = quantity > 0 ? quantity * quote.price : null;
  const wantsPosition = isCryptoPortfolioQuestion(message);
  const stalePrefix = quote.stale ? "Ultima cotacao disponivel" : "Cotacao atual";
  const messageText = wantsPosition && position?.hasPosition
    ? `${stalePrefix}: ${quote.name} esta em ${formatMarketCurrency(quote.price, quote.currency)}. Voce possui ${formatQuantity(quantity)} ${quote.symbol}, avaliados em ${formatMarketCurrency(currentValue ?? 0, quote.currency)}.`
    : `${stalePrefix}: ${quote.name} esta em ${formatMarketCurrency(quote.price, quote.currency)}.`;

  return createStructuredResponse({
    responseType: "summary",
    title: `${quote.symbol} ${quote.name}`,
    message: messageText,
    sections: [
      ...buildCryptoQuoteSections(quote),
      ...(wantsPosition
        ? [
            {
              type: "metrics" as const,
              title: "Sua posicao",
              metrics: position?.hasPosition
                ? [
                    { label: "Quantidade", value: formatQuantity(quantity), status: "neutral" as const },
                    { label: "Valor atual", value: formatMarketCurrency(currentValue ?? 0, quote.currency), status: "neutral" as const },
                    { label: "Preco medio", value: formatMarketCurrency(position.averagePrice ?? 0, quote.currency), status: "neutral" as const }
                  ]
                : [{ label: "Posicao", value: "Voce ainda nao possui essa cripto cadastrada na carteira.", status: "warning" as const }]
            }
          ]
        : [])
    ],
    suggestions: ["quanto tenho em bitcoin?", "quanto minha carteira de cripto vale hoje?"],
    metadata: { provider: "coingecko", model: "deterministic", affectedDomains: ["market", "portfolio"] }
  });
}

async function buildCryptoPortfolioReadResponse() {
  const portfolio = await getPortfolio();
  const cryptoPositions = portfolio.assets.filter((asset) => asset.categoryId === "CRIPTO" && (asset.hasPosition || asset.quantity > 0));
  const totalCurrentValue = cryptoPositions.reduce((total, asset) => total + (typeof asset.currentValue === "number" ? asset.currentValue : 0), 0);
  const totalInvested = cryptoPositions.reduce((total, asset) => total + (asset.investedValue ?? 0), 0);
  const profit = totalCurrentValue - totalInvested;

  return createStructuredResponse({
    responseType: "summary",
    title: "Carteira de cripto",
    message:
      cryptoPositions.length > 0
        ? `Sua carteira de cripto vale ${formatMarketCurrency(totalCurrentValue)} hoje, considerando as cotações reais disponíveis.`
        : "Voce ainda nao possui posicoes de cripto cadastradas na carteira.",
    sections: [
      {
        type: "metrics",
        title: "Resumo",
        metrics: [
          { label: "Valor atual", value: formatMarketCurrency(totalCurrentValue), status: totalCurrentValue > 0 ? "neutral" : "warning" },
          { label: "Valor investido", value: formatMarketCurrency(totalInvested), status: "neutral" },
          { label: "Lucro/prejuizo", value: formatMarketCurrency(profit), status: profit >= 0 ? "positive" : "warning" }
        ]
      },
      ...(cryptoPositions.length > 0
        ? [
            {
              type: "list" as const,
              title: "Posicoes",
              items: cryptoPositions.slice(0, 8).map((asset) => ({
                title: `${asset.ticker} - ${formatQuantity(asset.quantity)}`,
                description: `${formatMarketCurrency(asset.currentValue ?? 0)} · preco atual ${asset.currentPrice ? formatMarketCurrency(asset.currentPrice) : "indisponivel"}`,
                severity: asset.priceStatus === "stale" ? "warning" as const : "info" as const
              }))
            }
          ]
        : [])
    ],
    suggestions: ["quanto esta o bitcoin?", "quanto esta o ethereum?", "quanto esta o solana?"],
    metadata: { provider: "market-service", model: "deterministic", affectedDomains: ["portfolio", "market"] }
  });
}

async function handleCryptoReadMessage(message: string) {
  if (!isCryptoReadMessage(message)) return null;
  if (/(carteira\s+de\s+cripto|criptos?\s+(?:valem|vale)|quanto\s+tenho\s+de\s+cripto)/.test(normalizeText(message))) {
    return buildCryptoPortfolioReadResponse();
  }

  return buildSingleCryptoReadResponse(message);
}

export async function handleOperationalChatMessage(input: ToolInput): Promise<PreparedAction | NoAction> {
  const activeAction = await findActiveAiPendingAction(input.sessionId);
  const normalized = normalizeText(input.message);

  if (!activeAction && confirmationPattern.test(input.message)) {
    return { handled: true, response: createErrorResponse("Nao ha uma acao pendente ativa para confirmar. Envie o pedido novamente.") };
  }

  if (activeAction && cancelPattern.test(input.message)) {
    if (activeAction.id) await updateAiPendingAction(activeAction.id, { status: "cancelled" });
    await appendAiActionAudit({
      sessionId: input.sessionId,
      messageId: input.messageId,
      pendingActionId: activeAction.id ?? "",
      actionType: activeAction.actionType,
      toolName: activeAction.toolName,
      sanitizedInput: activeAction.extractedFields,
      status: "cancelled"
    });
    return { handled: true, response: createStructuredResponse({ responseType: "text", message: "Operacao cancelada com seguranca." }) };
  }

  if (activeAction && confirmationPattern.test(input.message) && activeAction.status === "awaiting_confirmation") {
    return { handled: true, response: await executeTool(activeAction, input.messageId) };
  }

  if (activeAction && confirmationPattern.test(input.message)) {
    return { handled: true, response: actionResponse(activeAction, "Ainda faltam campos obrigatorios antes da confirmacao.") };
  }

  if (activeAction?.status === "collecting") {
    if (isExplicitIntentSwitchDuringCollection(input.message)) {
      await discardPendingAction(activeAction, "cancelled", "replaced_by_new_intent", input.messageId);
      logAssistantDiagnostic("pending-action-bypassed", {
        pendingActionId: activeAction.id ?? null,
        toolName: activeAction.toolName
      });
    } else {
      return { handled: true, response: await updateCollectingAction(activeAction, input.message) };
    }
  }

  const timeZone = await resolveCurrentAssistantTimeZone();
  const planningReadResponse = await handlePlanningReadMessage(input.message, timeZone);
  if (planningReadResponse) {
    return { handled: true, response: planningReadResponse };
  }

  const cryptoReadResponse = await handleCryptoReadMessage(input.message);
  if (cryptoReadResponse) {
    return { handled: true, response: cryptoReadResponse };
  }

  if (explicitReadIntentPattern.test(normalized)) return { handled: false };
  if (!writeIntentPattern.test(input.message) && !settingsWriteIntentPattern.test(input.message)) return { handled: false };

  if (activeAction && activeAction.status === "awaiting_confirmation") {
    return {
      handled: true,
      response: actionResponse(
        activeAction,
        "Ja existe uma operacao aguardando confirmacao. Confirme ou cancele essa acao antes de criar outra."
      )
    };
  }

  let response: AiChatStructuredResponse | null = null;

  if (/(transferir|transferencia|mover).*(carteira|ativo)|(?:preco|preco medio|preço medio|quantidade).*(manual|editar|alterar|atualizar)|(?:editar|alterar|atualizar).*(preco medio|preço medio|quantidade)/.test(normalized)) {
    response = unsupportedInvestmentAction("Essa alteracao ainda nao possui servico seguro no sistema. Para manter os calculos consistentes, use compras, vendas, bonificacoes, desdobramentos ou grupamentos.");
  } else if (/(comprei|compre|compra|comprar)/.test(normalized)) response = await prepareInvestmentOperation(input.sessionId, input.message, "COMPRA");
  else if (/(vendi|venda|vender)/.test(normalized)) response = await prepareInvestmentOperation(input.sessionId, input.message, "VENDA");
  else if (/(bonifica|bonificacao|bonificacao)/.test(normalized)) response = await prepareInvestmentOperation(input.sessionId, input.message, "BONIFICACAO");
  else if (/(desdobramento|split)/.test(normalized)) response = await prepareInvestmentOperation(input.sessionId, input.message, "DESDOBRAMENTO");
  else if (/(grupamento|reverse split)/.test(normalized)) response = await prepareInvestmentOperation(input.sessionId, input.message, "GRUPAMENTO");
  else if (/(jcp|juros sobre capital)/.test(normalized)) response = await prepareDividendIncome(input.sessionId, input.message, "jcp");
  else if (/(rendimento).*(registr|cadast|receb|lanc|lanç|adic)|(?:registr|cadast|receb|lanc|lanç|adic).*(rendimento)/.test(normalized)) response = await prepareDividendIncome(input.sessionId, input.message, "dividendo");
  else if (/(dividendo).*(registr|cadast|receb|lanc|lanç|adic)|(?:registr|cadast|receb|lanc|lanç|adic).*(dividendo)|\brecebi\b.*\b(?:da|de|do)\s+[A-Z]{4}\d{1,2}\b/i.test(input.message)) response = await prepareDividendIncome(input.sessionId, input.message, "dividendo");
  else if (/(aporte|contribuicao|contribuicao|depositei|deposito)/.test(normalized)) response = await prepareContribution(input.sessionId, input.message);
  else if (/(marque|paga|pago|paguei)/.test(normalized)) response = await prepareMarkExpenseCompleted(input.sessionId, input.message);
  else if (/(recebi aquela|recebi aquele|marque.*entrada|entrada.*recebid|recebida)/.test(normalized)) response = await prepareMarkIncomeEntryReceived(input.sessionId, input.message);
  else if (/(recebi|vou receber|receber|entrada|freelance|comissao|bonus|cashback|reembolso|presente|hora extra|renda extra)/.test(normalized)) response = await prepareIncomeEntry(input.sessionId, input.message);
  else if (/(renda mensal|minha renda|salario|salario base)/.test(normalized)) response = await prepareIncome(input.sessionId, input.message);
  else if (/(tema|moeda|configur|perfil|nome)/.test(normalized)) response = await prepareSettingsUpdate(input.sessionId, input.message);
  else if (/(meta|objetivo)/.test(normalized)) response = await prepareGoal(input.sessionId, input.message);
  else if (/(gastei|gasto|despesa|assinatura|gasolina|spotify|mercado|uber)/.test(normalized)) response = await prepareExpense(input.sessionId, input.message);

  return response ? { handled: true, response } : { handled: false };
}
