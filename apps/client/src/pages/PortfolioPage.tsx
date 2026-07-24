import { RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PieChart } from "../components/charts/PieChart";
import { PageHeader } from "../components/ui/PageHeader";
import { ProgressBar } from "../components/ui/ProgressBar";
import { EmptyState, MobileDataCard } from "../components/ui/Responsive";
import { StatCard } from "../components/ui/StatCard";
import { refreshMarketData } from "../services/api";
import { useInvestmentStore } from "../stores/useInvestmentStore";
import type { Asset } from "../types/investments";
import { formatCurrency, formatPercentage } from "../utils/formatters";

const allocationColors = ["#22c55e", "#38bdf8", "#a78bfa", "#f59e0b", "#fb7185", "#14b8a6"];
const positionFilters = ["Com posicao", "Todos", "Sem posicao", "Com erro de cotacao"];
const quoteStatusFilters = ["Todos", "Atualizada", "Fallback", "Indisponivel", "Erro"];

function hasPosition(asset: Asset) {
  return asset.hasPosition ?? asset.quantity > 0;
}

function hasValidPrice(asset: Asset) {
  return typeof asset.currentPrice === "number" && Number.isFinite(asset.currentPrice) && asset.currentPrice > 0;
}

function hasQuoteIssue(asset: Asset) {
  return hasPosition(asset) && (!hasValidPrice(asset) || ["unavailable", "unsupported", "error", "failed"].includes(asset.priceStatus ?? ""));
}

function formatNullableCurrency(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? formatCurrency(value) : "Indisponivel";
}

function formatNullablePercentage(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? formatPercentage(value) : "Indisponivel";
}

function metricClass(value: number | null | undefined) {
  if (!value) return "text-muted";
  return value > 0 ? "text-accent" : "text-rose";
}

function quoteStatusLabel(status?: string) {
  const labels: Record<string, string> = {
    updated: "Atualizada",
    success: "Atualizada",
    stale: "Fallback",
    unavailable: "Indisponivel",
    unsupported: "Nao suportada",
    error: "Erro",
    failed: "Erro"
  };

  return labels[status ?? ""] ?? "Indisponivel";
}

function quoteStatusMatches(asset: Asset, filter: string) {
  if (filter === "Todos") return true;
  const status = asset.priceStatus ?? "unavailable";
  if (filter === "Atualizada") return ["updated", "success"].includes(status);
  if (filter === "Fallback") return status === "stale";
  if (filter === "Indisponivel") return ["unavailable", "unsupported"].includes(status) || !hasValidPrice(asset);
  if (filter === "Erro") return ["error", "failed"].includes(status);
  return true;
}

function quoteStatusClass(asset: Asset) {
  if (hasValidPrice(asset)) return "text-accent";
  return hasPosition(asset) ? "text-amber" : "text-muted";
}

export function PortfolioPage() {
  const portfolio = useInvestmentStore((state) => state.portfolio);
  const loadWorkspace = useInvestmentStore((state) => state.loadWorkspace);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todas");
  const [positionFilter, setPositionFilter] = useState("Com posicao");
  const [quoteStatusFilter, setQuoteStatusFilter] = useState("Todos");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshFeedback, setRefreshFeedback] = useState("");

  const activePositions = useMemo(() => (portfolio?.assets ?? []).filter(hasPosition), [portfolio?.assets]);
  const pricedPositions = useMemo(() => activePositions.filter(hasValidPrice), [activePositions]);
  const positionsWithQuoteIssue = useMemo(() => (portfolio?.assets ?? []).filter(hasQuoteIssue), [portfolio?.assets]);
  const categories = useMemo(() => {
    const values = portfolio?.assets.map((asset) => asset.categoryLabel ?? asset.category) ?? [];
    return ["Todas", ...Array.from(new Set(values))];
  }, [portfolio?.assets]);

  const summary = useMemo(() => {
    const invested = activePositions.reduce((total, asset) => total + asset.investedValue, 0);
    const current = pricedPositions.reduce((total, asset) => total + (asset.currentValue ?? 0), 0);
    const profit = pricedPositions.reduce((total, asset) => total + (asset.unrealizedProfit ?? asset.profit ?? 0), 0);

    return {
      invested,
      current,
      profit,
      profitability: invested > 0 ? (profit / invested) * 100 : 0,
      activeCount: activePositions.length,
      unavailableCount: positionsWithQuoteIssue.length
    };
  }, [activePositions, positionsWithQuoteIssue.length, pricedPositions]);

  const filteredAssets = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return (portfolio?.assets ?? []).filter((asset) => {
      const matchesSearch =
        asset.ticker.toLowerCase().includes(normalizedSearch) || asset.name.toLowerCase().includes(normalizedSearch);
      const matchesCategory = category === "Todas" || (asset.categoryLabel ?? asset.category) === category;
      const matchesPosition =
        positionFilter === "Todos" ||
        (positionFilter === "Com posicao" && hasPosition(asset)) ||
        (positionFilter === "Sem posicao" && !hasPosition(asset)) ||
        (positionFilter === "Com erro de cotacao" && hasQuoteIssue(asset));
      return matchesSearch && matchesCategory && matchesPosition && quoteStatusMatches(asset, quoteStatusFilter);
    });
  }, [category, portfolio?.assets, positionFilter, quoteStatusFilter, search]);

  const allocationChartData = useMemo(
    () =>
      (portfolio?.allocationComparison ?? []).map((item, index) => ({
        ...item,
        value: item.value ?? 0,
        color: item.color ?? allocationColors[index % allocationColors.length]
      })),
    [portfolio?.allocationComparison]
  );
  const lastPriceAt = portfolio?.assets
    .map((asset) => asset.lastPriceAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const recommendedCategory = portfolio?.allocation?.largestDeficit;
  const suggestedTicker = portfolio?.recommendation.ticker && portfolio.recommendation.ticker !== "Caixinha" ? portfolio.recommendation.ticker : "";
  const suggestedAsset = suggestedTicker ? activePositions.find((asset) => asset.ticker === suggestedTicker && hasValidPrice(asset)) : undefined;

  async function handleRefresh() {
    if (isRefreshing) return;

    setIsRefreshing(true);
    setRefreshFeedback("");

    try {
      const result = await refreshMarketData();
      await loadWorkspace();
      const refreshedAt = new Date(result.refreshedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      setRefreshFeedback(`${result.updated} ativos atualizados · ${result.failed + result.unsupported} cotacoes indisponiveis · ultima atualizacao as ${refreshedAt}`);
    } catch (error) {
      setRefreshFeedback(error instanceof Error ? `Falha ao atualizar: ${error.message}` : "Falha ao atualizar cotacoes.");
    } finally {
      setIsRefreshing(false);
    }
  }

  if (!portfolio) {
    return <div className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">Carregando carteira...</div>;
  }

  const emptyMessage =
    portfolio.assets.length === 0
      ? "Nenhum ativo cadastrado."
      : activePositions.length === 0 && positionFilter === "Com posicao"
        ? "Voce tem ativos cadastrados, mas nenhuma posicao na carteira. Cadastre uma compra para aparecer aqui."
        : positionsWithQuoteIssue.length > 0 && filteredAssets.length === 0 && quoteStatusFilter !== "Todos"
          ? "Nenhuma cotacao encontrada para este filtro."
          : "Nenhum resultado para os filtros selecionados.";

  return (
    <div>
      <PageHeader
        eyebrow="Carteira"
        title="Controle completo dos ativos"
        description="Pesos, rentabilidade, dividend yield, preco medio e exposicao por categoria em uma tabela filtravel."
      />

      <section className="mb-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Valor investido" value={formatCurrency(summary.invested)} detail="Posicoes ativas" icon={<RefreshCw size={18} />} tone="violet" />
        <StatCard label="Valor atual" value={formatCurrency(summary.current)} detail="Somente cotacoes validas" icon={<RefreshCw size={18} />} />
        <StatCard label="Lucro nao realizado" value={formatCurrency(summary.profit)} detail="Sem dividendos" icon={<RefreshCw size={18} />} tone={summary.profit < 0 ? "rose" : "green"} />
        <StatCard label="Rentabilidade" value={formatPercentage(summary.profitability)} detail="Sobre valor investido" icon={<RefreshCw size={18} />} tone="blue" />
        <StatCard label="Posicoes ativas" value={String(summary.activeCount)} detail={`${portfolio.assets.length} ativos cadastrados`} icon={<RefreshCw size={18} />} tone="amber" />
        <StatCard label="Cotacoes indisponiveis" value={String(summary.unavailableCount)} detail="Requer refresh ou provider" icon={<RefreshCw size={18} />} tone={summary.unavailableCount > 0 ? "amber" : "green"} />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
        <div className="min-w-0 rounded-lg border border-line bg-panel p-3 shadow-soft sm:p-4">
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex flex-col gap-3 xl:flex-row">
              <label className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-11 w-full rounded-lg border border-line bg-elevated pl-9 pr-3 text-base text-ink outline-none transition focus:border-accent sm:text-sm"
                  placeholder="Buscar por nome ou ticker"
                />
              </label>
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-11 w-full rounded-lg border border-line bg-elevated px-3 text-base text-ink outline-none transition focus:border-accent sm:text-sm xl:w-auto">
                {categories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)} className="h-11 w-full rounded-lg border border-line bg-elevated px-3 text-base text-ink outline-none transition focus:border-accent sm:text-sm xl:w-auto">
                {positionFilters.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <select value={quoteStatusFilter} onChange={(event) => setQuoteStatusFilter(event.target.value)} className="h-11 w-full rounded-lg border border-line bg-elevated px-3 text-base text-ink outline-none transition focus:border-accent sm:text-sm xl:w-auto">
                {quoteStatusFilters.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={isRefreshing}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-4 text-sm text-ink transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                aria-label="Atualizar cotacoes"
              >
                <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
                {isRefreshing ? "Atualizando" : "Atualizar"}
              </button>
            </div>
            <p className="text-xs text-muted">
              {activePositions.length} posicoes ativas · {portfolio.assets.length} ativos cadastrados · ultima sincronizacao {lastPriceAt ? new Date(lastPriceAt).toLocaleString("pt-BR") : "indisponivel"}
            </p>
            {refreshFeedback ? <p className="text-xs text-muted">{refreshFeedback}</p> : null}
          </div>

          {filteredAssets.length === 0 ? (
            <EmptyState>{emptyMessage}</EmptyState>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {filteredAssets.map((asset) => {
                  const quoteLabel = quoteStatusLabel(asset.priceStatus);
                  const lastQuote = asset.lastPriceAt ? new Date(asset.lastPriceAt).toLocaleString("pt-BR") : "indisponivel";

                  return (
                    <MobileDataCard
                      key={asset.ticker}
                      title={
                        <Link to={`/ativos/${asset.ticker}`} className="hover:text-accent">
                          {asset.ticker}
                        </Link>
                      }
                      subtitle={asset.name}
                      badge={<span className={quoteStatusClass(asset)}>{quoteLabel}</span>}
                    >
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-lg bg-elevated px-3 py-2">
                          <p className="text-xs text-muted">Categoria</p>
                          <p className="break-words font-medium text-ink">{asset.categoryLabel ?? asset.category}</p>
                        </div>
                        <div className="rounded-lg bg-elevated px-3 py-2">
                          <p className="text-xs text-muted">Quantidade</p>
                          <p className="font-medium text-ink">{asset.quantity}</p>
                        </div>
                        <div className="rounded-lg bg-elevated px-3 py-2">
                          <p className="text-xs text-muted">Preco medio</p>
                          <p className="font-medium text-ink">{formatCurrency(asset.averagePrice)}</p>
                        </div>
                        <div className="rounded-lg bg-elevated px-3 py-2">
                          <p className="text-xs text-muted">Preco atual</p>
                          <p className="font-medium text-ink">{hasValidPrice(asset) ? formatCurrency(asset.currentPrice ?? 0) : "Indisponivel"}</p>
                        </div>
                        <div className="rounded-lg bg-elevated px-3 py-2">
                          <p className="text-xs text-muted">Investido</p>
                          <p className="font-medium text-ink">{formatCurrency(asset.totalInvested ?? asset.investedValue)}</p>
                        </div>
                        <div className="rounded-lg bg-elevated px-3 py-2">
                          <p className="text-xs text-muted">Valor atual</p>
                          <p className="font-medium text-ink">{formatNullableCurrency(asset.currentValue)}</p>
                        </div>
                        <div className="rounded-lg bg-elevated px-3 py-2">
                          <p className="text-xs text-muted">Lucro</p>
                          <p className={`font-medium ${metricClass(asset.unrealizedProfit ?? asset.profit)}`}>{formatNullableCurrency(asset.unrealizedProfit ?? asset.profit)}</p>
                        </div>
                        <div className="rounded-lg bg-elevated px-3 py-2">
                          <p className="text-xs text-muted">Rentabilidade</p>
                          <p className={`font-medium ${metricClass(asset.profitabilityPercent ?? asset.returnPercentage)}`}>
                            {formatNullablePercentage(asset.profitabilityPercent ?? asset.returnPercentage)}
                          </p>
                        </div>
                      </div>

                      <details className="mt-3 rounded-lg bg-elevated px-3 py-2 text-sm">
                        <summary className="min-h-11 cursor-pointer list-none py-2 text-ink">Detalhes do ativo</summary>
                        <div className="grid gap-2 border-t border-line pt-3 text-muted">
                          <p className="flex justify-between gap-3">
                            <span>Dividend Yield</span>
                            <span className="text-ink">{formatPercentage(asset.dividendYield)}</span>
                          </p>
                          <p className="flex justify-between gap-3">
                            <span>Yield on Cost</span>
                            <span className="text-ink">{formatPercentage(asset.yieldOnCost ?? 0)}</span>
                          </p>
                          <p className="flex justify-between gap-3">
                            <span>Dividendos</span>
                            <span className="text-ink">{formatCurrency(asset.dividendsReceived)}</span>
                          </p>
                          <p className="flex justify-between gap-3">
                            <span>Peso</span>
                            <span className="text-ink">{formatPercentage(asset.weightPercent ?? asset.portfolioWeight)}</span>
                          </p>
                          <p className="flex justify-between gap-3">
                            <span>Ultima cotacao</span>
                            <span className="text-right text-ink">{lastQuote}</span>
                          </p>
                        </div>
                      </details>

                      <Link to={`/ativos/${asset.ticker}`} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-line bg-elevated px-3 text-sm text-ink transition hover:border-accent/50">
                        Abrir detalhes
                      </Link>
                    </MobileDataCard>
                  );
                })}
              </div>
              <div className="scrollbar-thin hidden max-h-[680px] overflow-auto md:block">
              <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 bg-panel text-xs uppercase tracking-[0.14em] text-muted">
                  <tr className="border-b border-line">
                    <th className="sticky left-0 z-20 bg-panel py-3 pr-3 font-medium">Ativo</th>
                    <th className="py-3 font-medium">Categoria</th>
                    <th className="py-3 text-right font-medium">Quantidade</th>
                    <th className="py-3 text-right font-medium">Preco medio</th>
                    <th className="py-3 text-right font-medium">Preco atual</th>
                    <th className="py-3 text-right font-medium">Investido</th>
                    <th className="py-3 text-right font-medium">Valor atual</th>
                    <th className="py-3 text-right font-medium">Lucro</th>
                    <th className="py-3 text-right font-medium">Rent.</th>
                    <th className="py-3 text-right font-medium">DY</th>
                    <th className="py-3 text-right font-medium">Yield on Cost</th>
                    <th className="py-3 text-right font-medium">Dividendos</th>
                    <th className="py-3 text-right font-medium">Peso</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssets.map((asset) => (
                    <tr key={asset.ticker} className="border-b border-line/70 text-muted">
                      <td className="sticky left-0 bg-panel py-4 pr-3">
                        <Link to={`/ativos/${asset.ticker}`} className="font-medium text-ink hover:text-accent">
                          {asset.ticker}
                        </Link>
                        <p className="text-xs text-muted">{asset.name}</p>
                      </td>
                      <td className="py-4">{asset.categoryLabel ?? asset.category}</td>
                      <td className="py-4 text-right">{asset.quantity}</td>
                      <td className="py-4 text-right">{formatCurrency(asset.averagePrice)}</td>
                      <td className="py-4 text-right">
                        {hasValidPrice(asset) ? (
                          <>
                            <p className="text-ink">{formatCurrency(asset.currentPrice ?? 0)}</p>
                            <p className="text-xs text-muted">
                              {asset.priceSource ? asset.priceSource.toUpperCase() : quoteStatusLabel(asset.priceStatus)}
                              {asset.lastPriceAt ? ` · ${new Date(asset.lastPriceAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
                            </p>
                          </>
                        ) : (
                          <span className={hasPosition(asset) ? "text-amber" : "text-muted"}>Indisponivel</span>
                        )}
                      </td>
                      <td className="py-4 text-right">{formatCurrency(asset.totalInvested ?? asset.investedValue)}</td>
                      <td className="py-4 text-right">{formatNullableCurrency(asset.currentValue)}</td>
                      <td className={`py-4 text-right ${metricClass(asset.unrealizedProfit ?? asset.profit)}`}>{formatNullableCurrency(asset.unrealizedProfit ?? asset.profit)}</td>
                      <td className={`py-4 text-right ${metricClass(asset.profitabilityPercent ?? asset.returnPercentage)}`}>
                        {formatNullablePercentage(asset.profitabilityPercent ?? asset.returnPercentage)}
                      </td>
                      <td className="py-4 text-right">{formatPercentage(asset.dividendYield)}</td>
                      <td className="py-4 text-right">{formatPercentage(asset.yieldOnCost ?? 0)}</td>
                      <td className="py-4 text-right">{formatCurrency(asset.dividendsReceived)}</td>
                      <td className="py-4 text-right">{formatPercentage(asset.weightPercent ?? asset.portfolioWeight)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>

        <aside className="min-w-0 space-y-4">
          <article className="min-w-0 rounded-lg border border-line bg-panel p-4">
            <p className="text-sm text-muted">Aporte recomendado</p>
            <h2 className="mt-2 break-words text-xl font-semibold text-ink">{recommendedCategory?.label ?? (portfolio.recommendation.category || "A definir")}</h2>
            <div className="mt-3 space-y-2 text-sm text-muted">
              <p>Atual: {formatPercentage(recommendedCategory?.currentPercent ?? 0)}</p>
              <p>Alvo: {formatPercentage(recommendedCategory?.targetPercent ?? 0)}</p>
              <p>Deficit: {formatCurrency(recommendedCategory?.amountNeeded ?? 0)}</p>
              <p className="break-words">Ativo sugerido: {suggestedAsset?.ticker ?? (suggestedTicker ? "Sem preco valido" : "Cadastre uma posicao elegivel")}</p>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">{portfolio.recommendation.reason}</p>
            <p className="mt-2 text-xs text-muted">
              Ultima cotacao: {suggestedAsset?.lastPriceAt ? new Date(suggestedAsset.lastPriceAt).toLocaleString("pt-BR") : "indisponivel"}
            </p>
          </article>
          <article className="min-w-0 rounded-lg border border-line bg-panel p-4">
            <h2 className="text-base font-semibold text-ink">Carteira ideal x atual</h2>
            <div className="mt-4">
              <PieChart data={allocationChartData} height={220} />
            </div>
            <div className="mt-4 space-y-4">
              {portfolio.allocationComparison.map((item) => (
                <div key={item.category}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-sm">
                    <span className="break-words text-muted">{item.category}</span>
                    <span className="shrink-0 text-ink">
                      {formatPercentage(item.currentPercentage)} / {formatPercentage(item.targetPercentage)}
                    </span>
                  </div>
                  <ProgressBar value={item.currentPercentage} tone={item.status === "balanced" ? "green" : item.difference > 0 ? "amber" : "blue"} />
                </div>
              ))}
            </div>
          </article>
        </aside>
      </section>
    </div>
  );
}
