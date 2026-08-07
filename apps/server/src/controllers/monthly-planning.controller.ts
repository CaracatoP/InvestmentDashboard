import { asyncHandler } from "../utils/async-handler";
import { created, noContent, ok } from "../utils/api-response";
import {
  addMonthlyExpense,
  addMonthlyIncomeEntry,
  completeMonthlyExpense,
  completeMonthlyIncomeEntry,
  copyPreviousMonthlyPlan,
  editMonthlyExpense,
  editMonthlyExpenseSeries,
  editMonthlyIncomeEntry,
  editMonthlyIncomeEntrySeries,
  getMonthlyPlanningOverview,
  patchMonthlyPlan,
  removeMonthlyExpense,
  removeMonthlyExpenseSeries,
  removeMonthlyIncomeEntry,
  removeMonthlyIncomeEntrySeries,
  saveMonthlyPlan
} from "../services/monthly-planning.service";
import {
  monthlyExpenseCompletionQuerySchema,
  monthlyExpenseCompletionSchema,
  monthlyExpenseMutationQuerySchema,
  monthlyExpenseSchema,
  monthlyExpenseUpdateSchema,
  monthlyIncomeEntryCompletionSchema,
  monthlyIncomeEntrySchema,
  monthlyIncomeEntryUpdateSchema,
  monthlyPlanningCopySchema,
  monthlyPlanningQuerySchema,
  monthlyPlanSchema,
  monthlyPlanUpdateSchema
} from "../validators/monthly-planning.validator";
import type { MonthlyExpenseRecord, MonthlyIncomeEntryRecord } from "../types/investment";

function setMonthlyExpenseAffectedDomainsHeader(response: { setHeader: (name: string, value: string) => void }, expenses?: MonthlyExpenseRecord | MonthlyExpenseRecord[] | null) {
  const expenseList = Array.isArray(expenses) ? expenses : expenses ? [expenses] : [];
  const domains = new Set(["monthlyPlanning", "history"]);

  for (const expense of expenseList) {
    if (expense.allocationKind === "investment_contribution") {
      domains.add("dashboard");
      domains.add("portfolio");
      domains.add("operations");
    }

    if (expense.allocationKind === "cash_box_contribution") {
      domains.add("dashboard");
      domains.add("portfolio");
      domains.add("cashBoxes");
    }
  }

  response.setHeader("x-affected-domains", [...domains].join(","));
}

function setMonthlyIncomeEntryAffectedDomainsHeader(response: { setHeader: (name: string, value: string) => void }, entries?: MonthlyIncomeEntryRecord | MonthlyIncomeEntryRecord[] | null) {
  const entryList = Array.isArray(entries) ? entries : entries ? [entries] : [];
  const domains = new Set(["monthlyPlanning", "history"]);
  if (entryList.some((entry) => entry.status === "received" || entry.status === "planned")) {
    domains.add("dashboard");
  }
  response.setHeader("x-affected-domains", [...domains].join(","));
}

export const showMonthlyPlanning = asyncHandler(async (request, response) => {
  const query = monthlyPlanningQuerySchema.parse(request.query);
  ok(response, await getMonthlyPlanningOverview(query.year, query.month, query.comparisonRange));
});

export const upsertMonthlyPlanningPlan = asyncHandler(async (request, response) => {
  const input = monthlyPlanSchema.parse(request.body);
  ok(response, await saveMonthlyPlan(input));
});

export const updateMonthlyPlanningPlan = asyncHandler(async (request, response) => {
  const input = monthlyPlanUpdateSchema.parse(request.body);
  ok(response, await patchMonthlyPlan(String(request.params.id), input));
});

export const copyPreviousPlanning = asyncHandler(async (request, response) => {
  const input = monthlyPlanningCopySchema.parse(request.body);
  ok(response, await copyPreviousMonthlyPlan(input.year, input.month));
});

export const createMonthlyPlanningExpense = asyncHandler(async (request, response) => {
  const input = monthlyExpenseSchema.parse(request.body);
  const expense = await addMonthlyExpense(String(request.params.planId), input);
  setMonthlyExpenseAffectedDomainsHeader(response, expense);
  created(response, expense);
});

export const createMonthlyPlanningIncomeEntry = asyncHandler(async (request, response) => {
  const input = monthlyIncomeEntrySchema.parse(request.body);
  const incomeEntry = await addMonthlyIncomeEntry(String(request.params.planId), input);
  setMonthlyIncomeEntryAffectedDomainsHeader(response, incomeEntry);
  created(response, incomeEntry);
});

export const updateMonthlyPlanningExpense = asyncHandler(async (request, response) => {
  const input = monthlyExpenseUpdateSchema.parse(request.body);
  const query = monthlyExpenseMutationQuerySchema.parse(request.query);
  const expense = query.scope === "series" ? await editMonthlyExpenseSeries(String(request.params.id), input) : await editMonthlyExpense(String(request.params.id), input);
  setMonthlyExpenseAffectedDomainsHeader(response, expense);
  ok(response, expense);
});

export const updateMonthlyPlanningIncomeEntry = asyncHandler(async (request, response) => {
  const input = monthlyIncomeEntryUpdateSchema.parse(request.body);
  const query = monthlyExpenseMutationQuerySchema.parse(request.query);
  const incomeEntry = query.scope === "series" ? await editMonthlyIncomeEntrySeries(String(request.params.id), input) : await editMonthlyIncomeEntry(String(request.params.id), input);
  setMonthlyIncomeEntryAffectedDomainsHeader(response, incomeEntry);
  ok(response, incomeEntry);
});

export const completeMonthlyPlanningExpense = asyncHandler(async (request, response) => {
  const input = monthlyExpenseCompletionSchema.parse(request.body);
  const query = monthlyExpenseCompletionQuerySchema.parse(request.query);
  const result = await completeMonthlyExpense(String(request.params.id), input, query.comparisonRange);
  setMonthlyExpenseAffectedDomainsHeader(response, result.expense);
  ok(response, result);
});

export const receiveMonthlyPlanningIncomeEntry = asyncHandler(async (request, response) => {
  const input = monthlyIncomeEntryCompletionSchema.parse(request.body);
  const query = monthlyExpenseCompletionQuerySchema.parse(request.query);
  const result = await completeMonthlyIncomeEntry(String(request.params.id), input, query.comparisonRange);
  setMonthlyIncomeEntryAffectedDomainsHeader(response, result.incomeEntry);
  ok(response, result);
});

export const deleteMonthlyPlanningExpense = asyncHandler(async (request, response) => {
  const query = monthlyExpenseMutationQuerySchema.parse(request.query);
  const removed = query.scope === "series" ? await removeMonthlyExpenseSeries(String(request.params.id)) : await removeMonthlyExpense(String(request.params.id));
  setMonthlyExpenseAffectedDomainsHeader(response, removed);
  noContent(response);
});

export const deleteMonthlyPlanningIncomeEntry = asyncHandler(async (request, response) => {
  const query = monthlyExpenseMutationQuerySchema.parse(request.query);
  const removed = query.scope === "series" ? await removeMonthlyIncomeEntrySeries(String(request.params.id)) : await removeMonthlyIncomeEntry(String(request.params.id));
  setMonthlyIncomeEntryAffectedDomainsHeader(response, removed);
  noContent(response);
});
