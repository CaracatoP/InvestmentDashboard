import assert from "node:assert/strict";
import test from "node:test";
import { formatCents, formatCompactCurrency, formatCurrency, formatDate, formatPercentage, parseBrazilianMoneyToCents, setCurrencyPreference, toDateKey } from "../src/utils/formatters";

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

test("toDateKey preserves date-only and local datetime keys for filters", () => {
  assert.equal(toDateKey("2026-08-01"), "2026-08-01");
  assert.equal(toDateKey("2026-08-01T00:00"), "2026-08-01");
});

test("currency preference keeps BRL as the only safe display currency", () => {
  setCurrencyPreference("USD");
  assert.match(formatCurrency(10), /^R\$\s*10,00$/);
  setCurrencyPreference("BRL");
  assert.match(formatCurrency(10), /^R\$\s*10,00$/);
});

test("formatCompactCurrency supports compact values without fraction range errors", () => {
  assert.match(formatCompactCurrency(1250000), /^R\$\s*1,3/);
});

test("formatPercentage keeps integers clean and recurring decimals readable", () => {
  assert.equal(formatPercentage(15), "15%");
  assert.equal(formatPercentage(12.5), "12,5%");
  assert.equal(formatPercentage(33.33), "33,33%");
});
