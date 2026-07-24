import assert from "node:assert/strict";
import test from "node:test";
import { calculateCashBoxTotals } from "../services/cash-box.service";
import type { CashBoxRecord } from "../types/investment";

test("calculateCashBoxTotals separates contributions, withdrawals and yield", () => {
  const cashBox: CashBoxRecord = {
    id: "cash-1",
    categoryId: "cash",
    name: "Reserva Nubank",
    type: "Reserva",
    initialBalance: 1000,
    currentBalance: 0,
    cdiPercentage: 100,
    createdAt: "2026-07-01",
    active: true,
    movements: [
      { type: "contribution", value: 500, date: "2026-07-02" },
      { type: "withdrawal", value: 200, date: "2026-07-03" },
      { type: "yield", value: 10, date: "2026-07-06" }
    ]
  };

  const totals = calculateCashBoxTotals(cashBox);

  assert.equal(totals.totalContributions, 1500);
  assert.equal(totals.totalWithdrawals, 200);
  assert.equal(totals.totalYield, 10);
});
