import { CalendarCard } from "../components/cards/CalendarCard";
import { PageHeader } from "../components/ui/PageHeader";
import { useInvestmentStore } from "../stores/useInvestmentStore";

export function CalendarPage() {
  const events = useInvestmentStore((state) => state.calendar);

  return (
    <div>
      <PageHeader
        eyebrow="Calendario"
        title="Eventos financeiros em ordem"
        description="Dividendos, compras, vendas, aportes e rebalanceamentos em uma agenda unica."
      />
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {events.map((event) => (
          <CalendarCard key={event.id} event={event} />
        ))}
      </section>
    </div>
  );
}
