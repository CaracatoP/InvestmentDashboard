import { getMarketStatus, refreshMarketQuotes } from "../services/market-data.service";
import { ok } from "../utils/api-response";
import { asyncHandler } from "../utils/async-handler";

export const refreshMarket = asyncHandler(async (_request, response) => {
  ok(response, await refreshMarketQuotes());
});

export const showMarketStatus = asyncHandler(async (_request, response) => {
  ok(response, await getMarketStatus());
});
