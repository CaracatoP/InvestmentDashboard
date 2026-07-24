import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Asset } from "../../types/investments";
import { formatCurrency, formatPercentage } from "../../utils/formatters";
import { ProgressBar } from "../ui/ProgressBar";
import { MoneyValue } from "../ui/ValueDisplay";

interface AssetCardProps {
  asset: Asset;
}

export function AssetCard({ asset }: AssetCardProps) {
  const currentValue = asset.currentValue !== null && asset.currentValue !== undefined ? formatCurrency(asset.currentValue) : "Indisponivel";

  return (
    <Link to={`/ativos/${asset.ticker}`} className="block min-w-0 rounded-lg border border-line bg-panel p-4 transition hover:border-accent/50 hover:bg-elevated">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{asset.ticker}</p>
          <p className="truncate text-sm text-muted">{asset.name}</p>
        </div>
        <ArrowUpRight size={17} className="shrink-0 text-muted" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-muted">Valor atual</p>
          <p className="min-w-0 font-medium text-ink">
            <MoneyValue value={currentValue} />
          </p>
        </div>
        <div>
          <p className="text-muted">Peso</p>
          <p className="font-medium text-ink">{formatPercentage(asset.portfolioWeight)}</p>
        </div>
      </div>
      <div className="mt-4">
        <ProgressBar value={asset.objectiveQuantity > 0 ? (asset.quantity / asset.objectiveQuantity) * 100 : 0} />
      </div>
    </Link>
  );
}
