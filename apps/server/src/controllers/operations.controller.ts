import { created, noContent, ok } from "../utils/api-response";
import { notFound } from "../utils/http-error";
import { createOperation, deleteOperation, findOperationById, listOperations, updateOperation } from "../repositories/investment.repository";
import { asyncHandler } from "../utils/async-handler";
import { operationSchema, operationUpdateSchema } from "../validators/operation.validator";

function withCalculatedTotal<T extends { quantity?: number; price?: number; totalValue?: number }>(input: T) {
  if (typeof input.quantity === "number" && typeof input.price === "number") {
    return { ...input, totalValue: input.quantity * input.price };
  }

  return input;
}

export const listOperationRecords = asyncHandler(async (_request, response) => {
  ok(response, await listOperations());
});

export const showOperationRecord = asyncHandler(async (request, response) => {
  const operation = await findOperationById(String(request.params.id));
  if (!operation) throw notFound("Operation not found");
  ok(response, operation);
});

export const createOperationRecord = asyncHandler(async (request, response) => {
  const input = operationSchema.parse(request.body);
  created(response, await createOperation(withCalculatedTotal(input)));
});

export const updateOperationRecord = asyncHandler(async (request, response) => {
  const input = operationUpdateSchema.parse(request.body);
  const existing = await findOperationById(String(request.params.id));

  if (!existing) throw notFound("Operation not found");

  const { id: _id, ...mergedOperation } = { ...existing, ...input };
  const operation = await updateOperation(String(request.params.id), withCalculatedTotal(mergedOperation));

  if (!operation) throw notFound("Operation not found");

  ok(response, operation);
});

export const deleteOperationRecord = asyncHandler(async (request, response) => {
  const deleted = await deleteOperation(String(request.params.id));
  if (!deleted) throw notFound("Operation not found");
  noContent(response);
});
