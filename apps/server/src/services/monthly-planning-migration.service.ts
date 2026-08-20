import { isDatabaseConnected } from "../config/database";
import { MonthlyExpenseModel } from "../models/monthly-expense.model";
import { MonthlyIncomeEntryModel } from "../models/monthly-income-entry.model";
import { MonthlyPlanModel } from "../models/monthly-plan.model";

type MongoIndex = {
  name?: string;
  key?: Record<string, unknown>;
  unique?: boolean;
  partialFilterExpression?: Record<string, unknown> | null;
};

type RecurrenceModelConfig = {
  label: "monthlyExpenses" | "monthlyIncomeEntries";
  model: typeof MonthlyExpenseModel | typeof MonthlyIncomeEntryModel;
  uniqueIndexName: string;
  legacyIndexName: string;
  lookupIndexName: string;
};

export interface MonthlyPlanningMigrationResult {
  droppedIndexes: string[];
  createdIndexes: string[];
  unresolvedOccurrenceDuplicates: {
    monthlyExpenses: number;
    monthlyIncomeEntries: number;
  };
}

const recurrenceOccurrenceKey = { userId: 1, planId: 1, recurrenceId: 1, recurrenceOriginalDate: 1 } as const;
const recurrencePartialFilter = {
  recurrenceId: { $type: "string", $gt: "" },
  recurrenceOriginalDate: { $type: "string", $gt: "" },
  recurrenceSourceId: { $type: "string", $gt: "" }
} as const;

const recurrenceModels: RecurrenceModelConfig[] = [
  {
    label: "monthlyExpenses",
    model: MonthlyExpenseModel,
    uniqueIndexName: "user_plan_recurrence_occurrence_unique",
    legacyIndexName: "userId_1_planId_1_recurrenceId_1_recurrenceOriginalDate_1",
    lookupIndexName: "user_plan_recurrence_lookup"
  },
  {
    label: "monthlyIncomeEntries",
    model: MonthlyIncomeEntryModel,
    uniqueIndexName: "user_plan_recurrence_income_occurrence_unique",
    legacyIndexName: "userId_1_planId_1_recurrenceId_1_recurrenceOriginalDate_1",
    lookupIndexName: "user_plan_recurrence_income_lookup"
  }
];

function keysMatch(left: Record<string, unknown> | undefined, right: Record<string, unknown>) {
  return JSON.stringify(left ?? {}) === JSON.stringify(right);
}

function partialFilterMatches(left: Record<string, unknown> | null | undefined) {
  return JSON.stringify(left ?? {}) === JSON.stringify(recurrencePartialFilter);
}

async function dropLegacyMonthlyPlanIndex() {
  const dropped: string[] = [];
  for (const index of await MonthlyPlanModel.collection.indexes()) {
    if (!index.name || !index.unique) continue;
    if (!keysMatch(index.key, { year: 1, month: 1 })) continue;
    if (index.key && "userId" in index.key) continue;
    await MonthlyPlanModel.collection.dropIndex(index.name);
    dropped.push(`MonthlyPlan.${index.name}`);
  }
  return dropped;
}

async function countOccurrenceDuplicateGroups(model: typeof MonthlyExpenseModel | typeof MonthlyIncomeEntryModel) {
  const duplicates = await model.collection
    .aggregate([
      {
        $match: {
          recurrenceId: { $type: "string", $gt: "" },
          recurrenceOriginalDate: { $type: "string", $gt: "" },
          recurrenceSourceId: { $type: "string", $gt: "" }
        }
      },
      {
        $group: {
          _id: {
            userId: "$userId",
            planId: "$planId",
            recurrenceId: "$recurrenceId",
            recurrenceOriginalDate: "$recurrenceOriginalDate"
          },
          count: { $sum: 1 }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ])
    .toArray();

  return duplicates.length;
}

async function ensureRecurrenceIndexes(config: RecurrenceModelConfig) {
  const droppedIndexes: string[] = [];
  const createdIndexes: string[] = [];
  const indexes = await config.model.collection.indexes();
  const desiredIndex = indexes.find((index) => index.name === config.uniqueIndexName);
  if (desiredIndex?.unique && keysMatch(desiredIndex.key, recurrenceOccurrenceKey) && partialFilterMatches(desiredIndex.partialFilterExpression)) {
    return { droppedIndexes, createdIndexes, unresolvedOccurrenceDuplicates: 0 };
  }

  const duplicateGroups = await countOccurrenceDuplicateGroups(config.model);
  if (duplicateGroups > 0) {
    return { droppedIndexes, createdIndexes, unresolvedOccurrenceDuplicates: duplicateGroups };
  }

  for (const index of indexes) {
    if (!index.name) continue;
    const isLegacyUserScopedRecurrenceIndex = index.name === config.legacyIndexName && keysMatch(index.key, recurrenceOccurrenceKey);
    if (!isLegacyUserScopedRecurrenceIndex) continue;
    await config.model.collection.dropIndex(index.name);
    droppedIndexes.push(`${config.label}.${index.name}`);
  }

  await config.model.createIndexes();
  const refreshedIndexes = await config.model.collection.indexes();
  if (refreshedIndexes.some((index) => index.name === config.uniqueIndexName)) {
    createdIndexes.push(`${config.label}.${config.uniqueIndexName}`);
  }
  if (refreshedIndexes.some((index) => index.name === config.lookupIndexName)) {
    createdIndexes.push(`${config.label}.${config.lookupIndexName}`);
  }

  return { droppedIndexes, createdIndexes, unresolvedOccurrenceDuplicates: 0 };
}

export async function runMonthlyPlanningMigrations(): Promise<MonthlyPlanningMigrationResult> {
  if (!isDatabaseConnected()) {
    return {
      droppedIndexes: [],
      createdIndexes: [],
      unresolvedOccurrenceDuplicates: {
        monthlyExpenses: 0,
        monthlyIncomeEntries: 0
      }
    };
  }

  const droppedIndexes = await dropLegacyMonthlyPlanIndex();
  await MonthlyPlanModel.createIndexes();

  const expenseMigration = await ensureRecurrenceIndexes(recurrenceModels[0]);
  const incomeMigration = await ensureRecurrenceIndexes(recurrenceModels[1]);

  return {
    droppedIndexes: [...droppedIndexes, ...expenseMigration.droppedIndexes, ...incomeMigration.droppedIndexes],
    createdIndexes: [...expenseMigration.createdIndexes, ...incomeMigration.createdIndexes],
    unresolvedOccurrenceDuplicates: {
      monthlyExpenses: expenseMigration.unresolvedOccurrenceDuplicates,
      monthlyIncomeEntries: incomeMigration.unresolvedOccurrenceDuplicates
    }
  };
}
