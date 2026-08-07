import assert from "node:assert/strict";
import test from "node:test";
import { buildMovements } from "../services/portfolio.service";
import type { CashBoxRecord, ContributionRecord, MonthlyExpenseRecord, MonthlyIncomeEntryRecord, MonthlyPlanRecord, OperationRecord } from "../types/investment";

const plan: MonthlyPlanRecord = {
  id: "plan-history",
  year: 2026,
  month: 8,
  incomeInCents: 200000,
  categories: [
    { id: "transport", name: "Transporte", icon: "car", color: "#22c55e", budgetType: "fixed", percentage: 0, fixedAmountInCents: 30000 }
  ]
};

const investmentsPlan: MonthlyPlanRecord = {
  id: "plan-history-investments",
  year: 2026,
  month: 8,
  incomeInCents: 200000,
  categories: [
    { id: "investimentos", name: "Investimentos", icon: "trending-up", color: "#a78bfa", budgetType: "fixed", percentage: 0, fixedAmountInCents: 50000 }
  ]
};

function expense(input: Partial<MonthlyExpenseRecord>): MonthlyExpenseRecord {
  return {
    id: "expense-1",
    planId: "plan-history",
    categoryId: "transport",
    description: "Gasolina",
    amountInCents: 6000,
    date: "2026-08-01",
    time: "10:00",
    expenseType: "single",
    recurring: false,
    status: "completed",
    ...input
  };
}

function incomeEntry(input: Partial<MonthlyIncomeEntryRecord>): MonthlyIncomeEntryRecord {
  return {
    id: "income-entry-1",
    planId: "plan-history",
    description: "Freelance",
    amountInCents: 80000,
    category: "Freelance",
    date: "2026-08-03",
    time: "11:00",
    status: "received",
    incomeType: "single",
    recurring: false,
    receivedAt: "2026-08-03T11:00:00-03:00",
    ...input
  };
}

test("history hides cancelled monthly expense occurrences", () => {
  const movements = buildMovements([], [], [], [], {
    monthlyPlans: [plan],
    monthlyExpenses: [
      expense({ id: "cancelled-expense", recurrenceCancelled: true }),
      expense({ id: "visible-expense", recurrenceCancelled: false })
    ]
  });

  assert.equal(movements.length, 1);
  assert.equal(movements[0].sourceType, "monthly-expense");
  assert.equal(movements[0].sourceId, "visible-expense");
});

test("history includes monthly income entries as income events", () => {
  const movements = buildMovements([], [], [], [], {
    monthlyPlans: [plan],
    monthlyIncomeEntries: [
      incomeEntry({ id: "income-visible" }),
      incomeEntry({ id: "income-cancelled", status: "cancelled" })
    ]
  });

  assert.equal(movements.length, 1);
  assert.equal(movements[0].sourceType, "monthly-income-entry");
  assert.equal(movements[0].eventType, "income");
  assert.equal(movements[0].type, "Entrada");
  assert.equal(movements[0].amount, 800);
  assert.equal(movements[0].statusLabel, "Recebido");
});

test("history keeps legitimate events with same id, amount and date from different sources", () => {
  const operation: OperationRecord = {
    id: "same-id",
    assetTicker: "VGIR11",
    type: "COMPRA",
    date: "2026-08-01",
    quantity: 10,
    price: 10,
    fees: 0,
    totalValue: 100
  };
  const contribution: ContributionRecord = {
    id: "same-id",
    date: "2026-08-01",
    value: 100,
    description: "Aporte"
  };

  const movements = buildMovements([operation], [], [contribution], []);

  assert.equal(movements.length, 2);
  assert.notEqual(movements[0].canonicalId, movements[1].canonicalId);
  assert.deepEqual(new Set(movements.map((movement) => movement.sourceType)), new Set(["operation", "contribution"]));
});

test("history deduplicates duplicated events by canonical source identity", () => {
  const duplicatedExpense = expense({
    id: "expense-duplicate",
    recurring: true,
    expenseType: "recurring",
    recurrenceId: "series-1",
    recurrenceOriginalDate: "2026-08-01"
  });

  const movements = buildMovements([], [], [], [], {
    monthlyPlans: [plan],
    monthlyExpenses: [duplicatedExpense, { ...duplicatedExpense }]
  });

  assert.equal(movements.length, 1);
  assert.equal(movements[0].canonicalId, "monthly-expense:series-1:recorrencia:2026-08-01");
});

test("history deduplicates duplicated recurring occurrences even when record ids differ", () => {
  const firstExpense = expense({
    id: "expense-recurring-a",
    recurring: true,
    expenseType: "recurring",
    recurrenceId: "series-2",
    recurrenceOriginalDate: "2026-08-10",
    date: "2026-08-10"
  });
  const secondExpense = { ...firstExpense, id: "expense-recurring-b" };

  const movements = buildMovements([], [], [], [], {
    monthlyPlans: [plan],
    monthlyExpenses: [firstExpense, secondExpense]
  });

  assert.equal(movements.length, 1);
  assert.equal(movements[0].canonicalId, "monthly-expense:series-2:recorrencia:2026-08-10");
});

test("history exposes raw duplicates for readonly diagnostics when deduplication is disabled", () => {
  const duplicatedExpense = expense({ id: "expense-raw-duplicate" });
  const movements = buildMovements([], [], [], [], {
    monthlyPlans: [plan],
    monthlyExpenses: [duplicatedExpense, { ...duplicatedExpense }],
    deduplicate: false
  });

  assert.equal(movements.length, 2);
  assert.equal(movements[0].canonicalId, movements[1].canonicalId);
});

test("history keeps the same canonical identity before and after payment while exposing the payment timestamp", () => {
  const planned = expense({
    id: "expense-history-payment",
    recurring: true,
    expenseType: "recurring",
    recurrenceId: "series-history-payment",
    recurrenceOriginalDate: "2026-08-10",
    date: "2026-08-10",
    time: "09:00",
    status: "planned"
  });
  const completed = {
    ...planned,
    status: "completed" as const,
    completedAt: "2026-08-06T14:10:00-03:00"
  };

  const plannedMovement = buildMovements([], [], [], [], {
    monthlyPlans: [plan],
    monthlyExpenses: [planned]
  })[0];
  const completedMovement = buildMovements([], [], [], [], {
    monthlyPlans: [plan],
    monthlyExpenses: [completed]
  })[0];

  assert.equal(plannedMovement.canonicalId, completedMovement.canonicalId);
  assert.equal(completedMovement.date, "2026-08-06T14:10:00-03:00");
  assert.equal(completedMovement.occurrenceDate, "2026-08-10");
  assert.equal(completedMovement.completedAt, "2026-08-06T14:10:00-03:00");
  assert.match(completedMovement.description, /Vencimento 10\/08\/2026/);
  assert.match(completedMovement.description, /Pago em 06\/08\/2026 as 14:10/);
});

test("history keeps only the linked asset operation when a completed planning expense already generated it", () => {
  const linkedExpense = expense({
    id: "expense-linked-asset",
    categoryId: "investimentos",
    description: "Aporte integrado",
    amountInCents: 50500,
    date: "2026-08-05",
    status: "completed",
    allocationKind: "investment_contribution",
    integration: {
      destination: "asset",
      linkedEntityType: "operation",
      linkedEntityId: "operation-linked-asset",
      assetId: "asset-history-1",
      assetTicker: "HIST11",
      operationType: "COMPRA",
      quantity: 5,
      price: 100,
      fees: 5,
      integrationId: "integration-linked-asset",
      idempotencyKey: "idempotency-linked-asset"
    }
  });
  const operation: OperationRecord = {
    id: "operation-linked-asset",
    assetId: "asset-history-1",
    assetTicker: "HIST11",
    type: "COMPRA",
    date: "2026-08-05",
    quantity: 5,
    price: 100,
    fees: 5,
    totalValue: 500,
    origin: "monthly-planning",
    planningLink: {
      expenseId: "expense-linked-asset",
      planId: "plan-history-investments",
      integrationId: "integration-linked-asset",
      idempotencyKey: "idempotency-linked-asset"
    }
  };

  const movements = buildMovements([operation], [], [], [], {
    monthlyPlans: [investmentsPlan],
    monthlyExpenses: [linkedExpense]
  });

  assert.equal(movements.length, 1);
  assert.equal(movements[0].sourceType, "operation");
  assert.equal(movements[0].sourceId, "operation-linked-asset");
});

test("history keeps only the linked cashbox movement when a completed planning expense already generated it", () => {
  const linkedExpense = expense({
    id: "expense-linked-cashbox",
    categoryId: "investimentos",
    description: "Caixinha integrada",
    amountInCents: 70000,
    date: "2026-08-04",
    status: "completed",
    allocationKind: "cash_box_contribution",
    integration: {
      destination: "cashbox",
      linkedEntityType: "cashBoxMovement",
      linkedEntityId: "cashbox-movement-linked",
      cashBoxId: "cashbox-history-1",
      integrationId: "integration-linked-cashbox",
      idempotencyKey: "idempotency-linked-cashbox"
    }
  });
  const cashBox: CashBoxRecord = {
    id: "cashbox-history-1",
    name: "Caixinha Historico",
    type: "reserva",
    initialBalance: 0,
    currentBalance: 700,
    cdiPercentage: 100,
    createdAt: "2026-08-01T00:00:00-03:00",
    active: true,
    movements: [
      {
        id: "cashbox-movement-linked",
        type: "contribution",
        value: 700,
        date: "2026-08-04",
        description: "Caixinha integrada",
        origin: "monthly-planning",
        planningLink: {
          expenseId: "expense-linked-cashbox",
          planId: "plan-history-investments",
          integrationId: "integration-linked-cashbox",
          idempotencyKey: "idempotency-linked-cashbox"
        }
      }
    ]
  };

  const movements = buildMovements([], [], [], [cashBox], {
    monthlyPlans: [investmentsPlan],
    monthlyExpenses: [linkedExpense]
  });

  assert.equal(movements.length, 1);
  assert.equal(movements[0].sourceType, "cashbox-movement");
  assert.equal(movements[0].sourceId, "cashbox-movement-linked");
});
