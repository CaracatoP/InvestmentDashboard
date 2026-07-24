import { asyncHandler } from "../utils/async-handler";
import { getCalendarEvents } from "../services/portfolio.service";
import { ok } from "../utils/api-response";

export const listCalendarEvents = asyncHandler(async (_request, response) => {
  ok(response, await getCalendarEvents());
});
