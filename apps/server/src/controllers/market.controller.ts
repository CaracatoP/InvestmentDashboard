import { getCryptoMarketQuoteByQuery, getMarketStatus, refreshMarketQuotes } from "../services/market-data.service";
import { ok } from "../utils/api-response";
import { asyncHandler } from "../utils/async-handler";
import { badRequest } from "../utils/http-error";

export const refreshMarket = asyncHandler(async (_request, response) => {
  ok(response, await refreshMarketQuotes());
});

export const showMarketStatus = asyncHandler(async (_request, response) => {
  ok(response, await getMarketStatus());
});

export const showCryptoQuote = asyncHandler(async (request, response) => {
  const query = String(request.query.q ?? request.query.query ?? "").trim();
  if (query.length < 2) throw badRequest("Informe uma criptomoeda para consultar.");

  ok(response, await getCryptoMarketQuoteByQuery(query));
});
