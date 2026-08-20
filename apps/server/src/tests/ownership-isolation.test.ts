import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { runWithAuthContext } from "../auth/auth-context";
import {
  createAsset,
  createCashBox,
  createOperation,
  deleteOperation,
  findAssetByTicker,
  listAssets,
  listCashBoxes,
  listOperations,
  updateAsset,
  upsertMarketQuote
} from "../repositories/investment.repository";
import {
  createMonthlyExpense,
  deleteMonthlyExpense,
  findMonthlyExpenseById,
  listAllMonthlyExpenses,
  listMonthlyPlans,
  updateMonthlyExpense,
  upsertMonthlyPlan
} from "../repositories/monthly-planning.repository";
import { getMarketStatus } from "../services/market-data.service";
import { addMonthlyExpense, getMonthlyPlanningOverview } from "../services/monthly-planning.service";

function asUser<T>(userId: string, callback: () => Promise<T>) {
  return runWithAuthContext({ userId, role: "user", channel: "web" }, callback);
}

test("investment records are isolated by the authenticated owner", async () => {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const firstUserId = `user-a-${suffix}`;
  const secondUserId = `user-b-${suffix}`;
  const ticker = `AAA${suffix.slice(0, 4)}`;
  let firstUserOperationId = "";

  await asUser(firstUserId, async () => {
    await createAsset({
      name: "Ativo Usuario A",
      ticker,
      category: "Ações",
      subcategory: "Brasil",
      sector: "Teste",
      currency: "BRL",
      active: true
    });
    const operation = await createOperation({
      assetTicker: ticker,
      type: "COMPRA",
      date: "2026-08-01",
      quantity: 10,
      price: 20,
      fees: 1,
      totalValue: 201
    });
    firstUserOperationId = operation.id ?? "";
    await createCashBox({
      name: "Reserva Usuario A",
      type: "Reserva",
      currentBalance: 1000,
      totalContributions: 1000,
      totalWithdrawals: 0,
      totalYield: 0,
      cdiPercentage: 100,
      createdAt: "2026-08-01",
      updatedAt: "2026-08-01",
      active: true,
      movements: []
    });
  });

  await asUser(secondUserId, async () => {
    assert.equal(await findAssetByTicker(ticker), null);
    assert.deepEqual((await listAssets()).filter((asset) => asset.ticker === ticker), []);
    assert.deepEqual((await listOperations()).filter((operation) => operation.assetTicker === ticker), []);
    assert.deepEqual((await listCashBoxes()).filter((cashBox) => cashBox.name === "Reserva Usuario A"), []);
    assert.equal(await updateAsset(ticker, { name: "Ativo Invadido" }), null);
    assert.equal(await deleteOperation(firstUserOperationId), false);
  });

  await asUser(firstUserId, async () => {
    assert.equal((await findAssetByTicker(ticker))?.ticker, ticker);
    assert.equal((await listOperations()).filter((operation) => operation.assetTicker === ticker).length, 1);
    assert.equal((await listCashBoxes()).filter((cashBox) => cashBox.name === "Reserva Usuario A").length, 1);
  });
});

test("monthly planning records are isolated by the authenticated owner", async () => {
  const suffix = randomUUID().slice(0, 8);
  const firstUserId = `plan-user-a-${suffix}`;
  const secondUserId = `plan-user-b-${suffix}`;
  const year = 2026;
  const month = 8;
  let firstUserExpenseId = "";

  await asUser(firstUserId, async () => {
    const plan = await upsertMonthlyPlan({
      year,
      month,
      incomeInCents: 500000,
      categories: [
        {
          id: "transport",
          name: "Transporte",
          icon: "car",
          color: "#22c55e",
          budgetType: "fixed",
          percentage: 0,
          fixedAmountInCents: 80000
        }
      ]
    });
    const expense = await createMonthlyExpense({
      planId: plan.id ?? "",
      categoryId: "transport",
      description: "Despesa Usuario A",
      amountInCents: 6000,
      date: "2026-08-02",
      time: "09:00",
      expenseType: "single",
      recurring: false,
      status: "completed"
    });
    firstUserExpenseId = expense.id ?? "";
  });

  await asUser(secondUserId, async () => {
    assert.deepEqual((await listMonthlyPlans()).filter((plan) => plan.year === year && plan.month === month), []);
    assert.deepEqual((await listAllMonthlyExpenses()).filter((expense) => expense.description === "Despesa Usuario A"), []);
    assert.equal(await findMonthlyExpenseById(firstUserExpenseId), null);
    assert.equal(await updateMonthlyExpense(firstUserExpenseId, { description: "Despesa Invadida" }), null);
    assert.equal(await deleteMonthlyExpense(firstUserExpenseId), false);
  });

  await asUser(firstUserId, async () => {
    assert.equal((await listMonthlyPlans()).filter((plan) => plan.year === year && plan.month === month).length, 1);
    assert.equal((await listAllMonthlyExpenses()).filter((expense) => expense.description === "Despesa Usuario A").length, 1);
  });
});

test("the same recurring expense template can exist for two users without cross-user conflicts", async () => {
  const suffix = randomUUID().slice(0, 8);
  const firstUserId = `recurrence-user-a-${suffix}`;
  const secondUserId = `recurrence-user-b-${suffix}`;

  async function seedRecurringPlan(userId: string) {
    return asUser(userId, async () => {
      const plan = await upsertMonthlyPlan({
        year: 2026,
        month: 8,
        incomeInCents: 450000,
        categories: [
          {
            id: "assinaturas",
            name: "Assinaturas",
            icon: "repeat",
            color: "#14b8a6",
            budgetType: "fixed",
            percentage: 0,
            fixedAmountInCents: 25000
          }
        ]
      });

      assert.ok(plan.id);
      const expense = await addMonthlyExpense(plan.id, {
        categoryId: "assinaturas",
        description: "Netflix compartilhado",
        amountInCents: 3900,
        date: "2026-08-10",
        time: "09:00",
        note: "",
        paymentMethod: "Credito",
        expenseType: "recurring",
        recurring: true,
        recurrenceFrequency: "monthly",
        recurrenceInterval: 1,
        recurrenceDayOfMonth: 10,
        recurrenceStartDate: "2026-08-10",
        recurrenceEndDate: null,
        status: "planned"
      });

      const overview = await getMonthlyPlanningOverview(2026, 9);
      return {
        plan,
        recurrenceId: expense.recurrenceId,
        occurrences: overview.expenses.filter((item) => item.recurrenceId === expense.recurrenceId)
      };
    });
  }

  const [firstUser, secondUser] = await Promise.all([seedRecurringPlan(firstUserId), seedRecurringPlan(secondUserId)]);

  assert.equal(firstUser.occurrences.length, 1);
  assert.equal(secondUser.occurrences.length, 1);
  assert.equal(firstUser.occurrences[0].date, "2026-09-10");
  assert.equal(secondUser.occurrences[0].date, "2026-09-10");
  assert.notEqual(firstUser.recurrenceId, null);
  assert.notEqual(secondUser.recurrenceId, null);

  await asUser(firstUserId, async () => {
    const overview = await getMonthlyPlanningOverview(2026, 9);
    assert.equal(overview.expenses.filter((item) => item.description === "Netflix compartilhado").length, 1);
    assert.equal(overview.expenses.filter((item) => item.recurrenceId === secondUser.recurrenceId).length, 0);
  });

  await asUser(secondUserId, async () => {
    const overview = await getMonthlyPlanningOverview(2026, 9);
    assert.equal(overview.expenses.filter((item) => item.description === "Netflix compartilhado").length, 1);
    assert.equal(overview.expenses.filter((item) => item.recurrenceId === firstUser.recurrenceId).length, 0);
  });
});

test("market status only exposes quotes for the authenticated owner's assets", async () => {
  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const firstUserId = `market-user-a-${suffix}`;
  const secondUserId = `market-user-b-${suffix}`;
  const firstTicker = `MKA${suffix.slice(0, 3)}`;
  const secondTicker = `MKB${suffix.slice(0, 3)}`;
  const quotedAt = new Date("2026-08-01T12:00:00.000Z");

  await asUser(firstUserId, async () => {
    await createAsset({
      name: "Market User A",
      ticker: firstTicker,
      category: "Ações",
      subcategory: "Brasil",
      sector: "Teste",
      currency: "BRL",
      active: true
    });
    await upsertMarketQuote({
      ticker: firstTicker,
      providerSymbol: firstTicker,
      price: 10,
      currency: "BRL",
      market: "B3",
      assetKind: "stock",
      quotedAt,
      source: "test",
      status: "updated"
    });
  });

  await asUser(secondUserId, async () => {
    await createAsset({
      name: "Market User B",
      ticker: secondTicker,
      category: "Ações",
      subcategory: "Brasil",
      sector: "Teste",
      currency: "BRL",
      active: true
    });
    await upsertMarketQuote({
      ticker: secondTicker,
      providerSymbol: secondTicker,
      price: 20,
      currency: "BRL",
      market: "B3",
      assetKind: "stock",
      quotedAt,
      source: "test",
      status: "updated"
    });

    const status = await getMarketStatus();

    assert.deepEqual(
      status.quotes.map((quote) => quote.ticker),
      [secondTicker]
    );
  });
});
