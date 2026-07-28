import assert from "node:assert/strict";
import test from "node:test";
import { formatCents, formatDate, parseBrazilianMoneyToCents } from "../src/utils/formatters";

test("parseBrazilianMoneyToCents accepts common Brazilian money inputs", () => {
  assert.equal(parseBrazilianMoneyToCents("60"), 6000);
  assert.equal(parseBrazilianMoneyToCents("60,50"), 6050);
  assert.equal(parseBrazilianMoneyToCents("1.250,90"), 125090);
  assert.equal(parseBrazilianMoneyToCents("23000"), 2300000);
});

test("parseBrazilianMoneyToCents treats dots as thousands without multiplying twice", () => {
  assert.equal(parseBrazilianMoneyToCents("23.000"), 2300000);
  assert.equal(formatCents(parseBrazilianMoneyToCents("23.000") ?? 0), "R$ 23.000,00");
});

test("parseBrazilianMoneyToCents rejects invalid values", () => {
  assert.equal(parseBrazilianMoneyToCents("-10"), null);
  assert.equal(parseBrazilianMoneyToCents("10,999"), null);
  assert.equal(parseBrazilianMoneyToCents("abc"), null);
});

test("formatDate keeps date-only financial events on the same calendar day", () => {
  assert.equal(formatDate("2026-07-28"), "28/07/2026");
  assert.equal(formatDate("2026-07-28T00:00:00.000Z"), "28/07/2026");
});
