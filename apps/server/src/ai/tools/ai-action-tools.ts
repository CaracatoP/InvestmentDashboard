import { randomUUID } from "crypto";
import {
  addMonthlyExpense,
  editMonthlyExpense,
  getLocalTimestampWithOffset,
  getOrCreateMonthlyPlan,
  saveMonthlyPlan
} from "../../services/monthly-planning.service";
import { registerContribution, registerGoal } from "../../services/portfolio.service";
import { listAllMonthlyExpenses } from "../../repositories/monthly-planning.repository";
import {
  createDividend,
  createOperation,
  listAssets
} from "../../repositories/investment.repository";
import {
  appendAiActionAudit,
  createAiPendingAction,
  findActiveAiPendingAction,
  findAiPendingActionById,
  findExecutedAiPendingActionByIdempotencyKey,
  updateAiPendingAction
} from "../../repositories/ai.repository";
import { contributionSchema } from "../../validators/contribution.validator";
import { dividendSchema } from "../../validators/dividend.validator";
import { goalSchema } from "../../validators/goal.validator";
import { monthlyExpenseSchema, monthlyPlanSchema } from "../../validators/monthly-planning.validator";
import { operationSchema } from "../../validators/operation.validator";
import type {
  AiChatStructuredResponse,
  AiPendingActionRecord,
  AiPendingActionRiskLevel,
  AiToolName
} from "../schemas/ai.schema";
import { createErrorResponse, createStructuredResponse } from "../utils/ai-structured-response";

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

const pendingActionTtlMs = 15 * 60 * 1000;
const confirmationPattern = /^(confirmo|pode registrar|pode confirmar|confirmar|sim,?\s*pode|sim pode|ok pode|pode executar)(\s|$)/i;
const cancelPattern = /^(cancelar|cancele|nao confirmar|não confirmar|desistir)(\s|$)/i;
const writeIntentPattern = /(registre|registrar|cadastre|cadastrar|adicione|adicionar|crie|criar|marque|alterar|altere|atualize|minha renda|gastei|gasto|despesa|aporte|meta|compre|comprei|compra|vendi|venda|dividendo|jcp|juros sobre capital|bonifica|desdobramento|split|grupamento|reverse split|transferir|transferencia|preco medio|preço medio|quantidade)/i;

const toolRequirements: Record<AiToolName, { required: string[]; optional: string[] }> = {
  createContribution: { required: ["amountInCents", "date"], optional: ["description", "note"] },
  createMonthlyExpense: { required: ["planId", "categoryId", "description", "amountInCents", "date", "time"], optional: ["note", "paymentMethod", "status", "expenseType", "recurring"] },
  updateMonthlyIncome: { required: ["year", "month", "incomeInCents"], optional: [] },
  createFinancialGoal: { required: ["title", "type", "targetInCents"], optional: ["description", "assetTicker", "deadline"] },
  markExpenseAsCompleted: { required: ["expenseId"], optional: ["completedAt"] },
  createInvestmentPurchase: { required: ["assetTicker", "quantity", "price", "date"], optional: ["fees", "notes"] },
  createInvestmentSale: { required: ["assetTicker", "quantity", "price", "date"], optional: ["fees", "notes"] },
  registerDividend: { required: ["assetTicker", "amountInCents", "paymentDate"], optional: ["amountPerShare", "quantityEligible", "notes"] },
  registerJCP: { required: ["assetTicker", "amountInCents", "paymentDate"], optional: ["amountPerShare", "quantityEligible", "notes"] },
  registerBonus: { required: ["assetTicker", "quantity", "date"], optional: ["notes"] },
  registerSplit: { required: ["assetTicker", "quantity", "date"], optional: ["notes"] },
  registerReverseSplit: { required: ["assetTicker", "quantity", "date"], optional: ["notes"] },
  transferAsset: { required: ["assetTicker", "fromWalletId", "toWalletId", "quantity", "date"], optional: ["notes"] },
  updateAveragePrice: { required: ["assetTicker", "averagePrice", "date"], optional: ["notes"] }
};

const missingFieldDefinitions: Record<string, MissingField> = {
  amountInCents: { name: "amountInCents", label: "Valor", type: "currency", required: true },
  date: { name: "date", label: "Data", type: "date", required: true },
  time: { name: "time", label: "Horario", type: "text", required: true },
  description: { name: "description", label: "Descricao", type: "text", required: true },
  categoryId: { name: "categoryId", label: "Setor", type: "select", required: true },
  planId: { name: "planId", label: "Planejamento mensal", type: "text", required: true },
  year: { name: "year", label: "Ano", type: "number", required: true },
  month: { name: "month", label: "Mes", type: "number", required: true },
  incomeInCents: { name: "incomeInCents", label: "Renda", type: "currency", required: true },
  title: { name: "title", label: "Nome da meta", type: "text", required: true },
  type: { name: "type", label: "Tipo da meta", type: "select", required: true },
  targetInCents: { name: "targetInCents", label: "Valor alvo", type: "currency", required: true },
  expenseId: { name: "expenseId", label: "Gasto", type: "select", required: true },
  assetTicker: { name: "assetTicker", label: "Ativo", type: "select", required: true },
  quantity: { name: "quantity", label: "Quantidade", type: "number", required: true },
  price: { name: "price", label: "Preco unitario", type: "currency", required: true },
  fees: { name: "fees", label: "Taxas", type: "currency", required: false },
  paymentDate: { name: "paymentDate", label: "Data de pagamento", type: "date", required: true },
  amountPerShare: { name: "amountPerShare", label: "Valor por cota", type: "currency", required: false },
  fromWalletId: { name: "fromWalletId", label: "Carteira origem", type: "select", required: true },
  toWalletId: { name: "toWalletId", label: "Carteira destino", type: "select", required: true },
  averagePrice: { name: "averagePrice", label: "Preco medio", type: "currency", required: true }
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

function extractExpenseDescription(message: string) {
  const withoutControl = stripControlInstructions(message);
  const withMatch = withoutControl.match(/\bcom\s+(.+?)(?:,|\s+agora\b|\s+hoje\b|\s+ontem\b|$)/i);
  if (withMatch) return sanitizeExtractedDescription(withMatch[1]);
  const normalized = normalizeText(withoutControl);
  if (normalized.includes("gasolina")) return "Gasolina";
  if (normalized.includes("spotify")) return "Spotify";
  if (normalized.includes("mercado")) return "Mercado";
  if (normalized.includes("uber")) return "Uber";
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
  if (/(mercado|alimentacao|comida|restaurante)/.test(normalized)) return "Alimentacao";
  return "";
}

async function resolveBudgetCategory(year: number, month: number, message: string) {
  const plan = await getOrCreateMonthlyPlan(year, month);
  const preferredName = inferCategoryName(message);
  const normalizedPreferred = normalizeText(preferredName);
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
    monthlyExpenseSchema.parse(fields);
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
  }
}

function meaningfulPreviewFields(fields: Array<{ label: string; value: string }>) {
  return fields.filter((field) => sanitizeExtractedDescription(field.value) || /valor|data|horario|per[ií]odo|renda|setor|tipo|ativo|quantidade|pre[cç]o|taxas|total|evento/i.test(field.label));
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
    riskLevel: input.riskLevel ?? "low",
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

function successResponse(message: string, action: AiPendingActionRecord, result: unknown, route?: string): AiChatStructuredResponse {
  const routeLabel =
    route === "/investimentos/aportes"
      ? "Ver aportes"
      : route === "/operacoes"
        ? "Ver operacoes"
        : route === "/dividendos"
          ? "Ver dividendos"
          : route === "/planejamento-mensal/gastos"
            ? "Ver gastos"
            : route === "/metas"
              ? "Ver metas"
              : route === "/planejamento-mensal/orcamento"
                ? "Ver orcamento"
                : "Ver dados";
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
      ...(route
        ? [{
            type: "actions" as const,
            actions: [{ id: "view-result", label: routeLabel, type: "navigate" as const, route }]
          }]
        : [])
    ],
    suggestions: route === "/investimentos/aportes" ? ["Como ficaram meus aportes?"] : route === "/operacoes" ? ["Como ficou minha carteira?"] : route === "/dividendos" ? ["Como ficaram meus dividendos?"] : [],
    metadata: { generatedAt: new Date().toISOString() },
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
  const action = await createPendingAction({
    sessionId,
    actionType: "create_monthly_expense",
    toolName: fields.recurring ? "createMonthlyExpense" : "createMonthlyExpense",
    extractedFields: fields,
    missingFields: category.missing,
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
    : missingNames.has("description")
      ? "Qual descricao deseja usar para este gasto?"
      : "Confirme o registro deste gasto.";
  return actionResponse(action, messageText);
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

async function prepareMarkExpenseCompleted(sessionId: string, message: string) {
  const normalized = normalizeText(message);
  if (!/(marque|paga|pago|paguei)/.test(normalized)) return null;
  const expenses = (await listAllMonthlyExpenses()).filter((expense) => expense.status !== "completed");
  const candidates = expenses.filter((expense) => normalized.includes(normalizeText(expense.description)) || normalizeText(expense.description).includes(normalized.replace(/marque|como|paga|pago|despesa|gasto/g, "").trim()));

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
  const action = await createPendingAction({
    sessionId,
    actionType: "mark_expense_completed",
    toolName: "markExpenseAsCompleted",
    extractedFields: { expenseId: expense.id, description: expense.description, amountInCents: expense.amountInCents },
    riskLevel: "medium",
    title: "Marcar gasto como pago",
    previewFields: [
      { label: "Descricao", value: expense.description },
      { label: "Valor", value: formatCurrencyFromCents(expense.amountInCents) },
      { label: "Data", value: formatDateBr(expense.date) }
    ]
  });
  return actionResponse(action, "Confirme para marcar este gasto como pago.");
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
  const extractedFields: ExtractedFields = {
    assetTicker: ticker,
    amountInCents,
    paymentDate,
    type,
    notes: sanitizeExtractedDescription(message.match(/\b(?:obs|observa[cç][aã]o|nota)\s*:?\s*(.+)$/i)?.[1] ?? null)
  };
  const customMissing: MissingField[] = [];
  if (!ticker) customMissing.push(await assetMissingField());
  const title = type === "jcp" ? "Registrar JCP" : "Registrar dividendo";
  const action = await createPendingAction({
    sessionId,
    actionType: type === "jcp" ? "register_jcp" : "register_dividend",
    toolName: type === "jcp" ? "registerJCP" : "registerDividend",
    extractedFields,
    missingFields: customMissing,
    title,
    previewFields: [
      ...(ticker ? [{ label: "Ativo", value: ticker }] : []),
      ...(amountInCents ? [{ label: "Valor", value: formatCurrencyFromCents(amountInCents) }] : []),
      { label: "Data", value: formatDateBr(paymentDate) },
      { label: "Tipo", value: type === "jcp" ? "JCP" : "Dividendo" }
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
    "registerJCP"
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
    const parsed = monthlyExpenseSchema.parse(fields);
    result = await addMonthlyExpense(String(parsed.planId), parsed);
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
    result = await editMonthlyExpense(String(fields.expenseId), { status: "completed" });
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
      status: "received",
      source: "manual",
      notes: typeof fields.notes === "string" ? fields.notes : undefined
    });
    result = await createDividend(parsed);
    route = "/dividendos";
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

  const successMessage =
    action.toolName === "createContribution"
      ? "Aporte registrado com sucesso."
      : action.toolName === "createMonthlyExpense"
        ? "Gasto registrado com sucesso."
        : action.toolName === "updateMonthlyIncome"
          ? "Renda mensal atualizada com sucesso."
          : action.toolName === "createFinancialGoal"
            ? "Meta criada com sucesso."
            : action.toolName === "createInvestmentPurchase"
              ? "Compra registrada com sucesso."
              : action.toolName === "createInvestmentSale"
                ? "Venda registrada com sucesso."
                : action.toolName === "registerDividend"
                  ? "Dividendo registrado com sucesso."
                  : action.toolName === "registerJCP"
                    ? "JCP registrado com sucesso."
                    : action.toolName === "registerBonus"
                      ? "Bonificacao registrada com sucesso."
                      : action.toolName === "registerSplit"
                        ? "Desdobramento registrado com sucesso."
                        : action.toolName === "registerReverseSplit"
                          ? "Grupamento registrado com sucesso."
                          : "Gasto marcado como pago.";

  return successResponse(successMessage, executed ?? action, result, route);
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
    const missingFields = getMissingRequiredFields(action.toolName, extractedFields);
    if (missingFields.length === 0) validateToolFieldsForPreview(action.toolName, extractedFields);
    const status = missingFields.length ? "collecting" : "awaiting_confirmation";
    const updated = await updateAiPendingAction(action.id, { extractedFields, missingFields, status });
    if (!updated) return createErrorResponse("Nao consegui atualizar a acao pendente.");
    const extractedRecord = extractedFields as Record<string, unknown>;
    const preview = buildPreview(updated, [
      ...(isPresent(extractedRecord.description) ? [{ label: "Descricao", value: String(extractedRecord.description) }] : []),
      { label: "Valor", value: formatCurrencyFromCents(Number(extractedRecord.amountInCents)) },
      { label: "Data", value: `${formatDateBr(String(extractedRecord.date))} ${String(extractedRecord.time ?? "")}` },
      { label: "Setor", value: selected.name }
    ], "Registrar gasto");
    const withPreview = await updateAiPendingAction(action.id, { preview });
    return actionResponse(withPreview ?? { ...updated, preview }, status === "collecting" ? "Qual descricao deseja usar para este gasto?" : "Confirme o registro deste gasto.");
  }

  if (action.toolName === "createMonthlyExpense" && action.missingFields.some((field) => field.name === "description")) {
    const description = sanitizeExtractedDescription(message);
    if (!description) return actionResponse(action, "Informe uma descricao curta e clara para este gasto.");
    const extractedFields: ExtractedFields = { ...(action.extractedFields as Record<string, unknown>), description };
    const missingFields = getMissingRequiredFields(action.toolName, extractedFields);
    if (missingFields.length === 0) validateToolFieldsForPreview(action.toolName, extractedFields);
    const status = missingFields.length ? "collecting" : "awaiting_confirmation";
    const updated = await updateAiPendingAction(action.id, { extractedFields, missingFields, status });
    if (!updated) return createErrorResponse("Nao consegui atualizar a acao pendente.");
    const plan = await getOrCreateMonthlyPlan(nowFields().year, nowFields().month);
    const preview = buildPreview(updated, [
      { label: "Descricao", value: description },
      { label: "Valor", value: formatCurrencyFromCents(Number(extractedFields.amountInCents)) },
      { label: "Data", value: `${formatDateBr(String(extractedFields.date))} ${String(extractedFields.time ?? "")}` },
      { label: "Setor", value: plan.categories.find((item) => item.id === extractedFields.categoryId)?.name ?? "Pendente" }
    ], "Registrar gasto");
    const withPreview = await updateAiPendingAction(action.id, { preview });
    return actionResponse(withPreview ?? { ...updated, preview }, status === "collecting" ? "Em qual setor deseja registrar este gasto?" : "Confirme o registro deste gasto.");
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

  if (!writeIntentPattern.test(input.message)) return { handled: false };

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
  else if (/(dividendo|rendimento).*(registr|cadast|receb|lanc|lanç|adic)|(?:registr|cadast|receb|lanc|lanç|adic).*(dividendo|rendimento)/.test(normalized)) response = await prepareDividendIncome(input.sessionId, input.message, "dividendo");
  else if (/(aporte|contribuicao|contribuicao|depositei|deposito)/.test(normalized)) response = await prepareContribution(input.sessionId, input.message);
  else if (/(renda|salario|salario)/.test(normalized)) response = await prepareIncome(input.sessionId, input.message);
  else if (/(meta|objetivo)/.test(normalized)) response = await prepareGoal(input.sessionId, input.message);
  else if (/(marque|paga|pago|paguei)/.test(normalized)) response = await prepareMarkExpenseCompleted(input.sessionId, input.message);
  else if (/(gastei|gasto|despesa|assinatura|gasolina|spotify|mercado|uber)/.test(normalized)) response = await prepareExpense(input.sessionId, input.message);

  return response ? { handled: true, response } : { handled: false };
}
