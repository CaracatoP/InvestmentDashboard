import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLocalTimestampFromDateTime,
  canMarkExpenseAsPaid,
  formatCompletedAt,
  getExpenseDueState,
  matchesExpenseStatusFilter
} from "../src/components/planning/planning-expense-utils";
import type { MonthlyExpenseRecord } from "../src/types/management";

function expense(overrides: Partial<MonthlyExpenseRecord>): MonthlyExpenseRecord {
  return {
    id: "expense-test",
    planId: "plan-test",
    categoryId: "category-test",
    description: "Spotify",
    amountInCents: 2190,
    date: "2026-08-10",
    time: "09:00",
    expenseType: "recurring",
    recurring: true,
    status: "planned",
    ...overrides
  };
}

const now = new Date(2026, 7, 6, 10, 0, 0, 0);

test("planned expenses are the only ones eligible for the quick complete action", () => {
  assert.equal(canMarkExpenseAsPaid(expense({ status: "planned" })), true);
  assert.equal(canMarkExpenseAsPaid(expense({ status: "completed", completedAt: "2026-08-06T14:10:00-03:00" })), false);
  assert.equal(canMarkExpenseAsPaid(expense({ status: "planned", recurrenceCancelled: true })), false);
});

test("status filters separate pending, paid and future expenses using August 6, 2026 as the local reference", () => {
  assert.equal(matchesExpenseStatusFilter(expense({ date: "2026-08-05", time: "09:00" }), "pending", now), true);
  assert.equal(matchesExpenseStatusFilter(expense({ date: "2026-08-10", time: "09:00" }), "pending", now), false);
  assert.equal(matchesExpenseStatusFilter(expense({ date: "2026-08-10", time: "09:00" }), "future", now), true);
  assert.equal(matchesExpenseStatusFilter(expense({ status: "completed", completedAt: "2026-08-06T14:10:00-03:00" }), "paid", now), true);
});

test("due state labels highlight overdue, today, near-term future and paid expenses", () => {
  assert.deepEqual(getExpenseDueState(expense({ date: "2026-08-04", time: "09:00" }), now), { key: "overdue", label: "Vencido ha 2 dias" });
  assert.deepEqual(getExpenseDueState(expense({ date: "2026-08-06", time: "23:00" }), now), { key: "today", label: "Vence hoje" });
  assert.deepEqual(getExpenseDueState(expense({ date: "2026-08-07", time: "09:00" }), now), { key: "soon", label: "Vence amanha" });
  assert.deepEqual(getExpenseDueState(expense({ date: "2026-08-09", time: "09:00" }), now), { key: "soon", label: "Vence em 3 dias" });
  assert.deepEqual(
    getExpenseDueState(expense({ status: "completed", completedAt: "2026-08-06T14:10:00-03:00" }), now),
    { key: "paid", label: "Pago em 06/08/2026 as 14:10" }
  );
});

test("frontend helpers keep the chosen payment timestamp separate from the due date", () => {
  assert.equal(formatCompletedAt("2026-08-06T14:10:00-03:00"), "Pago em 06/08/2026 as 14:10");
  assert.match(buildLocalTimestampFromDateTime("2026-08-06", "14:10"), /^2026-08-06T14:10:00[+-]\d{2}:\d{2}$/);
});
