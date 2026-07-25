import assert from "node:assert/strict";
import test from "node:test";
import { annualRateToMonthlyRate, calculateProjection } from "../services/projection.service";

test("annualRateToMonthlyRate converts annual percentage to equivalent monthly rate", () => {
  const monthly = annualRateToMonthlyRate(12);
  assert.ok(monthly > 0.009 && monthly < 0.01);
});

test("zero rates with monthly contribution grow only by contributions at end of month", () => {
  const projection = calculateProjection({
    wealth: 25000,
    monthlyContribution: 1000,
    expectedReturn: 0,
    inflation: 0,
    annualDividendYield: 0,
    currentAge: 30,
    targetAge: 31,
    reinvestDividends: true
  });

  assert.equal(projection.summary.futureWealth, 37000);
  assert.equal(projection.summary.realFutureWealth, 37000);
  assert.equal(projection.summary.futureMonthlyDividends, 0);
});

test("without contribution, return, or dividends, wealth stays constant", () => {
  const projection = calculateProjection({
    wealth: 25000,
    monthlyContribution: 0,
    expectedReturn: 0,
    inflation: 0,
    annualDividendYield: 0,
    currentAge: 30,
    targetAge: 41,
    reinvestDividends: true
  });

  assert.equal(projection.summary.futureWealth, 25000);
});

test("plausible long-term projection remains far below one billion", () => {
  const projection = calculateProjection({
    wealth: 25000,
    monthlyContribution: 1000,
    expectedReturn: 8,
    inflation: 4,
    annualDividendYield: 6,
    currentAge: 30,
    targetAge: 41,
    reinvestDividends: true
  });

  assert.ok(projection.summary.futureWealth > 150000);
  assert.ok(projection.summary.futureWealth < 1000000000);
});

test("dividends are accumulated separately when reinvestment is disabled", () => {
  const projection = calculateProjection({
    wealth: 100000,
    monthlyContribution: 0,
    expectedReturn: 0,
    inflation: 0,
    annualDividendYield: 6,
    currentAge: 30,
    targetAge: 31,
    reinvestDividends: false
  });

  assert.equal(projection.summary.futureWealth, 100000);
  assert.ok(projection.summary.accumulatedDividends > 0);
});
