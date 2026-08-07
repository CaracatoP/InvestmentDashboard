import type { AiPendingActionRiskLevel, AiToolName } from "../schemas/ai.schema";

export type AiToolDomain = "planning" | "investments" | "history" | "goals" | "settings";

export interface AiToolCatalogEntry {
  name: AiToolName;
  description: string;
  domain: AiToolDomain;
  operation: string;
  risk: AiPendingActionRiskLevel;
  required: string[];
  optional: string[];
  service: string;
  affectedDomains: string[];
  relatedRoutes: string[];
  confirmationRequired: boolean;
  strongConfirmation: boolean;
  idempotencyStrategy: string;
  enabled: boolean;
  uiActionId?: string;
  successMessage: string;
  clientMutationKey?: string;
}

export const aiToolCatalog: Record<AiToolName, AiToolCatalogEntry> = {
  createContribution: {
    name: "createContribution",
    description: "Registra um aporte financeiro.",
    domain: "investments",
    operation: "createContribution",
    risk: "low",
    required: ["amountInCents", "date"],
    optional: ["description", "note"],
    service: "registerContribution",
    affectedDomains: ["dashboard", "contributions", "history", "monthlyPlanning"],
    relatedRoutes: ["/investimentos/aportes", "/historico", "/planejamento-mensal"],
    confirmationRequired: true,
    strongConfirmation: false,
    idempotencyStrategy: "pending-action-idempotency-key",
    enabled: true,
    uiActionId: "view-contributions",
    successMessage: "Aporte registrado com sucesso.",
    clientMutationKey: "contribution.create"
  },
  createMonthlyExpense: {
    name: "createMonthlyExpense",
    description: "Registra um gasto no planejamento mensal.",
    domain: "planning",
    operation: "createMonthlyExpense",
    risk: "medium",
    required: ["planId", "categoryId", "description", "amountInCents", "date", "time"],
    optional: ["note", "paymentMethod", "status", "expenseType", "recurring"],
    service: "addMonthlyExpense",
    affectedDomains: ["monthlyPlanning", "history"],
    relatedRoutes: ["/planejamento-mensal/gastos", "/planejamento-mensal/calendario", "/historico"],
    confirmationRequired: true,
    strongConfirmation: false,
    idempotencyStrategy: "pending-action-idempotency-key",
    enabled: true,
    uiActionId: "view-planning-expenses",
    successMessage: "Gasto registrado com sucesso.",
    clientMutationKey: "monthlyPlanning.createExpense"
  },
  updateMonthlyIncome: {
    name: "updateMonthlyIncome",
    description: "Atualiza a renda do planejamento mensal.",
    domain: "planning",
    operation: "updateMonthlyIncome",
    risk: "medium",
    required: ["year", "month", "incomeInCents"],
    optional: [],
    service: "saveMonthlyPlan",
    affectedDomains: ["monthlyPlanning", "history"],
    relatedRoutes: ["/planejamento-mensal/orcamento", "/planejamento-mensal"],
    confirmationRequired: true,
    strongConfirmation: false,
    idempotencyStrategy: "pending-action-idempotency-key",
    enabled: true,
    uiActionId: "view-planning-budget",
    successMessage: "Renda mensal atualizada com sucesso.",
    clientMutationKey: "monthlyPlanning.updatePlan"
  },
  createFinancialGoal: {
    name: "createFinancialGoal",
    description: "Cria uma meta financeira.",
    domain: "goals",
    operation: "createFinancialGoal",
    risk: "low",
    required: ["title", "type", "targetInCents"],
    optional: ["description", "assetTicker", "deadline"],
    service: "registerGoal",
    affectedDomains: ["dashboard", "portfolio", "goals", "history"],
    relatedRoutes: ["/metas", "/investimentos/metas", "/historico"],
    confirmationRequired: true,
    strongConfirmation: false,
    idempotencyStrategy: "pending-action-idempotency-key",
    enabled: true,
    uiActionId: "view-goals",
    successMessage: "Meta criada com sucesso.",
    clientMutationKey: "goal.create"
  },
  markExpenseAsCompleted: {
    name: "markExpenseAsCompleted",
    description: "Marca uma ocorrencia do planejamento como paga.",
    domain: "planning",
    operation: "markExpenseAsCompleted",
    risk: "medium",
    required: ["expenseId"],
    optional: ["completedAt"],
    service: "completeMonthlyExpense",
    affectedDomains: ["monthlyPlanning", "history"],
    relatedRoutes: ["/planejamento-mensal/gastos", "/planejamento-mensal/calendario", "/historico"],
    confirmationRequired: true,
    strongConfirmation: false,
    idempotencyStrategy: "expense-completion-lock-and-idempotency-key",
    enabled: true,
    uiActionId: "view-planning-expenses",
    successMessage: "Gasto marcado como pago.",
    clientMutationKey: "monthlyPlanning.completeExpense"
  },
  createInvestmentPurchase: {
    name: "createInvestmentPurchase",
    description: "Registra uma compra de ativo.",
    domain: "investments",
    operation: "createInvestmentPurchase",
    risk: "high",
    required: ["assetTicker", "quantity", "price", "date"],
    optional: ["fees", "notes"],
    service: "createOperation",
    affectedDomains: ["operations", "dashboard", "portfolio", "history"],
    relatedRoutes: ["/operacoes", "/carteira", "/historico"],
    confirmationRequired: true,
    strongConfirmation: true,
    idempotencyStrategy: "pending-action-idempotency-key",
    enabled: true,
    uiActionId: "view-operations",
    successMessage: "Compra registrada com sucesso.",
    clientMutationKey: "operation.create"
  },
  createInvestmentSale: {
    name: "createInvestmentSale",
    description: "Registra uma venda de ativo.",
    domain: "investments",
    operation: "createInvestmentSale",
    risk: "high",
    required: ["assetTicker", "quantity", "price", "date"],
    optional: ["fees", "notes"],
    service: "createOperation",
    affectedDomains: ["operations", "dashboard", "portfolio", "history"],
    relatedRoutes: ["/operacoes", "/carteira", "/historico"],
    confirmationRequired: true,
    strongConfirmation: true,
    idempotencyStrategy: "pending-action-idempotency-key",
    enabled: true,
    uiActionId: "view-operations",
    successMessage: "Venda registrada com sucesso.",
    clientMutationKey: "operation.create"
  },
  registerDividend: {
    name: "registerDividend",
    description: "Registra um dividendo recebido.",
    domain: "investments",
    operation: "registerDividend",
    risk: "medium",
    required: ["assetTicker", "amountInCents", "paymentDate"],
    optional: ["amountPerShare", "quantityEligible", "notes"],
    service: "createDividend",
    affectedDomains: ["dashboard", "portfolio", "dividends", "history", "monthlyPlanning"],
    relatedRoutes: ["/dividendos", "/investimentos/dividendos", "/historico", "/planejamento-mensal"],
    confirmationRequired: true,
    strongConfirmation: false,
    idempotencyStrategy: "pending-action-idempotency-key",
    enabled: true,
    uiActionId: "view-dividends",
    successMessage: "Dividendo registrado com sucesso.",
    clientMutationKey: "dividend.create"
  },
  registerJCP: {
    name: "registerJCP",
    description: "Registra um JCP recebido.",
    domain: "investments",
    operation: "registerJCP",
    risk: "medium",
    required: ["assetTicker", "amountInCents", "paymentDate"],
    optional: ["amountPerShare", "quantityEligible", "notes"],
    service: "createDividend",
    affectedDomains: ["dashboard", "portfolio", "dividends", "history", "monthlyPlanning"],
    relatedRoutes: ["/dividendos", "/investimentos/dividendos", "/historico", "/planejamento-mensal"],
    confirmationRequired: true,
    strongConfirmation: false,
    idempotencyStrategy: "pending-action-idempotency-key",
    enabled: true,
    uiActionId: "view-dividends",
    successMessage: "JCP registrado com sucesso.",
    clientMutationKey: "dividend.create"
  },
  registerBonus: {
    name: "registerBonus",
    description: "Registra uma bonificacao.",
    domain: "investments",
    operation: "registerBonus",
    risk: "high",
    required: ["assetTicker", "quantity", "date"],
    optional: ["notes"],
    service: "createOperation",
    affectedDomains: ["operations", "dashboard", "portfolio", "history"],
    relatedRoutes: ["/operacoes", "/carteira", "/historico"],
    confirmationRequired: true,
    strongConfirmation: true,
    idempotencyStrategy: "pending-action-idempotency-key",
    enabled: true,
    uiActionId: "view-operations",
    successMessage: "Bonificacao registrada com sucesso.",
    clientMutationKey: "operation.create"
  },
  registerSplit: {
    name: "registerSplit",
    description: "Registra um desdobramento.",
    domain: "investments",
    operation: "registerSplit",
    risk: "high",
    required: ["assetTicker", "quantity", "date"],
    optional: ["notes"],
    service: "createOperation",
    affectedDomains: ["operations", "dashboard", "portfolio", "history"],
    relatedRoutes: ["/operacoes", "/carteira", "/historico"],
    confirmationRequired: true,
    strongConfirmation: true,
    idempotencyStrategy: "pending-action-idempotency-key",
    enabled: true,
    uiActionId: "view-operations",
    successMessage: "Desdobramento registrado com sucesso.",
    clientMutationKey: "operation.create"
  },
  registerReverseSplit: {
    name: "registerReverseSplit",
    description: "Registra um grupamento.",
    domain: "investments",
    operation: "registerReverseSplit",
    risk: "high",
    required: ["assetTicker", "quantity", "date"],
    optional: ["notes"],
    service: "createOperation",
    affectedDomains: ["operations", "dashboard", "portfolio", "history"],
    relatedRoutes: ["/operacoes", "/carteira", "/historico"],
    confirmationRequired: true,
    strongConfirmation: true,
    idempotencyStrategy: "pending-action-idempotency-key",
    enabled: true,
    uiActionId: "view-operations",
    successMessage: "Grupamento registrado com sucesso.",
    clientMutationKey: "operation.create"
  },
  transferAsset: {
    name: "transferAsset",
    description: "Transferencia entre carteiras ainda bloqueada.",
    domain: "investments",
    operation: "transferAsset",
    risk: "high",
    required: ["assetTicker", "fromWalletId", "toWalletId", "quantity", "date"],
    optional: ["notes"],
    service: "blocked",
    affectedDomains: [],
    relatedRoutes: [],
    confirmationRequired: true,
    strongConfirmation: true,
    idempotencyStrategy: "blocked-until-safe-service-exists",
    enabled: false,
    successMessage: "Operacao bloqueada."
  },
  updateAveragePrice: {
    name: "updateAveragePrice",
    description: "Edicao manual de preco medio ainda bloqueada.",
    domain: "investments",
    operation: "updateAveragePrice",
    risk: "high",
    required: ["assetTicker", "averagePrice", "date"],
    optional: ["notes"],
    service: "blocked",
    affectedDomains: [],
    relatedRoutes: [],
    confirmationRequired: true,
    strongConfirmation: true,
    idempotencyStrategy: "blocked-until-safe-service-exists",
    enabled: false,
    successMessage: "Operacao bloqueada."
  },
  updateSettingsProfile: {
    name: "updateSettingsProfile",
    description: "Atualiza configuracoes seguras do perfil.",
    domain: "settings",
    operation: "updateSettingsProfile",
    risk: "low",
    required: [],
    optional: ["profileName", "theme", "currency"],
    service: "updateSettings",
    affectedDomains: ["settings"],
    relatedRoutes: ["/configuracoes"],
    confirmationRequired: true,
    strongConfirmation: false,
    idempotencyStrategy: "pending-action-idempotency-key",
    enabled: true,
    uiActionId: "view-settings",
    successMessage: "Configuracoes atualizadas com sucesso.",
    clientMutationKey: "settings.profile.update"
  }
};

export function getAiToolCatalogEntry(toolName: AiToolName) {
  return aiToolCatalog[toolName];
}

export function getAiToolRequirements(toolName: AiToolName) {
  const entry = getAiToolCatalogEntry(toolName);
  return {
    required: [...entry.required],
    optional: [...entry.optional]
  };
}

export function getAiToolPrimaryRoute(toolName: AiToolName) {
  return getAiToolCatalogEntry(toolName).relatedRoutes[0] ?? undefined;
}
