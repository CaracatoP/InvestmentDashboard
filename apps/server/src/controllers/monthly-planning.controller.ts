import { asyncHandler } from "../utils/async-handler";
import { created, noContent, ok } from "../utils/api-response";
import {
  addMonthlyExpense,
  copyPreviousMonthlyPlan,
  editMonthlyExpense,
  editMonthlyExpenseSeries,
  getMonthlyPlanningOverview,
  patchMonthlyPlan,
  removeMonthlyExpense,
  removeMonthlyExpenseSeries,
  saveMonthlyPlan
} from "../services/monthly-planning.service";
import {
  monthlyExpenseMutationQuerySchema,
  monthlyExpenseSchema,
  monthlyExpenseUpdateSchema,
  monthlyPlanningCopySchema,
  monthlyPlanningQuerySchema,
  monthlyPlanSchema,
  monthlyPlanUpdateSchema
} from "../validators/monthly-planning.validator";

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
  created(response, expense);
});

export const updateMonthlyPlanningExpense = asyncHandler(async (request, response) => {
  const input = monthlyExpenseUpdateSchema.parse(request.body);
  const query = monthlyExpenseMutationQuerySchema.parse(request.query);
  ok(response, query.scope === "series" ? await editMonthlyExpenseSeries(String(request.params.id), input) : await editMonthlyExpense(String(request.params.id), input));
});

export const deleteMonthlyPlanningExpense = asyncHandler(async (request, response) => {
  const query = monthlyExpenseMutationQuerySchema.parse(request.query);
  if (query.scope === "series") await removeMonthlyExpenseSeries(String(request.params.id));
  else await removeMonthlyExpense(String(request.params.id));
  noContent(response);
});
