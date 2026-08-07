import {
  getContributionsOverview,
  getDashboard,
  getDividendsOverview,
  getGoalsOverview,
  getHistory,
  getPortfolio,
  getSettings
} from "../../services/portfolio.service";
import { env } from "../../config/env";
import { getCashBoxesOverview } from "../../services/cash-box.service";
import { getMonthlyPlanningOverview } from "../../services/monthly-planning.service";
import { filterSensitiveData } from "../utils/ai-sensitive-data-filter";

export type InvestmentContextFocus =
  | "overview"
  | "investments"
  | "portfolio"
  | "allocation"
  | "dividends"
  | "contributions"
  | "goals"
  | "cashboxes"
  | "history"
  | "projections"
  | "settings";

function compactMetrics(metrics: Awaited<ReturnType<typeof getDashboard>>["metrics"]) {
  return {
    totalWealth: metrics.totalWealth,
    totalEquity: metrics.totalEquity,
    marketAssetsValue: metrics.marketAssetsValue,
    cashboxesBalance: metrics.cashboxesBalance,
    investedCapital: metrics.investedCapital,
    marketInvestedCapital: metrics.marketInvestedCapital,
    cashboxesNetContributions: metrics.cashboxesNetContributions,
    investedValue: metrics.investedValue,
    currentValue: metrics.currentValue,
    totalProfit: metrics.totalProfit,
    netProfit: metrics.netProfit,
    unrealizedMarketProfit: metrics.unrealizedMarketProfit,
    cashboxesYield: metrics.cashboxesYield,
    receivedDividends: metrics.receivedDividends,
    totalReturnPercent: metrics.totalReturnPercent,
    returnPercentage: metrics.returnPercentage,
    monthlyDividends: metrics.monthlyDividends,
    yearlyDividends: metrics.yearlyDividends,
    monthlyContributions: metrics.monthlyContributions,
    yearlyContributions: metrics.yearlyContributions,
    dividendsThisMonth: metrics.dividendsThisMonth,
    dividendsThisYear: metrics.dividendsThisYear,
    contributionsThisMonth: metrics.contributionsThisMonth,
    withdrawalsThisMonth: metrics.withdrawalsThisMonth,
    cashboxYieldThisMonth: metrics.cashboxYieldThisMonth,
    assetCount: metrics.assetCount,
    cashboxCount: metrics.cashboxCount,
    positionCount: metrics.positionCount,
    allocationByCategory: metrics.allocationByCategory,
    allocationDifference: metrics.allocationDifference,
    nextContributionRecommendation: metrics.nextContributionRecommendation
  };
}

function compactAsset(asset: Awaited<ReturnType<typeof getPortfolio>>["assets"][number]) {
  return {
    ticker: asset.ticker,
    name: asset.name,
    category: asset.category,
    quantity: asset.quantity,
    averagePrice: asset.averagePrice,
    currentPrice: asset.currentPrice,
    investedValue: asset.investedValue,
    currentValue: asset.currentValue,
    profit: asset.profit,
    returnPercentage: asset.returnPercentage,
    dividendYield: asset.dividendYield,
    portfolioWeight: asset.portfolioWeight,
    hasPosition: asset.hasPosition
  };
}

function compactPortfolio(portfolio: Awaited<ReturnType<typeof getPortfolio>>) {
  return {
    assets: portfolio.assets
      .filter((asset) => asset.hasPosition || asset.quantity > 0)
      .map(compactAsset)
      .sort((left, right) => (right.currentValue ?? 0) - (left.currentValue ?? 0))
      .slice(0, 30),
    allocation: portfolio.allocation,
    allocationComparison: portfolio.allocationComparison,
    recommendation: portfolio.recommendation
  };
}

function currentPeriod() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function calculateMonthlyEquityChange(wealthEvolution: Awaited<ReturnType<typeof getDashboard>>["wealthEvolution"]) {
  const latest = wealthEvolution.at(-1);
  const previous = wealthEvolution.at(-2);
  if (!latest || !previous || previous.current <= 0) {
    return {
      month: latest?.month ?? "",
      monthlyEquityChangePercent: 0,
      monthlyEquityChangeValue: 0,
      monthlyReturnEstimatePercent: 0
    };
  }

  const change = latest.current - previous.current;
  const contributionAdjustedChange = change - latest.contributions;
  return {
    month: latest.month,
    monthlyEquityChangePercent: (change / previous.current) * 100,
    monthlyEquityChangeValue: change,
    monthlyReturnEstimatePercent: (contributionAdjustedChange / previous.current) * 100
  };
}

function buildClassDistribution(dashboard: Awaited<ReturnType<typeof getDashboard>>) {
  return (dashboard.metrics.allocationByCategory ?? dashboard.allocation?.categories ?? []).map((category) => ({
    categoryId: category.categoryId,
    label: category.label,
    currentValue: category.currentValue,
    currentPercent: category.currentPercent,
    targetPercent: category.targetPercent,
    differenceValue: category.differenceValue,
    status: category.status
  }));
}

function buildConcentration(portfolio: Awaited<ReturnType<typeof getPortfolio>>) {
  const positions = portfolio.assets
    .filter((asset) => asset.hasPosition || asset.quantity > 0)
    .map(compactAsset)
    .sort((left, right) => (right.portfolioWeight ?? 0) - (left.portfolioWeight ?? 0));
  const topPositions = positions.slice(0, 8);
  const top3Weight = topPositions.slice(0, 3).reduce((total, asset) => total + (asset.portfolioWeight ?? 0), 0);

  return {
    topPositions,
    largestPosition: topPositions[0] ?? null,
    top3WeightPercent: top3Weight
  };
}

function buildAiSettingsStatus() {
  const provider = env.aiProvider;
  const enabled = env.aiEnabled;
  const configured = provider === "disabled" ? false : Boolean(env.groqApiKey);
  const status = !enabled ? "disabled" : provider === "disabled" ? "disabled" : configured ? "configured" : "missing-key";

  return {
    enabled,
    provider,
    configured,
    status,
    limits: {
      maxRequestsPerHour: env.aiMaxRequestsPerHour,
      chatMaxMessages: env.aiChatMaxMessages,
      chatMaxContextTokens: env.aiChatMaxContextTokens,
      analysisCacheMinutes: env.aiAnalysisCacheMinutes
    }
  };
}

async function buildInvestmentOverviewContext(positionLimit = 12) {
  const period = currentPeriod();
  const [dashboard, portfolio, dividends, contributions, goals, planning] = await Promise.all([
    getDashboard(),
    getPortfolio(),
    getDividendsOverview(),
    getContributionsOverview(),
    getGoalsOverview(),
    getMonthlyPlanningOverview(period.year, period.month)
  ]);
  const metrics = compactMetrics(dashboard.metrics);
  const concentration = buildConcentration(portfolio);
  const hasInvestmentData =
    (metrics.totalEquity ?? 0) > 0 ||
    (metrics.investedCapital ?? 0) > 0 ||
    (metrics.assetCount ?? 0) > 0 ||
    (metrics.cashboxCount ?? 0) > 0 ||
    (contributions.totals.invested ?? 0) > 0 ||
    (dividends.totals.allTime ?? 0) > 0;

  return filterSensitiveData({
    scope: "investments:summary",
    dataStatus: hasInvestmentData ? "available" : "empty",
    emptyMessage: hasInvestmentData ? undefined : "Ainda nao ha ativos, aportes, dividendos ou caixinhas cadastrados.",
    period,
    summary: {
      totalWealth: metrics.totalWealth,
      totalEquity: metrics.totalEquity,
      investedCapital: metrics.investedCapital,
      investedValue: metrics.investedValue,
      currentValue: metrics.currentValue,
      marketAssetsValue: metrics.marketAssetsValue,
      cashboxesBalance: metrics.cashboxesBalance,
      totalProfit: metrics.totalProfit,
      netProfit: metrics.netProfit,
      totalReturnPercent: metrics.totalReturnPercent,
      returnPercentage: metrics.returnPercentage,
      monthlyPerformance: calculateMonthlyEquityChange(dashboard.wealthEvolution),
      assetCount: metrics.assetCount,
      positionCount: metrics.positionCount,
      cashboxCount: metrics.cashboxCount
    },
    classDistribution: buildClassDistribution(dashboard),
    concentration: {
      ...concentration,
      topPositions: concentration.topPositions.slice(0, positionLimit)
    },
    dividends: {
      receivedTotal: metrics.receivedDividends,
      thisMonth: metrics.dividendsThisMonth ?? metrics.monthlyDividends,
      thisYear: metrics.dividendsThisYear ?? metrics.yearlyDividends,
      monthlyAverage: dividends.totals.monthlyAverage,
      biggestPayment: dividends.totals.biggestPayment,
      byAsset: dividends.byAsset.slice(0, 8),
      monthly: dividends.monthly.slice(-6)
    },
    contributions: {
      thisMonth: metrics.contributionsThisMonth ?? metrics.monthlyContributions,
      thisYear: metrics.yearlyContributions,
      totalInvestedFromContributions: contributions.totals.invested,
      monthlyAverage: contributions.totals.monthlyAverage,
      monthlyGoalInCents: planning.summary.monthlyContributionGoalInCents,
      monthlyGoalProgressPercent: planning.summary.contributionGoalPercent,
      monthlyGoalRemainingInCents: planning.summary.contributionGoalRemainingInCents,
      monthly: contributions.monthly.slice(-6)
    },
    equityEvolution: dashboard.wealthEvolution.slice(-12),
    calculatedIndicators: {
      allocationRecommendation: dashboard.allocation?.recommendation ?? metrics.nextContributionRecommendation,
      allocationDifference: metrics.allocationDifference,
      recentMovements: dashboard.recentMovements.slice(0, 8),
      activeGoals: goals.filter((goal) => goal.active !== false).slice(0, 6)
    },
    responseGuidance:
      "Se dataStatus for available, analise estes numeros diretamente. Nunca diga que nao consegue acessar a carteira quando este contexto esta presente."
  });
}

export async function buildInvestmentContext(focus: InvestmentContextFocus = "overview") {
  if (focus === "dividends") {
    const dividends = await getDividendsOverview();
    return filterSensitiveData({
      scope: "investments:dividends",
      totals: dividends.totals,
      monthly: dividends.monthly.slice(-12),
      annual: dividends.annual.slice(-5),
      byAsset: dividends.byAsset.slice(0, 15),
      recentPayments: dividends.table.slice(0, 25),
      upcomingCalendar: dividends.calendar.slice(0, 15)
    });
  }

  if (focus === "contributions") {
    const contributions = await getContributionsOverview();
    return filterSensitiveData({
      scope: "investments:contributions",
      totals: contributions.totals,
      monthly: contributions.monthly.slice(-12),
      annual: contributions.annual.slice(-5),
      recentContributions: contributions.table.slice(0, 25)
    });
  }

  if (focus === "cashboxes") {
    const cashBoxes = await getCashBoxesOverview();
    return filterSensitiveData({
      scope: "investments:cashboxes",
      totals: cashBoxes.totals,
      cashBoxes: cashBoxes.cashBoxes.map((cashBox) => ({
        name: cashBox.name,
        type: cashBox.type,
        currentBalance: cashBox.currentBalance,
        totalContributions: cashBox.totalContributions,
        totalWithdrawals: cashBox.totalWithdrawals,
        totalYield: cashBox.totalYield,
        cdiPercentage: cashBox.cdiPercentage,
        active: cashBox.active
      })),
      evolution: cashBoxes.evolution.slice(-12),
      history: cashBoxes.history.slice(0, 25)
    });
  }

  if (focus === "history") {
    return filterSensitiveData({
      scope: "investments:history",
      history: (await getHistory()).slice(0, 45)
    });
  }

  if (focus === "goals") {
    const [dashboard, goals] = await Promise.all([getDashboard(), getGoalsOverview()]);
    return filterSensitiveData({
      scope: "investments:goals",
      metrics: compactMetrics(dashboard.metrics),
      goals: goals.slice(0, 20)
    });
  }

  if (focus === "projections") {
    const [dashboard, settings, goals, contributions, dividends] = await Promise.all([
      getDashboard(),
      getSettings(),
      getGoalsOverview(),
      getContributionsOverview(),
      getDividendsOverview()
    ]);
    return filterSensitiveData({
      scope: "investments:projections",
      metrics: compactMetrics(dashboard.metrics),
      projectionSettings: settings.projections,
      contributionTotals: contributions.totals,
      dividendTotals: dividends.totals,
      goals: goals.slice(0, 12)
    });
  }

  if (focus === "settings") {
    const settings = await getSettings();
    return filterSensitiveData({
      scope: "settings",
      profile: settings.profile,
      allocations: settings.allocations,
      categories: settings.categories,
      projections: settings.projections,
      ai: buildAiSettingsStatus(),
      responseGuidance:
        "Ao responder sobre configuracoes, use estes dados como fonte oficial. Se o pedido for para alterar nome, tema ou moeda, proponha o fluxo seguro com confirmacao."
    });
  }

  if (focus === "overview" || focus === "investments") {
    return buildInvestmentOverviewContext(12);
  }

  if (focus === "portfolio" || focus === "allocation") {
    const [dashboard, portfolio] = await Promise.all([getDashboard(), getPortfolio()]);
    const overview = await buildInvestmentOverviewContext(focus === "portfolio" ? 18 : 10);
    return filterSensitiveData({
      scope: `investments:${focus}`,
      overview,
      metrics: compactMetrics(dashboard.metrics),
      portfolio: compactPortfolio(portfolio)
    });
  }

  return buildInvestmentOverviewContext(12);
}
