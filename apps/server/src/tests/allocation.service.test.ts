import assert from "node:assert/strict";
import test from "node:test";
import { buildAllocationSummary } from "../services/allocation.service";

test("allocation recommendation chooses largest monetary deficit and ignores excess categories", () => {
  const summary = buildAllocationSummary(
    [
      { categoryId: "FII", label: "FIIs", value: 7000, ticker: "MXRF11" },
      { categoryId: "ACAO", label: "Acoes", value: 2000, ticker: "WEGE3" },
      { categoryId: "cash", label: "Caixinha", value: 1000, cashBoxId: "cash-1" }
    ],
    [
      { category: "FII", targetPercentage: 40, priority: 1 },
      { category: "ACAO", targetPercentage: 40, priority: 2 },
      { category: "cash", targetPercentage: 20, priority: 3 }
    ]
  );

  assert.equal(summary.totalEquity, 10000);
  assert.equal(summary.largestExcess?.categoryId, "FII");
  assert.equal(summary.recommendation.categoryId, "ACAO");
  assert.equal(summary.recommendation.ticker, "WEGE3");
  assert.ok(summary.recommendation.amountNeeded > 0);
});

test("allocation includes cashbox category in ideal and difference calculations", () => {
  const summary = buildAllocationSummary(
    [{ categoryId: "cash", label: "Caixinha", value: 5000, cashBoxId: "cash-1" }],
    [{ category: "cash", targetPercentage: 50, priority: 1 }]
  );
  const cash = summary.categories.find((category) => category.categoryId === "cash");

  assert.equal(cash?.label, "Caixinha");
  assert.equal(cash?.currentValue, 5000);
  assert.equal(cash?.targetPercent, 50);
  assert.equal(cash?.status, "excess");
});
