import type { WorkspaceCacheDomain, WorkspaceAffectedEntity, WorkspaceSyncDetail } from "./workspace-sync";

export type WorkspaceMutationEffectKey =
  | "asset.create"
  | "asset.update"
  | "asset.remove"
  | "operation.create"
  | "operation.update"
  | "operation.remove"
  | "dividend.create"
  | "dividend.update"
  | "dividend.remove"
  | "contribution.create"
  | "contribution.update"
  | "contribution.remove"
  | "cashBox.create"
  | "cashBox.update"
  | "cashBox.contribution"
  | "cashBox.withdrawal"
  | "cashBox.recalculate"
  | "cashBox.remove"
  | "goal.create"
  | "goal.update"
  | "goal.remove"
  | "monthlyPlanning.savePlan"
  | "monthlyPlanning.updatePlan"
  | "monthlyPlanning.copyPrevious"
  | "monthlyPlanning.createExpense"
  | "monthlyPlanning.completeExpense"
  | "monthlyPlanning.updateExpense"
  | "monthlyPlanning.removeExpense"
  | "settings.profile.update"
  | "settings.allocations.update"
  | "market.refresh"
  | "cdi.refresh"
  | "ai.action.success";

export interface WorkspaceMutationEffect {
  operation: string;
  update: string[];
  invalidate: WorkspaceCacheDomain[];
  queries: string[];
  relatedRoutes: string[];
  optimistic: boolean;
}

export const workspaceMutationEffects: Record<WorkspaceMutationEffectKey, WorkspaceMutationEffect> = {
  "asset.create": {
    operation: "createAsset",
    update: ["assets.records"],
    invalidate: ["assets", "dashboard", "portfolio", "history"],
    queries: ["asset:list", "portfolio:overview", "dashboard:summary", "history:timeline"],
    relatedRoutes: ["/ativos", "/carteira", "/historico"],
    optimistic: true
  },
  "asset.update": {
    operation: "updateAsset",
    update: ["assets.records"],
    invalidate: ["assets", "dashboard", "portfolio", "history"],
    queries: ["asset:list", "portfolio:overview", "dashboard:summary", "history:timeline"],
    relatedRoutes: ["/ativos", "/carteira", "/historico"],
    optimistic: true
  },
  "asset.remove": {
    operation: "removeAsset",
    update: ["assets.records"],
    invalidate: ["assets", "dashboard", "portfolio", "history"],
    queries: ["asset:list", "portfolio:overview", "dashboard:summary", "history:timeline"],
    relatedRoutes: ["/ativos", "/carteira", "/historico"],
    optimistic: true
  },
  "operation.create": {
    operation: "createInvestmentOperation",
    update: ["operations.records"],
    invalidate: ["operations", "dashboard", "portfolio", "history"],
    queries: ["operations:list", "portfolio:overview", "dashboard:summary", "history:timeline"],
    relatedRoutes: ["/operacoes", "/carteira", "/historico"],
    optimistic: true
  },
  "operation.update": {
    operation: "updateInvestmentOperation",
    update: ["operations.records"],
    invalidate: ["operations", "dashboard", "portfolio", "history"],
    queries: ["operations:list", "portfolio:overview", "dashboard:summary", "history:timeline"],
    relatedRoutes: ["/operacoes", "/carteira", "/historico"],
    optimistic: true
  },
  "operation.remove": {
    operation: "removeInvestmentOperation",
    update: ["operations.records"],
    invalidate: ["operations", "dashboard", "portfolio", "history"],
    queries: ["operations:list", "portfolio:overview", "dashboard:summary", "history:timeline"],
    relatedRoutes: ["/operacoes", "/carteira", "/historico"],
    optimistic: true
  },
  "dividend.create": {
    operation: "createDividend",
    update: ["dividends.records"],
    invalidate: ["dashboard", "portfolio", "dividends", "history", "monthlyPlanning"],
    queries: ["dividends:list", "portfolio:overview", "dashboard:summary", "history:timeline", "planning:overview"],
    relatedRoutes: ["/dividendos", "/investimentos/dividendos", "/historico", "/planejamento-mensal"],
    optimistic: true
  },
  "dividend.update": {
    operation: "updateDividend",
    update: ["dividends.records"],
    invalidate: ["dashboard", "portfolio", "dividends", "history", "monthlyPlanning"],
    queries: ["dividends:list", "portfolio:overview", "dashboard:summary", "history:timeline", "planning:overview"],
    relatedRoutes: ["/dividendos", "/investimentos/dividendos", "/historico", "/planejamento-mensal"],
    optimistic: true
  },
  "dividend.remove": {
    operation: "removeDividend",
    update: ["dividends.records"],
    invalidate: ["dashboard", "portfolio", "dividends", "history", "monthlyPlanning"],
    queries: ["dividends:list", "portfolio:overview", "dashboard:summary", "history:timeline", "planning:overview"],
    relatedRoutes: ["/dividendos", "/investimentos/dividendos", "/historico", "/planejamento-mensal"],
    optimistic: true
  },
  "contribution.create": {
    operation: "createContribution",
    update: ["contributions.records"],
    invalidate: ["dashboard", "contributions", "history", "monthlyPlanning"],
    queries: ["contributions:list", "dashboard:summary", "history:timeline", "planning:overview"],
    relatedRoutes: ["/aportes", "/investimentos/aportes", "/historico", "/planejamento-mensal"],
    optimistic: true
  },
  "contribution.update": {
    operation: "updateContribution",
    update: ["contributions.records"],
    invalidate: ["dashboard", "contributions", "history", "monthlyPlanning"],
    queries: ["contributions:list", "dashboard:summary", "history:timeline", "planning:overview"],
    relatedRoutes: ["/aportes", "/investimentos/aportes", "/historico", "/planejamento-mensal"],
    optimistic: true
  },
  "contribution.remove": {
    operation: "removeContribution",
    update: ["contributions.records"],
    invalidate: ["dashboard", "contributions", "history", "monthlyPlanning"],
    queries: ["contributions:list", "dashboard:summary", "history:timeline", "planning:overview"],
    relatedRoutes: ["/aportes", "/investimentos/aportes", "/historico", "/planejamento-mensal"],
    optimistic: true
  },
  "cashBox.create": {
    operation: "createCashBox",
    update: ["cashBoxes.records"],
    invalidate: ["dashboard", "portfolio", "history", "cashBoxes"],
    queries: ["cashBoxes:overview", "portfolio:overview", "dashboard:summary", "history:timeline"],
    relatedRoutes: ["/caixinhas", "/carteira", "/historico"],
    optimistic: false
  },
  "cashBox.update": {
    operation: "updateCashBox",
    update: ["cashBoxes.records"],
    invalidate: ["dashboard", "portfolio", "history", "cashBoxes"],
    queries: ["cashBoxes:overview", "portfolio:overview", "dashboard:summary", "history:timeline"],
    relatedRoutes: ["/caixinhas", "/carteira", "/historico"],
    optimistic: false
  },
  "cashBox.contribution": {
    operation: "createCashBoxContribution",
    update: ["cashBoxes.records"],
    invalidate: ["dashboard", "portfolio", "history", "cashBoxes", "monthlyPlanning"],
    queries: ["cashBoxes:overview", "portfolio:overview", "dashboard:summary", "history:timeline", "planning:overview"],
    relatedRoutes: ["/caixinhas", "/carteira", "/historico", "/planejamento-mensal"],
    optimistic: false
  },
  "cashBox.withdrawal": {
    operation: "createCashBoxWithdrawal",
    update: ["cashBoxes.records"],
    invalidate: ["dashboard", "portfolio", "history", "cashBoxes", "monthlyPlanning"],
    queries: ["cashBoxes:overview", "portfolio:overview", "dashboard:summary", "history:timeline", "planning:overview"],
    relatedRoutes: ["/caixinhas", "/carteira", "/historico", "/planejamento-mensal"],
    optimistic: false
  },
  "cashBox.recalculate": {
    operation: "recalculateCashBoxes",
    update: ["cashBoxes.records"],
    invalidate: ["dashboard", "portfolio", "history", "cashBoxes", "cdi"],
    queries: ["cashBoxes:overview", "cdi:status", "portfolio:overview", "dashboard:summary", "history:timeline"],
    relatedRoutes: ["/caixinhas", "/carteira", "/historico"],
    optimistic: false
  },
  "cashBox.remove": {
    operation: "removeCashBox",
    update: ["cashBoxes.records"],
    invalidate: ["dashboard", "portfolio", "history", "cashBoxes"],
    queries: ["cashBoxes:overview", "portfolio:overview", "dashboard:summary", "history:timeline"],
    relatedRoutes: ["/caixinhas", "/carteira", "/historico"],
    optimistic: false
  },
  "goal.create": {
    operation: "createGoal",
    update: ["goals.records"],
    invalidate: ["dashboard", "portfolio", "goals", "history"],
    queries: ["goals:list", "dashboard:summary", "portfolio:overview", "history:timeline"],
    relatedRoutes: ["/metas", "/investimentos/metas", "/historico"],
    optimistic: true
  },
  "goal.update": {
    operation: "updateGoal",
    update: ["goals.records"],
    invalidate: ["dashboard", "portfolio", "goals", "history"],
    queries: ["goals:list", "dashboard:summary", "portfolio:overview", "history:timeline"],
    relatedRoutes: ["/metas", "/investimentos/metas", "/historico"],
    optimistic: true
  },
  "goal.remove": {
    operation: "removeGoal",
    update: ["goals.records"],
    invalidate: ["dashboard", "portfolio", "goals", "history"],
    queries: ["goals:list", "dashboard:summary", "portfolio:overview", "history:timeline"],
    relatedRoutes: ["/metas", "/investimentos/metas", "/historico"],
    optimistic: true
  },
  "monthlyPlanning.savePlan": {
    operation: "saveMonthlyPlan",
    update: ["planning.plan"],
    invalidate: ["monthlyPlanning", "history"],
    queries: ["planning:overview", "history:timeline"],
    relatedRoutes: ["/planejamento-mensal", "/historico"],
    optimistic: false
  },
  "monthlyPlanning.updatePlan": {
    operation: "updateMonthlyPlan",
    update: ["planning.plan"],
    invalidate: ["monthlyPlanning", "history"],
    queries: ["planning:overview", "history:timeline"],
    relatedRoutes: ["/planejamento-mensal", "/historico"],
    optimistic: true
  },
  "monthlyPlanning.copyPrevious": {
    operation: "copyPreviousMonthlyPlan",
    update: ["planning.plan"],
    invalidate: ["monthlyPlanning", "history"],
    queries: ["planning:overview", "history:timeline"],
    relatedRoutes: ["/planejamento-mensal", "/historico"],
    optimistic: false
  },
  "monthlyPlanning.createExpense": {
    operation: "createMonthlyExpense",
    update: ["planning.expenses"],
    invalidate: ["monthlyPlanning", "history"],
    queries: ["planning:overview", "planning:calendar", "history:timeline"],
    relatedRoutes: ["/planejamento-mensal/gastos", "/planejamento-mensal/calendario", "/historico"],
    optimistic: true
  },
  "monthlyPlanning.completeExpense": {
    operation: "completeMonthlyExpense",
    update: ["planning.expenses"],
    invalidate: ["monthlyPlanning", "history"],
    queries: ["planning:overview", "planning:calendar", "history:timeline"],
    relatedRoutes: ["/planejamento-mensal/gastos", "/planejamento-mensal/calendario", "/historico"],
    optimistic: true
  },
  "monthlyPlanning.updateExpense": {
    operation: "updateMonthlyExpense",
    update: ["planning.expenses"],
    invalidate: ["monthlyPlanning", "history"],
    queries: ["planning:overview", "planning:calendar", "history:timeline"],
    relatedRoutes: ["/planejamento-mensal/gastos", "/planejamento-mensal/calendario", "/historico"],
    optimistic: true
  },
  "monthlyPlanning.removeExpense": {
    operation: "removeMonthlyExpense",
    update: ["planning.expenses"],
    invalidate: ["monthlyPlanning", "history"],
    queries: ["planning:overview", "planning:calendar", "history:timeline"],
    relatedRoutes: ["/planejamento-mensal/gastos", "/planejamento-mensal/calendario", "/historico"],
    optimistic: true
  },
  "settings.profile.update": {
    operation: "updateSettingsProfile",
    update: ["settings.profile"],
    invalidate: ["settings"],
    queries: ["settings:profile"],
    relatedRoutes: ["/configuracoes"],
    optimistic: true
  },
  "settings.allocations.update": {
    operation: "updateAllocations",
    update: ["settings.allocations"],
    invalidate: ["dashboard", "portfolio", "settings"],
    queries: ["settings:allocations", "portfolio:overview", "dashboard:summary"],
    relatedRoutes: ["/configuracoes", "/carteira"],
    optimistic: true
  },
  "market.refresh": {
    operation: "refreshMarketData",
    update: ["portfolio.market"],
    invalidate: ["dashboard", "portfolio", "history", "market"],
    queries: ["market:status", "portfolio:overview", "dashboard:summary", "history:timeline"],
    relatedRoutes: ["/carteira", "/ativos", "/historico"],
    optimistic: false
  },
  "cdi.refresh": {
    operation: "refreshCdiData",
    update: ["cashBoxes.cdi"],
    invalidate: ["dashboard", "portfolio", "history", "cashBoxes", "cdi"],
    queries: ["cdi:status", "cashBoxes:overview", "portfolio:overview", "dashboard:summary", "history:timeline"],
    relatedRoutes: ["/caixinhas", "/carteira", "/historico"],
    optimistic: false
  },
  "ai.action.success": {
    operation: "executeAiAction",
    update: ["assistant.session"],
    invalidate: ["dashboard", "portfolio", "dividends", "contributions", "goals", "history", "monthlyPlanning", "operations", "cashBoxes", "settings"],
    queries: ["assistant:session", "assistant:sessions"],
    relatedRoutes: ["/assistente"],
    optimistic: false
  }
};

export const analysisDependencyDomains = {
  complete: ["dashboard", "portfolio", "dividends", "contributions", "goals", "history", "monthlyPlanning", "cashBoxes", "settings"] satisfies WorkspaceCacheDomain[],
  planning: ["monthlyPlanning", "history", "contributions", "dividends"] satisfies WorkspaceCacheDomain[],
  investments: ["dashboard", "portfolio", "operations", "dividends", "contributions", "cashBoxes", "market", "cdi"] satisfies WorkspaceCacheDomain[],
  category: ["monthlyPlanning", "history"] satisfies WorkspaceCacheDomain[],
  goals: ["goals", "dashboard", "portfolio", "contributions"] satisfies WorkspaceCacheDomain[],
  projections: ["dashboard", "portfolio", "contributions", "dividends", "goals", "settings"] satisfies WorkspaceCacheDomain[]
};

export function resolveMutationEffect(effectKey: WorkspaceMutationEffectKey) {
  return workspaceMutationEffects[effectKey];
}

export function buildWorkspaceSyncFromEffect(
  effectKey: WorkspaceMutationEffectKey,
  input: {
    source?: WorkspaceSyncDetail["source"];
    reason?: string;
    affectedEntities?: WorkspaceAffectedEntity[];
  } = {}
) {
  const effect = resolveMutationEffect(effectKey);
  return {
    domains: effect.invalidate,
    source: input.source ?? "mutation",
    mutationKey: effectKey,
    reason: input.reason ?? effect.operation,
    affectedEntities: input.affectedEntities
  } as const;
}
