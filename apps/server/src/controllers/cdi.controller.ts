import { getCdiStatus, refreshCdiAndRecalculate } from "../services/cdi.service";
import { ok } from "../utils/api-response";
import { asyncHandler } from "../utils/async-handler";

export const getCdiStatusRecord = asyncHandler(async (_request, response) => {
  ok(response, await getCdiStatus());
});

export const refreshCdiRecord = asyncHandler(async (_request, response) => {
  ok(response, await refreshCdiAndRecalculate());
});
