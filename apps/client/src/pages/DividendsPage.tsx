import { Award, CalendarDays, Coins, TrendingUp } from "lucide-react";
import { type FormEvent, useState } from "react";
import { LazyBarChart, LazyPieChart } from "../components/charts/LazyCharts";
import { DividendCard } from "../components/cards/DividendCard";
import { ChartCard } from "../components/ui/ChartCard";
import { fieldClass, ManagementModal } from "../components/ui/Management";
import { PageHeader } from "../components/ui/PageHeader";
import { MobileDataCard } from "../components/ui/Responsive";
import { StatCard } from "../components/ui/StatCard";
import { MoneyValue } from "../components/ui/ValueDisplay";
import { dividendRecordsApi } from "../services/api";
import { useInvestmentStore } from "../stores/useInvestmentStore";
import type { AllocationComparison, DividendListItem } from "../types/investments";
import { formatCurrency, parseBrazilianMoneyToCents } from "../utils/formatters";

const dividendColors = ["#22c55e", "#38bdf8", "#a78bfa", "#f59e0b", "#fb7185", "#14b8a6"];

type DividendForm = {
  assetTicker: string;
  type: "dividendo" | "jcp" | "rendimento" | "amortizacao" | "outro";
  amount: string;
  paymentDate: string;
  status: "expected" | "received" | "cancelled";
  notes: string;
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function toDateInput(value?: string | null) {
  if (!value) return todayKey();
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? todayKey() : parsed.toISOString().slice(0, 10);
}

function toMoneyInput(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusLabel(status?: string) {
  if (status === "expected" || status === "announced") return "Previsto";
  if (status === "cancelled") return "Cancelado";
  return "Recebido";
}

function statusClass(status?: string) {
  if (status === "expected" || status === "announced") return "bg-amber/10 text-amber";
  if (status === "cancelled") return "bg-rose/10 text-rose";
  return "bg-accent/10 text-accent";
}

export function DividendsPage() {
  const dividends = useInvestmentStore((state) => state.dividends);
  const portfolio = useInvestmentStore((state) => state.portfolio);
  const loadWorkspace = useInvestmentStore((state) => state.loadWorkspace);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<DividendListItem | null>(null);
  const [form, setForm] = useState<DividendForm>({
    assetTicker: "",
    type: "dividendo",
    amount: "",
    paymentDate: todayKey(),
    status: "received",
    notes: ""
  });
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!dividends) {
    return <div className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">Carregando dividendos...</div>;
  }

  const totalByAsset = dividends.byAsset.reduce((total, item) => total + item.value, 0);
  const pieData: AllocationComparison[] = dividends.byAsset
    .filter((item) => item.value > 0)
    .map((item, index) => ({
      category: item.ticker,
      targetPercentage: 0,
      currentPercentage: totalByAsset > 0 ? (item.value / totalByAsset) * 100 : 0,
      difference: 0,
      value: item.value,
      color: dividendColors[index % dividendColors.length]
    }));
  const assetOptions = portfolio?.assets.map((asset) => asset.ticker).sort((left, right) => left.localeCompare(right)) ?? [];

  function openCreateModal() {
    setReceiveTarget(null);
    setForm({
      assetTicker: assetOptions[0] ?? "",
      type: "dividendo",
      amount: "",
      paymentDate: todayKey(),
      status: "received",
      notes: ""
    });
    setFeedback(null);
    setIsModalOpen(true);
  }

  function openReceiveModal(dividend: DividendListItem) {
    setReceiveTarget(dividend);
    setForm({
      assetTicker: dividend.assetTicker,
      type: (dividend.type as DividendForm["type"]) || "dividendo",
      amount: toMoneyInput(dividend.amount),
      paymentDate: toDateInput(dividend.receivedAt ?? dividend.date),
      status: "received",
      notes: dividend.notes ?? ""
    });
    setFeedback(null);
    setIsModalOpen(true);
  }

  async function submitDividend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountInCents = parseBrazilianMoneyToCents(form.amount);
    const assetTicker = form.assetTicker.trim().toUpperCase();

    if (!assetTicker) {
      setFeedback({ type: "error", message: "Informe o ativo." });
      return;
    }
    if (!amountInCents || amountInCents <= 0) {
      setFeedback({ type: "error", message: "Informe um valor valido." });
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      const totalValue = amountInCents / 100;
      if (receiveTarget?.id) {
        await dividendRecordsApi.receive(receiveTarget.id, {
          totalValue,
          paymentDate: form.paymentDate,
          receivedAt: form.paymentDate,
          notes: form.notes
        });
      } else {
        await dividendRecordsApi.create({
          assetTicker,
          type: form.type,
          totalValue,
          valuePerShare: 0,
          amountPerShare: 0,
          paymentDate: form.paymentDate,
          receivedAt: form.status === "received" ? form.paymentDate : null,
          status: form.status,
          source: "manual",
          notes: form.notes
        });
      }
      await loadWorkspace(["dashboard", "portfolio", "dividends", "history"]);
      setIsModalOpen(false);
      setFeedback({ type: "success", message: receiveTarget ? "Dividendo marcado como recebido." : "Dividendo registrado." });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Nao foi possivel salvar o dividendo." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Dividendos"
        title="Renda passiva calculada automaticamente"
        description="Recebimentos, media mensal, maior pagamento, calendario, tabela e graficos vindos da API."
        actions={
          <button
            type="button"
            onClick={openCreateModal}
            className="h-11 rounded-lg bg-accent px-4 text-sm font-medium text-black transition hover:bg-accent/90"
          >
            + Registrar dividendo
          </button>
        }
      />
      {feedback ? (
        <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${feedback.type === "success" ? "bg-accent/10 text-accent" : "bg-rose/10 text-rose"}`}>
          {feedback.message}
        </p>
      ) : null}

      <section className="stat-card-grid">
        <StatCard label="Dividendos mes" value={formatCurrency(dividends.totals.month)} icon={<Coins size={18} />} />
        <StatCard label="Dividendos ano" value={formatCurrency(dividends.totals.year)} icon={<CalendarDays size={18} />} tone="blue" />
        <StatCard label="Total recebido" value={formatCurrency(dividends.totals.allTime)} icon={<TrendingUp size={18} />} tone="violet" />
        <StatCard label="Media mensal" value={formatCurrency(dividends.totals.monthlyAverage)} icon={<Coins size={18} />} tone="amber" />
        <StatCard label="Maior pagamento" value={formatCurrency(dividends.totals.biggestPayment)} icon={<Award size={18} />} tone="rose" />
      </section>

      <section className="mt-6 grid min-w-0 gap-4 xl:grid-cols-2">
        <ChartCard title="Grafico mensal">
          <LazyBarChart data={dividends.monthly} name="Dividendos" color="#22c55e" />
        </ChartCard>
        <ChartCard title="Grafico anual">
          <LazyBarChart data={dividends.annual} xAxisKey="year" name="Dividendos" color="#38bdf8" />
        </ChartCard>
      </section>

      <section className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <ChartCard title="Dividendos por ativo">
          <LazyPieChart data={pieData} />
        </ChartCard>
        <ChartCard title="Calendario">
          <div className="space-y-3">
            {dividends.calendar.map((dividend) => (
              <DividendCard key={`${dividend.assetTicker}-${dividend.date}-${dividend.amount}`} ticker={dividend.assetTicker} amount={dividend.amount} date={dividend.date} />
            ))}
          </div>
        </ChartCard>
      </section>

      <section className="mt-4 min-w-0 rounded-lg border border-line bg-panel p-3 shadow-soft sm:p-4">
        <h2 className="text-base font-semibold text-ink">Tabela</h2>
        <div className="mt-4 space-y-3 md:hidden">
          {dividends.table.map((dividend) => (
            <MobileDataCard
              key={dividend.id ?? `${dividend.assetTicker}-${dividend.date}-${dividend.amount}`}
              title={dividend.assetTicker}
              subtitle={new Date(dividend.date).toLocaleDateString("pt-BR")}
              badge={<span className="text-accent"><MoneyValue value={formatCurrency(dividend.amount)} /></span>}
              actions={
                dividend.id && (dividend.status === "expected" || dividend.status === "announced") ? (
                  <button
                    type="button"
                    onClick={() => openReceiveModal(dividend)}
                    className="h-9 rounded-lg border border-line bg-elevated px-3 text-xs text-muted transition hover:border-accent/50 hover:text-ink"
                  >
                    Marcar recebido
                  </button>
                ) : null
              }
            >
              <div className="mobile-metric-grid text-sm">
                <div className="rounded-lg bg-elevated px-3 py-2">
                  <p className="text-xs text-muted">Cotas</p>
                  <p className="font-medium text-ink">{dividend.shares}</p>
                </div>
                <div className="rounded-lg bg-elevated px-3 py-2">
                  <p className="text-xs text-muted">Status</p>
                  <p className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs ${statusClass(dividend.status)}`}>{statusLabel(dividend.status)}</p>
                </div>
                <div className="rounded-lg bg-elevated px-3 py-2">
                  <p className="text-xs text-muted">Valor</p>
                  <p className="min-w-0 font-medium text-accent">
                    <MoneyValue value={formatCurrency(dividend.amount)} />
                  </p>
                </div>
              </div>
            </MobileDataCard>
          ))}
        </div>
        <div className="scrollbar-thin mt-4 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.14em] text-muted">
              <tr className="border-b border-line">
                <th className="py-3 font-medium">Ativo</th>
                <th className="py-3 font-medium">Data</th>
                <th className="py-3 font-medium">Tipo</th>
                <th className="py-3 font-medium">Status</th>
                <th className="py-3 font-medium">Cotas</th>
                <th className="py-3 text-right font-medium">Valor</th>
                <th className="py-3 text-right font-medium">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {dividends.table.map((dividend) => (
                <tr key={dividend.id ?? `${dividend.assetTicker}-${dividend.date}-${dividend.amount}`} className="border-b border-line/70 text-muted">
                  <td className="py-3 font-medium text-ink">{dividend.assetTicker}</td>
                  <td className="py-3">{new Date(dividend.date).toLocaleDateString("pt-BR")}</td>
                  <td className="py-3 capitalize">{dividend.type ?? "dividendo"}</td>
                  <td className="py-3">
                    <span className={`rounded-full px-2 py-1 text-xs ${statusClass(dividend.status)}`}>{statusLabel(dividend.status)}</span>
                  </td>
                  <td className="py-3">{dividend.shares}</td>
                  <td className="py-3 text-right text-accent">
                    <MoneyValue value={formatCurrency(dividend.amount)} size="table" />
                  </td>
                  <td className="py-3 text-right">
                    {dividend.id && (dividend.status === "expected" || dividend.status === "announced") ? (
                      <button
                        type="button"
                        onClick={() => openReceiveModal(dividend)}
                        className="h-9 rounded-lg border border-line bg-elevated px-3 text-xs text-muted transition hover:border-accent/50 hover:text-ink"
                      >
                        Marcar recebido
                      </button>
                    ) : (
                      <span className="text-xs text-muted">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ManagementModal
        title={receiveTarget ? "Marcar dividendo como recebido" : "Registrar dividendo"}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={submitDividend}
        submitDisabled={isSaving}
        submitLabel={isSaving ? "Salvando..." : "Salvar"}
      >
        <label className="grid gap-1 text-sm text-muted">
          Ativo
          <input
            className={fieldClass}
            value={form.assetTicker}
            list="dividend-asset-options"
            onChange={(event) => setForm((current) => ({ ...current, assetTicker: event.target.value.toUpperCase() }))}
            disabled={Boolean(receiveTarget)}
            placeholder="PETR4"
          />
          <datalist id="dividend-asset-options">
            {assetOptions.map((ticker) => <option key={ticker} value={ticker} />)}
          </datalist>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm text-muted">
            Tipo
            <select
              className={fieldClass}
              value={form.type}
              onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as DividendForm["type"] }))}
              disabled={Boolean(receiveTarget)}
            >
              <option value="dividendo">Dividendo</option>
              <option value="jcp">JCP</option>
              <option value="rendimento">Rendimento</option>
              <option value="amortizacao">Amortizacao</option>
              <option value="outro">Outro</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm text-muted">
            Status
            <select
              className={fieldClass}
              value={form.status}
              onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as DividendForm["status"] }))}
              disabled={Boolean(receiveTarget)}
            >
              <option value="received">Recebido</option>
              <option value="expected">Previsto</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm text-muted">
            Valor
            <input
              className={fieldClass}
              value={form.amount}
              onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
              placeholder="85,40"
              inputMode="decimal"
            />
          </label>
          <label className="grid gap-1 text-sm text-muted">
            Data
            <input
              className={fieldClass}
              type="date"
              value={form.paymentDate}
              onChange={(event) => setForm((current) => ({ ...current, paymentDate: event.target.value }))}
            />
          </label>
        </div>
        <label className="grid gap-1 text-sm text-muted">
          Observacao
          <textarea
            className={`${fieldClass} min-h-24 py-2`}
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Opcional"
          />
        </label>
      </ManagementModal>
    </div>
  );
}

