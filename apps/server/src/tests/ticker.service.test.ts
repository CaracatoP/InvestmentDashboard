import assert from "node:assert/strict";
import test from "node:test";
import { getTickerProfile, normalizeTicker, resolveKnownCryptoIdentity } from "../services/ticker.service";

test("normalizeTicker keeps canonical Brazilian stock ticker", () => {
  assert.equal(normalizeTicker("BBSE3"), "BBSE3");
});

test("normalizeTicker removes duplicated .SA suffix", () => {
  assert.equal(normalizeTicker("ITUB4.SA"), "ITUB4");
});

test("getTickerProfile identifies FII as B3 asset", () => {
  const profile = getTickerProfile({ ticker: "MXRF11", category: "FII" });
  assert.equal(profile.internalTicker, "MXRF11");
  assert.equal(profile.market, "b3");
  assert.equal(profile.kind, "fii");
});

test("getTickerProfile identifies ETF as B3 asset", () => {
  const profile = getTickerProfile({ ticker: "IVVB11", category: "ETF" });
  assert.equal(profile.market, "b3");
  assert.equal(profile.kind, "etf");
});

test("getTickerProfile identifies BTC as crypto", () => {
  const profile = getTickerProfile({ ticker: "BTC-BRL", category: "CRIPTO", coingeckoId: "bitcoin" });
  assert.equal(profile.internalTicker, "BTC");
  assert.equal(profile.market, "crypto");
  assert.equal(profile.providerSymbol, "bitcoin");
  assert.equal(profile.marketKey, "crypto:bitcoin");
});

test("known crypto identity resolves by symbol or display name without destructive migration", () => {
  assert.equal(resolveKnownCryptoIdentity({ ticker: "BTC", name: "BTC" })?.coingeckoId, "bitcoin");
  assert.equal(resolveKnownCryptoIdentity({ ticker: "ETH", name: "Ethereum" })?.coingeckoId, "ethereum");
  assert.equal(resolveKnownCryptoIdentity({ ticker: "SOL", name: "Solana" })?.coingeckoId, "solana");
  assert.equal(getTickerProfile({ ticker: "SOL", category: "CRIPTO" }).providerSymbol, "solana");
});
