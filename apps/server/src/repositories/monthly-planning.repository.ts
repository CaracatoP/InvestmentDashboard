import { randomUUID } from "crypto";
import { getCurrentUserId, SYSTEM_USER_ID } from "../auth/auth-context";
import { isDatabaseConnected } from "../config/database";
import { MonthlyExpenseModel } from "../models/monthly-expense.model";
import { MonthlyIncomeEntryModel } from "../models/monthly-income-entry.model";
import { MonthlyPlanModel } from "../models/monthly-plan.model";
import type { MonthlyExpenseRecord, MonthlyIncomeEntryRecord, MonthlyPlanRecord } from "../types/investment";

let localMonthlyPlans: MonthlyPlanRecord[] = [];
let localMonthlyExpenses: MonthlyExpenseRecord[] = [];
let localMonthlyIncomeEntries: MonthlyIncomeEntryRecord[] = [];
const monthlyExpenseCreationLocks = new Map<string, Promise<{ expense: MonthlyExpenseRecord; created: boolean }>>();
const monthlyIncomeEntryCreationLocks = new Map<string, Promise<{ incomeEntry: MonthlyIncomeEntryRecord; created: boolean }>>();
const emptyMongoOwnerId = "000000000000000000000000";

function currentOwnerId() {
  const userId = getCurrentUserId();
  return isDatabaseConnected() && userId === SYSTEM_USER_ID ? emptyMongoOwnerId : userId;
}

function ownerFilter<T extends object>(filter: T = {} as T) {
  return { ...filter, userId: currentOwnerId() };
}

function withOwner<T extends object>(input: T) {
  return { ...input, userId: currentOwnerId() };
}

function isOwned(record: { userId?: string }) {
  return (record.userId ?? SYSTEM_USER_ID) === currentOwnerId();
}

function withId(record: unknown) {
  const plain = record as Record<string, unknown> & { _id?: { toString: () => string } };
  return {
    ...plain,
    id: plain._id?.toString()
  };
}

function sortExpenses(left: MonthlyExpenseRecord, right: MonthlyExpenseRecord) {
  const leftKey = `${left.date}T${left.time}`;
  const rightKey = `${right.date}T${right.time}`;
  return rightKey.localeCompare(leftKey);
}

function sortIncomeEntries(left: MonthlyIncomeEntryRecord, right: MonthlyIncomeEntryRecord) {
  const leftKey = `${left.date}T${left.time}`;
  const rightKey = `${right.date}T${right.time}`;
  return rightKey.localeCompare(leftKey);
}

export async function listMonthlyPlans(): Promise<MonthlyPlanRecord[]> {
  if (isDatabaseConnected()) {
    const plans = await MonthlyPlanModel.find(ownerFilter()).sort({ year: -1, month: -1 }).lean();
    return plans.map((plan) => withId(plan)) as unknown as MonthlyPlanRecord[];
  }

  return localMonthlyPlans.filter(isOwned).sort((left, right) => right.year - left.year || right.month - left.month);
}

export async function findMonthlyPlanByMonth(year: number, month: number): Promise<MonthlyPlanRecord | null> {
  if (isDatabaseConnected()) {
    const plan = await MonthlyPlanModel.findOne(ownerFilter({ year, month })).lean();
    return plan ? (withId(plan) as unknown as MonthlyPlanRecord) : null;
  }

  return localMonthlyPlans.find((plan) => isOwned(plan) && plan.year === year && plan.month === month) ?? null;
}

export async function findMonthlyPlanById(id: string): Promise<MonthlyPlanRecord | null> {
  if (isDatabaseConnected()) {
    const plan = await MonthlyPlanModel.findOne(ownerFilter({ _id: id })).lean();
    return plan ? (withId(plan) as unknown as MonthlyPlanRecord) : null;
  }

  return localMonthlyPlans.find((plan) => isOwned(plan) && plan.id === id) ?? null;
}

export async function upsertMonthlyPlan(input: MonthlyPlanRecord): Promise<MonthlyPlanRecord> {
  const payload = withOwner(input);
  if (isDatabaseConnected()) {
    const plan = await MonthlyPlanModel.findOneAndUpdate(
      ownerFilter({ year: input.year, month: input.month }),
      payload,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return withId(plan) as unknown as MonthlyPlanRecord;
  }

  const index = localMonthlyPlans.findIndex((plan) => isOwned(plan) && plan.year === input.year && plan.month === input.month);
  const plan = { ...payload, id: localMonthlyPlans[index]?.id ?? input.id ?? randomUUID() };
  if (index >= 0) localMonthlyPlans[index] = plan;
  else localMonthlyPlans = [plan, ...localMonthlyPlans];
  return plan;
}

export async function updateMonthlyPlan(id: string, input: Partial<MonthlyPlanRecord>): Promise<MonthlyPlanRecord | null> {
  if (isDatabaseConnected()) {
    const plan = await MonthlyPlanModel.findOneAndUpdate(ownerFilter({ _id: id }), input, { new: true }).lean();
    return plan ? (withId(plan) as unknown as MonthlyPlanRecord) : null;
  }

  const index = localMonthlyPlans.findIndex((plan) => isOwned(plan) && plan.id === id);
  if (index < 0) return null;
  localMonthlyPlans[index] = { ...localMonthlyPlans[index], ...input };
  return localMonthlyPlans[index];
}

export async function listMonthlyExpenses(planId: string): Promise<MonthlyExpenseRecord[]> {
  if (isDatabaseConnected()) {
    const expenses = await MonthlyExpenseModel.find(ownerFilter({ planId })).sort({ date: -1, time: -1 }).lean();
    return expenses.map((expense) => withId(expense)) as unknown as MonthlyExpenseRecord[];
  }

  return localMonthlyExpenses.filter((expense) => isOwned(expense) && expense.planId === planId).sort(sortExpenses);
}

export async function listAllMonthlyExpenses(): Promise<MonthlyExpenseRecord[]> {
  if (isDatabaseConnected()) {
    const expenses = await MonthlyExpenseModel.find(ownerFilter()).sort({ date: -1, time: -1 }).lean();
    return expenses.map((expense) => withId(expense)) as unknown as MonthlyExpenseRecord[];
  }

  return localMonthlyExpenses.filter(isOwned).sort(sortExpenses);
}

export async function listMonthlyIncomeEntries(planId: string): Promise<MonthlyIncomeEntryRecord[]> {
  if (isDatabaseConnected()) {
    const entries = await MonthlyIncomeEntryModel.find(ownerFilter({ planId })).sort({ date: -1, time: -1 }).lean();
    return entries.map((entry) => withId(entry)) as unknown as MonthlyIncomeEntryRecord[];
  }

  return localMonthlyIncomeEntries.filter((entry) => isOwned(entry) && entry.planId === planId).sort(sortIncomeEntries);
}

export async function listAllMonthlyIncomeEntries(): Promise<MonthlyIncomeEntryRecord[]> {
  if (isDatabaseConnected()) {
    const entries = await MonthlyIncomeEntryModel.find(ownerFilter()).sort({ date: -1, time: -1 }).lean();
    return entries.map((entry) => withId(entry)) as unknown as MonthlyIncomeEntryRecord[];
  }

  return localMonthlyIncomeEntries.filter(isOwned).sort(sortIncomeEntries);
}

export async function findMonthlyIncomeEntryById(id: string): Promise<MonthlyIncomeEntryRecord | null> {
  if (isDatabaseConnected()) {
    const entry = await MonthlyIncomeEntryModel.findOne(ownerFilter({ _id: id })).lean();
    return entry ? (withId(entry) as unknown as MonthlyIncomeEntryRecord) : null;
  }

  return localMonthlyIncomeEntries.find((entry) => isOwned(entry) && entry.id === id) ?? null;
}

export async function findMonthlyIncomeEntryByIdempotencyKey(idempotencyKey: string): Promise<MonthlyIncomeEntryRecord | null> {
  if (isDatabaseConnected()) {
    const entry = await MonthlyIncomeEntryModel.findOne(ownerFilter({ idempotencyKey })).lean();
    return entry ? (withId(entry) as unknown as MonthlyIncomeEntryRecord) : null;
  }

  return localMonthlyIncomeEntries.find((entry) => isOwned(entry) && entry.idempotencyKey === idempotencyKey) ?? null;
}

export async function findMonthlyIncomeEntryByRecurrenceOccurrence(
  planId: string,
  recurrenceId: string,
  occurrenceDate: string
): Promise<MonthlyIncomeEntryRecord | null> {
  if (isDatabaseConnected()) {
    const entry = await MonthlyIncomeEntryModel.findOne({
      userId: currentOwnerId(),
      planId,
      recurrenceId,
      recurrenceOriginalDate: occurrenceDate
    }).lean();
    return entry ? (withId(entry) as unknown as MonthlyIncomeEntryRecord) : null;
  }

  return (
    localMonthlyIncomeEntries.find(
      (entry) =>
        entry.planId === planId &&
        isOwned(entry) &&
        entry.recurrenceId === recurrenceId &&
        (entry.recurrenceOriginalDate ?? entry.date) === occurrenceDate
    ) ?? null
  );
}

export async function findMonthlyExpenseById(id: string): Promise<MonthlyExpenseRecord | null> {
  if (isDatabaseConnected()) {
    const expense = await MonthlyExpenseModel.findOne(ownerFilter({ _id: id })).lean();
    return expense ? (withId(expense) as unknown as MonthlyExpenseRecord) : null;
  }

  return localMonthlyExpenses.find((expense) => isOwned(expense) && expense.id === id) ?? null;
}

export async function findMonthlyExpenseByIdempotencyKey(idempotencyKey: string): Promise<MonthlyExpenseRecord | null> {
  if (isDatabaseConnected()) {
    const expense = await MonthlyExpenseModel.findOne(ownerFilter({ "integration.idempotencyKey": idempotencyKey })).lean();
    return expense ? (withId(expense) as unknown as MonthlyExpenseRecord) : null;
  }

  return localMonthlyExpenses.find((expense) => isOwned(expense) && expense.integration?.idempotencyKey === idempotencyKey) ?? null;
}

export async function findMonthlyExpenseByRecurrenceOccurrence(
  planId: string,
  recurrenceId: string,
  occurrenceDate: string
): Promise<MonthlyExpenseRecord | null> {
  if (isDatabaseConnected()) {
    const expense = await MonthlyExpenseModel.findOne({
      userId: currentOwnerId(),
      planId,
      recurrenceId,
      recurrenceOriginalDate: occurrenceDate
    }).lean();
    return expense ? (withId(expense) as unknown as MonthlyExpenseRecord) : null;
  }

  return (
    localMonthlyExpenses.find(
      (expense) =>
        expense.planId === planId &&
        isOwned(expense) &&
        expense.recurrenceId === recurrenceId &&
        (expense.recurrenceOriginalDate ?? expense.date) === occurrenceDate
    ) ?? null
  );
}

export async function createMonthlyExpense(input: Omit<MonthlyExpenseRecord, "id">): Promise<MonthlyExpenseRecord> {
  if (isDatabaseConnected()) {
    const expense = await MonthlyExpenseModel.create(withOwner(input)).then((record) => record.toObject());
    return withId(expense) as unknown as MonthlyExpenseRecord;
  }

  const expense = { ...withOwner(input), id: randomUUID() };
  localMonthlyExpenses = [expense, ...localMonthlyExpenses];
  return expense;
}

export async function createMonthlyExpenseIfMissing(input: Omit<MonthlyExpenseRecord, "id">): Promise<{ expense: MonthlyExpenseRecord; created: boolean }> {
  const occurrenceDate = input.recurrenceOriginalDate ?? input.date;
  const shouldDeduplicate = Boolean(input.recurrenceSourceId && input.recurrenceId && occurrenceDate);
  const lockKey = shouldDeduplicate ? `${input.planId}:${input.recurrenceId}:${occurrenceDate}` : "";
  const existingLock = lockKey ? monthlyExpenseCreationLocks.get(lockKey) : undefined;
  if (existingLock) return existingLock;

  const createIfMissing = async () => {
    if (shouldDeduplicate) {
      const existing = await findMonthlyExpenseByRecurrenceOccurrence(input.planId, String(input.recurrenceId), occurrenceDate);
      if (existing) return { expense: existing, created: false };
    }

    try {
      return { expense: await createMonthlyExpense(input), created: true };
    } catch (error) {
      if (!shouldDeduplicate) throw error;

      const duplicateKeyCode = (error as { code?: number }).code;
      if (duplicateKeyCode !== 11000) throw error;

      const existing = await findMonthlyExpenseByRecurrenceOccurrence(input.planId, String(input.recurrenceId), occurrenceDate);
      if (existing) return { expense: existing, created: false };
      throw error;
    }
  };

  if (!lockKey) return createIfMissing();

  const creation = createIfMissing().finally(() => monthlyExpenseCreationLocks.delete(lockKey));
  monthlyExpenseCreationLocks.set(lockKey, creation);
  return creation;
}

export async function createMonthlyIncomeEntry(input: Omit<MonthlyIncomeEntryRecord, "id">): Promise<MonthlyIncomeEntryRecord> {
  if (isDatabaseConnected()) {
    const entry = await MonthlyIncomeEntryModel.create(withOwner(input)).then((record) => record.toObject());
    return withId(entry) as unknown as MonthlyIncomeEntryRecord;
  }

  const entry = { ...withOwner(input), id: randomUUID() };
  localMonthlyIncomeEntries = [entry, ...localMonthlyIncomeEntries];
  return entry;
}

export async function createMonthlyIncomeEntryIfMissing(input: Omit<MonthlyIncomeEntryRecord, "id">): Promise<{ incomeEntry: MonthlyIncomeEntryRecord; created: boolean }> {
  const occurrenceDate = input.recurrenceOriginalDate ?? input.date;
  const shouldDeduplicate = Boolean(input.recurrenceSourceId && input.recurrenceId && occurrenceDate);
  const lockKey = shouldDeduplicate ? `${input.planId}:${input.recurrenceId}:${occurrenceDate}` : "";
  const existingLock = lockKey ? monthlyIncomeEntryCreationLocks.get(lockKey) : undefined;
  if (existingLock) return existingLock;

  const createIfMissing = async () => {
    if (shouldDeduplicate) {
      const existing = await findMonthlyIncomeEntryByRecurrenceOccurrence(input.planId, String(input.recurrenceId), occurrenceDate);
      if (existing) return { incomeEntry: existing, created: false };
    }

    try {
      return { incomeEntry: await createMonthlyIncomeEntry(input), created: true };
    } catch (error) {
      if (!shouldDeduplicate) throw error;

      const duplicateKeyCode = (error as { code?: number }).code;
      if (duplicateKeyCode !== 11000) throw error;

      const existing = await findMonthlyIncomeEntryByRecurrenceOccurrence(input.planId, String(input.recurrenceId), occurrenceDate);
      if (existing) return { incomeEntry: existing, created: false };
      throw error;
    }
  };

  if (!lockKey) return createIfMissing();

  const creation = createIfMissing().finally(() => monthlyIncomeEntryCreationLocks.delete(lockKey));
  monthlyIncomeEntryCreationLocks.set(lockKey, creation);
  return creation;
}

export async function updateMonthlyExpense(id: string, input: Partial<Omit<MonthlyExpenseRecord, "id">>): Promise<MonthlyExpenseRecord | null> {
  if (isDatabaseConnected()) {
    const expense = await MonthlyExpenseModel.findOneAndUpdate(ownerFilter({ _id: id }), input, { new: true }).lean();
    return expense ? (withId(expense) as unknown as MonthlyExpenseRecord) : null;
  }

  const index = localMonthlyExpenses.findIndex((expense) => isOwned(expense) && expense.id === id);
  if (index < 0) return null;
  localMonthlyExpenses[index] = { ...localMonthlyExpenses[index], ...input };
  return localMonthlyExpenses[index];
}

export async function updateMonthlyIncomeEntry(id: string, input: Partial<Omit<MonthlyIncomeEntryRecord, "id">>): Promise<MonthlyIncomeEntryRecord | null> {
  if (isDatabaseConnected()) {
    const entry = await MonthlyIncomeEntryModel.findOneAndUpdate(ownerFilter({ _id: id }), input, { new: true }).lean();
    return entry ? (withId(entry) as unknown as MonthlyIncomeEntryRecord) : null;
  }

  const index = localMonthlyIncomeEntries.findIndex((entry) => isOwned(entry) && entry.id === id);
  if (index < 0) return null;
  localMonthlyIncomeEntries[index] = { ...localMonthlyIncomeEntries[index], ...input };
  return localMonthlyIncomeEntries[index];
}

export async function updateMonthlyIncomeEntriesByRecurrenceId(recurrenceId: string, input: Partial<Omit<MonthlyIncomeEntryRecord, "id">>): Promise<number> {
  if (isDatabaseConnected()) {
    const result = await MonthlyIncomeEntryModel.updateMany(ownerFilter({ recurrenceId }), input);
    return result.modifiedCount;
  }

  let updated = 0;
  localMonthlyIncomeEntries = localMonthlyIncomeEntries.map((entry) => {
    if (!isOwned(entry) || entry.recurrenceId !== recurrenceId) return entry;
    updated += 1;
    return { ...entry, ...input };
  });
  return updated;
}

export async function updateMonthlyExpensesByRecurrenceId(recurrenceId: string, input: Partial<Omit<MonthlyExpenseRecord, "id">>): Promise<number> {
  if (isDatabaseConnected()) {
    const result = await MonthlyExpenseModel.updateMany(ownerFilter({ recurrenceId }), input);
    return result.modifiedCount;
  }

  let updated = 0;
  localMonthlyExpenses = localMonthlyExpenses.map((expense) => {
    if (!isOwned(expense) || expense.recurrenceId !== recurrenceId) return expense;
    updated += 1;
    return { ...expense, ...input };
  });
  return updated;
}

export async function deleteMonthlyExpense(id: string): Promise<boolean> {
  if (isDatabaseConnected()) {
    const result = await MonthlyExpenseModel.findOneAndDelete(ownerFilter({ _id: id }));
    return Boolean(result);
  }

  const before = localMonthlyExpenses.length;
  localMonthlyExpenses = localMonthlyExpenses.filter((expense) => !(isOwned(expense) && expense.id === id));
  return localMonthlyExpenses.length < before;
}

export async function deleteMonthlyExpensesByRecurrenceId(recurrenceId: string): Promise<number> {
  if (isDatabaseConnected()) {
    const result = await MonthlyExpenseModel.deleteMany(ownerFilter({ recurrenceId }));
    return result.deletedCount;
  }

  const before = localMonthlyExpenses.length;
  localMonthlyExpenses = localMonthlyExpenses.filter((expense) => !(isOwned(expense) && expense.recurrenceId === recurrenceId));
  return before - localMonthlyExpenses.length;
}

export async function deleteMonthlyIncomeEntry(id: string): Promise<boolean> {
  if (isDatabaseConnected()) {
    const result = await MonthlyIncomeEntryModel.findOneAndDelete(ownerFilter({ _id: id }));
    return Boolean(result);
  }

  const before = localMonthlyIncomeEntries.length;
  localMonthlyIncomeEntries = localMonthlyIncomeEntries.filter((entry) => !(isOwned(entry) && entry.id === id));
  return localMonthlyIncomeEntries.length < before;
}

export async function deleteMonthlyIncomeEntriesByRecurrenceId(recurrenceId: string): Promise<number> {
  if (isDatabaseConnected()) {
    const result = await MonthlyIncomeEntryModel.deleteMany(ownerFilter({ recurrenceId }));
    return result.deletedCount;
  }

  const before = localMonthlyIncomeEntries.length;
  localMonthlyIncomeEntries = localMonthlyIncomeEntries.filter((entry) => !(isOwned(entry) && entry.recurrenceId === recurrenceId));
  return before - localMonthlyIncomeEntries.length;
}
