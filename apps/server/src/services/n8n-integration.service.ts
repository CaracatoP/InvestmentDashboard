import { runWithAuthContext } from "../auth/auth-context";
import type { SafeUser } from "./auth.service";
import {
  addMonthlyExpense,
  addMonthlyIncomeEntry,
  completeMonthlyExpense,
  completeMonthlyIncomeEntry,
  getMonthlyPlanningOverview,
  getOrCreateMonthlyPlan,
  type MonthlyPlanningOverview
} from "./monthly-planning.service";
import { getSettingsRecord } from "../repositories/investment.repository";
import {
  findVerifiedWhatsAppUserByPhoneNumber,
  normalizeWhatsAppPhone,
  verifyWhatsAppConnectionCode
} from "./whatsapp-link.service";
import { executeIntegrationIdempotentOperation } from "./integration-idempotency.service";
import { HttpError } from "../utils/http-error";

type MonthlyExpenseCreatePayload = Parameters<typeof addMonthlyExpense>[1];
type MonthlyIncomeEntryCreatePayload = Parameters<typeof addMonthlyIncomeEntry>[1];
type MonthlyExpenseCompletionPayload = Parameters<typeof completeMonthlyExpense>[1];
type MonthlyIncomeEntryCompletionPayload = Parameters<typeof completeMonthlyIncomeEntry>[1];

interface PeriodInput {
  phoneNumber: string;
  year: number;
  month: number;
}

interface N8nExpenseCreateInput extends PeriodInput {
  expense: MonthlyExpenseCreatePayload;
}

interface N8nIncomeEntryCreateInput extends PeriodInput {
  incomeEntry: MonthlyIncomeEntryCreatePayload;
}

function resolveIntegrationDisplayName(userName: string, profileName: string) {
  const normalizedUserName = userName.trim();
  const normalizedProfileName = profileName.trim();
  const defaultProfileName = normalizedProfileName.toLowerCase() === "investidor";

  return normalizedProfileName && !defaultProfileName
    ? normalizedProfileName
    : normalizedUserName || normalizedProfileName || "Usuario";
}

async function integrationUser(user: SafeUser, fallbackPhoneNumber: string) {
  const settings = await getSettingsRecord();
  const profileName = settings.profileName?.trim() || "";

  return {
    id: user.id,
    name: resolveIntegrationDisplayName(user.name, profileName),
    accountName: user.name,
    profileName: profileName || null,
    phoneNormalized: user.phoneNormalized || normalizeWhatsAppPhone(fallbackPhoneNumber),
    whatsappLinkedAt: user.whatsappLinkedAt ?? null,
    timezone: user.timezone ?? "America/Sao_Paulo"
  };
}

async function resolveLinkedUser(phoneNumber: string) {
  const phoneNormalized = normalizeWhatsAppPhone(phoneNumber);
  if (!phoneNormalized) throw new HttpError(400, "Telefone invalido.");

  const user = await findVerifiedWhatsAppUserByPhoneNumber(phoneNormalized);
  if (!user) throw new HttpError(404, "Telefone nao vinculado a um usuario ativo.");
  return user;
}

async function withLinkedUserContext<T>(phoneNumber: string, callback: (user: SafeUser) => Promise<T>) {
  const user = await resolveLinkedUser(phoneNumber);
  const result = await runWithAuthContext(
    { userId: user.id, role: user.role, email: user.email, channel: "whatsapp" },
    () => callback(user)
  );
  return { user, result };
}

function planningSummary(overview: MonthlyPlanningOverview) {
  return {
    income: {
      baseIncomeInCents: overview.summary.baseIncomeInCents,
      receivedExtraIncomeInCents: overview.summary.completedExtraIncomeInCents,
      plannedExtraIncomeInCents: overview.summary.plannedExtraIncomeInCents,
      currentTotalIncomeInCents: overview.summary.currentTotalIncomeInCents,
      projectedTotalIncomeInCents: overview.summary.projectedTotalIncomeInCents
    },
    expenses: {
      completedInCents: overview.summary.completedInCents,
      plannedInCents: overview.summary.plannedExpensesInCents,
      completedConsumptionInCents: overview.summary.completedConsumptionInCents,
      plannedConsumptionInCents: overview.summary.plannedConsumptionInCents,
      completedInvestmentsInCents: overview.summary.completedInvestmentsInCents,
      plannedInvestmentsInCents: overview.summary.plannedInvestmentsInCents
    },
    balance: {
      currentBalanceInCents: overview.summary.remainingIncomeInCents,
      projectedBalanceInCents: overview.summary.remainingIncomeAfterPlannedInCents,
      freeToSpendInCents: overview.summary.remainingBudgetInCents,
      projectedFreeToSpendInCents: overview.summary.remainingBudgetAfterPlannedInCents,
      availableToInvestInCents: overview.summary.availableToInvestInCents,
      canSpendPerDayInCents: overview.summary.canSpendPerDayInCents
    },
    investments: overview.investmentSummary
  };
}

async function n8nPlanningPayload(user: SafeUser, phoneNumber: string, overview: MonthlyPlanningOverview) {
  return {
    user: await integrationUser(user, phoneNumber),
    plan: overview.plan,
    financialSummary: planningSummary(overview),
    categories: overview.categories,
    expenses: overview.expenses,
    incomeEntries: overview.incomeEntries,
    warnings: overview.warnings,
    alerts: overview.alerts,
    insights: overview.insights,
    paymentMethodStats: overview.paymentMethodStats,
    incomeCategoryStats: overview.incomeCategoryStats
  };
}

function assertCompatibleIdempotencyKey(received: string | null | undefined, expected: string) {
  const normalized = received?.trim();
  if (normalized && normalized !== expected) {
    throw new HttpError(400, "Idempotency-Key do payload diverge do header.");
  }
}

function ensurePlanId(plan: { id?: string }) {
  if (!plan.id) throw new HttpError(500, "Planejamento mensal sem identificador apos criacao.");
  return plan.id;
}

export async function verifyN8nWhatsAppLink(input: { phoneNumber: string; code: string }) {
  const result = await verifyWhatsAppConnectionCode(input);
  const user = result.link?.phoneNormalized ? await resolveLinkedUser(result.link.phoneNormalized) : null;
  const integrationUserResult = user
    ? await runWithAuthContext(
      { userId: user.id, role: user.role, email: user.email, channel: "whatsapp" },
      () => integrationUser(user, input.phoneNumber)
    )
    : null;

  return {
    ...result,
    user: integrationUserResult
  };
}

export async function resolveN8nUserByPhone(input: { phoneNumber: string }) {
  const user = await resolveLinkedUser(input.phoneNumber);
  return {
    user: await runWithAuthContext(
      { userId: user.id, role: user.role, email: user.email, channel: "whatsapp" },
      () => integrationUser(user, input.phoneNumber)
    )
  };
}

export async function getN8nMonthlyPlanningSummary(input: PeriodInput & { comparisonRange: number }) {
  return withLinkedUserContext(input.phoneNumber, async (user) => {
    const overview = await getMonthlyPlanningOverview(input.year, input.month, input.comparisonRange);
    return n8nPlanningPayload(user, input.phoneNumber, overview);
  }).then(({ result }) => result);
}

export async function listN8nRecentMonthlyExpenses(input: PeriodInput & { comparisonRange: number; limit: number }) {
  return withLinkedUserContext(input.phoneNumber, async (user) => {
    const overview = await getMonthlyPlanningOverview(input.year, input.month, input.comparisonRange);
    return {
      user: await integrationUser(user, input.phoneNumber),
      plan: overview.plan,
      categories: overview.categories,
      expenses: overview.expenses.slice(0, input.limit)
    };
  }).then(({ result }) => result);
}

export async function createN8nMonthlyExpense(input: N8nExpenseCreateInput, idempotencyKey: string) {
  const { user } = await withLinkedUserContext(input.phoneNumber, async () => null);
  assertCompatibleIdempotencyKey(input.expense.integration?.idempotencyKey, idempotencyKey);
  const phoneNormalized = normalizeWhatsAppPhone(input.phoneNumber);
  const expense = input.expense.integration
    ? { ...input.expense, integration: { ...input.expense.integration, idempotencyKey } }
    : input.expense;

  return executeIntegrationIdempotentOperation({
    userId: user.id,
    idempotencyKey,
    operation: "n8n.monthlyExpense.create",
    request: { phoneNormalized, year: input.year, month: input.month, expense },
    execute: () =>
      runWithAuthContext(
        { userId: user.id, role: user.role, email: user.email, channel: "whatsapp" },
        async () => {
          const plan = await getOrCreateMonthlyPlan(input.year, input.month);
          const created = await addMonthlyExpense(ensurePlanId(plan), expense);
          return { user: await integrationUser(user, input.phoneNumber), plan, expense: created };
        }
      )
  });
}

export async function createN8nMonthlyIncomeEntry(input: N8nIncomeEntryCreateInput, idempotencyKey: string) {
  const { user } = await withLinkedUserContext(input.phoneNumber, async () => null);
  assertCompatibleIdempotencyKey(input.incomeEntry.idempotencyKey, idempotencyKey);
  const phoneNormalized = normalizeWhatsAppPhone(input.phoneNumber);
  const incomeEntry = { ...input.incomeEntry, idempotencyKey };

  return executeIntegrationIdempotentOperation({
    userId: user.id,
    idempotencyKey,
    operation: "n8n.monthlyIncomeEntry.create",
    request: { phoneNormalized, year: input.year, month: input.month, incomeEntry },
    execute: () =>
      runWithAuthContext(
        { userId: user.id, role: user.role, email: user.email, channel: "whatsapp" },
        async () => {
          const plan = await getOrCreateMonthlyPlan(input.year, input.month);
          const created = await addMonthlyIncomeEntry(ensurePlanId(plan), incomeEntry);
          return { user: await integrationUser(user, input.phoneNumber), plan, incomeEntry: created };
        }
      )
  });
}

export async function completeN8nMonthlyExpense(input: { phoneNumber: string; expenseId: string; payload: MonthlyExpenseCompletionPayload }, idempotencyKey: string) {
  const { user } = await withLinkedUserContext(input.phoneNumber, async () => null);
  const phoneNormalized = normalizeWhatsAppPhone(input.phoneNumber);

  return executeIntegrationIdempotentOperation({
    userId: user.id,
    idempotencyKey,
    operation: "n8n.monthlyExpense.complete",
    request: { phoneNormalized, expenseId: input.expenseId, payload: input.payload },
    execute: () =>
      runWithAuthContext(
        { userId: user.id, role: user.role, email: user.email, channel: "whatsapp" },
        async () => completeMonthlyExpense(input.expenseId, input.payload)
      )
  });
}

export async function receiveN8nMonthlyIncomeEntry(input: { phoneNumber: string; incomeEntryId: string; payload: MonthlyIncomeEntryCompletionPayload }, idempotencyKey: string) {
  const { user } = await withLinkedUserContext(input.phoneNumber, async () => null);
  const phoneNormalized = normalizeWhatsAppPhone(input.phoneNumber);

  return executeIntegrationIdempotentOperation({
    userId: user.id,
    idempotencyKey,
    operation: "n8n.monthlyIncomeEntry.receive",
    request: { phoneNormalized, incomeEntryId: input.incomeEntryId, payload: input.payload },
    execute: () =>
      runWithAuthContext(
        { userId: user.id, role: user.role, email: user.email, channel: "whatsapp" },
        async () => completeMonthlyIncomeEntry(input.incomeEntryId, input.payload)
      )
  });
}
