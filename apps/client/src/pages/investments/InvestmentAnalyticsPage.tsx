import { LazyAiAnalysisPanel } from "../../components/ai/LazyAiAnalysisPanel";
import { InvestmentsSubnav } from "../../components/investments/InvestmentsSubnav";
import { RebalancingPage } from "../RebalancingPage";

export default function InvestmentAnalyticsPage() {
  const now = new Date();

  return (
    <div>
      <InvestmentsSubnav />
      <LazyAiAnalysisPanel
        year={now.getFullYear()}
        month={now.getMonth() + 1}
        analysisType="investments"
        title="Analises de investimentos com IA"
        description="Leia a carteira, dividendos, aportes, metas e alocacao com dados reais do backend."
      />
      <RebalancingPage />
    </div>
  );
}
