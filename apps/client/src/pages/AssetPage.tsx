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

  useEffect(() => {
    let isMounted = true;

    async function loadAsset() {
      setIsLoading(true);
      const data = await fetchAsset(ticker);

      if (isMounted) {
        setAsset(data);
        setIsLoading(false);
      }
    }

    void loadAsset();

    return () => {
      isMounted = false;
    };
  }, [ticker]);

  if (isLoading || !asset) {
    return <div className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">Carregando ativo...</div>;
  }

  return (
    <div>
      <PageHeader eyebrow={asset.category} title={`${asset.ticker} - ${asset.name}`} description="Resumo operacional, dividendos, preco e objetivo do ativo." />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Preco medio" value={formatCurrency(asset.averagePrice)} detail={`${asset.quantity} unidades`} icon={<TrendingUp size={18} />} tone="blue" />
        <StatCard label="Preco atual" value={formatCurrency(asset.currentPrice)} detail={formatCurrency(asset.currentValue)} icon={<Wallet size={18} />} />
        <StatCard label="Lucro" value={formatCurrency(asset.profit)} detail={formatPercentage(asset.returnPercentage)} icon={<BadgePercent size={18} />} tone="violet" />
        <StatCard label="Rentabilidade" value={formatPercentage(asset.returnPercentage)} detail={`${formatPercentage(asset.portfolioWeight)} da carteira`} icon={<BadgePercent size={18} />} tone="amber" />
        <StatCard label="Dividendos recebidos" value={formatCurrency(asset.dividendsReceived)} detail={formatPercentage(asset.dividendYield)} icon={<Coins size={18} />} />
        <StatCard label="Quantidade" value={String(asset.quantity)} detail="Posicao atual" icon={<Layers3 size={18} />} tone="blue" />
        <StatCard label="Valor investido" value={formatCurrency(asset.investedValue)} detail="Calculado por operacoes" icon={<Wallet size={18} />} tone="violet" />
        <StatCard label="Valor atual" value={formatCurrency(asset.currentValue)} detail="Quantidade x preco atual" icon={<TrendingUp size={18} />} />
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
