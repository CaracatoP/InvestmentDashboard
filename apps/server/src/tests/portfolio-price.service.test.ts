import assert from "node:assert/strict";
import test from "node:test";
import { resolveCurrentPrice } from "../services/portfolio.service";
import type { AssetRecord, MarketQuoteRecord, PriceHistoryRecord } from "../types/investment";

const asset: AssetRecord = {
  id: "asset-1",
  name: "WEG",
  ticker: "WEGE3",
  category: "ACAO",
  currency: "BRL",
  active: true
};

test("resolveCurrentPrice uses valid MarketQuote first", () => {
  const quote: MarketQuoteRecord = {
    ticker: "WEGE3",
    price: 42.5,
    quotedAt: "2026-07-24T14:00:00.000Z",
    source: "brapi",
    currency: "BRL",
    status: "updated"
  };

  assert.equal(resolveCurrentPrice(asset, quote).currentPrice, 42.5);
});

test("resolveCurrentPrice falls back to latest valid PriceHistory", () => {
  const history: PriceHistoryRecord[] = [
    { ticker: "WEGE3", price: 40, capturedAt: "2026-07-23T14:00:00.000Z", source: "brapi" },
    { ticker: "WEGE3", price: 41, capturedAt: "2026-07-24T14:00:00.000Z", source: "brapi" }
  ];

  assert.equal(resolveCurrentPrice(asset, undefined, history).currentPrice, 41);
});

test("resolveCurrentPrice returns null when no quote exists and does not use average price", () => {
  assert.equal(resolveCurrentPrice(asset, undefined, []).currentPrice, null);
});
