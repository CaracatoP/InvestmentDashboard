import assert from "node:assert/strict";
import test from "node:test";
import { annualRateToDailyRate, calculateDailyCashBoxYield, getBusinessDatesBetween, isBusinessDay } from "../services/cdi.service";

test("annualRateToDailyRate uses 252 business days equivalent rate", () => {
  const annualRate = 13.65;
  const dailyRate = annualRateToDailyRate(annualRate);
  const annualized = (Math.pow(1 + dailyRate, 252) - 1) * 100;

  assert.ok(dailyRate > 0);
  assert.ok(Math.abs(annualized - annualRate) < 0.000001);
});

test("daily cashbox yield applies CDI percentage over equivalent business-day rate", () => {
  const yieldValue = calculateDailyCashBoxYield(1000, 13.65, 100);
  const incorrectCalendarDayYield = 1000 * (13.65 / 100 / 365);

  assert.ok(yieldValue > 0);
  assert.notEqual(Number(yieldValue.toFixed(8)), Number(incorrectCalendarDayYield.toFixed(8)));
});

test("business dates ignore weekends", () => {
  const dates = getBusinessDatesBetween("2026-07-24", "2026-07-28");

  assert.deepEqual(dates, ["2026-07-27", "2026-07-28"]);
  assert.equal(isBusinessDay("2026-07-25"), false);
  assert.equal(isBusinessDay("2026-07-27"), true);
});
