import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AreaChart } from "../components/charts/AreaChart";
import { DividendCard } from "../components/cards/DividendCard";
import { OperationCard } from "../components/cards/OperationCard";
import { ChartCard } from "../components/ui/ChartCard";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { fetchAsset } from "../services/api";
import type { AssetDetails } from "../types/investments";
import { formatCurrency, formatPercentage } from "../utils/formatters";
import { BadgePercent, Coins, Layers3, TrendingUp, Wallet } from "lucide-react";

export function AssetPage() {
  const { ticker = "" } = useParams();
  const [asset, setAsset] = useState<AssetDetails | null>(null);
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

  return (
    <div>
      <PageHeader eyebrow={asset.category} title={`${asset.ticker} - ${asset.name}`} description="Resumo operacional, dividendos, preco e objetivo do ativo." />
      <p className="mb-4 text-xs text-muted">
        Ultima cotacao: {asset.lastPriceAt ? new Date(asset.lastPriceAt).toLocaleString("pt-BR") : "indisponivel"}
        {asset.priceSource ? ` via ${asset.priceSource}` : ""}
      </p>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Preco medio" value={formatCurrency(asset.averagePrice)} detail={`${asset.quantity} unidades`} icon={<TrendingUp size={18} />} tone="blue" />
        <StatCard label="Preco atual" value={currentPrice} detail={currentValue} icon={<Wallet size={18} />} />
        <StatCard label="Lucro" value={profit !== null && profit !== undefined ? formatCurrency(profit) : "Indisponivel"} detail={profitability !== null && profitability !== undefined ? formatPercentage(profitability) : "Indisponivel"} icon={<BadgePercent size={18} />} tone="violet" />
        <StatCard label="Rentabilidade" value={profitability !== null && profitability !== undefined ? formatPercentage(profitability) : "Indisponivel"} detail={`${formatPercentage(asset.weightPercent ?? asset.portfolioWeight)} da carteira`} icon={<BadgePercent size={18} />} tone="amber" />
        <StatCard label="Dividendos recebidos" value={formatCurrency(asset.dividendsReceived)} detail={formatPercentage(asset.dividendYield)} icon={<Coins size={18} />} />
        <StatCard label="Quantidade" value={String(asset.quantity)} detail="Posicao atual" icon={<Layers3 size={18} />} tone="blue" />
        <StatCard label="Valor investido" value={formatCurrency(asset.totalInvested ?? asset.investedValue)} detail="Calculado por operacoes" icon={<Wallet size={18} />} tone="violet" />
        <StatCard label="Valor atual" value={currentValue} detail="Quantidade x preco atual" icon={<TrendingUp size={18} />} />
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <ChartCard title="Grafico de preco">
          <AreaChart data={asset.priceHistory} dataKey="price" name="Preco" color="#38bdf8" />
        </ChartCard>
        <ChartCard title="Historico de dividendos">
          <div className="space-y-3">
            {asset.dividends.map((dividend) => (
              <DividendCard key={`${dividend.assetTicker}-${dividend.date}`} ticker={dividend.assetTicker} amount={dividend.amount} date={dividend.date} />
            ))}
          </div>
        </ChartCard>
      </section>

      <section className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
