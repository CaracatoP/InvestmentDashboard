import { PageHeader } from "../components/ui/PageHeader";
import { Timeline } from "../components/ui/Timeline";
import { useInvestmentStore } from "../stores/useInvestmentStore";

export function HistoryPage() {
  const history = useInvestmentStore((state) => state.history);

  return (
    <div>
      <PageHeader
        eyebrow="Historico"
        title="Timeline completa da vida financeira"
        description="Compras, dividendos, vendas, aportes e rebalanceamentos em uma narrativa cronologica."
      />
      <Timeline items={history} />
    </div>
  );
}
