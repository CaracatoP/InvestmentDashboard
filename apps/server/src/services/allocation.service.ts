import type { AllocationRecord } from "../types/investment";

export interface AllocationValueInput {
  categoryId: string;
  label?: string;
  value: number;
  assetId?: string;
  ticker?: string;
  cashBoxId?: string;
}

export interface AllocationCategorySummary {
  categoryId: string;
  label: string;
  currentValue: number;
  currentPercent: number;
  targetPercent: number;
  idealValue: number;
  differenceValue: number;
  differencePercent: number;
  amountNeeded: number;
  status: "deficit" | "excess" | "balanced";
}

export interface AllocationSummary {
  totalEquity: number;
  categories: AllocationCategorySummary[];
  recommendation: {
    categoryId: string;
    label: string;
    assetId?: string;
    ticker?: string;
    cashBoxId?: string;
    amountNeeded: number;
    percentageDeficit: number;
    reason: string;
  };
  largestDeficit: AllocationCategorySummary | null;
  largestExcess: AllocationCategorySummary | null;
  targetTotalPercent: number;
}

const categoryLabels: Record<string, string> = {
  FII: "FIIs",
  ACAO: "Acoes Brasileiras",
  ETF: "ETFs",
  CRIPTO: "Bitcoin",
  RENDA_FIXA: "Renda Fixa",
  cash: "Caixinha"
};

export function getAllocationCategoryLabel(categoryId: string) {
  return categoryLabels[normalizeAllocationCategory(categoryId)] ?? categoryId;
}

export function normalizeAllocationCategory(category: string) {
  const normalized = category
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  if (["CASH", "CAIXINHA", "CAIXINHAS", "RESERVA", "NUBANK"].includes(normalized)) return "cash";

  return (
    Object.entries(categoryLabels).find(
      ([key, label]) =>
        key.toUpperCase() === normalized ||
        label
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toUpperCase() === normalized
    )?.[0] ?? normalized
  );
}

export function buildAllocationSummary(values: AllocationValueInput[], allocations: AllocationRecord[]): AllocationSummary {
  const valuesByCategory = new Map<string, number>();
  const firstItemByCategory = new Map<string, AllocationValueInput>();
  const categories = new Set<string>();

  for (const allocation of allocations) categories.add(normalizeAllocationCategory(allocation.category));

  for (const item of values) {
    const categoryId = normalizeAllocationCategory(item.categoryId);
    categories.add(categoryId);
    valuesByCategory.set(categoryId, (valuesByCategory.get(categoryId) ?? 0) + Math.max(item.value, 0));
    if (!firstItemByCategory.has(categoryId)) firstItemByCategory.set(categoryId, item);
  }

  const targetByCategory = new Map(allocations.map((allocation) => [normalizeAllocationCategory(allocation.category), allocation.targetPercentage]));
  const priorityByCategory = new Map(allocations.map((allocation) => [normalizeAllocationCategory(allocation.category), allocation.priority]));
  const totalEquity = [...valuesByCategory.values()].reduce((total, value) => total + value, 0);
  const targetTotalPercent = [...targetByCategory.values()].reduce((total, value) => total + value, 0);

  const summaries = [...categories]
    .sort((left, right) => (priorityByCategory.get(left) ?? 999) - (priorityByCategory.get(right) ?? 999) || getAllocationCategoryLabel(left).localeCompare(getAllocationCategoryLabel(right)))
    .map((categoryId) => {
      const currentValue = valuesByCategory.get(categoryId) ?? 0;
      const targetPercent = targetByCategory.get(categoryId) ?? 0;
      const currentPercent = totalEquity > 0 ? (currentValue / totalEquity) * 100 : 0;
      const idealValue = totalEquity * (targetPercent / 100);
      const differenceValue = idealValue - currentValue;
      const differencePercent = targetPercent - currentPercent;
      const targetRatio = targetPercent / 100;
      const amountNeeded =
        differenceValue > 0
          ? targetRatio > 0 && targetRatio < 1
            ? Math.max((targetRatio * totalEquity - currentValue) / (1 - targetRatio), 0)
            : differenceValue
          : 0;
      const status: AllocationCategorySummary["status"] =
        Math.abs(differenceValue) < 0.01 || Math.abs(differencePercent) < 0.1 ? "balanced" : differenceValue > 0 ? "deficit" : "excess";

      return {
        categoryId,
        label: getAllocationCategoryLabel(categoryId),
        currentValue,
        currentPercent,
        targetPercent,
        idealValue,
        differenceValue,
        differencePercent,
        amountNeeded,
        status
      };
    });

  const largestDeficit = summaries
    .filter((category) => category.status === "deficit" && category.targetPercent > 0)
    .sort((left, right) => right.differenceValue - left.differenceValue)[0] ?? null;
  const largestExcess = summaries
    .filter((category) => category.status === "excess")
    .sort((left, right) => left.differenceValue - right.differenceValue)[0] ?? null;
  const recommendationItem = largestDeficit ? firstItemByCategory.get(largestDeficit.categoryId) : undefined;

  return {
    totalEquity,
    categories: summaries,
    recommendation: largestDeficit
      ? {
          categoryId: largestDeficit.categoryId,
          label: largestDeficit.label,
          assetId: recommendationItem?.assetId,
          ticker: recommendationItem?.ticker,
          cashBoxId: recommendationItem?.cashBoxId,
          amountNeeded: largestDeficit.amountNeeded,
          percentageDeficit: Math.max(largestDeficit.differencePercent, 0),
          reason: `${largestDeficit.label} esta abaixo da distribuicao ideal em ${largestDeficit.differencePercent.toFixed(1)}%.`
        }
      : {
          categoryId: "",
          label: "",
          amountNeeded: 0,
          percentageDeficit: 0,
          reason: "Sua carteira esta proxima da alocacao ideal."
        },
    largestDeficit,
    largestExcess,
    targetTotalPercent
  };
}
