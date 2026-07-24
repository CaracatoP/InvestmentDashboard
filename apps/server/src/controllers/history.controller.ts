import { asyncHandler } from "../utils/async-handler";
import { getHistory } from "../services/portfolio.service";
import { ok } from "../utils/api-response";

export const listHistory = asyncHandler(async (_request, response) => {
  ok(response, await getHistory());
});
