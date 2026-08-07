import type { WorkspaceCacheDomain } from "./cache-invalidation";

function withSettings(domains: WorkspaceCacheDomain[]) {
  return Array.from(new Set<WorkspaceCacheDomain>(["settings", ...domains]));
}

export function getWorkspaceDomainsForPath(pathname: string): WorkspaceCacheDomain[] {
  if (pathname === "/" || pathname === "/investimentos") return withSettings(["dashboard"]);
  if (pathname === "/carteira" || pathname === "/investimentos/carteira" || pathname.startsWith("/ativos/")) return withSettings(["portfolio"]);
  if (pathname === "/dividendos" || pathname === "/investimentos/dividendos") return withSettings(["dividends"]);
  if (pathname === "/metas") return withSettings(["goals"]);
  if (pathname === "/projecoes") return withSettings(["dashboard", "contributions", "dividends", "goals"]);
  if (pathname === "/historico" || pathname === "/calendario") return withSettings(["history"]);
  if (pathname === "/configuracoes") return withSettings(["portfolio"]);
  if (pathname === "/alocacao" || pathname === "/investimentos/analises") return withSettings(["portfolio"]);

  return withSettings([]);
}
