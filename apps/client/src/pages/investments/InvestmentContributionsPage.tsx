import { InvestmentPlanningBridge } from "../../components/investments/InvestmentPlanningBridge";
import { InvestmentsSubnav } from "../../components/investments/InvestmentsSubnav";
import { ContributionsPage } from "../ContributionsPage";

export default function InvestmentContributionsPage() {
  return (
    <div>
      <InvestmentsSubnav />
      <InvestmentPlanningBridge />
      <ContributionsPage />
    </div>
  );
}
