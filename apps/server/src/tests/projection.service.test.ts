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

test("dividend yield estimates passive income without changing projected wealth", () => {
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
  assert.equal(projection.summary.futureMonthlyDividends, 500);
  assert.equal(projection.summary.futureAnnualDividends, 6000);
  assert.equal(projection.summary.accumulatedDividends, 6000);
});

test("reinvesting dividends does not add dividend yield a second time", () => {
  const baseInput = {
    wealth: 24794.82,
    monthlyContribution: 1000,
    expectedReturn: 14,
    inflation: 4,
    currentAge: 19,
    targetAge: 30
  };

  const withoutDividendYield = calculateProjection({
    ...baseInput,
    annualDividendYield: 0,
    reinvestDividends: true
  });
  const withDividendYield = calculateProjection({
    ...baseInput,
    annualDividendYield: 12,
    reinvestDividends: true
  });
  const withoutReinvestment = calculateProjection({
    ...baseInput,
    annualDividendYield: 12,
    reinvestDividends: false
  });

  assert.equal(withDividendYield.summary.months, 132);
  assert.equal(withDividendYield.summary.futureWealth, withoutDividendYield.summary.futureWealth);
  assert.equal(withDividendYield.summary.futureWealth, withoutReinvestment.summary.futureWealth);
  assert.equal(withDividendYield.summary.futureWealth, 398647);
  assert.equal(withDividendYield.summary.realFutureWealth, 258954);
  assert.equal(withDividendYield.summary.futureAnnualDividends, 47838);
  assert.equal(withDividendYield.summary.futureMonthlyDividends, 3986);
  assert.equal(withDividendYield.summary.futureMonthlyDividends, Math.round(withDividendYield.summary.futureWealth * 0.12 / 12));
});
