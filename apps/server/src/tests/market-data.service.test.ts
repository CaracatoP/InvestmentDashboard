import assert from "node:assert/strict";
import test from "node:test";
import { buildRejectedQuote, isValidMarketPrice, isValidStoredQuote } from "../services/market-data.service";
import { getTickerProfile } from "../services/ticker.service";
import type { AssetRecord, MarketQuoteRecord } from "../types/investment";

const asset: AssetRecord = {
  id: "asset-1",
  name: "BB Seguridade",
  ticker: "BBSE3",
  category: "ACAO",
  currency: "BRL",
  active: true
};

test("MarketQuote with positive price is valid", () => {
  const quote: MarketQuoteRecord = {
    ticker: "BBSE3",
    price: 35.2,
    quotedAt: "2026-07-24T14:00:00.000Z",
    source: "brapi",
    currency: "BRL",
    status: "updated"
  };

  assert.equal(isValidStoredQuote(quote), true);
});

test("zero, negative, NaN and null prices are rejected", () => {
  assert.equal(isValidMarketPrice(0), false);
  assert.equal(isValidMarketPrice(-1), false);
  assert.equal(isValidMarketPrice(Number.NaN), false);
  assert.equal(isValidMarketPrice(null), false);
});

test("rejected quote preserves last valid quote as stale", () => {
  const previous: MarketQuoteRecord = {
    ticker: "BBSE3",
    price: 35.2,
    quotedAt: "2026-07-24T14:00:00.000Z",
    source: "brapi",
    currency: "BRL",
    status: "updated"
  };
  const rejected = buildRejectedQuote(asset, getTickerProfile(asset), previous, "unavailable", "Provider missing ticker", "brapi");

  assert.equal(rejected.status, "stale");
  assert.equal(rejected.price, 35.2);
});

test("missing quote without fallback returns null price", () => {
  const rejected = buildRejectedQuote(asset, getTickerProfile(asset), null, "unavailable", "Provider missing ticker", "brapi");

  assert.equal(rejected.status, "unavailable");
  assert.equal(rejected.price, null);
});
