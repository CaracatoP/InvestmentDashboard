import { randomUUID } from "crypto";
import {
  addMonthlyExpense,
  addMonthlyIncomeEntry,
  completeMonthlyExpense,
  completeMonthlyIncomeEntry,
  getLocalTimestampWithOffset,
  getOrCreateMonthlyPlan,
  saveMonthlyPlan
} from "../../services/monthly-planning.service";
import { registerContribution, registerGoal, updateSettings } from "../../services/portfolio.service";
import { findMatchingExpectedDividend, markDividendReceived, registerReceivedDividend } from "../../services/dividend.service";
import { listAllMonthlyExpenses, listAllMonthlyIncomeEntries } from "../../repositories/monthly-planning.repository";
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
import { aiToolCatalog, getAiToolCatalogEntry, getAiToolPrimaryRoute } from "./ai-tool-catalog";

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

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function nowFields() {
  const now = new Date();
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    year: now.getFullYear(),
    month: now.getMonth() + 1
  };
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
  const match = message.toUpperCase().match(/\b([A-Z]{4}\d{1,2}F?|[A-Z]{3,5}11|BTC|ETH)\b/);
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

function formatDateBr(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function parseTargetMonth(message: string) {
  const normalized = normalizeText(message);
  const now = nowFields();
  for (const [name, month] of Object.entries(monthNames)) {
    if (normalized.includes(normalizeText(name))) {
      return { year: now.year, month };
    }
  }
  return { year: now.year, month: now.month };
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

function extractExpenseDescription(message: string) {
  const withoutControl = stripControlInstructions(message);
  const withMatch = withoutControl.match(/\bcom\s+(.+?)(?:,|\s+agora\b|\s+hoje\b|\s+ontem\b|$)/i);
  if (withMatch) return sanitizeExtractedDescription(withMatch[1]);
  const normalized = normalizeText(withoutControl);
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

function inferCategoryName(message: string) {
  const normalized = normalizeText(message);
  if (/(gasolina|uber|transporte|combustivel|combustivel)/.test(normalized)) return "Transporte";
  if (/(spotify|netflix|assinatura)/.test(normalized)) return "Assinaturas";
  if (/(mercado|alimentacao|comida|restaurante|mcdonald|mc donald)/.test(normalized)) return "Alimentacao";
  if (/(investimento|investir|aporte|aplicar|caixinha|carteira)/.test(normalized)) return "Investimentos";
  return "";
}

function buildPendingExpenseSearchText(message: string) {
  return normalizeText(message)
    .replace(/(?:r\$\s*)?\d[\d.,]*/gi, " ")
    .replace(
      /\b(?:marque|como|paga|pago|paguei|pagar|despesa|gasto|aquela|aquele|prevista|previsto|de|da|do|dos|das|o|a|os|as|real|reais)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveBudgetCategory(year: number, month: number, message: string) {
  const plan = await getOrCreateMonthlyPlan(year, month);
  const preferredName = inferCategoryName(message);
  const fallbackName = preferredName || "Outros";
  const normalizedPreferred = normalizeText(fallbackName);
  const matches = plan.categories.filter((category) => normalizeText(category.name) === normalizedPreferred);
  const exact = matches.length === 1 ? matches[0] : null;
  if (exact) return { plan, categoryId: exact.id, missing: [] };

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

async function expenseCustomMissingFields(fields: ExtractedFields) {
  const plan = await getOrCreateMonthlyPlan(nowFields().year, nowFields().month);
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
    return createStructuredResponse({
      responseType: "form",
      title: "Preciso de mais uma informacao",
      message,
      pendingAction: action.preview,
      sections: [{ type: "alert", items: [{ title: "Campo pendente", description: message, severity: "info" }] }]
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

async function prepareContribution(sessionId: string, message: string) {
  const amountInCents = parseMoneyToCents(message);
  if (!amountInCents) return null;
  const now = nowFields();
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
  const now = nowFields();
  const category = await resolveBudgetCategory(now.year, now.month, message);
  const description = extractExpenseDescription(message);
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
  const customMissing = [...category.missing, ...(await expenseCustomMissingFields(fields))];
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

function isPlannedIncomeMessage(message: string, date: string) {
  const normalized = normalizeText(message);
  const today = nowFields().date;
  return date > today || /(vou receber|receberei|irei receber|previsto|prevista|agendad|amanha|proximo|proxima)/.test(normalized);
}

async function prepareIncomeEntry(sessionId: string, message: string) {
  const amountInCents = parseMoneyToCents(message);
  if (!amountInCents) return null;

  const period = parseTargetMonth(message);
  const plan = await getOrCreateMonthlyPlan(period.year, period.month);
  const now = nowFields();
  const category = inferIncomeCategory(message);
  const description = extractIncomeEntryDescription(message, category);
  const date = parseDateInput(message) ?? now.date;
  const time = now.time;
  const status = isPlannedIncomeMessage(message, date) ? "planned" : "received";
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
    receivedAt: status === "received" ? getLocalTimestampWithOffset() : null
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
  const period = parseTargetMonth(message);
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
  const amountInCents = parseMoneyToCents(message);
  const candidateText = buildPendingExpenseSearchText(message);
  const expenses = (await listAllMonthlyExpenses()).filter((expense) => expense.status !== "completed");
  const candidates = expenses.filter((expense) => {
    const description = normalizeText(expense.description);
    const matchesText = !candidateText || normalized.includes(description) || description.includes(candidateText) || candidateText.includes(description);
    const matchesAmount = !amountInCents || expense.amountInCents === amountInCents;
    return matchesText && matchesAmount;
  });

  if (candidates.length !== 1) {
    return createStructuredResponse({
      responseType: "form",
      title: "Escolha o gasto",
      message: candidates.length === 0 ? "Nao encontrei um gasto pendente correspondente." : "Encontrei mais de um gasto. Qual deseja marcar como pago?",
      pendingAction: null,
      sections: [
        {
          type: "table",
          table: {
            columns: [
              { key: "description", label: "Descricao", format: "text" },
              { key: "amountInCents", label: "Valor", format: "currency" },
              { key: "date", label: "Data", format: "date" }
            ],
            rows: candidates.slice(0, 8).map((expense) => ({
              id: expense.id ?? "",
              description: expense.description,
              amountInCents: expense.amountInCents,
              date: expense.date
            }))
          }
        }
      ]
    });
  }

  const expense = candidates[0];
  const completedAt = parseCompletedAtInput(message);
  const action = await createPendingAction({
    sessionId,
    actionType: "mark_expense_completed",
    toolName: "markExpenseAsCompleted",
    extractedFields: { expenseId: expense.id, description: expense.description, amountInCents: expense.amountInCents, completedAt },
    riskLevel: "medium",
    title: "Marcar gasto como pago",
    previewFields: [
      { label: "Descricao", value: expense.description },
      { label: "Valor", value: formatCurrencyFromCents(expense.amountInCents) },
      { label: "Data", value: formatDateBr(expense.date) },
      ...(completedAt ? [{ label: "Pagamento", value: formatDateBr(String(completedAt).slice(0, 10)) }] : [])
    ]
  });
  return actionResponse(action, "Confirme para marcar este gasto como pago.");
}

async function prepareMarkIncomeEntryReceived(sessionId: string, message: string) {
  const normalized = normalizeText(message);
  if (!/(marque|recebi|recebida|recebido|entrada)/.test(normalized)) return null;
  const entries = (await listAllMonthlyIncomeEntries()).filter((entry) => entry.status === "planned" && !entry.recurrenceCancelled);
  const amountInCents = parseMoneyToCents(message);
  const category = inferIncomeCategory(message);
  const candidateText = normalized.replace(/marque|como|recebi|recebida|recebido|entrada|aquela|aquele|prevista|previsto/g, "").trim();
  const candidates = entries.filter((entry) => {
    const entryDescription = normalizeText(entry.description);
    const entryCategory = normalizeText(entry.category);
    const matchesAmount = !amountInCents || entry.amountInCents === amountInCents;
    const matchesCategory = category === "Outros" || entryCategory.includes(normalizeText(category));
    const matchesText = !candidateText || entryDescription.includes(candidateText) || candidateText.includes(entryDescription) || entryCategory.includes(candidateText);
    return matchesAmount && (matchesCategory || matchesText);
  });

  if (candidates.length !== 1) {
    return createStructuredResponse({
      responseType: "form",
      title: "Escolha a entrada",
      message: candidates.length === 0 ? "Nao encontrei uma entrada prevista correspondente." : "Encontrei mais de uma entrada prevista. Qual deseja marcar como recebida?",
      pendingAction: null,
      sections: [
        {
          type: "table",
          table: {
            columns: [
              { key: "description", label: "Descricao", format: "text" },
              { key: "category", label: "Categoria", format: "text" },
              { key: "amountInCents", label: "Valor", format: "currency" },
              { key: "date", label: "Data", format: "date" }
            ],
            rows: candidates.slice(0, 8).map((entry) => ({
              id: entry.id ?? "",
              description: entry.description,
              category: entry.category,
              amountInCents: entry.amountInCents,
              date: entry.date
            }))
          }
        }
      ]
    });
  }

  const entry = candidates[0];
  const receivedAt = parseCompletedAtInput(message);
  const action = await createPendingAction({
    sessionId,
    actionType: "mark_income_entry_received",
    toolName: "markIncomeEntryAsReceived",
    extractedFields: { incomeEntryId: entry.id, description: entry.description, category: entry.category, amountInCents: entry.amountInCents, receivedAt },
    riskLevel: "low",
    title: "Marcar entrada como recebida",
    previewFields: [
      { label: "Descricao", value: entry.description },
      { label: "Valor", value: formatCurrencyFromCents(entry.amountInCents) },
      { label: "Categoria", value: entry.category },
      { label: "Data prevista", value: formatDateBr(entry.date) },
      ...(receivedAt ? [{ label: "Recebimento", value: formatDateBr(String(receivedAt).slice(0, 10)) }] : [])
    ]
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

async function refreshExpenseCollectingAction(action: AiPendingActionRecord, extractedFields: ExtractedFields, categoryName?: string) {
  const customMissing = await expenseCustomMissingFields(extractedFields);
  const missingFields = getMissingRequiredFields(action.toolName, extractedFields, customMissing);
  if (missingFields.length === 0) validateToolFieldsForPreview(action.toolName, extractedFields);
  const status = missingFields.length ? "collecting" : "awaiting_confirmation";
  const updated = await updateAiPendingAction(action.id ?? "", { extractedFields, missingFields, status });
  if (!updated) return null;
  const plan = await getOrCreateMonthlyPlan(nowFields().year, nowFields().month);
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
  const now = nowFields();
  const date = parseDateInput(message) ?? now.date;
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
  const now = nowFields();
  const paymentDate = parseDateInput(message) ?? now.date;
  const ticker = extractTicker(message);
  const amountInCents = parseMoneyToCents(message);
  const matchingDividend = await findMatchingExpectedDividend({
    assetTicker: ticker,
    amountInCents,
    paymentDate,
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

function parseDateInput(message: string) {
  const normalized = normalizeText(message);
  if (/\b(hoje|agora)\b/.test(normalized)) return nowFields().date;
  if (/\bontem\b/.test(normalized)) {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  const iso = message.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const br = message.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (!br) return null;
  const now = nowFields();
  const year = br[3] ? Number(br[3].length === 2 ? `20${br[3]}` : br[3]) : now.year;
  return `${year}-${pad(Number(br[2]))}-${pad(Number(br[1]))}`;
}

function parseCompletedAtInput(message: string) {
  const normalized = normalizeText(message);
  if (!/\b(agora|hoje|ontem)\b/.test(normalized) && !parseDateInput(message)) return undefined;
  if (/\bagora\b/.test(normalized)) return getLocalTimestampWithOffset();

  const paymentDate = parseDateInput(message);
  if (!paymentDate) return undefined;

  const now = nowFields();
  const [year, month, day] = paymentDate.split("-").map(Number);
  const [hour, minute] = now.time.split(":").map(Number);
  return getLocalTimestampWithOffset(new Date(year, month - 1, day, hour, minute, 0, 0));
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
    const date = parseDateInput(message);
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

async function updateCollectingAction(action: AiPendingActionRecord, message: string) {
  if (!action.id) return createErrorResponse("Acao pendente invalida.");

  if (isInvestmentTool(action.toolName)) {
    return updateInvestmentCollectingAction(action, message);
  }

  if (action.toolName === "createMonthlyExpense" && action.missingFields.some((field) => field.name === "categoryId")) {
    const planId = String(action.extractedFields.planId ?? "");
    const plan = await getOrCreateMonthlyPlan(nowFields().year, nowFields().month);
    const normalized = normalizeText(message);
    const selected = plan.categories.find((category) => normalizeText(category.name) === normalized || normalized.includes(normalizeText(category.name)));
    if (!selected) return actionResponse(action, "Nao encontrei esse setor. Escolha uma das opcoes exibidas.");
    const extractedFields: ExtractedFields = { ...(action.extractedFields as Record<string, unknown>), planId: planId || plan.id, categoryId: selected.id };
    const refreshed = await refreshExpenseCollectingAction(action, extractedFields, selected.name);
    if (!refreshed) return createErrorResponse("Nao consegui atualizar a acao pendente.");
    return actionResponse(refreshed.action, expenseCollectingMessage(refreshed.missingFields));
  }

  if (action.toolName === "createMonthlyExpense" && action.missingFields.some((field) => field.name === "description")) {
    const description = sanitizeExtractedDescription(message);
    if (!description) return actionResponse(action, "Informe uma descricao curta e clara para este gasto.");
    const extractedFields: ExtractedFields = { ...(action.extractedFields as Record<string, unknown>), description };
    const refreshed = await refreshExpenseCollectingAction(action, extractedFields);
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

    const refreshed = await refreshExpenseCollectingAction(action, extractedFields);
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

export async function handleOperationalChatMessage(input: ToolInput): Promise<PreparedAction | NoAction> {
  const activeAction = await findActiveAiPendingAction(input.sessionId);

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
    return { handled: true, response: await updateCollectingAction(activeAction, input.message) };
  }

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

  const normalized = normalizeText(input.message);
  if (/^(quanto|como|quais|qual|analise|mostre|liste|listar|ver)\b/.test(normalized)) return { handled: false };
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
