import type { Response } from "express";
import { ok } from "../utils/api-response";
import { asyncHandler } from "../utils/async-handler";
import {
  createN8nMonthlyExpense,
  createN8nMonthlyIncomeEntry,
  completeN8nMonthlyExpense,
  getN8nMonthlyPlanningSummary,
  listN8nRecentMonthlyExpenses,
  receiveN8nMonthlyIncomeEntry,
  resolveN8nUserByPhone,
  verifyN8nWhatsAppLink
} from "../services/n8n-integration.service";
import { validateIntegrationIdempotencyKey } from "../services/integration-idempotency.service";
import {
  n8nMonthlyExpenseCompletionSchema,
  n8nMonthlyExpenseCreateSchema,
  n8nMonthlyIncomeEntryCompletionSchema,
  n8nMonthlyIncomeEntryCreateSchema,
  n8nMonthlyPlanningSummaryQuerySchema,
  n8nPhoneLookupQuerySchema,
  n8nRecentExpensesQuerySchema,
  n8nWhatsAppLinkVerifySchema
} from "../validators/n8n-integration.validator";

function readIdempotencyKey(request: { header: (name: string) => string | undefined }) {
  return validateIntegrationIdempotencyKey(request.header("Idempotency-Key"));
}

function sendIdempotent<T>(response: Response, result: { result: T; idempotentReplay: boolean }, firstStatusCode = 201) {
  response.status(result.idempotentReplay ? 200 : firstStatusCode).json({
    success: true,
    idempotentReplay: result.idempotentReplay,
    data: result.result
  });
}

export const verifyN8nWhatsAppIntegrationLink = asyncHandler(async (request, response) => {
  const input = n8nWhatsAppLinkVerifySchema.parse(request.body);
  ok(response, await verifyN8nWhatsAppLink(input));
});

export const showN8nUserByPhone = asyncHandler(async (request, response) => {
  const input = n8nPhoneLookupQuerySchema.parse(request.query);
  ok(response, await resolveN8nUserByPhone(input));
});

export const showN8nMonthlyPlanningSummary = asyncHandler(async (request, response) => {
  const input = n8nMonthlyPlanningSummaryQuerySchema.parse(request.query);
  ok(response, await getN8nMonthlyPlanningSummary(input));
});

export const listN8nMonthlyPlanningRecentExpenses = asyncHandler(async (request, response) => {
  const input = n8nRecentExpensesQuerySchema.parse(request.query);
  ok(response, await listN8nRecentMonthlyExpenses(input));
});

export const createN8nMonthlyPlanningExpense = asyncHandler(async (request, response) => {
  const idempotencyKey = readIdempotencyKey(request);
  const input = n8nMonthlyExpenseCreateSchema.parse(request.body);
  sendIdempotent(response, await createN8nMonthlyExpense(input, idempotencyKey));
});

export const createN8nMonthlyPlanningIncomeEntry = asyncHandler(async (request, response) => {
  const idempotencyKey = readIdempotencyKey(request);
  const input = n8nMonthlyIncomeEntryCreateSchema.parse(request.body);
  sendIdempotent(response, await createN8nMonthlyIncomeEntry(input, idempotencyKey));
});

export const completeN8nMonthlyPlanningExpense = asyncHandler(async (request, response) => {
  const idempotencyKey = readIdempotencyKey(request);
  const payload = n8nMonthlyExpenseCompletionSchema.parse(request.body);
  const result = await completeN8nMonthlyExpense({
    phoneNumber: payload.phoneNumber,
    expenseId: String(request.params.id),
    payload: { completedAt: payload.completedAt }
  }, idempotencyKey);
  sendIdempotent(response, result, 200);
});

export const receiveN8nMonthlyPlanningIncomeEntry = asyncHandler(async (request, response) => {
  const idempotencyKey = readIdempotencyKey(request);
  const payload = n8nMonthlyIncomeEntryCompletionSchema.parse(request.body);
  const result = await receiveN8nMonthlyIncomeEntry({
    phoneNumber: payload.phoneNumber,
    incomeEntryId: String(request.params.id),
    payload: { receivedAt: payload.receivedAt }
  }, idempotencyKey);
  sendIdempotent(response, result, 200);
});
