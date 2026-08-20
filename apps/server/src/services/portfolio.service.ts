import {
  createContribution,
  createGoal,
  getSettingsRecord,
  listAllocations,
  listAssets,
  listCashBoxes,
  listCdiRates,
  listContributions,
  listDividends,
  listGoals,
  listMarketQuotes,
  listOperations,
  listPriceHistory,
  replaceAllocations,
  updateSettingsRecord
} from "../repositories/investment.repository";
import { getAuthContext } from "../auth/auth-context";
import { updateUserProfile } from "./auth.service";
import { listAllMonthlyExpenses, listAllMonthlyIncomeEntries, listMonthlyPlans } from "../repositories/monthly-planning.repository";
import type {
  AssetRecord,
  CashBoxRecord,
  ContributionRecord,
  DividendRecord,
  GoalRecord,
  MarketQuoteRecord,
  MonthlyExpenseRecord,
  MonthlyIncomeEntryRecord,
  MonthlyPlanRecord,
  OperationRecord,
  PriceHistoryRecord
} from "../types/investment";
import { buildAllocationSummary, type AllocationSummary } from "./allocation.service";
import { calculateCashBoxTotals, getCashBoxMovementLabel, isCashBoxContribution, isCashBoxWithdrawal, isCashBoxYield, toCashBoxContributionType } from "./cash-box.service";
import { calculateProjection } from "./projection.service";
import { buildAssetMarketKey, buildStoredMarketDataKey, normalizeTicker } from "./ticker.service";

const monthLabels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const categoryLabels: Record<string, string> = {
  FII: "FIIs",
  ACAO: "Acoes Brasileiras",
  ETF: "ETFs",
  CRIPTO: "Criptomoedas",
  RENDA_FIXA: "Renda Fixa",
  cash: "Caixinha"
};

const categoryColors: Record<string, string> = {
  FIIs: "#22c55e",
  "Acoes Brasileiras": "#38bdf8",
  ETFs: "#a78bfa",
  Criptomoedas: "#f59e0b",
  "Renda Fixa": "#fb7185",
  Caixinha: "#14b8a6"
};

function dateFrom(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

function monthKey(value: string | Date) {
  return dateFrom(value).toISOString().slice(0, 7);
}

function monthName(value: string | Date) {
  return monthLabels[dateFrom(value).getUTCMonth()];
}

function yearKey(value: string | Date) {
  return dateFrom(value).getUTCFullYear().toString();
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function safeNumber(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function sumDatedAmountByPeriod(items: Array<{ date: string | Date; amount: number }>, period: string) {
  return sum(items.filter((item) => monthKey(item.date).startsWith(period)).map((item) => item.amount));
}

function dateIsBeforeOrSameMonth(value: string | Date, key: string) {
  return monthKey(value) <= key;
}

function groupDatedAmounts(items: Array<{ date: string | Date; amount: number }>) {
  const grouped = new Map<string, number>();

  for (const item of items) {
    const key = monthKey(item.date);
    grouped.set(key, (grouped.get(key) ?? 0) + item.amount);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({
      month: monthLabels[Number(key.slice(5, 7)) - 1],
      value
    }));
}

function groupDatedAmountsByYear(items: Array<{ date: string | Date; amount: number }>) {
  const grouped = new Map<string, number>();

  for (const item of items) {
    const key = yearKey(item.date);
    grouped.set(key, (grouped.get(key) ?? 0) + item.amount);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([year, value]) => ({ year, value }));
}

function normalizeContribution(contribution: ContributionRecord) {
  return {
    date: contribution.date,
    amount: contribution.value,
    category: "Aporte",
    notes: contribution.description ?? ""
  };
}

function normalizeDividend(dividend: DividendRecord) {
  const amountPerShare = dividend.amountPerShare ?? dividend.valuePerShare;
  const amount = dividend.netAmount ?? dividend.totalValue;

  return {
    id: dividend.id,
    assetId: dividend.assetId,
    assetTicker: dividend.assetTicker ?? "",
    category: dividend.category ?? "",
    type: dividend.type ?? "dividendo",
    date: dividend.paymentDate,
    paymentDate: dividend.paymentDate,
    receivedAt: dividend.receivedAt ?? null,
    amount,
    amountPerShare,
    shares: dividend.quantityEligible ?? (amountPerShare > 0 ? Math.round(amount / amountPerShare) : 0),
    status: dividend.status ?? "received",
    source: dividend.source ?? "manual",
    notes: dividend.notes ?? ""
  };
}

function isReceivedDividend(dividend: DividendRecord) {
  return (dividend.status ?? "received") === "received";
}

function dividendAmount(dividend: DividendRecord) {
  return dividend.netAmount ?? dividend.totalValue;
}

function assetMatchesOperation(asset: AssetRecord, operation: OperationRecord) {
  return normalizeTicker(operation.assetTicker ?? "") === normalizeTicker(asset.ticker) || String(operation.assetId ?? "") === String(asset.id ?? "");
}

function assetMatchesDividend(asset: AssetRecord, dividend: DividendRecord) {
  return normalizeTicker(dividend.assetTicker ?? "") === normalizeTicker(asset.ticker) || String(dividend.assetId ?? "") === String(asset.id ?? "");
}

function hasValidPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function marketDataKey(input: { assetKey?: string; ticker: string; market?: string; providerSymbol?: string }) {
  return input.assetKey?.trim() || buildStoredMarketDataKey(input);
}

function quoteHasValidPrice(quote?: MarketQuoteRecord) {
  return Boolean(quote && hasValidPrice(quote.price) && ["success", "updated", "stale"].includes(quote.status));
}

export function resolveCurrentPrice(asset: AssetRecord, quote?: MarketQuoteRecord, priceHistory: PriceHistoryRecord[] = []) {
  if (quoteHasValidPrice(quote)) {
    return {
      currentPrice: Number(quote?.price),
      lastPriceAt: quote?.quotedAt ?? null,
      priceSource: quote?.source ?? "MarketQuote",
      priceStatus: quote?.status === "success" ? "updated" : quote?.status
    };
  }

  const latestHistory = [...priceHistory]
    .filter((item) => normalizeTicker(item.ticker) === normalizeTicker(asset.ticker) && hasValidPrice(item.price))
    .sort((left, right) => dateFrom(right.capturedAt).getTime() - dateFrom(left.capturedAt).getTime())[0];

  if (latestHistory) {
    return {
      currentPrice: latestHistory.price,
      lastPriceAt: latestHistory.capturedAt,
      priceSource: latestHistory.source,
      priceStatus: "stale"
    };
  }

  if (hasValidPrice(asset.lastPrice)) {
    return {
      currentPrice: asset.lastPrice,
      lastPriceAt: asset.lastPriceAt ?? null,
      priceSource: asset.priceSource ?? "asset",
      priceStatus: asset.priceStatus ?? "stale"
    };
  }

  return {
    currentPrice: null,
    lastPriceAt: null,
    priceSource: quote?.source ?? asset.priceSource ?? "",
    priceStatus: quote?.status ?? "unavailable"
  };
}

function calculateAssetPosition(
  asset: AssetRecord,
  operations: OperationRecord[],
  dividends: DividendRecord[],
  portfolioValue: number,
  quote?: MarketQuoteRecord,
  priceHistory: PriceHistoryRecord[] = []
) {
  const assetOperations = operations.filter((operation) => assetMatchesOperation(asset, operation));
  const assetDividends = dividends.filter((dividend) => assetMatchesDividend(asset, dividend));
  let quantity = 0;
  let investedValue = 0;

  for (const operation of assetOperations.sort((left, right) => dateFrom(left.date).getTime() - dateFrom(right.date).getTime())) {
    if (operation.type === "COMPRA" || operation.type === "BONIFICACAO") {
      quantity += operation.quantity;
      investedValue += operation.type === "COMPRA" ? operation.totalValue + operation.fees : 0;
    }

    if (operation.type === "VENDA") {
      const averagePrice = quantity > 0 ? investedValue / quantity : 0;
      quantity = Math.max(quantity - operation.quantity, 0);
      investedValue = Math.max(investedValue - averagePrice * operation.quantity, 0);
    }

    if (operation.type === "DESDOBRAMENTO" && operation.quantity > 0) {
      quantity *= operation.quantity;
    }

    if (operation.type === "GRUPAMENTO" && operation.quantity > 0) {
      quantity /= operation.quantity;
    }
  }

  const price = resolveCurrentPrice(asset, quote, priceHistory);
  const currentPrice = price.currentPrice;
  const hasPosition = quantity > 0;
  const currentValue = hasValidPrice(currentPrice) ? quantity * currentPrice : null;
  const receivedDividends = assetDividends.filter(isReceivedDividend);
  const dividendsReceived = sum(receivedDividends.map(dividendAmount));
  const averagePrice = quantity > 0 ? investedValue / quantity : 0;
  const profit = currentValue !== null ? currentValue - investedValue : null;
  const dividendYield = currentValue && currentValue > 0 ? (dividendsReceived / currentValue) * 100 : 0;
  const yieldOnCost = investedValue > 0 ? (dividendsReceived / investedValue) * 100 : 0;
  const returnPercentage = profit !== null && investedValue > 0 ? (profit / investedValue) * 100 : null;

  return {
    assetId: asset.id,
    name: asset.name,
    ticker: normalizeTicker(asset.ticker),
    coingeckoId: asset.coingeckoId,
    categoryId: asset.category,
    categoryLabel: categoryLabels[asset.category] ?? asset.category,
    category: categoryLabels[asset.category] ?? asset.category,
    quantity,
    averagePrice,
    currentPrice,
    lastPriceAt: price.lastPriceAt,
    priceSource: price.priceSource,
    priceStatus: price.priceStatus,
    dividendYield,
    yieldOnCost,
    dividendsReceived,
    objectiveQuantity: quantity,
    currency: asset.currency,
    totalInvested: investedValue,
    investedValue,
    unrealizedProfit: profit,
    currentValue,
    profit,
    profitabilityPercent: returnPercentage,
    returnPercentage,
    weightPercent: portfolioValue > 0 && currentValue !== null ? (currentValue / portfolioValue) * 100 : 0,
    portfolioWeight: portfolioValue > 0 && currentValue !== null ? (currentValue / portfolioValue) * 100 : 0,
    hasPosition
  };
}

interface PortfolioCalculationInputs {
  assets: AssetRecord[];
  operations: OperationRecord[];
  dividends: DividendRecord[];
  quotes: MarketQuoteRecord[];
  priceHistory: PriceHistoryRecord[];
}

async function loadPortfolioCalculationInputs(): Promise<PortfolioCalculationInputs> {
  const [assets, operations, dividends, quotes, priceHistory] = await Promise.all([
    listAssets(),
    listOperations(),
    listDividends(),
    listMarketQuotes(),
    listPriceHistory()
  ]);
  return { assets, operations, dividends, quotes, priceHistory };
}

function calculatePortfolioFromInputs(inputs: PortfolioCalculationInputs) {
  const quoteByTicker = new Map(inputs.quotes.map((quote) => [marketDataKey({ ...quote, ticker: quote.ticker }), quote]));
  const quoteByLegacyTicker = new Map(inputs.quotes.map((quote) => [normalizeTicker(quote.ticker), quote]));
  const historyByTicker = new Map<string, PriceHistoryRecord[]>();
  const historyByLegacyTicker = new Map<string, PriceHistoryRecord[]>();
  for (const history of inputs.priceHistory) {
    const key = marketDataKey({ ...history, ticker: history.ticker });
    historyByTicker.set(key, [...(historyByTicker.get(key) ?? []), history]);
    const legacyTicker = normalizeTicker(history.ticker);
    historyByLegacyTicker.set(legacyTicker, [...(historyByLegacyTicker.get(legacyTicker) ?? []), history]);
  }

  const preliminary = inputs.assets.map((asset) =>
    calculateAssetPosition(
      asset,
      inputs.operations,
      inputs.dividends,
      0,
      quoteByTicker.get(buildAssetMarketKey(asset)) ?? quoteByLegacyTicker.get(normalizeTicker(asset.ticker)),
      historyByTicker.get(buildAssetMarketKey(asset)) ?? historyByLegacyTicker.get(normalizeTicker(asset.ticker)) ?? []
    )
  );
  const assetsValue = sum(preliminary.filter((asset) => asset.hasPosition).map((asset) => safeNumber(asset.currentValue)));
  return inputs.assets.map((asset) =>
    calculateAssetPosition(
      asset,
      inputs.operations,
      inputs.dividends,
      assetsValue,
      quoteByTicker.get(buildAssetMarketKey(asset)) ?? quoteByLegacyTicker.get(normalizeTicker(asset.ticker)),
      historyByTicker.get(buildAssetMarketKey(asset)) ?? historyByLegacyTicker.get(normalizeTicker(asset.ticker)) ?? []
    )
  );
}

async function getCalculatedPortfolio(inputs?: PortfolioCalculationInputs) {
  return calculatePortfolioFromInputs(inputs ?? (await loadPortfolioCalculationInputs()));
}

function buildAllocationValues(portfolioAssets: Awaited<ReturnType<typeof getCalculatedPortfolio>>, cashBoxes: CashBoxRecord[]) {
  return [
    ...portfolioAssets
      .filter((asset) => asset.hasPosition && asset.currentValue !== null && hasValidPrice(asset.currentPrice))
      .map((asset) => ({
        categoryId: asset.categoryId,
        label: asset.category,
        value: safeNumber(asset.currentValue),
        ticker: asset.ticker,
        assetId: asset.assetId
      })),
    ...cashBoxes.map((cashBox) => ({
      categoryId: cashBox.categoryId ?? "cash",
      label: "Caixinha",
      value: calculateCashBoxTotals(cashBox).currentBalance,
      cashBoxId: cashBox.id
    }))
  ];
}

function toLegacyComparison(summary: AllocationSummary) {
  return summary.categories.map((category) => ({
    category: category.label,
    categoryId: category.categoryId,
    targetPercentage: category.targetPercent,
    currentPercentage: category.currentPercent,
    difference: category.currentPercent - category.targetPercent,
    differenceValue: category.differenceValue,
    differencePercent: category.differencePercent,
    status: category.status,
    value: category.currentValue,
    targetValue: category.idealValue,
    missingValue: category.amountNeeded,
    color: categoryColors[category.label] ?? "#14b8a6"
  }));
}

function toLegacyRecommendation(summary: AllocationSummary) {
  const comparison = toLegacyComparison(summary);
  const recommended = summary.recommendation;
  const target = summary.largestDeficit;

  return {
    ticker: recommended.ticker ?? (recommended.cashBoxId ? "Caixinha" : ""),
    name: recommended.ticker ?? recommended.label,
    category: recommended.label,
    reason: target
      ? `${recommended.reason} Falta ${recommended.amountNeeded.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} para aproximar do alvo.`
      : recommended.reason,
    action: target
      ? `Proximo aporte recomendado: ${recommended.label}${recommended.ticker ? ` (${recommended.ticker})` : ""}`
      : "Sua carteira esta proxima da alocacao ideal.",
    comparison,
    allocation: summary
  };
}

function getOperationTypeLabel(type: string) {
  const labels: Record<string, string> = {
    COMPRA: "Compra",
    VENDA: "Venda",
    BONIFICACAO: "Bonificacao",
    DESDOBRAMENTO: "Desdobramento",
    GRUPAMENTO: "Grupamento"
  };

  return labels[type] ?? type;
}

function isPlanningLinkedPurchase(operation: OperationRecord) {
  return operation.origin === "monthly-planning" && operation.type === "COMPRA";
}

function getCashBoxMovementTypeLabel(type: string) {
  return getCashBoxMovementLabel(type);
}

function getCashBoxMovementDescription(type: string, description?: string) {
  if (description) return description;
  const normalizedType = toCashBoxContributionType(type);
  if (normalizedType === "contribution") return "Deposito na reserva Nubank";
  if (normalizedType === "withdrawal") return "Resgate da reserva Nubank";
  if (normalizedType === "yield") return "Rendimento da reserva Nubank";
  return "Movimentacao da reserva Nubank";
}

type MovementStatus = "completed" | "planned" | "cancelled";

type TimelineSourceType =
  | "operation"
  | "dividend"
  | "contribution"
  | "cashbox-movement"
  | "monthly-expense"
  | "monthly-income-entry"
  | "monthly-goal";

export interface TimelineMovement {
  id: string;
  date: string | Date;
  type: string;
  title: string;
  description: string;
  amount: number;
  eventType?: string;
  assetTicker?: string;
  assetCategory?: string;
  sector?: string;
  status?: MovementStatus;
  statusLabel?: string;
  paymentMethod?: string;
  source?: string;
  sourceType?: TimelineSourceType;
  sourceId?: string;
  seriesId?: string | null;
  occurrenceId?: string | null;
  occurrenceDate?: string | null;
  completedAt?: string | null;
  canonicalId?: string;
  day?: number;
}

interface BuildMovementsOptions {
  limit?: number;
  assets?: AssetRecord[];
  includePlannedDividends?: boolean;
  monthlyExpenses?: MonthlyExpenseRecord[];
  monthlyIncomeEntries?: MonthlyIncomeEntryRecord[];
  monthlyPlans?: MonthlyPlanRecord[];
  deduplicate?: boolean;
}

function dateKey(value: string | Date) {
  return dateFrom(value).toISOString().slice(0, 10);
}

function isFutureMovementDate(value: string | Date) {
  return dateKey(value) > dateKey(new Date());
}

function resolveMovementStatus(
  date: string | Date,
  rawStatus?: string,
  labels: { completed: string; planned: string } = { completed: "Realizado", planned: "Agendado" }
) {
  const normalizedStatus = rawStatus?.toLowerCase();

  if (normalizedStatus === "cancelled" || normalizedStatus === "cancelado") {
    return { status: "cancelled" as const, statusLabel: "Cancelado" };
  }

  if (normalizedStatus === "received" || normalizedStatus === "completed" || normalizedStatus === "realizado") {
    return { status: "completed" as const, statusLabel: labels.completed };
  }

  if (normalizedStatus === "expected" || normalizedStatus === "announced" || normalizedStatus === "planned" || normalizedStatus === "previsto") {
    return { status: "planned" as const, statusLabel: labels.planned };
  }

  return isFutureMovementDate(date)
    ? { status: "planned" as const, statusLabel: labels.planned }
    : { status: "completed" as const, statusLabel: labels.completed };
}

function getOperationEventType(type: string) {
  const eventTypes: Record<string, string> = {
    COMPRA: "compra",
    VENDA: "venda",
    BONIFICACAO: "outros",
    DESDOBRAMENTO: "outros",
    GRUPAMENTO: "outros"
  };

  return eventTypes[type] ?? "outros";
}

function getDividendEventType(type?: string) {
  return type?.toLowerCase() === "rendimento" ? "rendimento" : "dividendo";
}

function getCashBoxEventType(type: string) {
  const normalizedType = toCashBoxContributionType(type);
  if (normalizedType === "contribution") return "aporte";
  if (normalizedType === "withdrawal") return "resgate";
  if (normalizedType === "yield") return "rendimento";
  return "outros";
}

function buildAssetLookup(assets: AssetRecord[] = []) {
  const byTicker = new Map<string, AssetRecord>();
  const byId = new Map<string, AssetRecord>();

  for (const asset of assets) {
    byTicker.set(normalizeTicker(asset.ticker), asset);
    if (asset.id) byId.set(asset.id, asset);
  }

  return { byTicker, byId };
}

function resolveAssetMetadata(assetLookup: ReturnType<typeof buildAssetLookup>, ticker?: string, assetId?: string) {
  const asset = (ticker ? assetLookup.byTicker.get(normalizeTicker(ticker)) : undefined) ?? (assetId ? assetLookup.byId.get(assetId) : undefined);
  return {
    asset,
    assetTicker: ticker ?? asset?.ticker,
    assetCategory: asset?.category,
    sector: asset?.sector || asset?.subcategory || asset?.category
  };
}

function normalizePaymentMethod(paymentMethod?: string | null) {
  const value = paymentMethod?.trim();
  return value || "Nao informado";
}

function formatDateBr(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatDateTimeBr(value?: string | null) {
  if (!value) return null;
  const date = formatDateBr(value);
  const timeMatch = value.match(/T(\d{2}):(\d{2})/);
  return timeMatch ? `${date} as ${timeMatch[1]}:${timeMatch[2]}` : date;
}

function compactIdentityPart(value: string) {
  return value.trim().replace(/\s+/g, "-");
}

function fallbackSourceId(prefix: string, parts: Array<string | number | Date | null | undefined>) {
  return compactIdentityPart([prefix, ...parts.map((part) => String(part ?? "unknown"))].join(":"));
}

function buildCanonicalEventId(input: {
  sourceType: TimelineSourceType;
  sourceId?: string | null;
  eventType: string;
  occurrenceId?: string | null;
}) {
  return [input.sourceType, input.sourceId || "unknown", input.eventType, input.occurrenceId].filter(Boolean).map(String).map(compactIdentityPart).join(":");
}

function withCanonicalIdentity<T extends Omit<TimelineMovement, "id">>(
  movement: T,
  input: {
    sourceType: TimelineSourceType;
    sourceId?: string | null;
    eventType: string;
    occurrenceId?: string | null;
    seriesId?: string | null;
  }
): TimelineMovement {
  const sourceId = input.sourceId || input.occurrenceId || fallbackSourceId(input.sourceType, [movement.date, movement.title, movement.amount]);
  const canonicalId = buildCanonicalEventId({ ...input, sourceId });

  return {
    ...movement,
    id: canonicalId,
    eventType: input.eventType,
    sourceType: input.sourceType,
    sourceId,
    occurrenceId: input.occurrenceId ?? null,
    seriesId: input.seriesId ?? null,
    canonicalId
  };
}

function dedupeTimelineMovements(movements: TimelineMovement[]) {
  const seen = new Set<string>();
  const deduped: TimelineMovement[] = [];

  for (const movement of movements) {
    const key = movement.canonicalId ?? buildCanonicalEventId({
      sourceType: movement.sourceType ?? "monthly-expense",
      sourceId: movement.sourceId ?? movement.id,
      eventType: movement.eventType ?? movement.type,
      occurrenceId: movement.occurrenceId
    });
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(movement);
  }

  return deduped;
}

function sourceCounts(movements: TimelineMovement[]) {
  return movements.reduce<Record<string, number>>((counts, movement) => {
    const source = movement.sourceType ?? movement.source ?? "unknown";
    counts[source] = (counts[source] ?? 0) + 1;
    return counts;
  }, {});
}

function compareMovements(left: TimelineMovement, right: TimelineMovement) {
  const dateComparison = dateFrom(right.date).getTime() - dateFrom(left.date).getTime();
  if (dateComparison !== 0) return dateComparison;
  return (left.canonicalId ?? left.id).localeCompare(right.canonicalId ?? right.id);
}

export function buildMovements(
  operations: OperationRecord[],
  dividends: DividendRecord[],
  contributions: ContributionRecord[],
  cashBoxes: CashBoxRecord[] = [],
  options: BuildMovementsOptions = {}
) {
  // Fonte de verdade do Histórico: operações, dividendos/JCP, aportes, caixinhas, despesas mensais e objetivos são normalizados apenas aqui.
  const startedAt = Date.now();
  const assetLookup = buildAssetLookup(options.assets);
  const planById = new Map((options.monthlyPlans ?? []).map((plan) => [plan.id, plan]));

  const operationEvents: TimelineMovement[] = operations.map((operation) => {
    const metadata = resolveAssetMetadata(assetLookup, operation.assetTicker, operation.assetId);
    const eventType = getOperationEventType(operation.type);
    return withCanonicalIdentity({
      date: operation.date,
      type: getOperationTypeLabel(operation.type),
      title: metadata.assetTicker ?? operation.type,
      description:
        operation.quantity > 0
          ? `${operation.quantity} unidades a R$ ${Number(operation.price).toFixed(2)}${operation.notes ? ` - ${operation.notes}` : ""}`
          : (operation.notes ?? ""),
      amount: operation.totalValue,
      assetTicker: metadata.assetTicker,
      assetCategory: metadata.assetCategory,
      sector: metadata.sector,
      paymentMethod: "Corretora",
      source: "operations",
      ...resolveMovementStatus(operation.date)
    }, {
      sourceType: "operation",
      sourceId: operation.id ?? fallbackSourceId("operation", [operation.assetTicker, operation.type, operation.date]),
      eventType
    });
  });

  const dividendEvents: TimelineMovement[] = dividends
    .filter((dividend) => options.includePlannedDividends || isReceivedDividend(dividend))
    .map((dividend) => {
      const eventType = getDividendEventType(dividend.type);
      const metadata = resolveAssetMetadata(assetLookup, dividend.assetTicker, dividend.assetId);
      return withCanonicalIdentity({
        date: dividend.paymentDate,
        type: eventType === "rendimento" ? "Rendimento" : "Dividendo",
        title: metadata.assetTicker ?? "Dividendo",
        description: dividend.notes ?? (eventType === "rendimento" ? "Recebimento de rendimento" : "Recebimento de dividendos"),
        amount: dividendAmount(dividend),
        assetTicker: metadata.assetTicker,
        assetCategory: metadata.assetCategory,
        sector: metadata.sector,
        paymentMethod: "Carteira",
        source: "dividends",
        ...resolveMovementStatus(dividend.paymentDate, dividend.status, { completed: "Recebido", planned: "Previsto" })
      }, {
        sourceType: "dividend",
        sourceId: dividend.id ?? fallbackSourceId("dividend", [dividend.assetTicker, dividend.type, dividend.paymentDate]),
        eventType
      });
    });

  const contributionEvents: TimelineMovement[] = contributions.map((contribution) =>
    withCanonicalIdentity({
      date: contribution.date,
      type: "Aporte",
      title: "Aporte",
      description: contribution.description ?? "",
      amount: contribution.value,
      sector: "Investimentos",
      paymentMethod: "Corretora",
      source: "contributions",
      ...resolveMovementStatus(contribution.date)
    }, {
      sourceType: "contribution",
      sourceId: contribution.id ?? fallbackSourceId("contribution", [contribution.date, contribution.value]),
      eventType: "aporte"
    })
  );

  const cashBoxEvents: TimelineMovement[] = cashBoxes.flatMap((cashBox) =>
    (cashBox.movements ?? []).map((movement, index) => {
      const eventType = getCashBoxEventType(movement.type);
      const sourceId = movement.id ?? fallbackSourceId("cashbox-movement", [cashBox.id ?? cashBox.name, movement.type, movement.date, index]);
      return withCanonicalIdentity({
        date: movement.date,
        type: getCashBoxMovementTypeLabel(movement.type),
        title: cashBox.name,
        description: getCashBoxMovementDescription(movement.type, movement.description),
        amount: movement.value,
        assetCategory: "RENDA_FIXA",
        sector: cashBox.type || "Caixinha",
        paymentMethod: "Caixinha",
        source: "cashboxes",
        ...resolveMovementStatus(movement.date)
      }, {
        sourceType: "cashbox-movement",
        sourceId,
        eventType,
        occurrenceId: movement.id ? null : `${cashBox.id ?? cashBox.name}:${movement.date}:${index}`
      });
    })
  );

  const expenseEvents: TimelineMovement[] = (options.monthlyExpenses ?? [])
    .filter((expense) => !expense.recurrenceCancelled)
    .filter((expense) => !(expense.integration?.linkedEntityId && expense.allocationKind !== "expense"))
    .map((expense) => {
    const plan = planById.get(expense.planId);
    const category = plan?.categories.find((item) => item.id === expense.categoryId);
    const eventType =
      expense.allocationKind === "investment_contribution"
        ? "aporte"
        : expense.allocationKind === "cash_box_contribution"
          ? "cashbox"
          : expense.recurring
            ? "recorrencia"
            : "gasto";
    const occurrenceId = expense.recurrenceOriginalDate ?? expense.date;
    const sourceId = expense.recurring && expense.recurrenceId
      ? expense.recurrenceId
      : expense.id ?? fallbackSourceId("monthly-expense", [expense.planId, expense.date, expense.time]);
    const movementDate = expense.completedAt ?? `${expense.date}T${expense.time || "00:00"}`;
    const movementDescription = [
      category?.name ?? "Planejamento mensal",
      expense.note,
      `Vencimento ${formatDateBr(expense.date)}`,
      expense.completedAt ? `Pago em ${formatDateTimeBr(expense.completedAt)}` : null
    ]
      .filter(Boolean)
      .join(" - ");
    return withCanonicalIdentity({
      date: movementDate,
      type:
        expense.allocationKind === "investment_contribution"
          ? "Aporte planejado"
          : expense.allocationKind === "cash_box_contribution"
            ? "Caixinha planejada"
            : expense.recurring
              ? "Recorrencia"
              : "Gasto",
      title: expense.description,
      description: movementDescription,
      amount: expense.amountInCents / 100,
      sector: category?.name,
      paymentMethod: normalizePaymentMethod(expense.paymentMethod),
      source: "monthly-planning",
      occurrenceDate: expense.date,
      completedAt: expense.completedAt ?? null,
      ...resolveMovementStatus(`${expense.date}T${expense.time || "00:00"}`, expense.status, { completed: "Realizado", planned: "Previsto" })
    }, {
      sourceType: "monthly-expense",
      sourceId,
      eventType,
      occurrenceId,
      seriesId: expense.recurrenceId ?? null
    });
  });

  const incomeEntryEvents: TimelineMovement[] = (options.monthlyIncomeEntries ?? [])
    .filter((entry) => !entry.recurrenceCancelled && entry.status !== "cancelled")
    .map((entry) => {
      const eventType = "income";
      const occurrenceId = entry.recurrenceOriginalDate ?? entry.date;
      const sourceId = entry.recurring && entry.recurrenceId
        ? entry.recurrenceId
        : entry.id ?? fallbackSourceId("monthly-income-entry", [entry.planId, entry.date, entry.time]);
      const movementDate = entry.receivedAt ?? `${entry.date}T${entry.time || "00:00"}`;
      const movementDescription = [
        entry.category || "Entrada",
        entry.note,
        `Previsto para ${formatDateBr(entry.date)}`,
        entry.receivedAt ? `Recebido em ${formatDateTimeBr(entry.receivedAt)}` : null
      ]
        .filter(Boolean)
        .join(" - ");

      return withCanonicalIdentity({
        date: movementDate,
        type: entry.recurring ? "Entrada recorrente" : "Entrada",
        title: entry.description,
        description: movementDescription,
        amount: entry.amountInCents / 100,
        sector: entry.category,
        paymentMethod: "Planejamento mensal",
        source: "monthly-planning",
        occurrenceDate: entry.date,
        completedAt: entry.receivedAt ?? null,
        ...resolveMovementStatus(`${entry.date}T${entry.time || "00:00"}`, entry.status, { completed: "Recebido", planned: "Previsto" })
      }, {
        sourceType: "monthly-income-entry",
        sourceId,
        eventType,
        occurrenceId,
        seriesId: entry.recurrenceId ?? null
      });
    });

  const goalEvents: TimelineMovement[] = (options.monthlyPlans ?? []).flatMap((plan) =>
    (plan.goals ?? []).map((goal) => {
      const completed = goal.targetInCents > 0 && goal.savedInCents >= goal.targetInCents;
      return withCanonicalIdentity({
        date: `${plan.year}-${String(plan.month).padStart(2, "0")}-01`,
        type: "Objetivo",
        title: goal.name,
        description: `Meta do planejamento mensal${goal.linkedSource ? ` - ${goal.linkedSource}` : ""}`,
        amount: goal.targetInCents / 100,
        sector: "Planejamento mensal",
        paymentMethod: "Nao informado",
        source: "monthly-planning",
        status: completed ? "completed" : "planned",
        statusLabel: completed ? "Concluido" : "Previsto"
      }, {
        sourceType: "monthly-goal",
        sourceId: `${plan.id ?? `${plan.year}-${plan.month}`}:${goal.id}`,
        eventType: "objetivo",
        occurrenceId: `${plan.year}-${String(plan.month).padStart(2, "0")}-01`
      });
    })
  );

  const rawMovements = [...operationEvents, ...dividendEvents, ...contributionEvents, ...cashBoxEvents, ...expenseEvents, ...incomeEntryEvents, ...goalEvents];
  const movements = (options.deduplicate === false ? rawMovements : dedupeTimelineMovements(rawMovements)).sort(compareMovements);

  if (process.env.HISTORY_DEBUG === "true") {
    console.info(
      JSON.stringify({
        operation: "history-aggregation",
        sources: sourceCounts(rawMovements),
        beforeDeduplication: rawMovements.length,
        afterDeduplication: movements.length,
        durationMs: Date.now() - startedAt
      })
    );
  }

  return typeof options.limit === "number" ? movements.slice(0, options.limit) : movements;
}

export async function getDashboard() {
  const [portfolioInputs, contributions, allocations, cashBoxes, cdiRates] = await Promise.all([
    loadPortfolioCalculationInputs(),
    listContributions(),
    listAllocations(),
    listCashBoxes(),
    listCdiRates(1)
  ]);
  const portfolioAssets = calculatePortfolioFromInputs(portfolioInputs);
  const { dividends, operations, quotes } = portfolioInputs;
  const allocationSummary = buildAllocationSummary(buildAllocationValues(portfolioAssets, cashBoxes), allocations);
  const recommendation = toLegacyRecommendation(allocationSummary);
  const portfolioPositions = portfolioAssets.filter((asset) => asset.hasPosition);
  const marketInvestedCapital = sum(portfolioPositions.map((asset) => asset.investedValue));
  const marketAssetsValue = sum(portfolioPositions.map((asset) => safeNumber(asset.currentValue)));
  const cashBoxStats = cashBoxes.map(calculateCashBoxTotals);
  const cashboxesBalance = sum(cashBoxStats.map((cashBox) => cashBox.currentBalance));
  const cashboxesNetContributions = sum(cashBoxStats.map((cashBox) => cashBox.totalContributions - cashBox.totalWithdrawals));
  const cashboxesYield = sum(cashBoxStats.map((cashBox) => cashBox.totalYield));
  const investedCapital = marketInvestedCapital + cashboxesNetContributions;
  const totalEquity = marketAssetsValue + cashboxesBalance;
  const unrealizedMarketProfit = marketAssetsValue - marketInvestedCapital;
  const receivedDividends = dividends.filter(isReceivedDividend);
  const dividendAmounts = receivedDividends.map((dividend) => ({ date: dividend.paymentDate, amount: dividendAmount(dividend) }));
  const contributionAmounts = contributions.map((contribution) => ({ date: contribution.date, amount: contribution.value }));
  const cashBoxMovements = cashBoxes.flatMap((cashBox) => cashBox.movements ?? []);
  const cashboxContributionAmounts = cashBoxMovements
    .filter((movement) => isCashBoxContribution(toCashBoxContributionType(movement.type)))
    .map((movement) => ({ date: movement.date, amount: movement.value }));
  const cashboxWithdrawalAmounts = cashBoxMovements
    .filter((movement) => isCashBoxWithdrawal(toCashBoxContributionType(movement.type)))
    .map((movement) => ({ date: movement.date, amount: movement.value }));
  const cashboxYieldAmounts = cashBoxMovements
    .filter((movement) => isCashBoxYield(toCashBoxContributionType(movement.type)))
    .map((movement) => ({ date: movement.date, amount: movement.value }));
  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  const currentYear = now.getFullYear().toString();
  const receivedDividendsTotal = sum(dividendAmounts.map((dividend) => dividend.amount));
  const totalProfit = unrealizedMarketProfit + cashboxesYield + receivedDividendsTotal;
  const planningLinkedOperationAmounts = operations
    .filter(isPlanningLinkedPurchase)
    .map((operation) => ({ date: operation.date, amount: operation.totalValue + operation.fees }));
  const monthlyContributions = sumDatedAmountByPeriod([...contributionAmounts, ...planningLinkedOperationAmounts], currentMonth);
  const yearlyContributions = sumDatedAmountByPeriod([...contributionAmounts, ...planningLinkedOperationAmounts], currentYear);
  const monthlyCashBoxContributions = sumDatedAmountByPeriod(cashboxContributionAmounts, currentMonth);
  const yearlyCashBoxContributions = sumDatedAmountByPeriod(cashboxContributionAmounts, currentYear);
  const monthlyCashBoxWithdrawals = sumDatedAmountByPeriod(cashboxWithdrawalAmounts, currentMonth);
  const monthlyCashBoxYield = sumDatedAmountByPeriod(cashboxYieldAmounts, currentMonth);
  const totalMonthlyContributions = monthlyContributions + monthlyCashBoxContributions;
  const totalYearlyContributions = yearlyContributions + yearlyCashBoxContributions;
  const lastMarketRefreshAt = [...quotes].sort((left, right) => new Date(right.quotedAt).getTime() - new Date(left.quotedAt).getTime())[0]?.quotedAt ?? null;
  const lastCdiRefreshAt = cdiRates[0]?.fetchedAt ?? null;

  return {
    metrics: {
      totalEquity,
      marketAssetsValue,
      cashboxesBalance,
      investedCapital,
      marketInvestedCapital,
      cashboxesNetContributions,
      unrealizedMarketProfit,
      cashboxesYield,
      receivedDividends: receivedDividendsTotal,
      totalProfit,
      totalReturnPercent: investedCapital > 0 ? (totalProfit / investedCapital) * 100 : 0,
      assetCount: portfolioPositions.length,
      cashboxCount: cashBoxes.length,
      positionCount: portfolioPositions.length,
      dividendsThisMonth: sumDatedAmountByPeriod(dividendAmounts, currentMonth),
      dividendsThisYear: sumDatedAmountByPeriod(dividendAmounts, currentYear),
      contributionsThisMonth: totalMonthlyContributions,
      withdrawalsThisMonth: monthlyCashBoxWithdrawals,
      cashboxYieldThisMonth: monthlyCashBoxYield,
      nextContributionRecommendation: allocationSummary.recommendation,
      allocationByCategory: allocationSummary.categories,
      targetAllocation: allocationSummary.categories.map((category) => ({
        categoryId: category.categoryId,
        label: category.label,
        targetPercent: category.targetPercent,
        idealValue: category.idealValue
      })),
      allocationDifference: allocationSummary.categories.map((category) => ({
        categoryId: category.categoryId,
        label: category.label,
        differenceValue: category.differenceValue,
        differencePercent: category.differencePercent,
        status: category.status
      })),
      lastMarketRefreshAt,
      lastCdiRefreshAt,
      lastDashboardCalculationAt: now,
      totalWealth: totalEquity,
      returnPercentage: investedCapital > 0 ? (totalProfit / investedCapital) * 100 : 0,
      monthlyDividends: sumDatedAmountByPeriod(dividendAmounts, currentMonth),
      yearlyDividends: sumDatedAmountByPeriod(dividendAmounts, currentYear),
      monthlyContributions: totalMonthlyContributions,
      yearlyContributions: totalYearlyContributions,
      investedValue: investedCapital,
      currentValue: totalEquity,
      netProfit: totalProfit,
      cashBoxValue: cashboxesBalance
    },
    wealthEvolution: buildWealthEvolution(operations, dividends, contributions, cashBoxes),
    portfolioHistory: buildWealthEvolution(operations, dividends, contributions, cashBoxes),
    categoryAllocation: recommendation.comparison,
    monthlyDividends: groupDatedAmounts(dividendAmounts),
    monthlyContributions: groupDatedAmounts([...contributionAmounts, ...planningLinkedOperationAmounts, ...cashboxContributionAmounts]),
    monthlyWithdrawals: groupDatedAmounts(cashboxWithdrawalAmounts),
    monthlyCashBoxYield: groupDatedAmounts(cashboxYieldAmounts),
    recommendation,
    allocation: allocationSummary,
    recentMovements: buildMovements(operations, dividends, contributions, cashBoxes, { limit: 10 })
  };
}

function buildCashBoxBalanceAt(cashBoxes: CashBoxRecord[], key: string) {
  return sum(
    cashBoxes.map((cashBox) => {
      const initialBalance = cashBox.initialBalance ?? 0;
      const movementsBalance = sum(
        (cashBox.movements ?? [])
          .filter((movement) => dateIsBeforeOrSameMonth(movement.date, key))
          .map((movement) => (isCashBoxWithdrawal(toCashBoxContributionType(movement.type)) ? -movement.value : movement.value))
      );

      return Math.max(initialBalance + movementsBalance, 0);
    })
  );
}

function buildCashBoxNetContributionAt(cashBoxes: CashBoxRecord[], key: string) {
  return sum(
    cashBoxes.map((cashBox) => {
      const initialBalance = cashBox.initialBalance ?? 0;
      const movementsCapital = sum(
        (cashBox.movements ?? [])
          .filter((movement) => dateIsBeforeOrSameMonth(movement.date, key))
          .map((movement) => {
            const type = toCashBoxContributionType(movement.type);
            if (isCashBoxContribution(type)) return movement.value;
            if (isCashBoxWithdrawal(type)) return -movement.value;
            return 0;
          })
      );

      return Math.max(initialBalance + movementsCapital, 0);
    })
  );
}

function buildOperationPositionAt(operations: OperationRecord[], key: string) {
  const positions = new Map<string, { quantity: number; investedValue: number; currentPrice: number }>();

  for (const operation of operations
    .filter((item) => dateIsBeforeOrSameMonth(item.date, key))
    .sort((left, right) => dateFrom(left.date).getTime() - dateFrom(right.date).getTime())) {
    const positionKey = operation.assetTicker ?? operation.assetId ?? "";
    const position = positions.get(positionKey) ?? { quantity: 0, investedValue: 0, currentPrice: 0 };

    if (operation.price > 0) position.currentPrice = operation.price;

    if (operation.type === "COMPRA") {
      position.quantity += operation.quantity;
      position.investedValue += operation.totalValue + operation.fees;
    }

    if (operation.type === "BONIFICACAO") {
      position.quantity += operation.quantity;
    }

    if (operation.type === "VENDA") {
      const averagePrice = position.quantity > 0 ? position.investedValue / position.quantity : 0;
      position.quantity = Math.max(position.quantity - operation.quantity, 0);
      position.investedValue = Math.max(position.investedValue - averagePrice * operation.quantity, 0);
    }

    if (operation.type === "DESDOBRAMENTO" && operation.quantity > 0) {
      position.quantity *= operation.quantity;
    }

    if (operation.type === "GRUPAMENTO" && operation.quantity > 0) {
      position.quantity /= operation.quantity;
    }

    positions.set(positionKey, position);
  }

  return [...positions.values()].reduce(
    (total, position) => ({
      invested: total.invested + position.investedValue,
      current: total.current + position.quantity * position.currentPrice
    }),
    { invested: 0, current: 0 }
  );
}

function buildWealthEvolution(operations: OperationRecord[], dividends: DividendRecord[], contributions: ContributionRecord[], cashBoxes: CashBoxRecord[]) {
  const months = new Set<string>();
  for (const operation of operations) months.add(monthKey(operation.date));
  for (const dividend of dividends) months.add(monthKey(dividend.paymentDate));
  for (const contribution of contributions) months.add(monthKey(contribution.date));
  for (const cashBox of cashBoxes) {
    for (const movement of cashBox.movements ?? []) months.add(monthKey(movement.date));
  }

  return [...months].sort().map((key) => {
    const position = buildOperationPositionAt(operations, key);
    const receivedDividends = sum(dividends.filter((dividend) => isReceivedDividend(dividend) && dateIsBeforeOrSameMonth(dividend.paymentDate, key)).map(dividendAmount));
    const contributed = sum(contributions.filter((contribution) => dateIsBeforeOrSameMonth(contribution.date, key)).map((contribution) => contribution.value));
    const cashBoxBalance = buildCashBoxBalanceAt(cashBoxes, key);
    const cashBoxNetContribution = buildCashBoxNetContributionAt(cashBoxes, key);

    return {
      month: monthLabels[Number(key.slice(5, 7)) - 1],
      invested: position.invested + contributed + cashBoxNetContribution,
      current: position.current + cashBoxBalance,
      dividends: receivedDividends,
      contributions: contributed
    };
  });
}

export async function getPortfolio() {
  const [assets, allocations, cashBoxes] = await Promise.all([getCalculatedPortfolio(), listAllocations(), listCashBoxes()]);
  const allocationSummary = buildAllocationSummary(buildAllocationValues(assets, cashBoxes), allocations);
  const recommendation = toLegacyRecommendation(allocationSummary);

  return {
    assets,
    allocationComparison: recommendation.comparison,
    recommendation,
    allocation: allocationSummary
  };
}

export async function getAssetDetails(ticker: string) {
  const canonicalTicker = normalizeTicker(ticker);
  const [asset, portfolio, operations, dividends] = await Promise.all([
    listAssets().then((assets) => assets.find((item) => normalizeTicker(item.ticker) === canonicalTicker)),
    getPortfolio(),
    listOperations(),
    listDividends()
  ]);

  if (!asset) return null;

  const enrichedAsset = portfolio.assets.find((item) => normalizeTicker(item.ticker) === normalizeTicker(asset.ticker));
  if (!enrichedAsset) return null;

  const assetOperations = operations.filter((operation) => assetMatchesOperation(asset, operation));
  const assetDividends = dividends.filter((dividend) => assetMatchesDividend(asset, dividend));

  return {
    ...enrichedAsset,
    priceHistory: await listPriceHistory(undefined, { assetKey: buildAssetMarketKey(asset) }).then((history) =>
      history.length > 0
        ? history.map((item) => ({ month: monthName(item.capturedAt), price: item.price }))
        : assetOperations
            .filter((operation) => operation.price > 0)
            .sort((left, right) => dateFrom(left.date).getTime() - dateFrom(right.date).getTime())
            .map((operation) => ({ month: monthName(operation.date), price: operation.price }))
    ),
    dividends: assetDividends.map(normalizeDividend),
    operations: assetOperations.map((operation) => ({
      assetTicker: operation.assetTicker ?? asset.ticker,
      type: operation.type,
      date: operation.date,
      quantity: operation.quantity,
      price: operation.price,
      total: operation.totalValue,
      notes: operation.notes ?? ""
    }))
  };
}

export async function getDividendsOverview() {
  const [dividends, assets] = await Promise.all([listDividends(), listAssets()]);
  const receivedDividends = dividends.filter(isReceivedDividend);
  const dividendAmounts = receivedDividends.map((dividend) => ({ date: dividend.paymentDate, amount: dividendAmount(dividend) }));
  const total = sum(dividendAmounts.map((dividend) => dividend.amount));
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentYear = new Date().getFullYear().toString();

  return {
    totals: {
      month: sumDatedAmountByPeriod(dividendAmounts, currentMonth),
      year: sumDatedAmountByPeriod(dividendAmounts, currentYear),
      allTime: total,
      monthlyAverage: total / Math.max(new Set(dividendAmounts.map((dividend) => monthKey(dividend.date))).size, 1),
      biggestPayment: Math.max(...dividendAmounts.map((dividend) => dividend.amount), 0)
    },
    table: dividends.map(normalizeDividend),
    monthly: groupDatedAmounts(dividendAmounts),
    annual: groupDatedAmountsByYear(dividendAmounts),
    byAsset: assets.map((asset) => ({
      ticker: asset.ticker,
      value: sum(receivedDividends.filter((dividend) => assetMatchesDividend(asset, dividend)).map(dividendAmount))
    })),
    calendar: dividends.map(normalizeDividend)
  };
}

export async function getContributionsOverview() {
  const contributions = await listContributions();
  const contributionAmounts = contributions.map((contribution) => ({ date: contribution.date, amount: contribution.value }));
  const currentYear = new Date().getFullYear().toString();

  return {
    totals: {
      invested: sum(contributionAmounts.map((contribution) => contribution.amount)),
      year: sumDatedAmountByPeriod(contributionAmounts, currentYear),
      monthlyAverage: sum(contributionAmounts.map((contribution) => contribution.amount)) / Math.max(contributions.length, 1)
    },
    table: contributions.map(normalizeContribution),
    monthly: groupDatedAmounts(contributionAmounts),
    annual: groupDatedAmountsByYear(contributionAmounts)
  };
}

export async function registerContribution(input: { date: string; amount: number; category?: string; notes?: string }) {
  return createContribution({
    date: input.date,
    value: input.amount,
    description: input.notes ?? ""
  });
}

export async function getGoalsOverview() {
  const [goals, dashboard, portfolio, dividends] = await Promise.all([listGoals(), getDashboard(), getPortfolio(), listDividends()]);
  const receivedDividends = dividends.filter(isReceivedDividend);
  const monthlyDividendAverage = sum(receivedDividends.map(dividendAmount)) / Math.max(new Set(receivedDividends.map((dividend) => monthKey(dividend.paymentDate))).size, 1);

  return goals.map((goal) => {
    const current =
      goal.type === "wealth"
        ? dashboard.metrics.totalWealth
        : goal.type === "dividend"
          ? monthlyDividendAverage
          : goal.type === "invested"
            ? dashboard.metrics.investedValue
            : portfolio.assets.find((asset) => asset.ticker === goal.assetTicker)?.quantity ?? 0;
    const target = goal.type === "shares" ? (goal.targetQuantity ?? 0) : (goal.targetValue ?? 0);

    return {
      id: goal.id,
      title: goal.title,
      description: goal.description,
      type: goal.type,
      target,
      current,
      category: goal.description,
      assetTicker: goal.assetTicker,
      active: goal.active,
      completed: goal.completed,
      progress: target > 0 ? Math.min((current / target) * 100, 100) : 0
    };
  });
}

export async function registerGoal(input: {
  title: string;
  type: "wealth" | "dividend" | "shares" | "invested";
  target: number;
  current?: number;
  category?: string;
  assetTicker?: string;
}) {
  return createGoal({
    title: input.title,
    description: input.category ?? "",
    type: input.type,
    targetValue: input.type === "shares" ? 0 : input.target,
    targetQuantity: input.type === "shares" ? input.target : 0,
    assetTicker: input.assetTicker,
    active: true,
    completed: false
  });
}

export async function getCalendarEvents() {
  const [dividends, operations, contributions, cashBoxes] = await Promise.all([listDividends(), listOperations(), listContributions(), listCashBoxes()]);

  return buildMovements(operations, dividends, contributions, cashBoxes).map((movement) => ({
    ...movement,
    day: dateFrom(movement.date).getUTCDate()
  }));
}

export async function getHistory() {
  const [dividends, operations, contributions, cashBoxes, assets, monthlyExpenses, monthlyIncomeEntries, monthlyPlans] = await Promise.all([
    listDividends(),
    listOperations(),
    listContributions(),
    listCashBoxes(),
    listAssets(),
    listAllMonthlyExpenses(),
    listAllMonthlyIncomeEntries(),
    listMonthlyPlans()
  ]);

  return buildMovements(operations, dividends, contributions, cashBoxes, {
    assets,
    includePlannedDividends: true,
    monthlyExpenses,
    monthlyIncomeEntries,
    monthlyPlans
  });
}

export async function getSettings() {
  const settings = await getSettingsRecord();

  return {
    profile: {
      name: settings.profileName,
      currency: settings.currency,
      theme: settings.theme
    },
    allocations: settings.allocations,
    categories: settings.allocations.map((allocation) => ({
      name: allocation.category,
      color:
        {
          FII: "#22c55e",
          ACAO: "#38bdf8",
          ETF: "#a78bfa",
          CRIPTO: "#f59e0b",
          RENDA_FIXA: "#fb7185",
          cash: "#14b8a6"
        }[allocation.category] ?? "#14b8a6",
      targetPercentage: allocation.targetPercentage
    })),
    projections: {
      expectedReturn: settings.expectedReturn,
      inflation: settings.inflation,
      currentAge: settings.currentAge,
      targetAge: settings.targetAge
    }
  };
}

export async function updateAllocations(input: Array<{ category: string; targetPercentage: number; priority?: number }>) {
  return replaceAllocations(input);
}

export async function updateSettings(input: { expectedReturn?: number; inflation?: number; currentAge?: number; targetAge?: number; theme?: string; profileName?: string; currency?: string }) {
  const settings = await updateSettingsRecord(input);
  const authContext = getAuthContext();
  if (authContext?.userId && input.profileName) {
    await updateUserProfile(authContext.userId, { name: input.profileName });
  }
  return settings;
}

export { calculateProjection };
