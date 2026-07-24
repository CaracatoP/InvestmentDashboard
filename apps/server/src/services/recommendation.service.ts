type AssetLike = {
  name: string;
  ticker: string;
  category: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  currentValue?: number;
  objectiveQuantity?: number;
};

type AllocationLike = {
  category: string;
  targetPercentage: number;
};

const categoryLabels: Record<string, string> = {
  FII: "FIIs",
  ACAO: "Acoes Brasileiras",
  ETF: "ETFs",
  CRIPTO: "Bitcoin",
  RENDA_FIXA: "Renda Fixa"
};

function normalizeCategory(category: string) {
  const normalized = category
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  return Object.entries(categoryLabels).find(
    ([key, label]) =>
      key === normalized ||
      label
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase() === normalized
  )?.[0] ?? normalized;
}

function categoryMatches(assetCategory: string, allocationCategory: string) {
  return normalizeCategory(assetCategory) === normalizeCategory(allocationCategory);
}

export function getContributionRecommendation(assets: AssetLike[], allocations: AllocationLike[]) {
  const totalCurrentValue = assets.reduce((total, asset) => total + (asset.currentValue ?? asset.quantity * asset.currentPrice), 0);

  const comparison = allocations.map((allocation) => {
    const categoryValue = assets
      .filter((asset) => categoryMatches(asset.category, allocation.category))
      .reduce((total, asset) => total + (asset.currentValue ?? asset.quantity * asset.currentPrice), 0);
    const targetRatio = allocation.targetPercentage / 100;
    const currentPercentage = totalCurrentValue > 0 ? (categoryValue / totalCurrentValue) * 100 : 0;
    const targetValue = totalCurrentValue * targetRatio;
    const missingValue =
      targetRatio > 0 && targetRatio < 1
        ? Math.max((targetRatio * totalCurrentValue - categoryValue) / (1 - targetRatio), 0)
        : Math.max(targetValue - categoryValue, 0);

    return {
      category: categoryLabels[allocation.category] ?? allocation.category,
      targetPercentage: allocation.targetPercentage,
      currentPercentage,
      difference: currentPercentage - allocation.targetPercentage,
      value: categoryValue,
      targetValue,
      missingValue
    };
  });

  const underAllocated = [...comparison]
    .filter((item) => item.targetPercentage > 0)
    .sort((a, b) => a.difference - b.difference)[0];

  const candidates = assets
    .filter((asset) => underAllocated && categoryMatches(asset.category, underAllocated.category))
    .map((asset) => {
      const remainingQuantity = Math.max((asset.objectiveQuantity ?? asset.quantity) - asset.quantity, 0);
      return {
        ...asset,
        remainingQuantity,
        currentValue: asset.currentValue ?? asset.quantity * asset.currentPrice,
        targetGapValue: remainingQuantity > 0 ? remainingQuantity * asset.currentPrice : underAllocated?.missingValue ?? 0
      };
    })
    .sort((a, b) => b.targetGapValue - a.targetGapValue || a.currentValue - b.currentValue);

  const asset = candidates[0] ?? assets[0];
  const difference = underAllocated ? Math.abs(underAllocated.difference) : 0;

  return {
    ticker: asset?.ticker ?? "",
    name: asset?.name ?? "",
    category: underAllocated?.category ?? asset?.category ?? "",
    reason:
      underAllocated && underAllocated.difference < 0
        ? `Voce esta ${difference.toFixed(1)}% abaixo do ideal em ${underAllocated.category}. Falta ${underAllocated.missingValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} para equilibrar.`
        : "Sua carteira esta proxima da alocacao ideal.",
    action: underAllocated
      ? `Proximo aporte recomendado: ${underAllocated.category}${asset?.ticker ? ` (${asset.ticker})` : ""}`
      : "Cadastre ativos para receber recomendacoes.",
    comparison
  };
}
