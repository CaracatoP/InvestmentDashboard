import type { To } from "react-router-dom";

const allowedAiRoutes = {
  "/assistente": "/assistente",
  "/ativos": "/ativos",
  "/aportes": "/aportes",
  "/caixinhas": "/caixinhas",
  "/carteira": "/carteira",
  "/configuracoes": "/configuracoes",
  "/dividendos": "/dividendos",
  "/historico": "/historico",
  "/investimentos": "/investimentos",
  "/investimentos/aportes": "/investimentos/aportes",
  "/investimentos/analises": "/investimentos/analises",
  "/investimentos/carteira": "/investimentos/carteira",
  "/investimentos/dividendos": "/investimentos/dividendos",
  "/investimentos/metas": "/investimentos/metas",
  "/metas": "/metas",
  "/operacoes": "/operacoes",
  "/planejamento-mensal": "/planejamento-mensal",
  "/planejamento-mensal/analises": "/planejamento-mensal/analises",
  "/planejamento-mensal/calendario": "/planejamento-mensal/calendario",
  "/planejamento-mensal/gastos": "/planejamento-mensal/gastos",
  "/planejamento-mensal/objetivos": "/planejamento-mensal/objetivos",
  "/planejamento-mensal/orcamento": "/planejamento-mensal/orcamento",
  "/projecoes": "/projecoes"
} as const;

export function resolveAiActionRoute(route?: string | null): To | null {
  if (!route) return null;
  return allowedAiRoutes[route as keyof typeof allowedAiRoutes] ?? null;
}
