import { isDatabaseConnected } from "../config/database";
import { randomUUID } from "crypto";
import { AssetModel } from "../models/asset.model";
import { CashBoxModel } from "../models/cash-box.model";
import { CashBoxYieldModel } from "../models/cash-box-yield.model";
import { CdiRateModel } from "../models/cdi-rate.model";
import { ContributionModel } from "../models/contribution.model";
import { DividendModel } from "../models/dividend.model";
import { GoalModel } from "../models/goal.model";
import { MarketQuoteModel } from "../models/market-quote.model";
import { OperationModel } from "../models/operation.model";
import { PriceHistoryModel } from "../models/price-history.model";
import { SettingsModel } from "../models/settings.model";
import { SnapshotModel } from "../models/snapshot.model";
import { normalizeTicker } from "../services/ticker.service";
import type {
  AllocationRecord,
  AssetRecord,
  CashBoxRecord,
  CashBoxYieldRecord,
  CdiRateRecord,
  ContributionRecord,
  DividendRecord,
  GoalRecord,
  MarketQuoteRecord,
  OperationRecord,
  PriceHistoryRecord,
  SettingsRecord,
  SnapshotRecord
} from "../types/investment";

const positionOperationTypes = ["COMPRA", "VENDA", "BONIFICACAO", "DESDOBRAMENTO", "GRUPAMENTO"];

const baseAllocations: AllocationRecord[] = [
  { category: "FII", targetPercentage: 0, priority: 1 },
  { category: "ACAO", targetPercentage: 0, priority: 2 },
  { category: "ETF", targetPercentage: 0, priority: 3 },
  { category: "CRIPTO", targetPercentage: 0, priority: 4 },
  { category: "cash", targetPercentage: 0, priority: 5 }
];

function createEmptySettings(): SettingsRecord {
  return {
    theme: "dark",
    profileName: "",
    currency: "",
    expectedReturn: 0,
    inflation: 0,
    currentAge: 0,
    targetAge: 1,
    allocations: baseAllocations.map((allocation) => ({ ...allocation }))
  };
}

function withDefaultAllocations(settings: SettingsRecord): SettingsRecord {
  const allocations = [...settings.allocations];

  for (const allocation of baseAllocations) {
    if (!allocations.some((item) => item.category === allocation.category)) {
      allocations.push({ ...allocation, priority: allocations.length + 1 });
    }
  }

  return { ...settings, allocations };
}

let localAssets: AssetRecord[] = [];
let localOperations: OperationRecord[] = [];
let localDividends: DividendRecord[] = [];
let localContributions: ContributionRecord[] = [];
let localGoals: GoalRecord[] = [];
let localCashBoxes: CashBoxRecord[] = [];
let localSettings: SettingsRecord = createEmptySettings();
let localSnapshots: SnapshotRecord[] = [];
let localMarketQuotes: MarketQuoteRecord[] = [];
let localPriceHistory: PriceHistoryRecord[] = [];
let localCdiRates: CdiRateRecord[] = [];
let localCashBoxYields: CashBoxYieldRecord[] = [];

function withId(record: unknown) {
  const plain = record as Record<string, unknown> & { _id?: { toString: () => string } };
  return {
    ...plain,
    id: plain._id?.toString()
  };
}

function byDateDesc(left: { date?: string | Date; paymentDate?: string | Date }, right: { date?: string | Date; paymentDate?: string | Date }) {
  const leftDate = left.date ?? left.paymentDate ?? new Date(0);
  const rightDate = right.date ?? right.paymentDate ?? new Date(0);
  return new Date(rightDate).getTime() - new Date(leftDate).getTime();
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export async function listAssets(): Promise<AssetRecord[]> {
  if (isDatabaseConnected()) {
    const assets = await AssetModel.find({ active: true }).sort({ ticker: 1 }).lean();
    return assets.map((asset) => withId(asset)) as unknown as AssetRecord[];
  }

  return [...localAssets].sort((left, right) => left.ticker.localeCompare(right.ticker));
}

export async function listMarketQuotes(): Promise<MarketQuoteRecord[]> {
  if (isDatabaseConnected()) {
    const quotes = await MarketQuoteModel.find().sort({ ticker: 1 }).lean();
    return quotes.map((quote) => withId(quote)) as unknown as MarketQuoteRecord[];
  }

  return [...localMarketQuotes].sort((left, right) => left.ticker.localeCompare(right.ticker));
}

export async function findMarketQuoteByTicker(ticker: string): Promise<MarketQuoteRecord | null> {
  const canonicalTicker = normalizeTicker(ticker);

  if (isDatabaseConnected()) {
    const quote = await MarketQuoteModel.findOne({ ticker: canonicalTicker }).lean();
    return quote ? (withId(quote) as unknown as MarketQuoteRecord) : null;
  }

  return localMarketQuotes.find((quote) => quote.ticker === canonicalTicker) ?? null;
}

export async function upsertMarketQuote(input: Omit<MarketQuoteRecord, "id">): Promise<MarketQuoteRecord> {
  const canonicalTicker = normalizeTicker(input.ticker);

  if (isDatabaseConnected()) {
    const quote = await MarketQuoteModel.findOneAndUpdate(
      { ticker: canonicalTicker },
      { ...input, ticker: canonicalTicker },
      { new: true, upsert: true }
    ).lean();
    return withId(quote) as unknown as MarketQuoteRecord;
  }

  const index = localMarketQuotes.findIndex((quote) => quote.ticker === canonicalTicker);
  const quote = { ...input, ticker: canonicalTicker, id: localMarketQuotes[index]?.id ?? randomUUID() };
  if (index >= 0) localMarketQuotes[index] = quote;
  else localMarketQuotes = [quote, ...localMarketQuotes];
  return quote;
}

export async function createPriceHistory(input: Omit<PriceHistoryRecord, "id">): Promise<PriceHistoryRecord> {
  const canonicalTicker = normalizeTicker(input.ticker);
  if (!Number.isFinite(input.price) || input.price <= 0) {
    throw new Error(`Invalid price history value for ${canonicalTicker}`);
  }

  if (isDatabaseConnected()) {
    const history = await PriceHistoryModel.findOneAndUpdate(
      { ticker: canonicalTicker, capturedAt: input.capturedAt, source: input.source },
      { ...input, ticker: canonicalTicker },
      { new: true, upsert: true }
    ).lean();
    return withId(history) as unknown as PriceHistoryRecord;
  }

  const exists = localPriceHistory.some(
    (item) =>
      item.ticker === canonicalTicker &&
      new Date(item.capturedAt).getTime() === new Date(input.capturedAt).getTime() &&
      item.source === input.source
  );
  if (exists) return localPriceHistory.find((item) => item.ticker === canonicalTicker && item.source === input.source) as PriceHistoryRecord;
  const history = { ...input, ticker: canonicalTicker, id: randomUUID() };
  localPriceHistory = [history, ...localPriceHistory];
  return history;
}

export async function listPriceHistory(ticker?: string): Promise<PriceHistoryRecord[]> {
  const canonicalTicker = ticker ? normalizeTicker(ticker) : undefined;

  if (isDatabaseConnected()) {
    const query = canonicalTicker ? { ticker: canonicalTicker } : {};
    const history = await PriceHistoryModel.find(query).sort({ capturedAt: 1 }).lean();
    return history.map((item) => withId(item)) as unknown as PriceHistoryRecord[];
  }

  return localPriceHistory
    .filter((item) => !canonicalTicker || item.ticker === canonicalTicker)
    .sort((left, right) => new Date(left.capturedAt).getTime() - new Date(right.capturedAt).getTime());
}

function normalizeCashBoxYield(record: unknown): CashBoxYieldRecord {
  const plain = withId(record) as Record<string, unknown> & { cashBoxId?: { toString: () => string } };
  return {
    ...plain,
    cashBoxId: plain.cashBoxId?.toString?.() ?? String(plain.cashBoxId ?? "")
  } as unknown as CashBoxYieldRecord;
}

export async function listCdiRates(limit?: number): Promise<CdiRateRecord[]> {
  if (isDatabaseConnected()) {
    const query = CdiRateModel.find().sort({ referenceDate: -1 });
    if (limit) query.limit(limit);
    const rates = await query.lean();
    return rates.map((rate) => withId(rate)) as unknown as CdiRateRecord[];
  }

  return [...localCdiRates].sort((left, right) => right.referenceDate.localeCompare(left.referenceDate)).slice(0, limit);
}

export async function getLatestCdiRate(): Promise<CdiRateRecord | null> {
  return (await listCdiRates(1))[0] ?? null;
}

export async function upsertCdiRate(input: Omit<CdiRateRecord, "id">): Promise<CdiRateRecord> {
  if (isDatabaseConnected()) {
    const rate = await CdiRateModel.findOneAndUpdate({ referenceDate: input.referenceDate }, input, { new: true, upsert: true }).lean();
    return withId(rate) as unknown as CdiRateRecord;
  }

  const index = localCdiRates.findIndex((rate) => rate.referenceDate === input.referenceDate);
  const rate = { ...input, id: localCdiRates[index]?.id ?? randomUUID() };
  if (index >= 0) localCdiRates[index] = rate;
  else localCdiRates = [rate, ...localCdiRates];
  return rate;
}

export async function findCashBoxYield(cashBoxId: string, referenceDate: string): Promise<CashBoxYieldRecord | null> {
  if (isDatabaseConnected()) {
    const yieldRecord = await CashBoxYieldModel.findOne({ cashBoxId, referenceDate }).lean();
    return yieldRecord ? normalizeCashBoxYield(yieldRecord) : null;
  }

  return localCashBoxYields.find((yieldRecord) => yieldRecord.cashBoxId === cashBoxId && yieldRecord.referenceDate === referenceDate) ?? null;
}

export async function createCashBoxYield(input: Omit<CashBoxYieldRecord, "id">): Promise<CashBoxYieldRecord> {
  if (isDatabaseConnected()) {
    const yieldRecord = await CashBoxYieldModel.findOneAndUpdate(
      { cashBoxId: input.cashBoxId, referenceDate: input.referenceDate },
      input,
      { new: true, upsert: true }
    ).lean();
    return normalizeCashBoxYield(yieldRecord);
  }

  const existing = await findCashBoxYield(input.cashBoxId, input.referenceDate);
  if (existing) return existing;
  const yieldRecord = { ...input, id: randomUUID() };
  localCashBoxYields = [yieldRecord, ...localCashBoxYields];
  return yieldRecord;
}

export async function listCashBoxYields(cashBoxId?: string): Promise<CashBoxYieldRecord[]> {
  if (isDatabaseConnected()) {
    const query = cashBoxId ? { cashBoxId } : {};
    const yieldRecords = await CashBoxYieldModel.find(query).sort({ referenceDate: -1 }).lean();
    return yieldRecords.map(normalizeCashBoxYield);
  }

  return localCashBoxYields
    .filter((yieldRecord) => !cashBoxId || yieldRecord.cashBoxId === cashBoxId)
    .sort((left, right) => right.referenceDate.localeCompare(left.referenceDate));
}

export async function findAssetByTicker(ticker: string): Promise<AssetRecord | null> {
  const canonicalTicker = normalizeTicker(ticker);

  if (isDatabaseConnected()) {
    const asset = await AssetModel.findOne({ ticker: canonicalTicker, active: true }).lean();
    return asset ? (withId(asset) as unknown as AssetRecord) : null;
  }

  return localAssets.find((asset) => asset.ticker === canonicalTicker && asset.active) ?? null;
}

export async function findAssetById(id: string): Promise<AssetRecord | null> {
  if (isDatabaseConnected()) {
    const asset = await AssetModel.findById(id).lean();
    return asset ? (withId(asset) as unknown as AssetRecord) : null;
  }

  return localAssets.find((asset) => asset.id === id && asset.active) ?? null;
}

export async function createAsset(input: Omit<AssetRecord, "id" | "createdAt">): Promise<AssetRecord> {
  const normalizedInput = { ...input, ticker: normalizeTicker(input.ticker) };

  if (isDatabaseConnected()) {
    return withId(await AssetModel.create(normalizedInput).then((asset) => asset.toObject())) as unknown as AssetRecord;
  }

  const asset = { ...normalizedInput, id: randomUUID(), createdAt: new Date().toISOString() };
  localAssets = [asset, ...localAssets];
  return asset;
}

export async function updateAsset(ticker: string, input: Partial<Omit<AssetRecord, "id" | "createdAt">>): Promise<AssetRecord | null> {
  const isObjectId = /^[a-f\d]{24}$/i.test(ticker);
  const canonicalTicker = normalizeTicker(ticker);
  const normalizedInput = input.ticker ? { ...input, ticker: normalizeTicker(input.ticker) } : input;

  if (isDatabaseConnected()) {
    const query = isObjectId ? { _id: ticker } : { ticker: canonicalTicker };
    const asset = await AssetModel.findOneAndUpdate(query, normalizedInput, { new: true }).lean();
    return asset ? (withId(asset) as unknown as AssetRecord) : null;
  }

  const index = localAssets.findIndex((asset) => asset.id === ticker || asset.ticker === canonicalTicker);
  if (index < 0) return null;
  localAssets[index] = { ...localAssets[index], ...normalizedInput, ticker: normalizedInput.ticker ?? localAssets[index].ticker };
  return localAssets[index];
}

export async function deleteAsset(ticker: string): Promise<boolean> {
  const isObjectId = /^[a-f\d]{24}$/i.test(ticker);
  const canonicalTicker = normalizeTicker(ticker);

  if (isDatabaseConnected()) {
    const query = isObjectId ? { _id: ticker } : { ticker: canonicalTicker };
    const result = await AssetModel.findOneAndUpdate(query, { active: false });
    return Boolean(result);
  }

  const before = localAssets.length;
  localAssets = localAssets.map((asset) => (asset.id === ticker || asset.ticker === canonicalTicker ? { ...asset, active: false } : asset));
  return localAssets.length === before;
}

export async function listOperations(): Promise<OperationRecord[]> {
  if (isDatabaseConnected()) {
    const operations = await OperationModel.find({ type: { $in: positionOperationTypes } }).sort({ date: -1 }).lean();
    return operations.map((operation) => withId(operation)) as unknown as OperationRecord[];
  }

  return localOperations.filter((operation) => positionOperationTypes.includes(operation.type)).sort(byDateDesc);
}

export async function findOperationById(id: string): Promise<OperationRecord | null> {
  if (isDatabaseConnected()) {
    const operation = await OperationModel.findById(id).lean();
    return operation ? (withId(operation) as unknown as OperationRecord) : null;
  }

  return localOperations.find((operation) => operation.id === id) ?? null;
}

export async function createOperation(input: Omit<OperationRecord, "id">): Promise<OperationRecord> {
  const normalizedInput = input.assetTicker ? { ...input, assetTicker: normalizeTicker(input.assetTicker) } : input;

  if (isDatabaseConnected()) {
    return withId(await OperationModel.create(normalizedInput).then((operation) => operation.toObject())) as unknown as OperationRecord;
  }

  const operation = { ...normalizedInput, id: randomUUID() };
  localOperations = [operation, ...localOperations];
  return operation;
}

export async function updateOperation(id: string, input: Partial<Omit<OperationRecord, "id">>): Promise<OperationRecord | null> {
  const normalizedInput = input.assetTicker ? { ...input, assetTicker: normalizeTicker(input.assetTicker) } : input;

  if (isDatabaseConnected()) {
    const operation = await OperationModel.findByIdAndUpdate(id, normalizedInput, { new: true }).lean();
    return operation ? (withId(operation) as unknown as OperationRecord) : null;
  }

  const index = localOperations.findIndex((operation) => operation.id === id);
  if (index < 0) return null;
  localOperations[index] = { ...localOperations[index], ...normalizedInput };
  return localOperations[index];
}

export async function deleteOperation(id: string): Promise<boolean> {
  if (isDatabaseConnected()) {
    const result = await OperationModel.findByIdAndDelete(id);
    return Boolean(result);
  }

  const before = localOperations.length;
  localOperations = localOperations.filter((operation) => operation.id !== id);
  return localOperations.length < before;
}

export async function listDividends(): Promise<DividendRecord[]> {
  if (isDatabaseConnected()) {
    const dividends = await DividendModel.find().sort({ paymentDate: -1 }).lean();
    return dividends.map((dividend) => withId(dividend)) as unknown as DividendRecord[];
  }

  return [...localDividends].sort(byDateDesc);
}

export async function findDividendById(id: string): Promise<DividendRecord | null> {
  if (isDatabaseConnected()) {
    const dividend = await DividendModel.findById(id).lean();
    return dividend ? (withId(dividend) as unknown as DividendRecord) : null;
  }

  return localDividends.find((dividend) => dividend.id === id) ?? null;
}

export async function createDividend(input: Omit<DividendRecord, "id">): Promise<DividendRecord> {
  const normalizedInput = input.assetTicker ? { ...input, assetTicker: normalizeTicker(input.assetTicker) } : input;

  if (isDatabaseConnected()) {
    return withId(await DividendModel.create(normalizedInput).then((dividend) => dividend.toObject())) as unknown as DividendRecord;
  }

  const dividend = { ...normalizedInput, id: randomUUID() };
  localDividends = [dividend, ...localDividends];
  return dividend;
}

export async function updateDividend(id: string, input: Partial<Omit<DividendRecord, "id">>): Promise<DividendRecord | null> {
  const normalizedInput = input.assetTicker ? { ...input, assetTicker: normalizeTicker(input.assetTicker) } : input;

  if (isDatabaseConnected()) {
    const dividend = await DividendModel.findByIdAndUpdate(id, normalizedInput, { new: true }).lean();
    return dividend ? (withId(dividend) as unknown as DividendRecord) : null;
  }

  const index = localDividends.findIndex((dividend) => dividend.id === id);
  if (index < 0) return null;
  localDividends[index] = { ...localDividends[index], ...normalizedInput };
  return localDividends[index];
}

export async function deleteDividend(id: string): Promise<boolean> {
  if (isDatabaseConnected()) {
    const result = await DividendModel.findByIdAndDelete(id);
    return Boolean(result);
  }

  const before = localDividends.length;
  localDividends = localDividends.filter((dividend) => dividend.id !== id);
  return localDividends.length < before;
}

export async function listContributions(): Promise<ContributionRecord[]> {
  if (isDatabaseConnected()) {
    const contributions = await ContributionModel.find().sort({ date: -1 }).lean();
    return contributions.map((contribution) => withId(contribution)) as unknown as ContributionRecord[];
  }

  return [...localContributions].sort(byDateDesc);
}

export async function findContributionById(id: string): Promise<ContributionRecord | null> {
  if (isDatabaseConnected()) {
    const contribution = await ContributionModel.findById(id).lean();
    return contribution ? (withId(contribution) as unknown as ContributionRecord) : null;
  }

  return localContributions.find((contribution) => contribution.id === id) ?? null;
}

export async function createContribution(input: Omit<ContributionRecord, "id">): Promise<ContributionRecord> {
  if (isDatabaseConnected()) {
    return withId(await ContributionModel.create(input).then((contribution) => contribution.toObject())) as unknown as ContributionRecord;
  }

  const contribution = { ...input, id: randomUUID() };
  localContributions = [contribution, ...localContributions];
  return contribution;
}

export async function updateContribution(id: string, input: Partial<Omit<ContributionRecord, "id">>): Promise<ContributionRecord | null> {
  if (isDatabaseConnected()) {
    const contribution = await ContributionModel.findByIdAndUpdate(id, input, { new: true }).lean();
    return contribution ? (withId(contribution) as unknown as ContributionRecord) : null;
  }

  const index = localContributions.findIndex((contribution) => contribution.id === id);
  if (index < 0) return null;
  localContributions[index] = { ...localContributions[index], ...input };
  return localContributions[index];
}

export async function deleteContribution(id: string): Promise<boolean> {
  if (isDatabaseConnected()) {
    const result = await ContributionModel.findByIdAndDelete(id);
    return Boolean(result);
  }

  const before = localContributions.length;
  localContributions = localContributions.filter((contribution) => contribution.id !== id);
  return localContributions.length < before;
}

export async function listGoals(): Promise<GoalRecord[]> {
  if (isDatabaseConnected()) {
    const goals = await GoalModel.find({ active: true }).sort({ createdAt: -1 }).lean();
    return goals.map((goal) => withId(goal)) as unknown as GoalRecord[];
  }

  return [...localGoals].filter((goal) => goal.active);
}

export async function findGoalById(id: string): Promise<GoalRecord | null> {
  if (isDatabaseConnected()) {
    const goal = await GoalModel.findById(id).lean();
    return goal ? (withId(goal) as unknown as GoalRecord) : null;
  }

  return localGoals.find((goal) => goal.id === id && goal.active) ?? null;
}

export async function createGoal(input: Omit<GoalRecord, "id">): Promise<GoalRecord> {
  if (isDatabaseConnected()) {
    return withId(await GoalModel.create(input).then((goal) => goal.toObject())) as unknown as GoalRecord;
  }

  const goal = { ...input, id: randomUUID() };
  localGoals = [goal, ...localGoals];
  return goal;
}

export async function updateGoal(id: string, input: Partial<Omit<GoalRecord, "id">>): Promise<GoalRecord | null> {
  if (isDatabaseConnected()) {
    const goal = await GoalModel.findByIdAndUpdate(id, input, { new: true }).lean();
    return goal ? (withId(goal) as unknown as GoalRecord) : null;
  }

  const index = localGoals.findIndex((goal) => goal.id === id);
  if (index < 0) return null;
  localGoals[index] = { ...localGoals[index], ...input };
  return localGoals[index];
}

export async function deleteGoal(id: string): Promise<boolean> {
  if (isDatabaseConnected()) {
    const result = await GoalModel.findByIdAndUpdate(id, { active: false });
    return Boolean(result);
  }

  const before = localGoals.length;
  localGoals = localGoals.map((goal) => (goal.id === id ? { ...goal, active: false } : goal));
  return localGoals.length === before;
}

export async function listCashBoxes(): Promise<CashBoxRecord[]> {
  if (isDatabaseConnected()) {
    const cashBoxes = await CashBoxModel.find({ active: true }).sort({ name: 1 }).lean();
    return cashBoxes.map((cashBox) => withId(cashBox)) as unknown as CashBoxRecord[];
  }

  return [...localCashBoxes].filter((cashBox) => cashBox.active);
}

export async function findCashBoxById(id: string): Promise<CashBoxRecord | null> {
  if (isDatabaseConnected()) {
    const cashBox = await CashBoxModel.findById(id).lean();
    return cashBox ? (withId(cashBox) as unknown as CashBoxRecord) : null;
  }

  return localCashBoxes.find((cashBox) => cashBox.id === id && cashBox.active) ?? null;
}

export async function createCashBox(input: Omit<CashBoxRecord, "id">): Promise<CashBoxRecord> {
  if (isDatabaseConnected()) {
    return withId(await CashBoxModel.create(input).then((cashBox) => cashBox.toObject())) as unknown as CashBoxRecord;
  }

  const cashBox = { ...input, id: randomUUID() };
  localCashBoxes = [cashBox, ...localCashBoxes];
  return cashBox;
}

export async function updateCashBox(id: string, input: Partial<Omit<CashBoxRecord, "id">>): Promise<CashBoxRecord | null> {
  if (isDatabaseConnected()) {
    const cashBox = await CashBoxModel.findByIdAndUpdate(id, input, { new: true }).lean();
    return cashBox ? (withId(cashBox) as unknown as CashBoxRecord) : null;
  }

  const index = localCashBoxes.findIndex((cashBox) => cashBox.id === id);
  if (index < 0) return null;
  localCashBoxes[index] = { ...localCashBoxes[index], ...input };
  return localCashBoxes[index];
}

export async function deleteCashBox(id: string): Promise<boolean> {
  if (isDatabaseConnected()) {
    const result = await CashBoxModel.findByIdAndUpdate(id, { active: false });
    return Boolean(result);
  }

  const before = localCashBoxes.length;
  localCashBoxes = localCashBoxes.map((cashBox) => (cashBox.id === id ? { ...cashBox, active: false } : cashBox));
  return localCashBoxes.length === before;
}

function isContributionMovement(type: string) {
  return type === "DEPOSITO" || type === "contribution";
}

function isWithdrawalMovement(type: string) {
  return type === "RESGATE" || type === "withdrawal";
}

function isYieldMovement(type: string) {
  return type === "RENDIMENTO" || type === "yield";
}

function deriveCashBoxFields(cashBox: CashBoxRecord) {
  const movements = cashBox.movements ?? [];
  const movementContributions = sum(movements.filter((movement) => isContributionMovement(movement.type)).map((movement) => movement.value));
  const movementWithdrawals = sum(movements.filter((movement) => isWithdrawalMovement(movement.type)).map((movement) => movement.value));
  const movementYield = sum(movements.filter((movement) => isYieldMovement(movement.type)).map((movement) => movement.value));
  const initialBalance =
    cashBox.initialBalance ??
    Math.max((cashBox.currentBalance ?? 0) - movementContributions + movementWithdrawals - movementYield, 0);

  return {
    categoryId: cashBox.categoryId ?? "cash",
    initialBalance,
    totalContributions: cashBox.totalContributions ?? initialBalance + movementContributions,
    totalWithdrawals: cashBox.totalWithdrawals ?? movementWithdrawals,
    totalYield: cashBox.totalYield ?? movementYield,
    currentBalance: cashBox.currentBalance ?? Math.max(initialBalance + movementContributions - movementWithdrawals + movementYield, 0),
    lastYieldCalculationAt: cashBox.lastYieldCalculationAt ?? new Date()
  };
}

export async function migrateCashBoxes(): Promise<{ updated: number }> {
  const cashBoxes = await listCashBoxes();
  let updated = 0;

  for (const cashBox of cashBoxes) {
    const derived = deriveCashBoxFields(cashBox);
    const needsMigration =
      cashBox.categoryId !== derived.categoryId ||
      cashBox.initialBalance === undefined ||
      cashBox.totalContributions === undefined ||
      cashBox.totalWithdrawals === undefined ||
      cashBox.totalYield === undefined ||
      cashBox.lastYieldCalculationAt === undefined;

    if (!needsMigration || !cashBox.id) continue;
    await updateCashBox(cashBox.id, derived);
    updated += 1;
  }

  return { updated };
}

export async function getSettingsRecord(): Promise<SettingsRecord> {
  if (isDatabaseConnected()) {
    const settings = await SettingsModel.findOne().lean();
    if (settings) {
      const normalized = withDefaultAllocations(withId(settings) as unknown as SettingsRecord);
      if (normalized.allocations.length !== ((settings as unknown as SettingsRecord).allocations ?? []).length) {
        await SettingsModel.findByIdAndUpdate(normalized.id, { allocations: normalized.allocations });
      }
      return normalized;
    }
    return withId(await SettingsModel.create(createEmptySettings()).then((record) => record.toObject())) as unknown as SettingsRecord;
  }

  localSettings = withDefaultAllocations(localSettings);
  return localSettings;
}

export async function updateSettingsRecord(input: Partial<SettingsRecord>): Promise<SettingsRecord> {
  if (isDatabaseConnected()) {
    const existing = await SettingsModel.findOne();
    if (existing) {
      Object.assign(existing, input);
      return withId(await existing.save().then((record: { toObject: () => unknown }) => record.toObject())) as unknown as SettingsRecord;
    }
    return withId(await SettingsModel.create({ ...createEmptySettings(), ...input }).then((record) => record.toObject())) as unknown as SettingsRecord;
  }

  localSettings = { ...localSettings, ...input };
  return localSettings;
}

export async function resetSettingsRecord(): Promise<SettingsRecord> {
  const settings = createEmptySettings();

  if (isDatabaseConnected()) {
    await SettingsModel.deleteMany({});
    return withId(await SettingsModel.create(settings).then((record) => record.toObject())) as unknown as SettingsRecord;
  }

  localSettings = settings;
  return localSettings;
}

export async function listAllocations(): Promise<AllocationRecord[]> {
  return (await getSettingsRecord()).allocations;
}

export async function replaceAllocations(input: Array<{ category: string; targetPercentage: number; priority?: number }>): Promise<AllocationRecord[]> {
  const allocations = input.map((item, index) => ({
    category: item.category,
    targetPercentage: item.targetPercentage,
    priority: item.priority ?? index + 1
  }));

  await updateSettingsRecord({ allocations });
  return allocations;
}

export async function listCategories() {
  const allocations = await listAllocations();

  return allocations.map((allocation) => ({
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
  }));
}

export async function listSnapshots(): Promise<SnapshotRecord[]> {
  if (isDatabaseConnected()) {
    const snapshots = await SnapshotModel.find().sort({ date: 1 }).lean();
    return snapshots as unknown as SnapshotRecord[];
  }

  return [...localSnapshots].sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
}
