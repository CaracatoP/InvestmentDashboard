import { createBrowserRouter } from "react-router-dom";
import { App } from "../App";
import { AssetPage } from "../pages/AssetPage";
import { AssetsPage } from "../pages/AssetsPage";
import { CalendarPage } from "../pages/CalendarPage";
import { ContributionsPage } from "../pages/ContributionsPage";
import { CashBoxesPage } from "../pages/CashBoxesPage";
import { DashboardPage } from "../pages/DashboardPage";
import { DividendsPage } from "../pages/DividendsPage";
import { GoalsPage } from "../pages/GoalsPage";
import { HistoryPage } from "../pages/HistoryPage";
import { OperationsPage } from "../pages/OperationsPage";
import { PortfolioPage } from "../pages/PortfolioPage";
import { ProjectionsPage } from "../pages/ProjectionsPage";
import { RebalancingPage } from "../pages/RebalancingPage";
import { SettingsPage } from "../pages/SettingsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "carteira", element: <PortfolioPage /> },
      { path: "ativos", element: <AssetsPage /> },
      { path: "ativos/:ticker", element: <AssetPage /> },
      { path: "operacoes", element: <OperationsPage /> },
      { path: "dividendos", element: <DividendsPage /> },
      { path: "aportes", element: <ContributionsPage /> },
      { path: "caixinhas", element: <CashBoxesPage /> },
      { path: "metas", element: <GoalsPage /> },
      { path: "projecoes", element: <ProjectionsPage /> },
      { path: "calendario", element: <CalendarPage /> },
      { path: "historico", element: <HistoryPage /> },
      { path: "configuracoes", element: <SettingsPage /> },
      { path: "alocacao", element: <RebalancingPage /> }
    ]
  }
]);
