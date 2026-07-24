import { getCdiStatus, recalculateCashBoxYields, refreshCdiRate } from "../services/cdi.service";
import { ok } from "../utils/api-response";
import { asyncHandler } from "../utils/async-handler";

export const getCdiStatusRecord = asyncHandler(async (_request, response) => {
  ok(response, await getCdiStatus());
});

export const refreshCdiRecord = asyncHandler(async (_request, response) => {
  const rate = await refreshCdiRate();
  const recalculation = await recalculateCashBoxYields();
  ok(response, { rate, recalculation });
});
