import { asyncHandler } from "../utils/async-handler";
import { getDashboard } from "../services/portfolio.service";
import { ok } from "../utils/api-response";

export const showDashboard = asyncHandler(async (_request, response) => {
  ok(response, await getDashboard());
});
