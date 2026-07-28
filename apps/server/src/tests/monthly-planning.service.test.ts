import assert from "node:assert/strict";
import test from "node:test";
import {
  addMonthlyExpense,
  calculateCategoryLimit,
  calculateMonthlyPlanning,
  copyPreviousMonthlyPlan,
  determineExpenseStatus,
  editMonthlyExpense,
  getMonthlyPlanningOverview,
  removeMonthlyExpense,
  saveMonthlyPlan
} from "../services/monthly-planning.service";
import type { MonthlyExpenseRecord, MonthlyPlanRecord } from "../types/investment";

test("calculateCategoryLimit derives percentage and fixed budgets in cents", () => {
  assert.equal(calculateCategoryLimit({ budgetType: "percentage", percentage: 10, fixedAmountInCents: null }, 350000), 35000);
  assert.equal(calculateCategoryLimit({ budgetType: "fixed", percentage: 0, fixedAmountInCents: 12050 }, 350000), 12050);
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
  const overview = await getMonthlyPlanningOverview(2099, 7);

  assert.equal(copied.incomeInCents, 500000);
  assert.equal(copied.categories.length, 1);
  assert.equal(copied.categories[0].percentage, 30);
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
