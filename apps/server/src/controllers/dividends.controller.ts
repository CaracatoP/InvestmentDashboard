import { asyncHandler } from "../utils/async-handler";
import { getDividendsOverview } from "../services/portfolio.service";
import { deleteDividend, findDividendById, listDividends as listDividendRecords } from "../repositories/investment.repository";
import { createDividendRecord as createDividendRecordService, markDividendReceived, updateDividendRecord as updateDividendRecordService } from "../services/dividend.service";
import { dividendReceiveSchema, dividendSchema, dividendUpdateSchema } from "../validators/dividend.validator";
import { created, noContent, ok } from "../utils/api-response";
import { notFound } from "../utils/http-error";

export const listDividends = asyncHandler(async (_request, response) => {
  if (_request.query.mode === "records") {
    ok(response, await listDividendRecords());
    return;
  }

  ok(response, await getDividendsOverview());
});

export const showDividendRecord = asyncHandler(async (request, response) => {
  const dividend = await findDividendById(String(request.params.id));
  if (!dividend) throw notFound("Dividend not found");
  ok(response, dividend);
});

export const createDividendRecord = asyncHandler(async (request, response) => {
  const input = dividendSchema.parse(request.body);
  created(response, await createDividendRecordService(input));
});

export const updateDividendRecord = asyncHandler(async (request, response) => {
  const input = dividendUpdateSchema.parse(request.body);
  const dividend = await updateDividendRecordService(String(request.params.id), input);

  if (!dividend) throw notFound("Dividend not found");

  ok(response, dividend);
});

export const receiveDividendRecord = asyncHandler(async (request, response) => {
  const input = dividendReceiveSchema.parse(request.body ?? {});
  ok(response, await markDividendReceived(String(request.params.id), input));
});

export const deleteDividendRecord = asyncHandler(async (request, response) => {
  const deleted = await deleteDividend(String(request.params.id));
  if (!deleted) throw notFound("Dividend not found");
  noContent(response);
});
