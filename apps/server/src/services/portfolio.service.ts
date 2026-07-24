import {
  createContribution,
  createGoal,
  getSettingsRecord,
  listAllocations,
  listAssets,
  listCashBoxes,
  listContributions,
  listDividends,
  listGoals,
  listOperations,
  replaceAllocations,
  updateSettingsRecord
} from "../repositories/investment.repository";
import type { AssetRecord, CashBoxRecord, ContributionRecord, DividendRecord, GoalRecord, OperationRecord } from "../types/investment";
import { calculateProjection } from "./projection.service";
import { getContributionRecommendation } from "./recommendation.service";

const monthLabels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const categoryLabels: Record<string, string> = {
  FII: "FIIs",
  ACAO: "Acoes Brasileiras",
  ETF: "ETFs",
  CRIPTO: "Bitcoin",
  RENDA_FIXA: "Renda Fixa"
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
  return {
    assetTicker: dividend.assetTicker ?? "",
    date: dividend.paymentDate,
    amount: dividend.totalValue,
    shares: dividend.valuePerShare > 0 ? Math.round(dividend.totalValue / dividend.valuePerShare) : 0
  };
}

function assetMatchesOperation(asset: AssetRecord, operation: OperationRecord) {
  return operation.assetTicker === asset.ticker || String(operation.assetId ?? "") === String(asset.id ?? "");
}

function assetMatchesDividend(asset: AssetRecord, dividend: DividendRecord) {
  return dividend.assetTicker === asset.ticker || String(dividend.assetId ?? "") === String(asset.id ?? "");
}

function getCurrentPrice(operations: OperationRecord[]) {
  const pricedOperation = operations
    .filter((operation) => operation.price > 0)
    .sort((left, right) => dateFrom(right.date).getTime() - dateFrom(left.date).getTime())[0];

  return pricedOperation?.price ?? 0;
}

function calculateAssetPosition(asset: AssetRecord, operations: OperationRecord[], dividends: DividendRecord[], portfolioValue: number) {
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

  const currentPrice = getCurrentPrice(assetOperations);
  const currentValue = quantity * currentPrice;
  const dividendsReceived = sum(assetDividends.map((dividend) => dividend.totalValue));
  const averagePrice = quantity > 0 ? investedValue / quantity : 0;
  const profit = currentValue - investedValue;

  return {
    name: asset.name,
    ticker: asset.ticker,
    category: categoryLabels[asset.category] ?? asset.category,
    quantity,
    averagePrice,
    currentPrice,
    dividendYield: currentValue > 0 ? (dividendsReceived / currentValue) * 100 : 0,
    dividendsReceived,
    objectiveQuantity: quantity,
    currency: asset.currency,
    investedValue,
    currentValue,
    profit,
    returnPercentage: investedValue > 0 ? (profit / investedValue) * 100 : 0,
    portfolioWeight: portfolioValue > 0 ? (currentValue / portfolioValue) * 100 : 0
  };
}

async function getCalculatedPortfolio() {
  const [assets, operations, dividends] = await Promise.all([listAssets(), listOperations(), listDividends()]);
  const preliminary = assets.map((asset) => calculateAssetPosition(asset, operations, dividends, 0));
  const assetsValue = sum(preliminary.map((asset) => asset.currentValue));
  return assets.map((asset) => calculateAssetPosition(asset, operations, dividends, assetsValue));
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

function getCashBoxMovementTypeLabel(type: string) {
  const labels: Record<string, string> = {
    DEPOSITO: "Movimentacao das Caixinhas",
    RESGATE: "Resgate",
    RENDIMENTO: "Movimentacao das Caixinhas"
  };

  return labels[type] ?? "Movimentacao das Caixinhas";
}

function getCashBoxMovementDescription(type: string, description?: string) {
  if (description) return description;
  if (type === "DEPOSITO") return "Deposito na reserva Nubank";
  if (type === "RESGATE") return "Resgate da reserva Nubank";
  if (type === "RENDIMENTO") return "Rendimento da reserva Nubank";
  return "Movimentacao da reserva Nubank";
}

function buildMovements(
  operations: OperationRecord[],
  dividends: DividendRecord[],
  contributions: ContributionRecord[],
  cashBoxes: CashBoxRecord[] = [],
  limit?: number
) {
  const operationEvents = operations.map((operation) => ({
    id: operation.id ?? `operation-${operation.assetTicker}-${operation.date}`,
    date: operation.date,
    type: getOperationTypeLabel(operation.type),
    title: operation.assetTicker ?? operation.type,
    description:
      operation.quantity > 0
        ? `${operation.quantity} unidades a R$ ${Number(operation.price).toFixed(2)}`
        : (operation.notes ?? ""),
    amount: operation.totalValue
  }));

  const dividendEvents = dividends.map((dividend) => ({
    id: dividend.id ?? `dividend-${dividend.assetTicker}-${dividend.paymentDate}`,
    date: dividend.paymentDate,
    type: "Dividendo",
    title: dividend.assetTicker ?? "Dividendo",
    description: "Recebimento de dividendos",
    amount: dividend.totalValue
  }));

  const contributionEvents = contributions.map((contribution) => ({
    id: contribution.id ?? `contribution-${contribution.date}`,
    date: contribution.date,
    type: "Aporte",
    title: "Aporte",
    description: contribution.description ?? "",
    amount: contribution.value
  }));
  const cashBoxEvents = cashBoxes.flatMap((cashBox) =>
    (cashBox.movements ?? []).map((movement, index) => ({
      id: movement.id ?? `cash-box-${cashBox.id ?? cashBox.name}-${movement.type}-${movement.date}-${index}`,
      date: movement.date,
      type: getCashBoxMovementTypeLabel(movement.type),
      title: cashBox.name,
      description: getCashBoxMovementDescription(movement.type, movement.description),
      amount: movement.value
    }))
  );

  const movements = [...operationEvents, ...dividendEvents, ...contributionEvents, ...cashBoxEvents].sort(
    (left, right) => dateFrom(right.date).getTime() - dateFrom(left.date).getTime()
  );

  return typeof limit === "number" ? movements.slice(0, limit) : movements;
}

export async function getDashboard() {
  const [portfolioAssets, dividends, contributions, allocations, operations, cashBoxes] = await Promise.all([
    getCalculatedPortfolio(),
    listDividends(),
    listContributions(),
    listAllocations(),
    listOperations(),
    listCashBoxes()
  ]);
  const investedValue = sum(portfolioAssets.map((asset) => asset.investedValue));
  const assetsCurrentValue = sum(portfolioAssets.map((asset) => asset.currentValue));
  const cashBoxValue = sum(cashBoxes.map((cashBox) => cashBox.currentBalance));
  const currentValue = assetsCurrentValue + cashBoxValue;
  const profit = currentValue - investedValue;
  const dividendAmounts = dividends.map((dividend) => ({ date: dividend.paymentDate, amount: dividend.totalValue }));
  const contributionAmounts = contributions.map((contribution) => ({ date: contribution.date, amount: contribution.value }));
  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  const currentYear = now.getFullYear().toString();
  const recommendation = getContributionRecommendation(portfolioAssets, allocations);

  return {
    metrics: {
      totalWealth: currentValue,
      totalProfit: profit,
      returnPercentage: investedValue > 0 ? (profit / investedValue) * 100 : 0,
      monthlyDividends: sumDatedAmountByPeriod(dividendAmounts, currentMonth),
      yearlyDividends: sumDatedAmountByPeriod(dividendAmounts, currentYear),
      monthlyContributions: sumDatedAmountByPeriod(contributionAmounts, currentMonth),
      yearlyContributions: sumDatedAmountByPeriod(contributionAmounts, currentYear),
      assetCount: portfolioAssets.length,
      investedValue,
      currentValue,
      netProfit: profit + sum(dividendAmounts.map((dividend) => dividend.amount)),
      cashBoxValue
    },
    wealthEvolution: buildWealthEvolution(operations, dividends, contributions, cashBoxes),
    categoryAllocation: recommendation.comparison.map((allocation) => ({
      ...allocation,
      value: allocation.value ?? 0,
      color:
        {
          FIIs: "#22c55e",
          "Acoes Brasileiras": "#38bdf8",
          ETFs: "#a78bfa",
          Bitcoin: "#f59e0b",
          "Renda Fixa": "#fb7185"
        }[allocation.category] ?? "#14b8a6"
    })),
    monthlyDividends: groupDatedAmounts(dividendAmounts),
    monthlyContributions: groupDatedAmounts(contributionAmounts),
    recommendation,
    recentMovements: buildMovements(operations, dividends, contributions, cashBoxes, 10)
  };
}

function buildCashBoxBalanceAt(cashBoxes: CashBoxRecord[], key: string) {
  return sum(
    cashBoxes.flatMap((cashBox) =>
      (cashBox.movements ?? [])
        .filter((movement) => dateIsBeforeOrSameMonth(movement.date, key))
        .map((movement) => (movement.type === "RESGATE" ? -movement.value : movement.value))
    )
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
    const receivedDividends = sum(dividends.filter((dividend) => dateIsBeforeOrSameMonth(dividend.paymentDate, key)).map((dividend) => dividend.totalValue));
    const contributed = sum(contributions.filter((contribution) => dateIsBeforeOrSameMonth(contribution.date, key)).map((contribution) => contribution.value));
    const cashBoxBalance = buildCashBoxBalanceAt(cashBoxes, key);

    return {
      month: monthLabels[Number(key.slice(5, 7)) - 1],
      invested: position.invested + contributed + cashBoxBalance,
      current: position.current + cashBoxBalance,
      dividends: receivedDividends,
      contributions: contributed
    };
  });
}

export async function getPortfolio() {
  const [assets, allocations] = await Promise.all([getCalculatedPortfolio(), listAllocations()]);
  const recommendation = getContributionRecommendation(assets, allocations);

  return {
    assets,
    allocationComparison: recommendation.comparison,
    recommendation
  };
}

export async function getAssetDetails(ticker: string) {
  const [asset, portfolio, operations, dividends] = await Promise.all([
    listAssets().then((assets) => assets.find((item) => item.ticker === ticker.toUpperCase())),
    getPortfolio(),
    listOperations(),
    listDividends()
  ]);

  if (!asset) return null;

  const enrichedAsset = portfolio.assets.find((item) => item.ticker === asset.ticker);
  if (!enrichedAsset) return null;

  const assetOperations = operations.filter((operation) => assetMatchesOperation(asset, operation));
  const assetDividends = dividends.filter((dividend) => assetMatchesDividend(asset, dividend));

  return {
    ...enrichedAsset,
    priceHistory: assetOperations
      .filter((operation) => operation.price > 0)
      .sort((left, right) => dateFrom(left.date).getTime() - dateFrom(right.date).getTime())
      .map((operation) => ({ month: monthName(operation.date), price: operation.price })),
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
  const dividendAmounts = dividends.map((dividend) => ({ date: dividend.paymentDate, amount: dividend.totalValue }));
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
      value: sum(dividends.filter((dividend) => assetMatchesDividend(asset, dividend)).map((dividend) => dividend.totalValue))
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
  const monthlyDividendAverage = sum(dividends.map((dividend) => dividend.totalValue)) / Math.max(new Set(dividends.map((dividend) => monthKey(dividend.paymentDate))).size, 1);

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
  const [dividends, operations, contributions, cashBoxes] = await Promise.all([listDividends(), listOperations(), listContributions(), listCashBoxes()]);
  return buildMovements(operations, dividends, contributions, cashBoxes);
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
          RENDA_FIXA: "#fb7185"
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
  return updateSettingsRecord(input);
}

export { calculateProjection };
