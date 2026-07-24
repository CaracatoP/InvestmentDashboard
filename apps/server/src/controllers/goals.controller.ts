import { asyncHandler } from "../utils/async-handler";
import { getGoalsOverview } from "../services/portfolio.service";
import { createGoal as insertGoal, deleteGoal, findGoalById, listGoals as listGoalRecords, updateGoal } from "../repositories/investment.repository";
import { goalSchema, goalUpdateSchema } from "../validators/goal.validator";
import { created, noContent, ok } from "../utils/api-response";
import { notFound } from "../utils/http-error";

export const listGoals = asyncHandler(async (_request, response) => {
  if (_request.query.mode === "records") {
    ok(response, await listGoalRecords());
    return;
  }

  ok(response, await getGoalsOverview());
});

export const showGoal = asyncHandler(async (request, response) => {
  const goal = await findGoalById(String(request.params.id));
  if (!goal) throw notFound("Goal not found");
  ok(response, goal);
});

export const createGoal = asyncHandler(async (request, response) => {
  const input = goalSchema.parse(request.body);
  const goal = await insertGoal(input);

  created(response, goal);
});

export const updateGoalRecord = asyncHandler(async (request, response) => {
  const input = goalUpdateSchema.parse(request.body);
  const goal = await updateGoal(String(request.params.id), input);

  if (!goal) throw notFound("Goal not found");

  ok(response, goal);
});

export const deleteGoalRecord = asyncHandler(async (request, response) => {
  const deleted = await deleteGoal(String(request.params.id));
  if (!deleted) throw notFound("Goal not found");
  noContent(response);
});
