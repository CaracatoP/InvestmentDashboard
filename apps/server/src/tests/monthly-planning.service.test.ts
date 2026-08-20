import assert from "node:assert/strict";
import test from "node:test";
import {
  createAsset,
  createCashBox,
  findCashBoxById,
  listOperations
} from "../repositories/investment.repository";
import {
  listAllMonthlyExpenses,
  listAllMonthlyIncomeEntries,
} from "../repositories/monthly-planning.repository";
import {
  addMonthlyExpense,
  addMonthlyIncomeEntry,
  calculateBudgetDistribution,
  calculateCategoryLimit,
  calculateMonthlyPlanning,
  copyPreviousMonthlyPlan,
  completeMonthlyExpense,
  completeMonthlyIncomeEntry,
  determineExpenseStatus,
  editMonthlyExpense,
  getMonthlyPlanningOverview,
  removeMonthlyExpense,
  removeMonthlyExpenseSeries,
  saveMonthlyPlan
} from "../services/monthly-planning.service";
import type { MonthlyExpenseRecord, MonthlyIncomeEntryRecord, MonthlyPlanRecord } from "../types/investment";

async function saveInvestmentsPlan(input: { year: number; month: number; monthlyContributionGoalInCents?: number }) {
  return saveMonthlyPlan({
    year: input.year,
    month: input.month,
    incomeInCents: 500000,
    monthlyContributionGoalInCents: input.monthlyContributionGoalInCents ?? 0,
    categories: [
      {
        id: "investimentos",
        name: "Investimentos",
        icon: "trending-up",
        color: "#a78bfa",
        budgetType: "fixed",
        percentage: 0,
        fixedAmountInCents: 250000
      }
    ]
  });
}

test("calculateCategoryLimit derives percentage and fixed budgets in cents", () => {
  assert.equal(calculateCategoryLimit({ budgetType: "percentage", percentage: 10, fixedAmountInCents: null }, 350000), 35000);
  assert.equal(calculateCategoryLimit({ budgetType: "fixed", percentage: 0, fixedAmountInCents: 12050 }, 350000), 12050);
});

test("budget distribution sums only percentage sectors correctly", () => {
  const distribution = calculateBudgetDistribution({
    incomeInCents: 200000,
    sectors: [
      { budgetType: "percentage", percentage: 20, fixedAmountInCents: null },
      { budgetType: "percentage", percentage: 30, fixedAmountInCents: null }
    ]
  });

  assert.equal(distribution.distributedPercentage, 50);
  assert.equal(distribution.availablePercentage, 50);
  assert.equal(distribution.distributedAmountInCents, 100000);
  assert.equal(distribution.availableAmountInCents, 100000);
  assert.equal(distribution.status, "within-limit");
});

test("budget distribution converts fixed sectors into income percentage", () => {
  const distribution = calculateBudgetDistribution({
    incomeInCents: 200000,
    sectors: [
      { budgetType: "fixed", percentage: 0, fixedAmountInCents: 30000 },
      { budgetType: "fixed", percentage: 0, fixedAmountInCents: 150000 }
    ]
  });

  assert.equal(distribution.distributedPercentage, 90);
  assert.equal(distribution.availablePercentage, 10);
  assert.equal(distribution.distributedAmountInCents, 180000);
  assert.equal(distribution.availableAmountInCents, 20000);
});

test("budget distribution supports mixed fixed and percentage sectors", () => {
  const distribution = calculateBudgetDistribution({
    incomeInCents: 400000,
    sectors: [
      { budgetType: "fixed", percentage: 0, fixedAmountInCents: 100000 },
      { budgetType: "percentage", percentage: 30, fixedAmountInCents: null }
    ]
  });

  assert.equal(distribution.distributedPercentage, 55);
  assert.equal(distribution.availablePercentage, 45);
  assert.equal(distribution.distributedAmountInCents, 220000);
  assert.equal(distribution.availableAmountInCents, 180000);
});

test("budget distribution reports over limit without capping percentages", () => {
  const distribution = calculateBudgetDistribution({
    incomeInCents: 200000,
    sectors: [
      { budgetType: "fixed", percentage: 0, fixedAmountInCents: 150000 },
      { budgetType: "percentage", percentage: 40, fixedAmountInCents: null }
    ]
  });

  assert.equal(distribution.distributedPercentage, 115);
  assert.equal(distribution.availablePercentage, 0);
  assert.equal(distribution.excessPercentage, 15);
  assert.equal(distribution.excessAmountInCents, 30000);
  assert.equal(distribution.status, "over-limit");
});

test("budget distribution requires income for fixed sectors when income is zero", () => {
  const distribution = calculateBudgetDistribution({
    incomeInCents: 0,
    sectors: [{ budgetType: "fixed", percentage: 0, fixedAmountInCents: 30000 }]
  });

  assert.equal(distribution.distributedPercentage, null);
  assert.equal(distribution.availablePercentage, null);
  assert.equal(distribution.hasFixedBudgetWithoutIncome, true);
  assert.equal(distribution.status, "income-required");
  assert.equal(Number.isNaN(distribution.excessPercentage), false);
  assert.equal(Number.isFinite(distribution.excessPercentage), true);
});

test("budget distribution recalculates fixed sector percentages when income changes", () => {
  const sectors = [{ budgetType: "fixed" as const, percentage: 0, fixedAmountInCents: 30000 }];

  assert.equal(calculateBudgetDistribution({ incomeInCents: 200000, sectors }).distributedPercentage, 15);
  assert.equal(calculateBudgetDistribution({ incomeInCents: 300000, sectors }).distributedPercentage, 10);
});

test("budget distribution rounds recurring decimals to two decimal places", () => {
  const distribution = calculateBudgetDistribution({
    incomeInCents: 300000,
    sectors: [{ budgetType: "fixed", percentage: 0, fixedAmountInCents: 100000 }]
  });

  assert.equal(distribution.distributedPercentage, 33.33);
  assert.equal(distribution.availablePercentage, 66.67);
});

test("monthly summary separates completed and planned expenses", () => {
  const plan: MonthlyPlanRecord = {
    id: "plan-test",
    month: 7,
    year: 2026,
    incomeInCents: 350000,
    categories: [
      { id: "transport", name: "Transporte", icon: "car", color: "#3b82f6", budgetType: "percentage", percentage: 10, fixedAmountInCents: null }
    ]
  };
  const expenses: MonthlyExpenseRecord[] = [
    {
      id: "expense-1",
      planId: "plan-test",
      categoryId: "transport",
      description: "Gasolina",
      amountInCents: 18000,
      date: "2026-07-27",
      time: "20:30",
      expenseType: "single",
      recurring: false,
      status: "completed"
    },
    {
      id: "expense-2",
      planId: "plan-test",
      categoryId: "transport",
      description: "Estacionamento",
      amountInCents: 7000,
      date: "2026-07-30",
      time: "10:00",
      expenseType: "single",
      recurring: false,
      status: "planned"
    }
  ];

  const overview = calculateMonthlyPlanning(plan, expenses);

  assert.equal(overview.summary.totalPlannedInCents, 35000);
  assert.equal(overview.summary.completedInCents, 18000);
  assert.equal(overview.summary.plannedExpensesInCents, 7000);
  assert.equal(overview.summary.remainingIncomeInCents, 332000);
  assert.equal(overview.summary.remainingIncomeAfterPlannedInCents, 325000);
  assert.equal(overview.categories[0].remainingInCents, 17000);
  assert.equal(overview.categories[0].remainingAfterPlannedInCents, 10000);
  assert.equal(Math.round(overview.categories[0].usedPercent * 100) / 100, 51.43);
});

test("monthly summary adds income entries without changing category base limits", () => {
  const plan: MonthlyPlanRecord = {
    id: "plan-income-entry-summary",
    month: 8,
    year: 2026,
    incomeInCents: 350000,
    categories: [
      { id: "food", name: "Alimentacao", icon: "utensils", color: "#22c55e", budgetType: "percentage", percentage: 20, fixedAmountInCents: null }
    ]
  };
  const incomeEntries: MonthlyIncomeEntryRecord[] = [
    {
      id: "income-entry-1",
      planId: "plan-income-entry-summary",
      description: "Freelance",
      amountInCents: 80000,
      category: "Freelance",
      date: "2026-08-05",
      time: "10:00",
      status: "received",
      incomeType: "single",
      recurring: false,
      receivedAt: "2026-08-05T10:00:00-03:00"
    },
    {
      id: "income-entry-2",
      planId: "plan-income-entry-summary",
      description: "Comissao",
      amountInCents: 25000,
      category: "Comissao",
      date: "2026-08-28",
      time: "10:00",
      status: "planned",
      incomeType: "single",
      recurring: false
    }
  ];

  const overview = calculateMonthlyPlanning(plan, [], { year: 2026, month: 8, incomeEntries });

  assert.equal(overview.summary.baseIncomeInCents, 350000);
  assert.equal(overview.summary.completedExtraIncomeInCents, 80000);
  assert.equal(overview.summary.plannedExtraIncomeInCents, 25000);
  assert.equal(overview.summary.currentTotalIncomeInCents, 430000);
  assert.equal(overview.summary.projectedTotalIncomeInCents, 455000);
  assert.equal(overview.summary.remainingIncomeAfterPlannedInCents, 455000);
  assert.equal(overview.categories[0].limitInCents, 70000);
  assert.equal(overview.incomeCategoryStats.length, 2);
  assert.equal(overview.calendarDays.some((day) => day.events.some((event) => event.type === "income")), true);
});

test("fixed budget categories also expose percent of monthly income", () => {
  const plan: MonthlyPlanRecord = {
    id: "plan-fixed-percent",
    month: 7,
    year: 2026,
    incomeInCents: 350000,
    categories: [
      { id: "food", name: "Alimentacao", icon: "utensils", color: "#22c55e", budgetType: "fixed", percentage: 0, fixedAmountInCents: 70000 }
    ]
  };

  const overview = calculateMonthlyPlanning(plan, []);
  const updatedOverview = calculateMonthlyPlanning({ ...plan, incomeInCents: 700000 }, []);

  assert.equal(overview.categories[0].limitInCents, 70000);
  assert.equal(overview.categories[0].plannedPercentOfIncome, 20);
  assert.equal(updatedOverview.categories[0].plannedPercentOfIncome, 10);
});

test("investment integrations import contributions and dividends into monthly planning", () => {
  const plan: MonthlyPlanRecord = {
    id: "plan-investment-integration",
    month: 7,
    year: 2026,
    incomeInCents: 350000,
    includeDividendsAsIncome: true,
    monthlyContributionGoalInCents: 150000,
    investmentSimulationAmountInCents: 50000,
    categories: []
  };

  const overview = calculateMonthlyPlanning(plan, [], {
    year: 2026,
    month: 7,
    contributions: [{ id: "contribution-1", date: "2026-07-05", value: 980, description: "Aporte corretora" }],
    dividends: [{ id: "dividend-1", assetTicker: "MXRF11", totalValue: 180, valuePerShare: 0.1, paymentDate: "2026-07-12", status: "received" }],
    dashboard: { metrics: { totalEquity: 24794.82, totalReturnPercent: 14, monthlyDividends: 180, currentValue: 24000 } } as never
  });

  assert.equal(overview.summary.totalIncomeWithDividendsInCents, 368000);
  assert.equal(overview.summary.contributedThisMonthInCents, 98000);
  assert.equal(Math.round(overview.summary.contributionGoalPercent * 100) / 100, 65.33);
  assert.equal(overview.investmentSummary.simulatedContributionTotalInCents, 148000);
  assert.equal(overview.calendarDays.some((day) => day.events.some((event) => event.type === "contribution")), true);
  assert.equal(overview.calendarDays.some((day) => day.events.some((event) => event.type === "dividend")), true);
});

test("completed investment expense creates and links one asset operation while updating the contribution goal", async () => {
  const plan = await saveInvestmentsPlan({ year: 2026, month: 4, monthlyContributionGoalInCents: 200000 });
  const asset = await createAsset({
    name: "Planejamento Ativo Abril",
    ticker: "PLAN4",
    category: "FII",
    currency: "BRL",
    active: true
  });

  assert.ok(plan.id);
  assert.ok(asset.id);

  const expense = await addMonthlyExpense(plan.id, {
    categoryId: "investimentos",
    description: "Aporte integrado abril",
    amountInCents: 50500,
    date: "2026-04-05",
    time: "09:00",
    note: "",
    paymentMethod: "Pix",
    expenseType: "single",
    recurring: false,
    status: "completed",
    integration: {
      destination: "asset",
      assetId: asset.id,
      operationType: "COMPRA",
      quantity: 5,
      price: 100,
      fees: 5,
      idempotencyKey: "planning-asset-apr-2026"
    }
  });

  assert.equal(expense.allocationKind, "investment_contribution");
  assert.equal(expense.integration?.linkedEntityType, "operation");
  assert.ok(expense.integration?.linkedEntityId);

  const operation = (await listOperations()).find((item) => item.id === expense.integration?.linkedEntityId);
  assert.ok(operation);
  assert.equal(operation?.origin, "monthly-planning");
  assert.equal(operation?.planningLink?.expenseId, expense.id);
  assert.equal(operation?.planningLink?.integrationId, expense.integration?.integrationId);
  assert.equal(operation?.assetId, asset.id);
  assert.equal(operation?.assetTicker, "PLAN4");
  assert.equal(operation?.totalValue, 500);
  assert.equal(operation?.fees, 5);

  const overview = await getMonthlyPlanningOverview(2026, 4);
  assert.equal(overview.summary.completedInvestmentsInCents, 50500);
  assert.equal(overview.summary.completedConsumptionInCents, 0);
  assert.equal(overview.summary.contributedThisMonthInCents, 50500);
  assert.equal(overview.summary.contributionGoalRemainingInCents, 149500);
  assert.equal(overview.investmentSummary.assetContributionsThisMonthInCents, 50500);
  assert.equal(overview.investmentSummary.cashBoxContributionsThisMonthInCents, 0);
});

test("completed investment expense creates and links one cashbox movement without inflating the asset contribution goal", async () => {
  const plan = await saveInvestmentsPlan({ year: 2026, month: 5, monthlyContributionGoalInCents: 150000 });
  const cashBox = await createCashBox({
    name: "Caixinha Planejamento Maio",
    type: "reserva",
    initialBalance: 0,
    currentBalance: 0,
    cdiPercentage: 100,
    createdAt: "2026-05-01T08:00:00-03:00",
    active: true,
    movements: []
  });

  assert.ok(plan.id);
  assert.ok(cashBox.id);

  const expense = await addMonthlyExpense(plan.id, {
    categoryId: "investimentos",
    description: "Transferencia integrada maio",
    amountInCents: 70000,
    date: "2026-05-04",
    time: "10:30",
    note: "",
    paymentMethod: "Pix",
    expenseType: "single",
    recurring: false,
    status: "completed",
    integration: {
      destination: "cashbox",
      cashBoxId: cashBox.id,
      idempotencyKey: "planning-cashbox-may-2026"
    }
  });

  assert.equal(expense.allocationKind, "cash_box_contribution");
  assert.equal(expense.integration?.linkedEntityType, "cashBoxMovement");
  assert.ok(expense.integration?.linkedEntityId);

  const updatedCashBox = await findCashBoxById(String(cashBox.id));
  const movement = updatedCashBox?.movements?.find((item) => item.id === expense.integration?.linkedEntityId);

  assert.ok(movement);
  assert.equal(movement?.type, "contribution");
  assert.equal(movement?.origin, "monthly-planning");
  assert.equal(movement?.planningLink?.expenseId, expense.id);
  assert.equal(movement?.planningLink?.integrationId, expense.integration?.integrationId);
  assert.equal(updatedCashBox?.currentBalance, 700);

  const overview = await getMonthlyPlanningOverview(2026, 5);
  assert.equal(overview.summary.completedInvestmentsInCents, 70000);
  assert.equal(overview.summary.contributedThisMonthInCents, 0);
  assert.equal(overview.summary.contributionGoalRemainingInCents, 150000);
  assert.equal(overview.investmentSummary.assetContributionsThisMonthInCents, 0);
  assert.equal(overview.investmentSummary.cashBoxContributionsThisMonthInCents, 70000);
});

test("integrated investment creation is idempotent for duplicate requests and creates a single linked operation", async () => {
  const plan = await saveInvestmentsPlan({ year: 2026, month: 6 });
  const asset = await createAsset({
    name: "Planejamento Ativo Junho",
    ticker: "PLAN6",
    category: "FII",
    currency: "BRL",
    active: true
  });
  const idempotencyKey = "planning-asset-jun-2026";

  assert.ok(plan.id);
  assert.ok(asset.id);

  const payload = {
    categoryId: "investimentos",
    description: "Aporte idempotente junho",
    amountInCents: 25000,
    date: "2026-06-03",
    time: "11:00",
    note: "",
    paymentMethod: "Pix",
    expenseType: "single" as const,
    recurring: false,
    status: "completed" as const,
    integration: {
      destination: "asset" as const,
      assetId: asset.id,
      operationType: "COMPRA" as const,
      quantity: 10,
      price: 25,
      fees: 0,
      idempotencyKey
    }
  };

  const [first, second] = await Promise.all([addMonthlyExpense(plan.id, payload), addMonthlyExpense(plan.id, payload)]);
  const matchingExpenses = (await listAllMonthlyExpenses()).filter((item) => item.integration?.idempotencyKey === idempotencyKey);
  const matchingOperations = (await listOperations()).filter((item) => item.planningLink?.idempotencyKey === idempotencyKey);

  assert.equal(first.id, second.id);
  assert.equal(first.integration?.linkedEntityId, second.integration?.linkedEntityId);
  assert.equal(matchingExpenses.length, 1);
  assert.equal(matchingOperations.length, 1);
});

test("income entry creation is idempotent and receipt updates the monthly overview", async () => {
  const plan = await saveMonthlyPlan({
    year: 2097,
    month: 8,
    incomeInCents: 300000,
    categories: [
      { id: "moradia", name: "Moradia", icon: "home", color: "#38bdf8", budgetType: "percentage", percentage: 30, fixedAmountInCents: null }
    ]
  });
  assert.ok(plan.id);

  const payload = {
    description: "Freelance idempotente",
    amountInCents: 90000,
    category: "Freelance",
    date: "2097-08-10",
    time: "09:00",
    status: "planned" as const,
    incomeType: "single" as const,
    recurring: false,
    note: "",
    idempotencyKey: "income-entry-idempotent-2097"
  };

  const [first, second] = await Promise.all([addMonthlyIncomeEntry(plan.id, payload), addMonthlyIncomeEntry(plan.id, payload)]);
  const matchingEntries = (await listAllMonthlyIncomeEntries()).filter((entry) => entry.idempotencyKey === payload.idempotencyKey);

  assert.equal(first.id, second.id);
  assert.equal(matchingEntries.length, 1);

  assert.ok(first.id);
  const completion = await completeMonthlyIncomeEntry(first.id, { receivedAt: "2097-08-10T12:00:00-03:00" });

  assert.equal(completion.incomeEntry.status, "received");
  assert.equal(completion.summary.receivedExtraIncomeInCents, 90000);
  assert.equal(completion.summary.currentBalanceInCents, 390000);
  assert.equal(completion.overview.categories[0].limitInCents, 90000);
});

test("recurring investment expenses stay planned without a linked entity until completion", async () => {
  const plan = await saveInvestmentsPlan({ year: 2026, month: 3, monthlyContributionGoalInCents: 100000 });
  const asset = await createAsset({
    name: "Planejamento Recorrente Marco",
    ticker: "PLAN3",
    category: "ETF",
    currency: "BRL",
    active: true
  });

  assert.ok(plan.id);
  assert.ok(asset.id);

  const expense = await addMonthlyExpense(plan.id, {
    categoryId: "investimentos",
    description: "Investimento recorrente marco",
    amountInCents: 24000,
    date: "2026-03-10",
    time: "08:15",
    note: "",
    paymentMethod: "Pix",
    expenseType: "recurring",
    recurring: true,
    recurrenceFrequency: "monthly",
    recurrenceInterval: 1,
    recurrenceDayOfMonth: 10,
    recurrenceStartDate: "2026-03-10",
    recurrenceEndDate: null,
    status: "planned",
    integration: {
      destination: "asset",
      assetId: asset.id,
      operationType: "COMPRA",
      quantity: 10,
      price: 24,
      fees: 0,
      idempotencyKey: "planning-recurring-mar-2026"
    }
  });

  assert.equal(expense.status, "planned");
  assert.equal(expense.allocationKind, "investment_contribution");
  assert.equal(expense.integration?.linkedEntityId ?? null, null);
  assert.equal((await listOperations()).some((item) => item.planningLink?.expenseId === expense.id), false);
  assert.ok(expense.id);

  const completion = await completeMonthlyExpense(expense.id, { completedAt: "2026-03-12T10:20:00-03:00" });
  const linkedOperation = (await listOperations()).find((item) => item.planningLink?.expenseId === expense.id);

  assert.equal(completion.expense.status, "completed");
  assert.ok(completion.expense.integration?.linkedEntityId);
  assert.equal(linkedOperation?.assetTicker, "PLAN3");
  assert.equal(linkedOperation?.origin, "monthly-planning");
  assert.equal(completion.overview.summary.completedInvestmentsInCents, 24000);
  assert.equal(completion.overview.summary.plannedInvestmentsInCents, 0);

  await removeMonthlyExpenseSeries(expense.id);
});

test("future expenses are forced to planned while past expenses keep manual status", () => {
  const now = new Date(2026, 6, 27, 20, 30);

  assert.equal(determineExpenseStatus("2026-07-28", "09:00", "completed", now), "planned");
  assert.equal(determineExpenseStatus("2026-07-27", "18:00", "planned", now), "planned");
  assert.equal(determineExpenseStatus("2026-07-27", "18:00", undefined, now), "completed");
});

test("copyPreviousMonthlyPlan copies configuration without copying expenses", async () => {
  const previous = await saveMonthlyPlan({
    year: 2099,
    month: 6,
    incomeInCents: 500000,
    categories: [
      { id: "moradia", name: "Moradia", icon: "home", color: "#38bdf8", budgetType: "percentage", percentage: 30, fixedAmountInCents: null }
    ]
  });

  assert.ok(previous.id);
  await addMonthlyExpense(previous.id, {
    categoryId: "moradia",
    description: "Aluguel",
    amountInCents: 150000,
    date: "2099-06-05",
    time: "09:00",
    note: "",
    paymentMethod: null,
    expenseType: "single",
    recurring: false,
    status: "completed"
  });

  const copied = await copyPreviousMonthlyPlan(2099, 7);
  const copiedAgain = await copyPreviousMonthlyPlan(2099, 7);
  const overview = await getMonthlyPlanningOverview(2099, 7);

  assert.equal(copied.incomeInCents, 500000);
  assert.equal(copied.categories.length, 1);
  assert.equal(copied.categories[0].percentage, 30);
  assert.equal(copiedAgain.id, copied.id);
  assert.equal(copiedAgain.categories.length, 1);
  assert.equal(overview.expenses.length, 0);
});

test("recurring expenses generate planned future entries without duplicates", async () => {
  const plan = await saveMonthlyPlan({
    year: 2098,
    month: 7,
    incomeInCents: 400000,
    categories: [
      { id: "assinaturas", name: "Assinaturas", icon: "repeat", color: "#14b8a6", budgetType: "fixed", percentage: 0, fixedAmountInCents: 20000 }
    ]
  });

  assert.ok(plan.id);
  const template = await addMonthlyExpense(plan.id, {
    categoryId: "assinaturas",
    description: "Internet",
    amountInCents: 12000,
    date: "2098-07-10",
    time: "09:00",
    note: "",
    paymentMethod: "Pix",
    expenseType: "recurring",
    recurring: true,
    recurrenceFrequency: "monthly",
    recurrenceInterval: 1,
    recurrenceDayOfMonth: 10,
    recurrenceStartDate: "2098-07-10",
    recurrenceEndDate: null,
    status: "planned"
  });

  const firstOverview = await getMonthlyPlanningOverview(2098, 8);
  const secondOverview = await getMonthlyPlanningOverview(2098, 8);
  const generated = secondOverview.expenses.filter((expense) => expense.recurrenceId === template.recurrenceId);

  assert.equal(firstOverview.expenses.filter((expense) => expense.description === "Internet").length, 1);
  assert.equal(generated.length, 1);
  assert.equal(generated[0].date, "2098-08-10");
  assert.equal(generated[0].status, "planned");
  assert.equal(Boolean(generated[0].recurrenceSourceId), true);
});

test("recurring expenses stay idempotent with simultaneous overview loads", async () => {
  const plan = await saveMonthlyPlan({
    year: 2098,
    month: 10,
    incomeInCents: 400000,
    categories: [
      { id: "moradia", name: "Moradia", icon: "home", color: "#38bdf8", budgetType: "fixed", percentage: 0, fixedAmountInCents: 120000 }
    ]
  });

  assert.ok(plan.id);
  const template = await addMonthlyExpense(plan.id, {
    categoryId: "moradia",
    description: "Condominio",
    amountInCents: 55000,
    date: "2098-10-08",
    time: "08:00",
    note: "",
    paymentMethod: "Pix",
    expenseType: "recurring",
    recurring: true,
    recurrenceFrequency: "monthly",
    recurrenceInterval: 1,
    recurrenceDayOfMonth: 8,
    recurrenceStartDate: "2098-10-08",
    recurrenceEndDate: null,
    status: "planned"
  });

  const [first, second] = await Promise.all([getMonthlyPlanningOverview(2098, 11), getMonthlyPlanningOverview(2098, 11)]);
  const firstGenerated = first.expenses.filter((expense) => expense.recurrenceId === template.recurrenceId);
  const secondGenerated = second.expenses.filter((expense) => expense.recurrenceId === template.recurrenceId);

  assert.equal(firstGenerated.length, 1);
  assert.equal(secondGenerated.length, 1);
  assert.equal(secondGenerated[0].date, "2098-11-08");
});

test("switching July -> August -> September -> August keeps a single recurring occurrence for August 2026", async () => {
  const buildPlan = (month: number) =>
    saveMonthlyPlan({
      year: 2026,
      month,
      incomeInCents: 380000,
      categories: [
        {
          id: "moradia-agosto",
          name: "Moradia agosto",
          icon: "home",
          color: "#38bdf8",
          budgetType: "fixed",
          percentage: 0,
          fixedAmountInCents: 120000
        }
      ]
    });

  const julyPlan = await buildPlan(7);
  await buildPlan(8);
  await buildPlan(9);

  assert.ok(julyPlan.id);
  const template = await addMonthlyExpense(julyPlan.id, {
    categoryId: "moradia-agosto",
    description: "Aluguel navegacao agosto",
    amountInCents: 98000,
    date: "2026-07-08",
    time: "08:00",
    note: "",
    paymentMethod: "Pix",
    expenseType: "recurring",
    recurring: true,
    recurrenceFrequency: "monthly",
    recurrenceInterval: 1,
    recurrenceDayOfMonth: 8,
    recurrenceStartDate: "2026-07-08",
    recurrenceEndDate: null,
    status: "planned"
  });

  assert.ok(template.recurrenceId);

  const july = await getMonthlyPlanningOverview(2026, 7);
  const augustFirst = await getMonthlyPlanningOverview(2026, 8);
  const september = await getMonthlyPlanningOverview(2026, 9);
  const augustSecond = await getMonthlyPlanningOverview(2026, 8);
  const augustRecords = (await listAllMonthlyExpenses()).filter(
    (expense) => expense.recurrenceId === template.recurrenceId && (expense.recurrenceOriginalDate ?? expense.date) === "2026-08-08"
  );

  assert.equal(july.expenses.filter((expense) => expense.recurrenceId === template.recurrenceId).length, 1);
  assert.equal(augustFirst.expenses.filter((expense) => expense.recurrenceId === template.recurrenceId).length, 1);
  assert.equal(september.expenses.filter((expense) => expense.recurrenceId === template.recurrenceId).length, 1);
  assert.equal(augustSecond.expenses.filter((expense) => expense.recurrenceId === template.recurrenceId).length, 1);
  assert.equal(augustRecords.length, 1);
  assert.equal(augustRecords[0].date, "2026-08-08");
});

test("deleting one recurring occurrence cancels it without recreating the duplicate", async () => {
  const plan = await saveMonthlyPlan({
    year: 2097,
    month: 1,
    incomeInCents: 300000,
    categories: [
      { id: "saude", name: "Saude", icon: "heart", color: "#fb7185", budgetType: "fixed", percentage: 0, fixedAmountInCents: 15000 }
    ]
  });

  assert.ok(plan.id);
  await addMonthlyExpense(plan.id, {
    categoryId: "saude",
    description: "Academia",
    amountInCents: 9900,
    date: "2097-01-05",
    time: "08:00",
    note: "",
    paymentMethod: "Credito",
    expenseType: "recurring",
    recurring: true,
    recurrenceFrequency: "monthly",
    recurrenceInterval: 1,
    recurrenceDayOfMonth: 5,
    recurrenceStartDate: "2097-01-05",
    recurrenceEndDate: null,
    status: "planned"
  });

  const overview = await getMonthlyPlanningOverview(2097, 2);
  const occurrence = overview.expenses.find((expense) => expense.description === "Academia");
  assert.ok(occurrence?.id);

  await removeMonthlyExpense(occurrence.id);
  const refreshed = await getMonthlyPlanningOverview(2097, 2);

  assert.equal(refreshed.expenses.some((expense) => expense.description === "Academia"), false);
});

test("editing the original recurring occurrence as single keeps future series template unchanged", async () => {
  const plan = await saveMonthlyPlan({
    year: 2096,
    month: 3,
    incomeInCents: 300000,
    categories: [
      { id: "assinaturas", name: "Assinaturas", icon: "repeat", color: "#14b8a6", budgetType: "fixed", percentage: 0, fixedAmountInCents: 20000 }
    ]
  });

  assert.ok(plan.id);
  const original = await addMonthlyExpense(plan.id, {
    categoryId: "assinaturas",
    description: "Streaming",
    amountInCents: 5000,
    date: "2096-03-15",
    time: "09:00",
    note: "",
    paymentMethod: "Credito",
    expenseType: "recurring",
    recurring: true,
    recurrenceFrequency: "monthly",
    recurrenceInterval: 1,
    recurrenceDayOfMonth: 15,
    recurrenceStartDate: "2096-03-15",
    recurrenceEndDate: null,
    status: "planned"
  });

  assert.ok(original.id);
  await editMonthlyExpense(original.id, { description: "Streaming promocional", amountInCents: 3000 });
  const future = await getMonthlyPlanningOverview(2096, 4);

  assert.equal(future.expenses.some((expense) => expense.description === "Streaming promocional"), false);
  assert.equal(future.expenses.some((expense) => expense.description === "Streaming" && expense.amountInCents === 5000), true);
});

test("completing one recurring occurrence moves the amount from planned to completed exactly once", async () => {
  const plan = await saveMonthlyPlan({
    year: 2095,
    month: 8,
    incomeInCents: 300000,
    categories: [
      { id: "assinaturas-complete", name: "Assinaturas complete", icon: "repeat", color: "#14b8a6", budgetType: "fixed", percentage: 0, fixedAmountInCents: 15000 }
    ]
  });

  assert.ok(plan.id);
  const expense = await addMonthlyExpense(plan.id, {
    categoryId: "assinaturas-complete",
    description: "Spotify teste",
    amountInCents: 10000,
    date: "2095-08-10",
    time: "09:00",
    note: "",
    paymentMethod: "Pix",
    expenseType: "recurring",
    recurring: true,
    recurrenceFrequency: "monthly",
    recurrenceInterval: 1,
    recurrenceDayOfMonth: 10,
    recurrenceStartDate: "2095-08-10",
    recurrenceEndDate: null,
    status: "planned"
  });

  assert.ok(expense.id);
  const before = await getMonthlyPlanningOverview(2095, 8);
  const result = await completeMonthlyExpense(expense.id, { completedAt: "2095-08-06T14:10:00-03:00" });

  assert.equal(result.expense.status, "completed");
  assert.equal(result.expense.date, "2095-08-10");
  assert.equal(result.expense.completedAt, "2095-08-06T14:10:00-03:00");
  assert.equal(result.overview.summary.completedInCents - before.summary.completedInCents, 10000);
  assert.equal(before.summary.plannedExpensesInCents - result.overview.summary.plannedExpensesInCents, 10000);
  assert.equal(result.summary.completedExpensesInCents, result.overview.summary.completedInCents);
  assert.equal(result.summary.plannedExpensesInCents, result.overview.summary.plannedExpensesInCents);
});

test("completing the same occurrence twice stays idempotent, including concurrent retries", async () => {
  const plan = await saveMonthlyPlan({
    year: 2095,
    month: 9,
    incomeInCents: 250000,
    categories: [
      { id: "internet-idempotent", name: "Internet idempotent", icon: "repeat", color: "#38bdf8", budgetType: "fixed", percentage: 0, fixedAmountInCents: 12000 }
    ]
  });

  assert.ok(plan.id);
  const expense = await addMonthlyExpense(plan.id, {
    categoryId: "internet-idempotent",
    description: "Internet fibra",
    amountInCents: 8500,
    date: "2095-09-12",
    time: "08:00",
    note: "",
    paymentMethod: "Pix",
    expenseType: "recurring",
    recurring: true,
    recurrenceFrequency: "monthly",
    recurrenceInterval: 1,
    recurrenceDayOfMonth: 12,
    recurrenceStartDate: "2095-09-12",
    recurrenceEndDate: null,
    status: "planned"
  });

  assert.ok(expense.id);
  const before = await getMonthlyPlanningOverview(2095, 9);
  const [first, second] = await Promise.all([completeMonthlyExpense(expense.id), completeMonthlyExpense(expense.id)]);
  const third = await completeMonthlyExpense(expense.id);

  assert.equal(first.overview.summary.completedInCents - before.summary.completedInCents, 8500);
  assert.equal(before.summary.plannedExpensesInCents - first.overview.summary.plannedExpensesInCents, 8500);
  assert.equal(second.overview.summary.completedInCents, first.overview.summary.completedInCents);
  assert.equal(second.overview.summary.plannedExpensesInCents, first.overview.summary.plannedExpensesInCents);
  assert.equal(first.expense.completedAt, second.expense.completedAt);
  assert.equal(first.alreadyCompleted, false);
  assert.equal(second.alreadyCompleted, false);
  assert.equal(third.alreadyCompleted, true);
  assert.equal(third.expense.completedAt, first.expense.completedAt);
});

test("completing August keeps other recurring months unchanged", async () => {
  const buildPlan = (month: number) => saveMonthlyPlan({
    year: 2094,
    month,
    incomeInCents: 320000,
    categories: [
      { id: "serie-celular", name: "Serie celular", icon: "repeat", color: "#22c55e", budgetType: "fixed", percentage: 0, fixedAmountInCents: 20000 }
    ]
  });

  const julyPlan = await buildPlan(7);
  await buildPlan(8);
  await buildPlan(9);

  assert.ok(julyPlan.id);
  const template = await addMonthlyExpense(julyPlan.id, {
    categoryId: "serie-celular",
    description: "Plano celular",
    amountInCents: 15000,
    date: "2026-07-15",
    time: "09:00",
    note: "",
    paymentMethod: "Credito",
    expenseType: "recurring",
    recurring: true,
    recurrenceFrequency: "monthly",
    recurrenceInterval: 1,
    recurrenceDayOfMonth: 15,
    recurrenceStartDate: "2026-07-15",
    recurrenceEndDate: null,
    status: "planned"
  });

  const august = await getMonthlyPlanningOverview(2094, 8);
  const septemberBefore = await getMonthlyPlanningOverview(2094, 9);
  const augustOccurrence = august.expenses.find((expense) => expense.recurrenceId === template.recurrenceId);
  const july = await getMonthlyPlanningOverview(2094, 7);

  assert.ok(augustOccurrence?.id);
  await completeMonthlyExpense(augustOccurrence.id, { completedAt: "2094-08-06T09:30:00-03:00" });

  const julyAfter = await getMonthlyPlanningOverview(2094, 7);
  const augustAfter = await getMonthlyPlanningOverview(2094, 8);
  const septemberAfter = await getMonthlyPlanningOverview(2094, 9);

  assert.equal(julyAfter.expenses.find((expense) => expense.recurrenceId === template.recurrenceId)?.status, july.expenses.find((expense) => expense.recurrenceId === template.recurrenceId)?.status);
  assert.equal(augustAfter.expenses.find((expense) => expense.recurrenceId === template.recurrenceId)?.status, "completed");
  assert.equal(septemberAfter.expenses.find((expense) => expense.recurrenceId === template.recurrenceId)?.status, septemberBefore.expenses.find((expense) => expense.recurrenceId === template.recurrenceId)?.status);
});

test("completing an overdue recurring occurrence preserves the due date and the chosen payment timestamp", async () => {
  const plan = await saveMonthlyPlan({
    year: 2026,
    month: 8,
    incomeInCents: 210000,
    categories: [
      { id: "vencida-luz", name: "Vencida luz", icon: "home", color: "#f59e0b", budgetType: "fixed", percentage: 0, fixedAmountInCents: 30000 }
    ]
  });

  assert.ok(plan.id);
  const expense = await addMonthlyExpense(plan.id, {
    categoryId: "vencida-luz",
    description: "Conta de luz vencida",
    amountInCents: 22000,
    date: "2026-08-04",
    time: "10:00",
    note: "",
    paymentMethod: "Conta bancaria",
    expenseType: "recurring",
    recurring: true,
    recurrenceFrequency: "monthly",
    recurrenceInterval: 1,
    recurrenceDayOfMonth: 4,
    recurrenceStartDate: "2026-08-04",
    recurrenceEndDate: null,
    status: "planned"
  });

  assert.ok(expense.id);
  const before = await getMonthlyPlanningOverview(2026, 8);
  const result = await completeMonthlyExpense(expense.id, { completedAt: "2026-08-06T18:30:00-03:00" });

  assert.equal(result.expense.status, "completed");
  assert.equal(result.expense.date, "2026-08-04");
  assert.equal(result.expense.completedAt, "2026-08-06T18:30:00-03:00");
  assert.equal(result.overview.summary.completedInCents - before.summary.completedInCents, 22000);
  assert.equal(before.summary.plannedExpensesInCents - result.overview.summary.plannedExpensesInCents, 22000);
});

test("completing the current recurring template keeps future months alive without creating a hidden clone", async () => {
  const buildPlan = (month: number) => saveMonthlyPlan({
    year: 2093,
    month,
    incomeInCents: 260000,
    categories: [
      { id: "academia-template", name: "Academia template", icon: "repeat", color: "#22c55e", budgetType: "fixed", percentage: 0, fixedAmountInCents: 20000 }
    ]
  });

  const augustPlan = await buildPlan(8);
  await buildPlan(9);

  assert.ok(augustPlan.id);
  const expense = await addMonthlyExpense(augustPlan.id, {
    categoryId: "academia-template",
    description: "GymPass template",
    amountInCents: 8240,
    date: "2093-08-02",
    time: "00:00",
    note: "",
    paymentMethod: "Credito",
    expenseType: "recurring",
    recurring: true,
    recurrenceFrequency: "monthly",
    recurrenceInterval: 1,
    recurrenceDayOfMonth: 29,
    recurrenceStartDate: "2093-08-02",
    recurrenceEndDate: null,
    status: "planned"
  });

  assert.ok(expense.id);
  assert.ok(expense.recurrenceId);
  const beforeSourceRecords = (await listAllMonthlyExpenses()).filter(
    (item) => item.recurrenceId === expense.recurrenceId && (item.recurrenceOriginalDate ?? item.date) === "2093-08-02"
  );
  const result = await completeMonthlyExpense(expense.id, { completedAt: "2093-08-06T19:05:00-03:00" });
  const afterCompletionSourceRecords = (await listAllMonthlyExpenses()).filter(
    (item) => item.recurrenceId === expense.recurrenceId && (item.recurrenceOriginalDate ?? item.date) === "2093-08-02"
  );
  const hiddenClones = afterCompletionSourceRecords.filter((item) => item.recurrenceCancelled);

  assert.equal(beforeSourceRecords.length, 1);
  assert.equal(afterCompletionSourceRecords.length, 1);
  assert.equal(hiddenClones.length, 0);
  assert.equal(result.expense.status, "completed");
  assert.equal(result.expense.date, "2093-08-02");
  assert.equal(result.expense.completedAt, "2093-08-06T19:05:00-03:00");
  assert.equal(result.expense.recurrenceSourceId ?? null, null);
  assert.equal(
    result.overview.expenses.filter((item) => item.recurrenceId === expense.recurrenceId && item.date === "2093-08-02").length,
    1
  );

  const september = await getMonthlyPlanningOverview(2093, 9);
  const septemberOccurrence = september.expenses.find((item) => item.recurrenceId === expense.recurrenceId && item.date === "2093-09-29");
  const afterSeptemberRecords = (await listAllMonthlyExpenses()).filter((item) => item.recurrenceId === expense.recurrenceId);

  assert.ok(septemberOccurrence?.id);
  assert.equal(septemberOccurrence?.status, "planned");
  assert.equal(afterSeptemberRecords.length, 3);
});
