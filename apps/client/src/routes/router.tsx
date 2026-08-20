import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { App } from "../App";
import { ProtectedRoute, PublicOnlyRoute } from "../components/auth/RouteGuards";

const LoginPage = lazy(() => import("../pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const RegisterPage = lazy(() => import("../pages/RegisterPage").then((module) => ({ default: module.RegisterPage })));
const ForgotPasswordPage = lazy(() => import("../pages/ForgotPasswordPage").then((module) => ({ default: module.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("../pages/ResetPasswordPage").then((module) => ({ default: module.ResetPasswordPage })));
const DashboardPage = lazy(() => import("../pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const PortfolioPage = lazy(() => import("../pages/PortfolioPage").then((module) => ({ default: module.PortfolioPage })));
const AssetsPage = lazy(() => import("../pages/AssetsPage").then((module) => ({ default: module.AssetsPage })));
const AssetPage = lazy(() => import("../pages/AssetPage").then((module) => ({ default: module.AssetPage })));
const OperationsPage = lazy(() => import("../pages/OperationsPage").then((module) => ({ default: module.OperationsPage })));
const DividendsPage = lazy(() => import("../pages/DividendsPage").then((module) => ({ default: module.DividendsPage })));
const ContributionsPage = lazy(() => import("../pages/ContributionsPage").then((module) => ({ default: module.ContributionsPage })));
const CashBoxesPage = lazy(() => import("../pages/CashBoxesPage").then((module) => ({ default: module.CashBoxesPage })));
const GoalsPage = lazy(() => import("../pages/GoalsPage").then((module) => ({ default: module.GoalsPage })));
const ProjectionsPage = lazy(() => import("../pages/ProjectionsPage").then((module) => ({ default: module.ProjectionsPage })));
const HistoryPage = lazy(() => import("../pages/HistoryPage").then((module) => ({ default: module.HistoryPage })));
const SettingsPage = lazy(() => import("../pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const RebalancingPage = lazy(() => import("../pages/RebalancingPage").then((module) => ({ default: module.RebalancingPage })));
const AssistantPage = lazy(() => import("../pages/AssistantPage").then((module) => ({ default: module.AssistantPage })));
const PlanningOverviewPage = lazy(() => import("../pages/planning/PlanningOverviewPage"));
const PlanningBudgetPage = lazy(() => import("../pages/planning/PlanningBudgetPage"));
const PlanningExpensesPage = lazy(() => import("../pages/planning/PlanningExpensesPage"));
const PlanningCalendarPage = lazy(() => import("../pages/planning/PlanningCalendarPage"));
const PlanningGoalsPage = lazy(() => import("../pages/planning/PlanningGoalsPage"));
const PlanningAnalyticsPage = lazy(() => import("../pages/planning/PlanningAnalyticsPage"));
const PlanningCategoryAnalyticsPage = lazy(() => import("../pages/planning/PlanningCategoryAnalyticsPage"));
const InvestmentsOverviewPage = lazy(() => import("../pages/investments/InvestmentsOverviewPage"));
const InvestmentPortfolioPage = lazy(() => import("../pages/investments/InvestmentPortfolioPage"));
const InvestmentContributionsPage = lazy(() => import("../pages/investments/InvestmentContributionsPage"));
const InvestmentDividendsPage = lazy(() => import("../pages/investments/InvestmentDividendsPage"));
const InvestmentContributionGoalsPage = lazy(() => import("../pages/investments/InvestmentContributionGoalsPage"));
const InvestmentAnalyticsPage = lazy(() => import("../pages/investments/InvestmentAnalyticsPage"));

function lazyPage(page: ReactNode) {
  return (
    <Suspense fallback={<div className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">Carregando pagina...</div>}>
      {page}
    </Suspense>
  );
}

export const router = createBrowserRouter([
  { path: "/login", element: lazyPage(<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>) },
  { path: "/cadastro", element: lazyPage(<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>) },
  { path: "/esqueci-minha-senha", element: lazyPage(<PublicOnlyRoute><ForgotPasswordPage /></PublicOnlyRoute>) },
  { path: "/redefinir-senha", element: lazyPage(<PublicOnlyRoute><ResetPasswordPage /></PublicOnlyRoute>) },
  {
    path: "/",
    element: <ProtectedRoute><App /></ProtectedRoute>,
    children: [
      { index: true, element: lazyPage(<DashboardPage />) },
      { path: "investimentos", element: lazyPage(<InvestmentsOverviewPage />) },
      { path: "investimentos/carteira", element: lazyPage(<InvestmentPortfolioPage />) },
      { path: "investimentos/aportes", element: lazyPage(<InvestmentContributionsPage />) },
      { path: "investimentos/dividendos", element: lazyPage(<InvestmentDividendsPage />) },
      { path: "investimentos/metas", element: lazyPage(<InvestmentContributionGoalsPage />) },
      { path: "investimentos/analises", element: lazyPage(<InvestmentAnalyticsPage />) },
      { path: "carteira", element: lazyPage(<PortfolioPage />) },
      { path: "ativos", element: lazyPage(<AssetsPage />) },
      { path: "ativos/:ticker", element: lazyPage(<AssetPage />) },
      { path: "operacoes", element: lazyPage(<OperationsPage />) },
      { path: "dividendos", element: lazyPage(<DividendsPage />) },
      { path: "aportes", element: lazyPage(<ContributionsPage />) },
      { path: "planejamento-mensal", element: lazyPage(<PlanningOverviewPage />) },
      { path: "planejamento-mensal/orcamento", element: lazyPage(<PlanningBudgetPage />) },
      { path: "planejamento-mensal/gastos", element: lazyPage(<PlanningExpensesPage />) },
      { path: "planejamento-mensal/calendario", element: lazyPage(<PlanningCalendarPage />) },
      { path: "planejamento-mensal/objetivos", element: lazyPage(<PlanningGoalsPage />) },
      { path: "planejamento-mensal/analises", element: lazyPage(<PlanningAnalyticsPage />) },
      { path: "planejamento-mensal/analises/categoria/:categoryId", element: lazyPage(<PlanningCategoryAnalyticsPage />) },
      { path: "caixinhas", element: lazyPage(<CashBoxesPage />) },
      { path: "metas", element: lazyPage(<GoalsPage />) },
      { path: "projecoes", element: lazyPage(<ProjectionsPage />) },
      { path: "calendario", element: <Navigate to="/historico" replace /> },
      { path: "historico", element: lazyPage(<HistoryPage />) },
      { path: "assistente", element: lazyPage(<AssistantPage />) },
      { path: "configuracoes", element: lazyPage(<SettingsPage />) },
      { path: "alocacao", element: lazyPage(<RebalancingPage />) }
    ]
  }
]);
