import { randomUUID } from "crypto";
import { isDatabaseConnected } from "../config/database";
import { MonthlyExpenseModel } from "../models/monthly-expense.model";
import { MonthlyPlanModel } from "../models/monthly-plan.model";
import type { MonthlyExpenseRecord, MonthlyPlanRecord } from "../types/investment";

let localMonthlyPlans: MonthlyPlanRecord[] = [];
let localMonthlyExpenses: MonthlyExpenseRecord[] = [];

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

export async function listMonthlyPlans(): Promise<MonthlyPlanRecord[]> {
  if (isDatabaseConnected()) {
    const plans = await MonthlyPlanModel.find().sort({ year: -1, month: -1 }).lean();
    return plans.map((plan) => withId(plan)) as unknown as MonthlyPlanRecord[];
  }

  return [...localMonthlyPlans].sort((left, right) => right.year - left.year || right.month - left.month);
}

export async function findMonthlyPlanByMonth(year: number, month: number): Promise<MonthlyPlanRecord | null> {
  if (isDatabaseConnected()) {
    const plan = await MonthlyPlanModel.findOne({ year, month }).lean();
    return plan ? (withId(plan) as unknown as MonthlyPlanRecord) : null;
  }

  return localMonthlyPlans.find((plan) => plan.year === year && plan.month === month) ?? null;
}

export async function findMonthlyPlanById(id: string): Promise<MonthlyPlanRecord | null> {
  if (isDatabaseConnected()) {
    const plan = await MonthlyPlanModel.findById(id).lean();
    return plan ? (withId(plan) as unknown as MonthlyPlanRecord) : null;
  }

  return localMonthlyPlans.find((plan) => plan.id === id) ?? null;
}

export async function upsertMonthlyPlan(input: MonthlyPlanRecord): Promise<MonthlyPlanRecord> {
  if (isDatabaseConnected()) {
    const plan = await MonthlyPlanModel.findOneAndUpdate(
      { year: input.year, month: input.month },
      input,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return withId(plan) as unknown as MonthlyPlanRecord;
  }

  const index = localMonthlyPlans.findIndex((plan) => plan.year === input.year && plan.month === input.month);
  const plan = { ...input, id: localMonthlyPlans[index]?.id ?? input.id ?? randomUUID() };
  if (index >= 0) localMonthlyPlans[index] = plan;
  else localMonthlyPlans = [plan, ...localMonthlyPlans];
  return plan;
}

export async function updateMonthlyPlan(id: string, input: Partial<MonthlyPlanRecord>): Promise<MonthlyPlanRecord | null> {
  if (isDatabaseConnected()) {
    const plan = await MonthlyPlanModel.findByIdAndUpdate(id, input, { new: true }).lean();
    return plan ? (withId(plan) as unknown as MonthlyPlanRecord) : null;
  }

  const index = localMonthlyPlans.findIndex((plan) => plan.id === id);
  if (index < 0) return null;
  localMonthlyPlans[index] = { ...localMonthlyPlans[index], ...input };
  return localMonthlyPlans[index];
}

export async function listMonthlyExpenses(planId: string): Promise<MonthlyExpenseRecord[]> {
  if (isDatabaseConnected()) {
    const expenses = await MonthlyExpenseModel.find({ planId }).sort({ date: -1, time: -1 }).lean();
    return expenses.map((expense) => withId(expense)) as unknown as MonthlyExpenseRecord[];
  }

  return localMonthlyExpenses.filter((expense) => expense.planId === planId).sort(sortExpenses);
}

export async function listAllMonthlyExpenses(): Promise<MonthlyExpenseRecord[]> {
  if (isDatabaseConnected()) {
    const expenses = await MonthlyExpenseModel.find().sort({ date: -1, time: -1 }).lean();
    return expenses.map((expense) => withId(expense)) as unknown as MonthlyExpenseRecord[];
  }

  return [...localMonthlyExpenses].sort(sortExpenses);
}

export async function findMonthlyExpenseById(id: string): Promise<MonthlyExpenseRecord | null> {
  if (isDatabaseConnected()) {
    const expense = await MonthlyExpenseModel.findById(id).lean();
    return expense ? (withId(expense) as unknown as MonthlyExpenseRecord) : null;
  }

  return localMonthlyExpenses.find((expense) => expense.id === id) ?? null;
}

export async function createMonthlyExpense(input: Omit<MonthlyExpenseRecord, "id">): Promise<MonthlyExpenseRecord> {
  if (isDatabaseConnected()) {
    const expense = await MonthlyExpenseModel.create(input).then((record) => record.toObject());
    return withId(expense) as unknown as MonthlyExpenseRecord;
  }

  const expense = { ...input, id: randomUUID() };
  localMonthlyExpenses = [expense, ...localMonthlyExpenses];
  return expense;
}

export async function updateMonthlyExpense(id: string, input: Partial<Omit<MonthlyExpenseRecord, "id">>): Promise<MonthlyExpenseRecord | null> {
  if (isDatabaseConnected()) {
    const expense = await MonthlyExpenseModel.findByIdAndUpdate(id, input, { new: true }).lean();
    return expense ? (withId(expense) as unknown as MonthlyExpenseRecord) : null;
  }

  const index = localMonthlyExpenses.findIndex((expense) => expense.id === id);
  if (index < 0) return null;
  localMonthlyExpenses[index] = { ...localMonthlyExpenses[index], ...input };
  return localMonthlyExpenses[index];
}

export async function updateMonthlyExpensesByRecurrenceId(recurrenceId: string, input: Partial<Omit<MonthlyExpenseRecord, "id">>): Promise<number> {
  if (isDatabaseConnected()) {
    const result = await MonthlyExpenseModel.updateMany({ recurrenceId }, input);
    return result.modifiedCount;
  }

  let updated = 0;
  localMonthlyExpenses = localMonthlyExpenses.map((expense) => {
    if (expense.recurrenceId !== recurrenceId) return expense;
    updated += 1;
    return { ...expense, ...input };
  });
  return updated;
}

export async function deleteMonthlyExpense(id: string): Promise<boolean> {
  if (isDatabaseConnected()) {
    const result = await MonthlyExpenseModel.findByIdAndDelete(id);
    return Boolean(result);
  }

  const before = localMonthlyExpenses.length;
  localMonthlyExpenses = localMonthlyExpenses.filter((expense) => expense.id !== id);
  return localMonthlyExpenses.length < before;
}

export async function deleteMonthlyExpensesByRecurrenceId(recurrenceId: string): Promise<number> {
  if (isDatabaseConnected()) {
    const result = await MonthlyExpenseModel.deleteMany({ recurrenceId });
    return result.deletedCount;
  }

  const before = localMonthlyExpenses.length;
  localMonthlyExpenses = localMonthlyExpenses.filter((expense) => expense.recurrenceId !== recurrenceId);
  return before - localMonthlyExpenses.length;
}
