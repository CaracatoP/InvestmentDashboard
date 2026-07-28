import { InvestmentPlanningBridge } from "../../components/investments/InvestmentPlanningBridge";
import { InvestmentsSubnav } from "../../components/investments/InvestmentsSubnav";
import { DashboardPage } from "../DashboardPage";

export default function InvestmentsOverviewPage() {
  return (
    <div>
      <InvestmentsSubnav />
      <InvestmentPlanningBridge />
      <DashboardPage />
    </div>
  );
}
