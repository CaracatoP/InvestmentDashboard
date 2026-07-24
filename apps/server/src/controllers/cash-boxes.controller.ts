import { createCashBox, deleteCashBox, findCashBoxById, updateCashBox } from "../repositories/investment.repository";
import {
  addCashBoxMovement,
  getCashBoxesOverview,
  listCashBoxMovements,
  listCashBoxYieldHistory,
  normalizeCashBoxForPersistence
} from "../services/cash-box.service";
import { recalculateCashBoxYields } from "../services/cdi.service";
import { created, noContent, ok } from "../utils/api-response";
import { asyncHandler } from "../utils/async-handler";
import { notFound } from "../utils/http-error";
import type { CashBoxRecord } from "../types/investment";
import { cashBoxMovementInputSchema, cashBoxRecalculateSchema, cashBoxSchema, cashBoxUpdateSchema } from "../validators/cash-box.validator";

export const listCashBoxRecords = asyncHandler(async (_request, response) => {
  const overview = await getCashBoxesOverview();
  if (_request.query.mode === "records") {
    ok(response, overview.cashBoxes);
    return;
  }

  ok(response, overview);
});

export const showCashBoxRecord = asyncHandler(async (request, response) => {
  const cashBox = await findCashBoxById(String(request.params.id));
  if (!cashBox) throw notFound("Cash box not found");
  ok(response, cashBox);
});

export const createCashBoxRecord = asyncHandler(async (request, response) => {
  const input = cashBoxSchema.parse(request.body);
  created(response, await createCashBox(normalizeCashBoxForPersistence(input) as Omit<CashBoxRecord, "id">));
});

export const updateCashBoxRecord = asyncHandler(async (request, response) => {
  const input = cashBoxUpdateSchema.parse(request.body);
  const existing = await findCashBoxById(String(request.params.id));
  if (!existing) throw notFound("Cash box not found");
  const cashBox = await updateCashBox(String(request.params.id), normalizeCashBoxForPersistence({ ...existing, ...input }));

  if (!cashBox) throw notFound("Cash box not found");

  ok(response, cashBox);
});

export const deleteCashBoxRecord = asyncHandler(async (request, response) => {
  const deleted = await deleteCashBox(String(request.params.id));
  if (!deleted) throw notFound("Cash box not found");
  noContent(response);
});

export const createCashBoxContributionRecord = asyncHandler(async (request, response) => {
  const input = cashBoxMovementInputSchema.parse(request.body);
  ok(
    response,
    await addCashBoxMovement(String(request.params.id), {
      type: "contribution",
      value: input.value,
      date: input.date,
      description: input.description
    })
  );
});

export const createCashBoxWithdrawalRecord = asyncHandler(async (request, response) => {
  const input = cashBoxMovementInputSchema.parse(request.body);
  ok(
    response,
    await addCashBoxMovement(String(request.params.id), {
      type: "withdrawal",
      value: input.value,
      date: input.date,
      description: input.description
    })
  );
});

export const listCashBoxMovementRecords = asyncHandler(async (request, response) => {
  ok(response, await listCashBoxMovements(String(request.params.id)));
});

export const listCashBoxYieldRecords = asyncHandler(async (request, response) => {
  ok(response, await listCashBoxYieldHistory(String(request.params.id)));
});

export const recalculateCashBoxRecords = asyncHandler(async (request, response) => {
  const input = cashBoxRecalculateSchema.parse(request.body ?? {});
  ok(response, await recalculateCashBoxYields(input));
});
