import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "../components/ui/PageHeader";
import { Timeline } from "../components/ui/Timeline";
import { useInvestmentStore } from "../stores/useInvestmentStore";
import type { Movement } from "../types/investments";
import { formatDate, toDateKey } from "../utils/formatters";

const fieldClass = "h-11 w-full min-w-0 rounded-lg border border-line bg-elevated px-3 text-base text-ink outline-none transition focus:border-accent sm:text-sm";

const eventTypeOptions = [
  { value: "all", label: "Todos os tipos" },
  { value: "compra", label: "Compra" },
  { value: "venda", label: "Venda" },
  { value: "aporte", label: "Aporte" },
  { value: "income", label: "Entrada" },
  { value: "dividendo", label: "Dividendo" },
  { value: "rendimento", label: "Rendimento" },
  { value: "rebalanceamento", label: "Rebalanceamento" },
  { value: "gasto", label: "Gasto" },
  { value: "objetivo", label: "Objetivo" },
  { value: "recorrencia", label: "Recorrencia" },
  { value: "resgate", label: "Resgate" },
  { value: "outros", label: "Outros" }
];

const periodOptions = [
  { value: "all", label: "Todo periodo" },
  { value: "current-month", label: "Mes atual" },
  { value: "current-year", label: "Ano atual" },
  { value: "last-30", label: "Ultimos 30 dias" },
  { value: "last-90", label: "Ultimos 90 dias" },
  { value: "next-30", label: "Proximos 30 dias" }
];

const viewOptions = [
  { value: "all", label: "Todos" },
  { value: "completed", label: "Realizados" },
  { value: "future", label: "Futuros" }
];

const sortOptions = [
  { value: "recent", label: "Mais recentes primeiro" },
  { value: "oldest", label: "Mais antigos primeiro" },
  { value: "highest", label: "Maior valor" },
  { value: "lowest", label: "Menor valor" }
];

function normalizeText(value?: string | null) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function dateOnly(value: string) {
  return toDateKey(value);
}

function normalizeEventType(event: Movement) {
  const explicitType = normalizeText(event.eventType);
  if (explicitType) return explicitType;

  const label = normalizeText(event.type);
  if (label.includes("compra")) return "compra";
  if (label.includes("venda")) return "venda";
  if (label.includes("aporte") || label.includes("deposito")) return "aporte";
  if (label.includes("entrada")) return "income";
  if (label.includes("dividendo")) return "dividendo";
  if (label.includes("rendimento")) return "rendimento";
  if (label.includes("rebalance")) return "rebalanceamento";
  if (label.includes("gasto")) return "gasto";
  if (label.includes("objetivo")) return "objetivo";
  if (label.includes("recorr")) return "recorrencia";
  if (label.includes("resgate")) return "resgate";
  return "outros";
}

function isFutureEvent(event: Movement) {
  return event.status === "planned" || dateOnly(event.date) > dateOnly(new Date().toISOString());
}

function isCompletedEvent(event: Movement) {
  return event.status === "completed" || (!isFutureEvent(event) && event.status !== "cancelled");
}

function matchesPeriod(event: Movement, period: string) {
  if (period === "all") return true;

  const currentDate = new Date();
  const eventDate = new Date(event.date);
  const currentKey = dateOnly(currentDate.toISOString());
  const eventKey = dateOnly(event.date);

  if (period === "current-month") {
    return eventDate.getUTCFullYear() === currentDate.getUTCFullYear() && eventDate.getUTCMonth() === currentDate.getUTCMonth();
  }

  if (period === "current-year") {
    return eventDate.getUTCFullYear() === currentDate.getUTCFullYear();
  }

  if (period === "last-30" || period === "last-90") {
    const days = period === "last-30" ? 30 : 90;
    const startDate = new Date(currentDate);
    startDate.setDate(currentDate.getDate() - days);
    return eventDate >= startDate && eventKey <= currentKey;
  }

  if (period === "next-30") {
    const endDate = new Date(currentDate);
    endDate.setDate(currentDate.getDate() + 30);
    return eventKey >= currentKey && eventDate <= endDate;
  }

  return true;
}

function uniqueOptions(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])].sort((left, right) => left.localeCompare(right));
}

function groupTitle(date: string) {
  const currentDate = new Date(`${date}T00:00:00`);
  const today = new Date();
  const todayKey = dateOnly(today.toISOString());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayKey = dateOnly(yesterday.toISOString());
  const differenceInDays = Math.floor((new Date(`${todayKey}T00:00:00`).getTime() - currentDate.getTime()) / 86_400_000);

  if (date === todayKey) return `Hoje — ${formatDate(date)}`;
  if (date === yesterdayKey) return `Ontem — ${formatDate(date)}`;
  if (differenceInDays > 1 && differenceInDays < 7) return `Esta semana — ${formatDate(date)}`;

  return formatDate(date);
}

function groupByDate(items: Movement[]) {
  const groups = new Map<string, Movement[]>();

  for (const item of items) {
    const key = dateOnly(item.date);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return [...groups.entries()].map(([date, events]) => ({ date, title: groupTitle(date), events }));
}

export function HistoryPage() {
  const history = useInvestmentStore((state) => state.history);
  const isLoading = useInvestmentStore((state) => state.isLoading);
  const [period, setPeriod] = useState("all");
  const [view, setView] = useState("all");
  const [eventType, setEventType] = useState("all");
  const [asset, setAsset] = useState("all");
  const [sector, setSector] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sort, setSort] = useState("recent");

  const assetOptions = useMemo(() => uniqueOptions(history.map((event) => event.assetTicker)), [history]);
  const sectorOptions = useMemo(() => uniqueOptions(history.map((event) => event.sector ?? event.assetCategory)), [history]);
  const paymentOptions = useMemo(() => uniqueOptions(history.map((event) => event.paymentMethod)), [history]);

  const filteredHistory = useMemo(() => {
    const term = normalizeText(search);
    const filtered = history.filter((event) => {
      const eventKey = dateOnly(event.date);
      const eventSector = event.sector ?? event.assetCategory ?? "";
      const searchable = [event.type, event.title, event.description, event.assetTicker, event.assetCategory, event.sector, event.paymentMethod, event.statusLabel]
        .map(normalizeText)
        .join(" ");

      const matchesSearch = !term || searchable.includes(term);
      const matchesType = eventType === "all" || normalizeEventType(event) === eventType;
      const matchesAsset = asset === "all" || event.assetTicker === asset;
      const matchesSector = sector === "all" || eventSector === sector;
      const matchesPayment = paymentMethod === "all" || event.paymentMethod === paymentMethod;
      const matchesView = view === "all" || (view === "completed" ? isCompletedEvent(event) : isFutureEvent(event));
      const matchesStart = !startDate || eventKey >= startDate;
      const matchesEnd = !endDate || eventKey <= endDate;

      return matchesSearch && matchesType && matchesAsset && matchesSector && matchesPayment && matchesView && matchesStart && matchesEnd && matchesPeriod(event, period);
    });

    return [...filtered].sort((left, right) => {
      const tieBreak = (left.canonicalId ?? left.id).localeCompare(right.canonicalId ?? right.id);
      if (sort === "highest" || sort === "lowest") {
        const valueComparison = sort === "highest" ? Math.abs(right.amount) - Math.abs(left.amount) : Math.abs(left.amount) - Math.abs(right.amount);
        return valueComparison || tieBreak;
      }
      const dateComparison = new Date(right.date).getTime() - new Date(left.date).getTime();
      if (dateComparison === 0) return tieBreak;
      return sort === "oldest" ? -dateComparison : dateComparison;
    });
  }, [asset, endDate, eventType, history, paymentMethod, period, search, sector, sort, startDate, view]);

  const groupedHistory = useMemo(() => groupByDate(filteredHistory), [filteredHistory]);

  function clearFilters() {
    setPeriod("all");
    setView("all");
    setEventType("all");
    setAsset("all");
    setSector("all");
    setPaymentMethod("all");
    setSearch("");
    setStartDate("");
    setEndDate("");
    setSort("recent");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Historico"
        title="Timeline completa da vida financeira"
        description="Compras, vendas, aportes, dividendos, gastos, recorrencias e eventos futuros em uma narrativa cronologica."
      />

      <section className="mb-4 min-w-0 rounded-lg border border-line bg-panel p-3 shadow-soft sm:p-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(220px,1.5fr)_repeat(4,minmax(150px,1fr))]">
          <label className="relative min-w-0">
            <span className="sr-only">Buscar por descricao</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className={`${fieldClass} pl-9`} placeholder="Buscar por descricao, ativo ou evento" />
          </label>
          <select value={period} onChange={(event) => setPeriod(event.target.value)} className={fieldClass} aria-label="Periodo">
            {periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select value={view} onChange={(event) => setView(event.target.value)} className={fieldClass} aria-label="Visualizacao">
            {viewOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select value={eventType} onChange={(event) => setEventType(event.target.value)} className={fieldClass} aria-label="Tipo de evento">
            {eventTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value)} className={fieldClass} aria-label="Ordenacao">
            {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[repeat(5,minmax(130px,1fr))_auto]">
          <select value={asset} onChange={(event) => setAsset(event.target.value)} className={fieldClass} aria-label="Ativo">
            <option value="all">Todos os ativos</option>
            {assetOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <select value={sector} onChange={(event) => setSector(event.target.value)} className={fieldClass} aria-label="Setor">
            <option value="all">Todos os setores</option>
            {sectorOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className={fieldClass} aria-label="Forma de pagamento">
            <option value="all">Todas as formas</option>
            {paymentOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={fieldClass} aria-label="Data inicial" />
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className={fieldClass} aria-label="Data final" />
          <button type="button" onClick={clearFilters} className="inline-flex h-11 items-center justify-center rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink">
            Limpar
          </button>
        </div>

        <p className="mt-3 text-xs text-muted">
          Exibindo {filteredHistory.length} de {history.length} eventos. Eventos futuros aparecem com identificacao textual como Previsto ou Agendado.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-accent" />Entrada</span>
          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-rose" />Saída</span>
        </div>
      </section>

      {isLoading ? <p className="rounded-lg border border-line bg-panel p-4 text-sm text-muted">Carregando historico...</p> : null}
      {!isLoading && groupedHistory.length === 0 ? (
        <Timeline items={[]} emptyMessage="Nenhum evento encontrado para os filtros atuais." />
      ) : null}
      {!isLoading && groupedHistory.length > 0 ? (
        <div className="space-y-5">
          {groupedHistory.map((group) => (
            <section key={group.date} className="min-w-0">
              <h2 className="mb-2 text-sm font-semibold text-ink">{group.title}</h2>
              <Timeline items={group.events} showStatus colorByFlow />
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
