import mongoose from "mongoose";
import { connectDatabase } from "../config/database";
import {
  listAssets,
  listCashBoxes,
  listContributions,
  listDividends,
  listOperations
} from "../repositories/investment.repository";
import { listAllMonthlyExpenses, listMonthlyPlans } from "../repositories/monthly-planning.repository";
import { buildMovements } from "../services/portfolio.service";
import type { MonthlyExpenseRecord } from "../types/investment";

function groupDuplicates<T>(items: T[], keyFor: (item: T) => string | null | undefined) {
  const counts = new Map<string, number>();

  for (const item of items) {
    const key = keyFor(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function isValidDate(value: string | Date | null | undefined) {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function recurrenceOccurrenceKey(expense: MonthlyExpenseRecord) {
  if (!expense.recurrenceId) return null;
  return `${expense.planId}:${expense.recurrenceId}:${expense.recurrenceOriginalDate ?? expense.date}`;
}

async function main() {
  const connected = await connectDatabase();
  const [operations, dividends, contributions, cashBoxes, assets, monthlyExpenses, monthlyPlans] = await Promise.all([
    listOperations(),
    listDividends(),
    listContributions(),
    listCashBoxes(),
    listAssets(),
    listAllMonthlyExpenses(),
    listMonthlyPlans()
  ]);

  const rawHistory = buildMovements(operations, dividends, contributions, cashBoxes, {
    assets,
    includePlannedDividends: true,
    monthlyExpenses,
    monthlyPlans,
    deduplicate: false
  });
  const dedupedHistory = buildMovements(operations, dividends, contributions, cashBoxes, {
    assets,
    includePlannedDividends: true,
    monthlyExpenses,
    monthlyPlans
  });

  const report = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    databaseConnected: connected,
    sourceCounts: {
      operations: operations.length,
      dividends: dividends.length,
      contributions: contributions.length,
      cashBoxes: cashBoxes.length,
      monthlyExpenses: monthlyExpenses.length,
      monthlyPlans: monthlyPlans.length
    },
    history: {
      rawEvents: rawHistory.length,
      dedupedEvents: dedupedHistory.length,
      duplicateCanonicalEvents: groupDuplicates(rawHistory, (event) => event.canonicalId ?? event.id).slice(0, 50)
    },
    recurringExpenses: {
      duplicateOccurrences: groupDuplicates(
        monthlyExpenses.filter((expense) => !expense.recurrenceCancelled),
        recurrenceOccurrenceKey
      ).slice(0, 50),
      cancelledOrHiddenRecords: monthlyExpenses.filter((expense) => expense.recurrenceCancelled).length,
      activeSeriesTemplates: monthlyExpenses.filter((expense) => expense.recurrenceId && !expense.recurrenceSourceId && !expense.recurrenceCancelled).length,
      generatedOccurrencesWithoutSource: monthlyExpenses.filter(
        (expense) =>
          expense.recurrenceId &&
          expense.recurrenceOriginalDate &&
          expense.recurrenceOriginalDate !== expense.date &&
          !expense.recurrenceSourceId &&
          !expense.recurrenceCancelled
      ).length
    },
    invalidRecords: {
      expensesWithInvalidAmount: monthlyExpenses.filter((expense) => !Number.isFinite(expense.amountInCents) || expense.amountInCents <= 0).length,
      expensesWithInvalidDate: monthlyExpenses.filter((expense) => !isValidDate(expense.date)).length,
      operationsWithInvalidAmount: operations.filter((operation) => !Number.isFinite(operation.totalValue)).length,
      dividendsWithInvalidDate: dividends.filter((dividend) => !isValidDate(dividend.paymentDate)).length,
      contributionsWithInvalidDate: contributions.filter((contribution) => !isValidDate(contribution.date)).length
    }
  };

  console.info(JSON.stringify(report, null, 2));
  if (connected) await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exit(1);
});
