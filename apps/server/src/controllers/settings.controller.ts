import { asyncHandler } from "../utils/async-handler";
import { getSettings, updateAllocations, updateSettings } from "../services/portfolio.service";
import { getSettingsRecord, resetSettingsRecord } from "../repositories/investment.repository";
import { allocationSchema } from "../validators/allocation.validator";
import { settingsUpdateSchema } from "../validators/settings.validator";
import { created, noContent, ok } from "../utils/api-response";

export const showSettings = asyncHandler(async (_request, response) => {
  ok(response, await getSettings());
});

export const showSettingsRecord = asyncHandler(async (_request, response) => {
  ok(response, await getSettingsRecord());
});

export const createSettingsRecord = asyncHandler(async (request, response) => {
  const input = settingsUpdateSchema.parse(request.body);
  created(response, await updateSettings(input));
});

export const updateSettingsRecordController = asyncHandler(async (request, response) => {
  const input = settingsUpdateSchema.parse(request.body);
  ok(response, await updateSettings(input));
});

export const updateAllocationTargets = asyncHandler(async (request, response) => {
  const input = allocationSchema.parse(request.body);

  ok(response, await updateAllocations(input.allocations));
});

export const deleteSettingsRecord = asyncHandler(async (_request, response) => {
  await resetSettingsRecord();
  noContent(response);
});
