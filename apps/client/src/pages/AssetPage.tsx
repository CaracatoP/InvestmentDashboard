import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PriceHistoryChart } from "../components/charts/PriceHistoryChart";
import { DividendCard } from "../components/cards/DividendCard";
import { OperationCard } from "../components/cards/OperationCard";
import { ChartCard } from "../components/ui/ChartCard";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { fetchAsset, fetchAssetPriceHistory } from "../services/api";
import type { AssetDetails, AssetPriceHistoryResponse } from "../types/investments";
import { formatCurrency, formatPercentage } from "../utils/formatters";
import { BadgePercent, Coins, Layers3, TrendingUp, Wallet } from "lucide-react";

const priceRanges = [
  { label: "1M", value: "1mo" },
  { label: "3M", value: "3mo" },
  { label: "6M", value: "6mo" },
  { label: "1A", value: "1y" },
  { label: "5A", value: "5y" },
  { label: "Max.", value: "max" }
];

function getHistoryStateMessage(history: AssetPriceHistoryResponse | null, error: string) {
  if (error) return error;
  if (!history) return "";
  if (history.status === "unsupported") return "Historico de mercado nao suportado para este ativo.";
  if (history.status === "unavailable") return history.message || "Historico indisponivel para este periodo.";
  if (history.status === "error") return history.message || "Erro ao consultar historico na BRAPI.";
  if (history.points.length === 0) return "Sem dados historicos para este periodo.";
  return "";
}

export function AssetPage() {
  const { ticker = "" } = useParams();
  const [asset, setAsset] = useState<AssetDetails | null>(null);
  const [selectedRange, setSelectedRange] = useState("1y");
  const [priceHistory, setPriceHistory] = useState<AssetPriceHistoryResponse | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadAsset() {
      setIsLoading(true);
      setError("");

      try {
        const data = await fetchAsset(ticker);

        if (isMounted) {
          setAsset(data);
          setIsLoading(false);
        }
      } catch {
        if (isMounted) {
          setAsset(null);
          setError("Nao foi possivel carregar este ativo.");
          setIsLoading(false);
        }
      }
    }

    void loadAsset();

    return () => {
      isMounted = false;
    };
  }, [ticker]);

  useEffect(() => {
    if (!ticker) return;

    const controller = new AbortController();
    setIsHistoryLoading(true);
    setHistoryError("");

    void fetchAssetPriceHistory(ticker, selectedRange, controller.signal)
      .then((history) => {
        setPriceHistory(history);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setHistoryError(error instanceof Error ? error.message : "Nao foi possivel carregar o historico de precos.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsHistoryLoading(false);
      });

    return () => controller.abort();
  }, [selectedRange, ticker]);

  if (isLoading) {
    return <div className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">Carregando ativo...</div>;
  }

  if (!asset) {
    return <div className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">{error || "Ativo nao encontrado."}</div>;
  }

  const numericCurrentPrice = asset.currentPrice;
  const hasCurrentPrice = typeof numericCurrentPrice === "number" && Number.isFinite(numericCurrentPrice) && numericCurrentPrice > 0;
  const currentPrice = hasCurrentPrice ? formatCurrency(numericCurrentPrice) : "Indisponivel";
  const currentValue = asset.currentValue !== null && asset.currentValue !== undefined ? formatCurrency(asset.currentValue) : "Indisponivel";
  const profit = asset.unrealizedProfit ?? asset.profit;
  const profitability = asset.profitabilityPercent ?? asset.returnPercentage;
  const historyMessage = getHistoryStateMessage(priceHistory, historyError);
  const hasHistoricalPrices = (priceHistory?.points.length ?? 0) > 0;

  return (
    <div>
      <PageHeader eyebrow={asset.category} title={`${asset.ticker} - ${asset.name}`} description="Resumo operacional, dividendos, preco e objetivo do ativo." />
      <p className="mb-4 text-xs text-muted">
        Ultima cotacao: {asset.lastPriceAt ? new Date(asset.lastPriceAt).toLocaleString("pt-BR") : "indisponivel"}
        {asset.priceSource ? ` via ${asset.priceSource}` : ""}
      </p>

      <section className="stat-card-grid">
        <StatCard label="Preco medio" value={formatCurrency(asset.averagePrice)} detail={`${asset.quantity} unidades`} icon={<TrendingUp size={18} />} tone="blue" />
        <StatCard label="Preco atual" value={currentPrice} detail={currentValue} icon={<Wallet size={18} />} />
        <StatCard label="Lucro" value={profit !== null && profit !== undefined ? formatCurrency(profit) : "Indisponivel"} detail={profitability !== null && profitability !== undefined ? formatPercentage(profitability) : "Indisponivel"} icon={<BadgePercent size={18} />} tone="violet" />
        <StatCard label="Rentabilidade" value={profitability !== null && profitability !== undefined ? formatPercentage(profitability) : "Indisponivel"} detail={`${formatPercentage(asset.weightPercent ?? asset.portfolioWeight)} da carteira`} icon={<BadgePercent size={18} />} tone="amber" />
        <StatCard label="Dividendos recebidos" value={formatCurrency(asset.dividendsReceived)} detail={formatPercentage(asset.dividendYield)} icon={<Coins size={18} />} />
        <StatCard label="Quantidade" value={String(asset.quantity)} detail="Posicao atual" icon={<Layers3 size={18} />} tone="blue" />
        <StatCard label="Valor investido" value={formatCurrency(asset.totalInvested ?? asset.investedValue)} detail="Calculado por operacoes" icon={<Wallet size={18} />} tone="violet" />
        <StatCard label="Valor atual" value={currentValue} detail="Quantidade x preco atual" icon={<TrendingUp size={18} />} />
      </section>

      <section className="mt-6 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <ChartCard title="Grafico de preco">
          <div className="mb-3 flex flex-wrap gap-2">
            {priceRanges.map((range) => (
              <button
                key={range.value}
                type="button"
                onClick={() => setSelectedRange(range.value)}
                className={[
                  "min-h-11 rounded-lg border px-3 text-xs font-medium transition",
                  selectedRange === range.value ? "border-aqua bg-aqua/10 text-aqua" : "border-line bg-elevated text-muted hover:border-aqua/50 hover:text-ink"
                ].join(" ")}
              >
                {range.label}
              </button>
            ))}
          </div>

          <div className="mb-3 min-h-5 text-xs text-muted">
            {isHistoryLoading ? <span>Carregando historico...</span> : null}
            {!isHistoryLoading && priceHistory?.status === "cached" ? <span>Usando historico em cache.</span> : null}
            {!isHistoryLoading && priceHistory?.status === "stale" ? <span>Usando historico em cache porque a BRAPI nao respondeu agora.</span> : null}
            {!isHistoryLoading && priceHistory?.status === "updated" ? (
              <span>Historico atualizado pela {priceHistory.source.toUpperCase()}.</span>
            ) : null}
          </div>

          {hasHistoricalPrices ? (
            <PriceHistoryChart data={priceHistory?.points ?? []} range={priceHistory?.range ?? selectedRange} />
          ) : (
            <div className="rounded-lg border border-line bg-elevated p-6 text-sm text-muted">
              {historyMessage || "Carregando historico de precos..."}
            </div>
          )}
        </ChartCard>
        <ChartCard title="Historico de dividendos">
          <div className="space-y-3">
            {asset.dividends.map((dividend) => (
              <DividendCard key={`${dividend.assetTicker}-${dividend.date}`} ticker={dividend.assetTicker} amount={dividend.amount} date={dividend.date} />
            ))}
          </div>
        </ChartCard>
      </section>

      <section className="mt-4 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {asset.operations.map((operation) => (
          <OperationCard
            key={`${operation.assetTicker}-${operation.date}`}
            type={operation.type}
            ticker={operation.assetTicker}
            date={operation.date}
            amount={operation.total}
            description={operation.notes}
          />
        ))}
      </section>
    </div>
  );
}

