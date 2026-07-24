import { isDatabaseConnected } from "../config/database";
import { randomUUID } from "crypto";
import { AssetModel } from "../models/asset.model";
import { CashBoxModel } from "../models/cash-box.model";
import { ContributionModel } from "../models/contribution.model";
import { DividendModel } from "../models/dividend.model";
import { GoalModel } from "../models/goal.model";
import { OperationModel } from "../models/operation.model";
import { SettingsModel } from "../models/settings.model";
import { SnapshotModel } from "../models/snapshot.model";
import type {
  AllocationRecord,
  AssetRecord,
  CashBoxRecord,
  ContributionRecord,
  DividendRecord,
  GoalRecord,
  OperationRecord,
  SettingsRecord,
  SnapshotRecord
} from "../types/investment";

const positionOperationTypes = ["COMPRA", "VENDA", "BONIFICACAO", "DESDOBRAMENTO", "GRUPAMENTO"];

const baseAllocations: AllocationRecord[] = [
  { category: "FII", targetPercentage: 0, priority: 1 },
  { category: "ACAO", targetPercentage: 0, priority: 2 },
  { category: "ETF", targetPercentage: 0, priority: 3 },
  { category: "CRIPTO", targetPercentage: 0, priority: 4 }
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

let localAssets: AssetRecord[] = [];
let localOperations: OperationRecord[] = [];
let localDividends: DividendRecord[] = [];
let localContributions: ContributionRecord[] = [];
let localGoals: GoalRecord[] = [];
let localCashBoxes: CashBoxRecord[] = [];
let localSettings: SettingsRecord = createEmptySettings();
let localSnapshots: SnapshotRecord[] = [];

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

export async function listAssets(): Promise<AssetRecord[]> {
  if (isDatabaseConnected()) {
    const assets = await AssetModel.find({ active: true }).sort({ ticker: 1 }).lean();
    return assets.map((asset) => withId(asset)) as unknown as AssetRecord[];
  }

  return [...localAssets].sort((left, right) => left.ticker.localeCompare(right.ticker));
}

export async function findAssetByTicker(ticker: string): Promise<AssetRecord | null> {
  if (isDatabaseConnected()) {
    const asset = await AssetModel.findOne({ ticker: ticker.toUpperCase(), active: true }).lean();
    return asset ? (withId(asset) as unknown as AssetRecord) : null;
  }

  return localAssets.find((asset) => asset.ticker === ticker.toUpperCase() && asset.active) ?? null;
}

export async function findAssetById(id: string): Promise<AssetRecord | null> {
  if (isDatabaseConnected()) {
    const asset = await AssetModel.findById(id).lean();
    return asset ? (withId(asset) as unknown as AssetRecord) : null;
  }

  return localAssets.find((asset) => asset.id === id && asset.active) ?? null;
}

export async function createAsset(input: Omit<AssetRecord, "id" | "createdAt">): Promise<AssetRecord> {
  if (isDatabaseConnected()) {
    return withId(await AssetModel.create(input).then((asset) => asset.toObject())) as unknown as AssetRecord;
  }

  const asset = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
  localAssets = [asset, ...localAssets];
  return asset;
}

export async function updateAsset(ticker: string, input: Partial<Omit<AssetRecord, "id" | "createdAt">>): Promise<AssetRecord | null> {
  const isObjectId = /^[a-f\d]{24}$/i.test(ticker);

  if (isDatabaseConnected()) {
    const query = isObjectId ? { _id: ticker } : { ticker: ticker.toUpperCase() };
    const asset = await AssetModel.findOneAndUpdate(query, input, { new: true }).lean();
    return asset ? (withId(asset) as unknown as AssetRecord) : null;
  }

  const index = localAssets.findIndex((asset) => asset.id === ticker || asset.ticker === ticker.toUpperCase());
  if (index < 0) return null;
  localAssets[index] = { ...localAssets[index], ...input, ticker: input.ticker?.toUpperCase() ?? localAssets[index].ticker };
  return localAssets[index];
}

export async function deleteAsset(ticker: string): Promise<boolean> {
  const isObjectId = /^[a-f\d]{24}$/i.test(ticker);

  if (isDatabaseConnected()) {
    const query = isObjectId ? { _id: ticker } : { ticker: ticker.toUpperCase() };
    const result = await AssetModel.findOneAndUpdate(query, { active: false });
    return Boolean(result);
  }

  const before = localAssets.length;
  localAssets = localAssets.map((asset) => (asset.id === ticker || asset.ticker === ticker.toUpperCase() ? { ...asset, active: false } : asset));
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
  if (isDatabaseConnected()) {
    return withId(await OperationModel.create(input).then((operation) => operation.toObject())) as unknown as OperationRecord;
  }

  const operation = { ...input, id: randomUUID() };
  localOperations = [operation, ...localOperations];
  return operation;
}

export async function updateOperation(id: string, input: Partial<Omit<OperationRecord, "id">>): Promise<OperationRecord | null> {
  if (isDatabaseConnected()) {
    const operation = await OperationModel.findByIdAndUpdate(id, input, { new: true }).lean();
    return operation ? (withId(operation) as unknown as OperationRecord) : null;
  }

  const index = localOperations.findIndex((operation) => operation.id === id);
  if (index < 0) return null;
  localOperations[index] = { ...localOperations[index], ...input };
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
  if (isDatabaseConnected()) {
    return withId(await DividendModel.create(input).then((dividend) => dividend.toObject())) as unknown as DividendRecord;
  }

  const dividend = { ...input, id: randomUUID() };
  localDividends = [dividend, ...localDividends];
  return dividend;
}

export async function updateDividend(id: string, input: Partial<Omit<DividendRecord, "id">>): Promise<DividendRecord | null> {
  if (isDatabaseConnected()) {
    const dividend = await DividendModel.findByIdAndUpdate(id, input, { new: true }).lean();
    return dividend ? (withId(dividend) as unknown as DividendRecord) : null;
  }

  const index = localDividends.findIndex((dividend) => dividend.id === id);
  if (index < 0) return null;
  localDividends[index] = { ...localDividends[index], ...input };
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

export async function getSettingsRecord(): Promise<SettingsRecord> {
  if (isDatabaseConnected()) {
    const settings = await SettingsModel.findOne().lean();
    if (settings) return withId(settings) as unknown as SettingsRecord;
    return withId(await SettingsModel.create(createEmptySettings()).then((record) => record.toObject())) as unknown as SettingsRecord;
  }

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
        RENDA_FIXA: "#fb7185"
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
