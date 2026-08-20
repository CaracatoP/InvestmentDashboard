import { z } from "zod";
import { env } from "../../config/env";
import { getCdiStatus } from "../../services/cdi.service";
import { getMarketQuoteSnapshot, isValidMarketPrice } from "../../services/market-data.service";
import { getMonthlyPlanningOverview } from "../../services/monthly-planning.service";
import { getDashboard, getGoalsOverview, getPortfolio } from "../../services/portfolio.service";
import { findMonthlyPlanById, listAllMonthlyExpenses, listAllMonthlyIncomeEntries } from "../../repositories/monthly-planning.repository";
import { listDividends, listOperations } from "../../repositories/investment.repository";
import { findKnownCryptoByQuery, getTickerProfile } from "../../services/ticker.service";

export type AssistantCapabilityOperation = "read" | "write";

export interface AssistantCapabilityDefinition<TArgs, TResult> {
  name: string;
  description: string;
  operation: AssistantCapabilityOperation;
  requiresUser: boolean;
  requiresConfirmation: boolean;
  schema: z.ZodTypeAny;
  execute: (args: TArgs) => Promise<TResult>;
}

export interface AssistantCapabilityCall {
  name: keyof typeof assistantReadCapabilities;
  arguments: unknown;
}

const periodMonthSchema = z.object({
  year: z.number().int().min(1970).max(2200),
  month: z.number().int().min(1).max(12)
});

const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().min(1)
});

const expenseStatusSchema = z.enum(["completed", "planned"]);
const incomeStatusSchema = z.enum(["received", "planned", "cancelled"]);
const assetClassSchema = z.enum(["stock", "fii", "etf", "crypto", "cash"]);
const marketEntityTypeSchema = z.enum(["crypto", "b3", "macro_indicator", "fixed_income", "unknown"]);

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dateKey(value: string | Date) {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function monthKeyFromDate(value: string | Date) {
  return dateKey(value).slice(0, 7);
}

function yearFromDate(value: string | Date) {
  return Number(dateKey(value).slice(0, 4));
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function expenseDateTimeKey(expense: { date: string | Date; time?: string | null }) {
  return `${dateKey(expense.date)}T${String(expense.time ?? "00:00")}`;
}

function incomeDateTimeKey(entry: { date: string | Date; time?: string | null }) {
  return `${dateKey(entry.date)}T${String(entry.time ?? "00:00")}`;
}

async function categoryNameByPlanId(planIds: string[]) {
  const categories = new Map<string, string>();
  await Promise.all(
    [...new Set(planIds)]
      .filter(Boolean)
      .map(async (planId) => {
        const plan = await findMonthlyPlanById(planId);
        for (const category of plan?.categories ?? []) {
          categories.set(`${planId}:${category.id}`, category.name);
        }
      })
  );
  return categories;
}

function matchTextQuery(searchable: string, query?: string | null) {
  if (!query) return true;
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return true;
  return searchable.includes(normalizedQuery);
}

function inRange(date: string | Date, range?: { from: string; to: string } | null) {
  if (!range) return true;
  const key = dateKey(date);
  return key >= range.from && key <= range.to;
}

function inPeriod(
  date: string | Date,
  input: { month?: { year: number; month: number } | null; range?: { from: string; to: string } | null; year?: number | null }
) {
  if (input.month) return monthKeyFromDate(date) === `${input.month.year}-${pad(input.month.month)}`;
  if (input.year) return yearFromDate(date) === input.year;
  if (input.range) return inRange(date, input.range);
  return true;
}

function statusLabelFromExpense(status: string) {
  return status === "completed" ? "Pago" : "Pendente";
}

function normalizeDividendAmount(dividend: {
  totalValue: number;
  netAmount?: number | null;
  grossAmount?: number | null;
}) {
  if (typeof dividend.netAmount === "number" && Number.isFinite(dividend.netAmount)) return dividend.netAmount;
  if (typeof dividend.grossAmount === "number" && Number.isFinite(dividend.grossAmount)) return dividend.grossAmount;
  return dividend.totalValue;
}

function isReceivedDividend(dividend: { status?: string; receivedAt?: string | Date | null }) {
  return dividend.status === "received" || Boolean(dividend.receivedAt);
}

function resolvePortfolioPositionByQuery(
  portfolio: Awaited<ReturnType<typeof getPortfolio>>,
  query?: string | null,
  assetTicker?: string | null
) {
  const normalizedQuery = normalizeText(query ?? assetTicker ?? "");
  const normalizedTicker = normalizeText(assetTicker ?? "");

  return (
    portfolio.assets.find((asset) => {
      const candidates = [asset.ticker, asset.name, asset.coingeckoId].filter(Boolean).map((value) => normalizeText(String(value)));
      return (
        (normalizedTicker && candidates.includes(normalizedTicker)) ||
        (normalizedQuery && candidates.some((candidate) => normalizedQuery.includes(candidate) || candidate.includes(normalizedQuery)))
      );
    }) ?? null
  );
}

function positionsByAssetClass(portfolio: Awaited<ReturnType<typeof getPortfolio>>, assetClass: z.infer<typeof assetClassSchema>) {
  return portfolio.assets.filter((asset) => {
    const profile = getTickerProfile({
      ticker: asset.ticker,
      category: asset.categoryId ?? asset.category,
      coingeckoId: asset.coingeckoId ?? undefined
    });
    return profile.kind === assetClass && (asset.hasPosition || asset.quantity > 0);
  });
}

const planningSnapshotSchema = periodMonthSchema;
const expenseAnalyticsSchema = z.object({
  month: periodMonthSchema.optional(),
  range: dateRangeSchema.optional(),
  year: z.number().int().min(1970).max(2200).optional(),
  categoryId: z.string().trim().min(1).optional(),
  categoryName: z.string().trim().min(1).optional(),
  textQuery: z.string().trim().min(1).optional(),
  statuses: z.array(expenseStatusSchema).max(4).optional(),
  recurringOnly: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(20).optional().default(8)
});
const incomeAnalyticsSchema = z.object({
  month: periodMonthSchema.optional(),
  range: dateRangeSchema.optional(),
  year: z.number().int().min(1970).max(2200).optional(),
  category: z.string().trim().min(1).optional(),
  textQuery: z.string().trim().min(1).optional(),
  statuses: z.array(incomeStatusSchema).max(4).optional(),
  limit: z.number().int().min(1).max(20).optional().default(8)
});
const dividendAnalyticsSchema = z.object({
  month: periodMonthSchema.optional(),
  range: dateRangeSchema.optional(),
  year: z.number().int().min(1970).max(2200).optional(),
  assetTicker: z.string().trim().min(1).optional(),
  onlyReceived: z.boolean().optional().default(true)
});
const portfolioSnapshotSchema = z.object({
  assetQuery: z.string().trim().min(1).optional(),
  assetTicker: z.string().trim().min(1).optional(),
  assetClass: assetClassSchema.optional()
});
const marketQuoteSchema = z.object({
  entityQuery: z.string().trim().min(1),
  entityType: marketEntityTypeSchema,
  assetTicker: z.string().trim().min(1).optional(),
  assetName: z.string().trim().min(1).optional(),
  coingeckoId: z.string().trim().min(1).optional(),
  currency: z.string().trim().min(3).max(3).default("BRL")
});
const goalsSnapshotSchema = z.object({
  limit: z.number().int().min(1).max(20).optional().default(10)
});
const planningSimulationSchema = z.object({
  year: z.number().int().min(1970).max(2200),
  month: z.number().int().min(1).max(12),
  scenario: z.enum(["expense", "income", "investment"]),
  amountInCents: z.number().int().positive()
});
const expensePaymentStatusSchema = z.object({
  descriptionQuery: z.string().trim().min(1),
  month: periodMonthSchema.optional(),
  range: dateRangeSchema.optional(),
  limit: z.number().int().min(1).max(10).optional().default(5)
});

export const assistantReadCapabilities = {
  getPlanningSnapshot: {
    name: "getPlanningSnapshot",
    description: "Consulta o resumo autoritativo do planejamento mensal.",
    operation: "read",
    requiresUser: true,
    requiresConfirmation: false,
    schema: planningSnapshotSchema,
    async execute(args) {
      const overview = await getMonthlyPlanningOverview(args.year, args.month);
      return {
        period: { year: args.year, month: args.month, key: `${args.year}-${pad(args.month)}` },
        summary: {
          currentBalanceInCents: overview.summary.remainingIncomeInCents,
          afterPlannedInCents: overview.summary.remainingIncomeAfterPlannedInCents,
          availableToSpendInCents: overview.summary.remainingIncomeAfterPlannedInCents,
          availableToInvestInCents: overview.summary.availableToInvestInCents,
          currentTotalIncomeInCents: overview.summary.currentTotalIncomeInCents,
          projectedTotalIncomeInCents: overview.summary.projectedTotalIncomeInCents,
          baseIncomeInCents: overview.summary.baseIncomeInCents,
          completedExtraIncomeInCents: overview.summary.completedExtraIncomeInCents,
          plannedExtraIncomeInCents: overview.summary.plannedExtraIncomeInCents,
          dividendIncomeInCents: overview.summary.dividendIncomeInCents,
          completedExpensesInCents: overview.summary.completedInCents,
          plannedExpensesInCents: overview.summary.plannedExpensesInCents,
          completedConsumptionInCents: overview.summary.completedConsumptionInCents,
          plannedConsumptionInCents: overview.summary.plannedConsumptionInCents,
          canSpendPerDayInCents: overview.summary.canSpendPerDayInCents,
          remainingDays: overview.summary.remainingDays,
          contributionGoalInCents: overview.summary.monthlyContributionGoalInCents,
          contributionGoalPercent: overview.summary.contributionGoalPercent,
          contributionGoalRemainingInCents: overview.summary.contributionGoalRemainingInCents
        },
        categories: overview.categories.map((category) => ({
          categoryId: category.id,
          name: category.name,
          spentInCents: category.completedInCents,
          plannedInCents: category.plannedInCents,
          budgetInCents: category.limitInCents
        })),
        pendingExpensesCount: overview.expenses.filter((expense) => expense.status !== "completed").length
      };
    }
  } satisfies AssistantCapabilityDefinition<z.infer<typeof planningSnapshotSchema>, unknown>,
  getExpenseAnalytics: {
    name: "getExpenseAnalytics",
    description: "Consulta gastos com filtros por periodo, categoria, descricao e status.",
    operation: "read",
    requiresUser: true,
    requiresConfirmation: false,
    schema: expenseAnalyticsSchema,
    async execute(args) {
      const expenses = await listAllMonthlyExpenses();
      const categoryNames = await categoryNameByPlanId(expenses.map((expense) => expense.planId));
      const filtered = expenses
        .filter((expense) => inPeriod(expense.date, { month: args.month, range: args.range, year: args.year }))
        .filter((expense) => (args.statuses?.length ? args.statuses.includes(expense.status) : true))
        .filter((expense) => (args.recurringOnly ? Boolean(expense.recurring) : true))
        .filter((expense) => {
          const categoryName = categoryNames.get(`${expense.planId}:${expense.categoryId}`) ?? expense.categoryId;
          const searchable = normalizeText([expense.description, expense.note ?? "", categoryName].filter(Boolean).join(" "));
          const matchesText = matchTextQuery(searchable, args.textQuery);
          const matchesCategoryId = args.categoryId ? expense.categoryId === args.categoryId : true;
          const matchesCategoryName = args.categoryName ? normalizeText(categoryName).includes(normalizeText(args.categoryName)) : true;
          return matchesText && matchesCategoryId && matchesCategoryName;
        })
        .sort((left, right) => expenseDateTimeKey(right).localeCompare(expenseDateTimeKey(left)));

      const totalInCents = sum(filtered.map((expense) => expense.amountInCents));
      const byCategory = new Map<string, { categoryId: string; categoryName: string; totalInCents: number; count: number }>();

      for (const expense of filtered) {
        const categoryName = categoryNames.get(`${expense.planId}:${expense.categoryId}`) ?? expense.categoryId;
        const key = `${expense.categoryId}:${categoryName}`;
        const current = byCategory.get(key) ?? {
          categoryId: expense.categoryId,
          categoryName,
          totalInCents: 0,
          count: 0
        };
        current.totalInCents += expense.amountInCents;
        current.count += 1;
        byCategory.set(key, current);
      }

      const upcoming = filtered
        .filter((expense) => expense.status !== "completed")
        .sort((left, right) => expenseDateTimeKey(left).localeCompare(expenseDateTimeKey(right)));
      const overdue = filtered
        .filter((expense) => expense.status !== "completed" && dateKey(expense.date) < new Date().toISOString().slice(0, 10))
        .sort((left, right) => expenseDateTimeKey(left).localeCompare(expenseDateTimeKey(right)));

      return {
        totalInCents,
        count: filtered.length,
        byCategory: [...byCategory.values()].sort((left, right) => right.totalInCents - left.totalInCents),
        largest: [...filtered]
          .sort((left, right) => right.amountInCents - left.amountInCents || expenseDateTimeKey(right).localeCompare(expenseDateTimeKey(left)))
          .slice(0, args.limit),
        upcoming: upcoming.slice(0, args.limit),
        overdue: overdue.slice(0, args.limit),
        items: filtered.slice(0, args.limit)
      };
    }
  } satisfies AssistantCapabilityDefinition<z.infer<typeof expenseAnalyticsSchema>, unknown>,
  getIncomeAnalytics: {
    name: "getIncomeAnalytics",
    description: "Consulta receitas recebidas ou previstas por periodo, categoria e descricao.",
    operation: "read",
    requiresUser: true,
    requiresConfirmation: false,
    schema: incomeAnalyticsSchema,
    async execute(args) {
      const entries = await listAllMonthlyIncomeEntries();
      const filtered = entries
        .filter((entry) => inPeriod(entry.date, { month: args.month, range: args.range, year: args.year }))
        .filter((entry) => (args.statuses?.length ? args.statuses.includes(entry.status) : true))
        .filter((entry) => {
          const searchable = normalizeText([entry.description, entry.category, entry.note ?? ""].filter(Boolean).join(" "));
          const matchesText = matchTextQuery(searchable, args.textQuery);
          const matchesCategory = args.category ? normalizeText(entry.category).includes(normalizeText(args.category)) : true;
          return matchesText && matchesCategory;
        })
        .sort((left, right) => incomeDateTimeKey(right).localeCompare(incomeDateTimeKey(left)));

      const totalInCents = sum(filtered.map((entry) => entry.amountInCents));
      const receivedInCents = sum(filtered.filter((entry) => entry.status === "received").map((entry) => entry.amountInCents));
      const plannedInCents = sum(filtered.filter((entry) => entry.status === "planned").map((entry) => entry.amountInCents));
      const byCategory = new Map<string, { category: string; totalInCents: number; count: number }>();

      for (const entry of filtered) {
        const key = normalizeText(entry.category);
        const current = byCategory.get(key) ?? { category: entry.category, totalInCents: 0, count: 0 };
        current.totalInCents += entry.amountInCents;
        current.count += 1;
        byCategory.set(key, current);
      }

      return {
        totalInCents,
        receivedInCents,
        plannedInCents,
        count: filtered.length,
        byCategory: [...byCategory.values()].sort((left, right) => right.totalInCents - left.totalInCents),
        items: filtered.slice(0, args.limit)
      };
    }
  } satisfies AssistantCapabilityDefinition<z.infer<typeof incomeAnalyticsSchema>, unknown>,
  getDividendAnalytics: {
    name: "getDividendAnalytics",
    description: "Consulta dividendos por periodo e ativo.",
    operation: "read",
    requiresUser: true,
    requiresConfirmation: false,
    schema: dividendAnalyticsSchema,
    async execute(args) {
      const dividends = await listDividends();
      const filtered = dividends
        .filter((dividend) => (args.onlyReceived ? isReceivedDividend(dividend) : true))
        .filter((dividend) => inPeriod(dividend.paymentDate, { month: args.month, range: args.range, year: args.year }))
        .filter((dividend) => (args.assetTicker ? normalizeText(dividend.assetTicker ?? "").includes(normalizeText(args.assetTicker)) : true));

      const totalInCents = Math.round(sum(filtered.map((dividend) => normalizeDividendAmount(dividend))) * 100);
      const byAsset = new Map<string, { assetTicker: string; totalInCents: number; count: number }>();

      for (const dividend of filtered) {
        const ticker = dividend.assetTicker ?? "Sem ticker";
        const key = normalizeText(ticker);
        const current = byAsset.get(key) ?? { assetTicker: ticker, totalInCents: 0, count: 0 };
        current.totalInCents += Math.round(normalizeDividendAmount(dividend) * 100);
        current.count += 1;
        byAsset.set(key, current);
      }

      const rankedAssets = [...byAsset.values()].sort((left, right) => right.totalInCents - left.totalInCents);
      return {
        totalInCents,
        count: filtered.length,
        byAsset: rankedAssets,
        topAsset: rankedAssets[0] ?? null,
        upcomingCount: dividends.filter((dividend) => !isReceivedDividend(dividend)).length
      };
    }
  } satisfies AssistantCapabilityDefinition<z.infer<typeof dividendAnalyticsSchema>, unknown>,
  getPortfolioSnapshot: {
    name: "getPortfolioSnapshot",
    description: "Consulta resumo, posicoes e exposicao da carteira do usuario.",
    operation: "read",
    requiresUser: true,
    requiresConfirmation: false,
    schema: portfolioSnapshotSchema,
    async execute(args) {
      const [dashboard, portfolio, operations] = await Promise.all([getDashboard(), getPortfolio(), listOperations()]);
      const positions = args.assetClass
        ? positionsByAssetClass(portfolio, args.assetClass)
        : portfolio.assets.filter((asset) => asset.hasPosition || asset.quantity > 0);
      const position = args.assetQuery || args.assetTicker ? resolvePortfolioPositionByQuery(portfolio, args.assetQuery, args.assetTicker) : null;
      const byClass = (["stock", "fii", "etf", "crypto", "cash"] as const).map((assetClass) => {
        const classPositions = positionsByAssetClass(portfolio, assetClass);
        const currentValue = sum(classPositions.map((item) => item.currentValue ?? 0));
        return {
          assetClass,
          currentValue,
          quantity: sum(classPositions.map((item) => item.quantity ?? 0)),
          count: classPositions.length
        };
      });
      const rankedByCurrentValue = [...positions].sort((left, right) => (right.currentValue ?? 0) - (left.currentValue ?? 0));
      const rankedByProfit = [...positions].sort((left, right) => (left.profit ?? 0) - (right.profit ?? 0));
      const lastOperations = position
        ? operations
            .filter((operation) => normalizeText(operation.assetTicker ?? "").includes(normalizeText(position.ticker)))
            .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
            .slice(0, 10)
        : [];

      return {
        summary: {
          totalWealth: dashboard.metrics.totalWealth,
          totalEquity: dashboard.metrics.totalEquity,
          investedCapital: dashboard.metrics.investedCapital,
          investedValue: dashboard.metrics.investedValue,
          currentValue: dashboard.metrics.currentValue,
          totalProfit: dashboard.metrics.totalProfit,
          returnPercentage: dashboard.metrics.returnPercentage
        },
        position: position
          ? {
              ticker: position.ticker,
              name: position.name,
              category: position.categoryId ?? position.category,
              quantity: position.quantity,
              averagePrice: position.averagePrice,
              currentPrice: position.currentPrice,
              investedValue: position.investedValue,
              currentValue: position.currentValue,
              profit: position.profit,
              returnPercentage: position.returnPercentage,
              lastOperations
            }
          : null,
        byClass,
        positions: rankedByCurrentValue.slice(0, 12).map((asset) => ({
          ticker: asset.ticker,
          name: asset.name,
          category: asset.categoryId ?? asset.category,
          quantity: asset.quantity,
          averagePrice: asset.averagePrice,
          currentPrice: asset.currentPrice,
          investedValue: asset.investedValue,
          currentValue: asset.currentValue,
          profit: asset.profit,
          returnPercentage: asset.returnPercentage
        })),
        largestPosition: rankedByCurrentValue[0] ?? null,
        worstPosition: rankedByProfit[0] ?? null
      };
    }
  } satisfies AssistantCapabilityDefinition<z.infer<typeof portfolioSnapshotSchema>, unknown>,
  getMarketQuote: {
    name: "getMarketQuote",
    description: "Consulta cotacao de mercado ou indicador economico via provider apropriado.",
    operation: "read",
    requiresUser: false,
    requiresConfirmation: false,
    schema: marketQuoteSchema,
    async execute(args) {
      if (args.entityType === "macro_indicator") {
        if (normalizeText(args.entityQuery) !== "cdi") {
          return {
            entityType: args.entityType,
            supported: false,
            integrated: false,
            entityQuery: args.entityQuery,
            message: "Este indicador economico ainda nao possui provider oficial integrado ao assistente."
          };
        }

        const status = await getCdiStatus();
        return {
          entityType: "macro_indicator" as const,
          supported: true,
          integrated: true,
          entityQuery: args.entityQuery,
          indicator: "CDI",
          referenceDate: status.referenceDate,
          updatedAt: status.updatedAt,
          annualRatePercent: status.rate,
          dailyRate: status.dailyRate,
          source: status.source
        };
      }

      if (args.entityType === "fixed_income") {
        return {
          entityType: "fixed_income" as const,
          supported: false,
          integrated: false,
          entityQuery: args.entityQuery,
          message: "Produtos de renda fixa como CDB, LCI e LCA nao possuem uma cotacao unica generica."
        };
      }

      if (args.entityType === "unknown") {
        return {
          entityType: "unknown" as const,
          supported: false,
          integrated: false,
          entityQuery: args.entityQuery,
          message: "Nao consegui identificar esse ativo com confianca."
        };
      }

      if (args.entityType === "b3" && (!env.marketDataProvider.trim() || !env.marketDataApiKey.trim())) {
        return {
          entityType: "b3" as const,
          supported: false,
          integrated: false,
          entityQuery: args.entityQuery,
          message: "As cotacoes em tempo real de ativos B3 ainda nao estao integradas neste ambiente."
        };
      }

      if (args.entityType === "crypto") {
        const known = findKnownCryptoByQuery(args.entityQuery);
        const asset = {
          name: args.assetName ?? known?.name ?? args.entityQuery.trim(),
          ticker: args.assetTicker ?? known?.symbol ?? args.entityQuery.trim().toUpperCase(),
          category: "CRIPTO",
          coingeckoId: args.coingeckoId ?? known?.coingeckoId ?? "",
          currency: args.currency,
          active: true
        };
        const quote = await getMarketQuoteSnapshot(asset, { refreshIfMissing: true });
        return {
          entityType: "crypto" as const,
          supported: true,
          integrated: true,
          entityQuery: args.entityQuery,
          quote,
          hasValidPrice: isValidMarketPrice(quote?.price)
        };
      }

      const asset = {
        name: args.assetName ?? args.entityQuery.trim(),
        ticker: args.assetTicker ?? args.entityQuery.trim().toUpperCase(),
        category: "ACAO",
        currency: args.currency,
        active: true
      };
      const quote = await getMarketQuoteSnapshot(asset, { refreshIfMissing: true });
      return {
        entityType: "b3" as const,
        supported: true,
        integrated: true,
        entityQuery: args.entityQuery,
        quote,
        hasValidPrice: isValidMarketPrice(quote?.price)
      };
    }
  } satisfies AssistantCapabilityDefinition<z.infer<typeof marketQuoteSchema>, unknown>,
  getGoalsSnapshot: {
    name: "getGoalsSnapshot",
    description: "Consulta metas financeiras e progresso.",
    operation: "read",
    requiresUser: true,
    requiresConfirmation: false,
    schema: goalsSnapshotSchema,
    async execute(args) {
      const goals = await getGoalsOverview();
      const activeGoals = goals.filter((goal) => goal.active !== false);
      return {
        goals: activeGoals.slice(0, args.limit),
        topGoal: activeGoals.sort((left, right) => right.progress - left.progress)[0] ?? null
      };
    }
  } satisfies AssistantCapabilityDefinition<z.infer<typeof goalsSnapshotSchema>, unknown>,
  simulatePlanningImpact: {
    name: "simulatePlanningImpact",
    description: "Simula o efeito de um gasto, recebimento ou aporte sem persistir nenhum dado.",
    operation: "read",
    requiresUser: true,
    requiresConfirmation: false,
    schema: planningSimulationSchema,
    async execute(args) {
      const overview = await getMonthlyPlanningOverview(args.year, args.month);
      const direction = args.scenario === "income" ? 1 : -1;
      const currentBalanceAfter = overview.summary.remainingIncomeAfterPlannedInCents + direction * args.amountInCents;
      const availableToInvest = overview.summary.availableToInvestInCents + direction * args.amountInCents;
      return {
        scenario: args.scenario,
        amountInCents: args.amountInCents,
        currentBalanceAfterInCents: currentBalanceAfter,
        availableToInvestAfterInCents: availableToInvest,
        originalBalanceAfterInCents: overview.summary.remainingIncomeAfterPlannedInCents,
        originalAvailableToInvestInCents: overview.summary.availableToInvestInCents
      };
    }
  } satisfies AssistantCapabilityDefinition<z.infer<typeof planningSimulationSchema>, unknown>,
  getExpensePaymentStatus: {
    name: "getExpensePaymentStatus",
    description: "Consulta se um gasto ja foi pago e retorna candidatos seguros.",
    operation: "read",
    requiresUser: true,
    requiresConfirmation: false,
    schema: expensePaymentStatusSchema,
    async execute(args) {
      const expenses = await listAllMonthlyExpenses();
      const categoryNames = await categoryNameByPlanId(expenses.map((expense) => expense.planId));
      const filtered = expenses
        .filter((expense) => inPeriod(expense.date, { month: args.month, range: args.range, year: null }))
        .filter((expense) => {
          const categoryName = categoryNames.get(`${expense.planId}:${expense.categoryId}`) ?? expense.categoryId;
          const searchable = normalizeText([expense.description, expense.note ?? "", categoryName].filter(Boolean).join(" "));
          return matchTextQuery(searchable, args.descriptionQuery);
        })
        .sort((left, right) => expenseDateTimeKey(right).localeCompare(expenseDateTimeKey(left)));

      return {
        count: filtered.length,
        candidates: filtered.slice(0, args.limit).map((expense) => ({
          id: expense.id ?? "",
          description: expense.description,
          amountInCents: expense.amountInCents,
          date: expense.date,
          status: expense.status,
          statusLabel: statusLabelFromExpense(expense.status)
        }))
      };
    }
  } satisfies AssistantCapabilityDefinition<z.infer<typeof expensePaymentStatusSchema>, unknown>
};

export type AssistantReadCapabilityName = keyof typeof assistantReadCapabilities;

export async function executeAssistantCapability<TName extends AssistantReadCapabilityName>(call: {
  name: TName;
  arguments: unknown;
}) {
  const capability = assistantReadCapabilities[call.name];
  const parsedArguments = capability.schema.parse(call.arguments);
  const startedAt = Date.now();
  const result = await capability.execute(parsedArguments as never);
  return {
    capability,
    arguments: parsedArguments,
    result,
    durationMs: Date.now() - startedAt
  };
}

export function listAssistantReadCapabilities() {
  return Object.values(assistantReadCapabilities).map((capability) => ({
    name: capability.name,
    description: capability.description,
    operation: capability.operation,
    requiresUser: capability.requiresUser,
    requiresConfirmation: capability.requiresConfirmation
  }));
}
