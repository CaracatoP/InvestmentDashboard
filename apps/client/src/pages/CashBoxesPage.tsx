import { FormEvent, useEffect, useMemo, useState } from "react";
import { Edit2, Landmark, Percent, Plus, RefreshCw, Trash2, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { LazyAreaChart } from "../components/charts/LazyCharts";
import { ChartCard } from "../components/ui/ChartCard";
import { ConfirmDelete, ManagementField, fieldClass, ManagementModal, ManagementTable, ManagementToolbar } from "../components/ui/Management";
import { PageHeader } from "../components/ui/PageHeader";
import { MobileDataCard } from "../components/ui/Responsive";
import { StatCard } from "../components/ui/StatCard";
import { MoneyValue } from "../components/ui/ValueDisplay";
import { useWorkspaceInvalidation } from "../hooks/useWorkspaceInvalidation";
import { cashBoxRecordsApi, fetchCdiStatus, refreshCdiData } from "../services/api";
import type { CdiStatusResponse } from "../types/investments";
import type { CashBoxMovementRecord, CashBoxMovementType, CashBoxRecord } from "../types/management";
import { formatCurrency, formatPercentage } from "../utils/formatters";

type CashBoxFormState = {
  name: string;
  type: string;
  currentBalance: string;
  cdiPercentage: string;
  createdAt: string;
  active: boolean;
};

type CashBoxMovementFormState = {
  type: CashBoxMovementType;
  value: string;
  date: string;
  description: string;
};

const emptyCashBoxForm: CashBoxFormState = {
  name: "",
  type: "",
  currentBalance: "",
  cdiPercentage: "",
  createdAt: new Date().toISOString().slice(0, 10),
  active: true
};

const emptyMovementForm: CashBoxMovementFormState = {
  type: "DEPOSITO",
  value: "",
  date: new Date().toISOString().slice(0, 10),
  description: ""
};

function parseMoneyInput(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

interface CashBoxesOverview {
  totals: {
    currentBalance: number;
    deposited: number;
    withdrawn: number;
    yield: number;
    profitability: number;
  };
  cashBoxes: CashBoxRecord[];
  history: CashBoxMovementRecord[];
  evolution: Array<{ month: string; value: number }>;
}

function normalizeMovementType(type: CashBoxMovementType) {
  if (type === "DEPOSITO") return "contribution";
  if (type === "RESGATE") return "withdrawal";
  if (type === "RENDIMENTO") return "yield";
  return type;
}

function getMovementLabel(type: CashBoxMovementType) {
  const labels: Record<CashBoxMovementType, string> = {
    DEPOSITO: "Aporte",
    contribution: "Aporte",
    RESGATE: "Resgate",
    withdrawal: "Resgate",
    RENDIMENTO: "Rendimento",
    yield: "Rendimento",
    adjustment: "Ajuste"
  };

  return labels[type] ?? "Movimentacao";
}

function cdiSourceLabel(source?: CdiStatusResponse["source"]) {
  return source === "bcb" ? "Banco Central" : "Fallback";
}

export function CashBoxesPage() {
  const [overview, setOverview] = useState<CashBoxesOverview | null>(null);
  const [cdiStatus, setCdiStatus] = useState<CdiStatusResponse | null>(null);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("Todos");
  const [editing, setEditing] = useState<CashBoxRecord | null>(null);
  const [form, setForm] = useState<CashBoxFormState>(emptyCashBoxForm);
  const [movementForm, setMovementForm] = useState<CashBoxMovementFormState>(emptyMovementForm);
  const [movementTarget, setMovementTarget] = useState<CashBoxRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CashBoxRecord | null>(null);
  const [isRefreshingCdi, setIsRefreshingCdi] = useState(false);
  const [cdiFeedback, setCdiFeedback] = useState("");
  const [formError, setFormError] = useState("");
  const [movementError, setMovementError] = useState("");

  async function loadCashBoxes() {
    setOverview(await cashBoxRecordsApi.overview());
  }

  async function loadCdiOverview() {
    try {
      setCdiStatus(await fetchCdiStatus());
      setCdiFeedback("");
    } catch (error) {
      setCdiFeedback(error instanceof Error ? `Falha ao consultar CDI: ${error.message}` : "Falha ao consultar CDI.");
    }
  }

  useEffect(() => {
    void loadCashBoxes();
    void loadCdiOverview();
  }, []);

  useWorkspaceInvalidation(["cashBoxes"], () => loadCashBoxes());
  useWorkspaceInvalidation(["cdi"], () => loadCdiOverview());

  const cashBoxes = overview?.cashBoxes ?? [];
  const history = overview?.history ?? [];
  const types = useMemo(() => ["Todos", ...Array.from(new Set(cashBoxes.map((cashBox) => cashBox.type)))], [cashBoxes]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return cashBoxes.filter((cashBox) => {
      const matchesSearch = [cashBox.name, cashBox.type].some((value) => value.toLowerCase().includes(term));
      const matchesType = type === "Todos" || cashBox.type === type;
      return matchesSearch && matchesType;
    });
  }, [cashBoxes, search, type]);

  function openCreate() {
    setEditing(null);
    setForm(emptyCashBoxForm);
    setFormError("");
    setIsModalOpen(true);
  }

  function openEdit(cashBox: CashBoxRecord) {
    setEditing(cashBox);
    setForm({
      name: cashBox.name,
      type: cashBox.type,
      currentBalance: String(cashBox.currentBalance ?? ""),
      cdiPercentage: cashBox.cdiPercentage ? String(cashBox.cdiPercentage) : "",
      createdAt: String(cashBox.createdAt).slice(0, 10),
      active: cashBox.active
    });
    setFormError("");
    setIsModalOpen(true);
  }

  function openMovement(cashBox: CashBoxRecord) {
    setMovementTarget(cashBox);
    setMovementForm(emptyMovementForm);
    setMovementError("");
    setIsMovementModalOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentBalance = parseMoneyInput(form.currentBalance);
    const cdiPercentage = parseMoneyInput(form.cdiPercentage);
    const name = form.name.trim();
    const cashBoxType = form.type.trim();

    if (!name) {
      setFormError("Informe o nome da caixinha.");
      return;
    }
    if (!cashBoxType) {
      setFormError("Informe o tipo da caixinha.");
      return;
    }
    if (currentBalance === null || currentBalance < 0) {
      setFormError("Informe um saldo atual valido para a caixinha.");
      return;
    }
    if (!form.createdAt) {
      setFormError("Selecione a data de criacao da caixinha.");
      return;
    }

    const payload: CashBoxRecord = {
      name,
      type: cashBoxType,
      currentBalance,
      cdiPercentage: cdiPercentage === null ? 0 : Math.max(cdiPercentage, 0),
      createdAt: form.createdAt,
      active: form.active,
      movements: editing?.movements ?? []
    };

    if (editing?.id) await cashBoxRecordsApi.update(editing.id, payload);
    else await cashBoxRecordsApi.create(payload);
    setIsModalOpen(false);
    setEditing(null);
    setForm(emptyCashBoxForm);
    setFormError("");
  }

  async function handleMovementSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!movementTarget?.id) return;
    const value = parseMoneyInput(movementForm.value);
    const description = movementForm.description.trim();

    if (!value || value <= 0) {
      setMovementError("Informe um valor maior que zero para a movimentacao.");
      return;
    }
    if (!movementForm.date) {
      setMovementError("Selecione a data da movimentacao.");
      return;
    }

    const payload = {
      value,
      date: movementForm.date,
      description
    };
    const type = normalizeMovementType(movementForm.type);
    if (type === "withdrawal") await cashBoxRecordsApi.withdrawal(movementTarget.id, payload);
    else await cashBoxRecordsApi.contribution(movementTarget.id, payload);
    setIsMovementModalOpen(false);
    setMovementTarget(null);
    setMovementForm(emptyMovementForm);
    setMovementError("");
  }

  async function confirmDelete() {
    if (!deleteTarget?.id) return;
    await cashBoxRecordsApi.remove(deleteTarget.id);
    setDeleteTarget(null);
  }

  async function handleCdiRefresh() {
    if (isRefreshingCdi) return;

    setIsRefreshingCdi(true);
    setCdiFeedback("");

    try {
      const result = await refreshCdiData();
      setCdiFeedback(
        `${cdiSourceLabel(result.rate.source)} em ${new Date(result.rate.updatedAt).toLocaleString("pt-BR")} · ${result.recalculation.applied} rendimentos recalculados`
      );
    } catch (error) {
      setCdiFeedback(error instanceof Error ? `Falha ao atualizar CDI: ${error.message}` : "Falha ao atualizar CDI.");
    } finally {
      setIsRefreshingCdi(false);
    }
  }

  if (!overview) {
    return <div className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">Carregando caixinhas...</div>;
  }

  return (
    <div>
      <PageHeader eyebrow="Caixinhas" title="Reserva Nubank" description="Controle saldos, CDI, movimentacoes e evolucao da sua reserva." />

      <section className="stat-card-grid">
        <StatCard label="Saldo atual" value={formatCurrency(overview.totals.currentBalance)} detail="Total nas caixinhas" icon={<Wallet size={18} />} />
        <StatCard label="Total aplicado" value={formatCurrency(overview.totals.deposited)} detail="Depositos registrados" icon={<TrendingUp size={18} />} tone="blue" />
        <StatCard label="Total resgatado" value={formatCurrency(overview.totals.withdrawn)} detail="Resgates registrados" icon={<TrendingDown size={18} />} tone="rose" />
        <StatCard label="Rentabilidade" value={formatPercentage(overview.totals.profitability)} detail={formatCurrency(overview.totals.yield)} icon={<Percent size={18} />} tone="amber" />
        <StatCard label="Caixinhas" value={String(cashBoxes.length)} detail="Reservas ativas" icon={<Landmark size={18} />} tone="violet" />
      </section>

      <section className="mt-4">
        <article className="rounded-lg border border-line bg-panel p-4 shadow-soft sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-muted">CDI oficial da reserva</p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">{cdiStatus ? formatPercentage(cdiStatus.rate) : "Carregando..."}</h2>
              <p className="mt-2 text-sm text-muted">
                Fonte atual:{" "}
                <span className={cdiStatus?.source === "fallback" ? "text-amber" : "text-accent"}>
                  {cdiSourceLabel(cdiStatus?.source)}
                </span>
                {cdiStatus ? ` · referencia ${new Date(`${cdiStatus.referenceDate}T12:00:00Z`).toLocaleDateString("pt-BR")}` : ""}
              </p>
              {cdiStatus?.fallbackReason ? <p className="mt-2 text-xs text-amber">Motivo do fallback: {cdiStatus.fallbackReason}</p> : null}
              {cdiFeedback ? <p className="mt-2 text-xs text-muted">{cdiFeedback}</p> : null}
            </div>

            <button
              type="button"
              onClick={() => void handleCdiRefresh()}
              disabled={isRefreshingCdi}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-4 text-sm text-ink transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={16} className={isRefreshingCdi ? "animate-spin" : ""} />
              {isRefreshingCdi ? "Atualizando CDI" : "Atualizar CDI"}
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-lg bg-elevated px-3 py-3">
              <p className="text-xs text-muted">Taxa anual</p>
              <p className="mt-1 font-medium text-ink">{cdiStatus ? formatPercentage(cdiStatus.rate) : "Indisponivel"}</p>
            </div>
            <div className="rounded-lg bg-elevated px-3 py-3">
              <p className="text-xs text-muted">Referencia</p>
              <p className="mt-1 font-medium text-ink">
                {cdiStatus ? new Date(`${cdiStatus.referenceDate}T12:00:00Z`).toLocaleDateString("pt-BR") : "Indisponivel"}
              </p>
            </div>
            <div className="rounded-lg bg-elevated px-3 py-3">
              <p className="text-xs text-muted">Ultima atualizacao</p>
              <p className="mt-1 font-medium text-ink">{cdiStatus ? new Date(cdiStatus.updatedAt).toLocaleString("pt-BR") : "Indisponivel"}</p>
            </div>
            <div className="rounded-lg bg-elevated px-3 py-3">
              <p className="text-xs text-muted">Scheduler</p>
              <p className="mt-1 font-medium text-ink">
                {cdiStatus ? `${cdiStatus.schedulersEnabled ? "Ativo" : "Desligado"} · ${String(cdiStatus.updateHour).padStart(2, "0")}h` : "Indisponivel"}
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="mt-6 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <ChartCard title="Grafico de evolucao">
          <LazyAreaChart data={overview.evolution} dataKey="value" name="Saldo" color="#38bdf8" />
        </ChartCard>
        <ChartCard title="Historico">
          <div className="space-y-3">
            {history.map((movement, index) => (
              <div key={movement.id ?? `${movement.cashBoxName}-${movement.date}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-elevated px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="break-words font-medium text-ink">{movement.cashBoxName}</p>
                  <p className="text-xs text-muted">
                    {getMovementLabel(movement.type)} - {new Date(movement.date).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <span className={`min-w-0 shrink-0 ${normalizeMovementType(movement.type) === "withdrawal" ? "text-rose" : "text-accent"}`}>
                  <MoneyValue value={formatCurrency(movement.value)} />
                </span>
              </div>
            ))}
          </div>
        </ChartCard>
      </section>

      <section className="mt-4">
        <ManagementToolbar
          search={search}
          onSearchChange={setSearch}
          filter={type}
          onFilterChange={setType}
          filterOptions={types}
          onCreate={openCreate}
          searchPlaceholder="Pesquise por nome ou tipo de caixinha"
          searchLabel="Pesquisar caixinhas"
          filterLabel="Filtrar caixinhas por tipo"
          createLabel="Nova caixinha"
        />
        <ManagementTable
          columns={["Nome", "Tipo", "Saldo", "CDI", "Criacao", "Status"]}
          rows={filtered}
          getKey={(cashBox) => cashBox.id ?? cashBox.name}
          renderMobileCard={(cashBox) => (
            <MobileDataCard
              title={cashBox.name}
              subtitle={cashBox.type}
              badge={<span className={cashBox.active ? "text-accent" : "text-muted"}>{cashBox.active ? "Ativa" : "Inativa"}</span>}
            >
              <div className="mobile-metric-grid text-sm">
                <div className="rounded-lg bg-elevated px-3 py-2">
                  <p className="text-xs text-muted">Saldo</p>
                  <p className="min-w-0 font-medium text-accent">
                    <MoneyValue value={formatCurrency(cashBox.currentBalance)} />
                  </p>
                </div>
                <div className="rounded-lg bg-elevated px-3 py-2">
                  <p className="text-xs text-muted">CDI</p>
                  <p className="font-medium text-ink">{formatPercentage(cashBox.cdiPercentage)}</p>
                </div>
                <div className="rounded-lg bg-elevated px-3 py-2">
                  <p className="text-xs text-muted">Criacao</p>
                  <p className="font-medium text-ink">{new Date(cashBox.createdAt).toLocaleDateString("pt-BR")}</p>
                </div>
                <div className="rounded-lg bg-elevated px-3 py-2">
                  <p className="text-xs text-muted">Status</p>
                  <p className="font-medium text-ink">{cashBox.active ? "Ativa" : "Inativa"}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <button type="button" onClick={() => openMovement(cashBox)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink">
                  <Plus size={15} />
                  Movimentar
                </button>
                <button type="button" onClick={() => openEdit(cashBox)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink">
                  <Edit2 size={15} />
                  Editar
                </button>
                <button type="button" onClick={() => setDeleteTarget(cashBox)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-rose/50 hover:text-rose">
                  <Trash2 size={15} />
                  Excluir
                </button>
              </div>
            </MobileDataCard>
          )}
          renderRow={(cashBox) => (
            <>
              <td className="py-3 font-medium text-ink">{cashBox.name}</td>
              <td className="py-3">{cashBox.type}</td>
              <td className="py-3 text-right text-accent">
                <MoneyValue value={formatCurrency(cashBox.currentBalance)} size="table" />
              </td>
              <td className="py-3">{formatPercentage(cashBox.cdiPercentage)}</td>
              <td className="py-3">{new Date(cashBox.createdAt).toLocaleDateString("pt-BR")}</td>
              <td className="py-3">{cashBox.active ? "Ativa" : "Inativa"}</td>
              <td className="py-3">
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => openMovement(cashBox)} className="grid h-11 w-11 place-items-center rounded-lg border border-line bg-elevated text-muted transition hover:border-accent/50 hover:text-ink" title="Adicionar movimentacao" aria-label="Adicionar movimentacao">
                    <Plus size={15} />
                  </button>
                  <button type="button" onClick={() => openEdit(cashBox)} className="grid h-11 w-11 place-items-center rounded-lg border border-line bg-elevated text-muted transition hover:border-accent/50 hover:text-ink" title="Editar" aria-label="Editar">
                    <Edit2 size={15} />
                  </button>
                  <button type="button" onClick={() => setDeleteTarget(cashBox)} className="grid h-11 w-11 place-items-center rounded-lg border border-line bg-elevated text-muted transition hover:border-rose/50 hover:text-rose" title="Excluir" aria-label="Excluir">
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </>
          )}
        />
      </section>

      <ManagementModal
        title={editing ? "Editar caixinha" : "Nova caixinha"}
        description="Cadastre a reserva, o saldo atual e o percentual de CDI usado para acompanhar a rentabilidade."
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmit}
      >
        <ManagementField label="Nome da caixinha" required helperText="Ex.: reserva de emergencia, viagens ou oportunidades.">
          <input required autoFocus value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className={fieldClass} placeholder="Ex.: Reserva de emergencia" />
        </ManagementField>
        <ManagementField label="Tipo" required helperText="Use o tipo para identificar rapidamente a finalidade desta reserva.">
          <input required value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))} className={fieldClass} placeholder="Ex.: liquidez diaria" />
        </ManagementField>
        <div className="grid gap-3 sm:grid-cols-2">
          <ManagementField label="Saldo atual" required helperText="Informe o saldo atual da caixinha no momento do cadastro.">
            <input type="number" min="0" step="0.01" value={form.currentBalance} onChange={(event) => setForm((current) => ({ ...current, currentBalance: event.target.value }))} className={fieldClass} placeholder="Ex.: 2500,00" />
          </ManagementField>
          <ManagementField label="Percentual do CDI" optional helperText="Preencha somente se esta caixinha rende um percentual especifico do CDI.">
            <input type="number" min="0" step="0.01" value={form.cdiPercentage} onChange={(event) => setForm((current) => ({ ...current, cdiPercentage: event.target.value }))} className={fieldClass} placeholder="Ex.: 100" />
          </ManagementField>
        </div>
        <ManagementField label="Data de criacao" required>
          <input type="date" value={String(form.createdAt).slice(0, 10)} onChange={(event) => setForm((current) => ({ ...current, createdAt: event.target.value }))} className={fieldClass} />
        </ManagementField>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-line bg-elevated px-3 py-3 text-sm text-muted">
          Caixinha ativa
          <input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} className="h-4 w-4 accent-accent" />
        </label>
        {formError ? <p className="rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-sm text-rose">{formError}</p> : null}
      </ManagementModal>

      <ManagementModal
        title={`Movimentar ${movementTarget?.name ?? "caixinha"}`}
        description="Registre aportes ou resgates para manter o saldo e o historico da reserva atualizados."
        isOpen={isMovementModalOpen}
        onClose={() => setIsMovementModalOpen(false)}
        onSubmit={handleMovementSubmit}
      >
        <ManagementField label="Tipo de movimentacao" required>
          <select value={movementForm.type} onChange={(event) => setMovementForm((current) => ({ ...current, type: event.target.value as CashBoxMovementType }))} className={fieldClass}>
            <option value="DEPOSITO">Aporte</option>
            <option value="RESGATE">Resgate</option>
          </select>
        </ManagementField>
        <ManagementField label="Valor da movimentacao" required helperText="Informe o valor do aporte ou do resgate.">
          <input type="number" min="0" step="0.01" value={movementForm.value} onChange={(event) => setMovementForm((current) => ({ ...current, value: event.target.value }))} className={fieldClass} placeholder="Ex.: 300,00" />
        </ManagementField>
        <ManagementField label="Data da movimentacao" required>
          <input type="date" value={String(movementForm.date).slice(0, 10)} onChange={(event) => setMovementForm((current) => ({ ...current, date: event.target.value }))} className={fieldClass} />
        </ManagementField>
        <ManagementField label="Descricao" optional helperText="Ex.: reforco da reserva, resgate para conta corrente ou ajuste manual.">
          <input value={movementForm.description} onChange={(event) => setMovementForm((current) => ({ ...current, description: event.target.value }))} className={fieldClass} placeholder="Descreva a movimentacao, se necessario" />
        </ManagementField>
        {movementError ? <p className="rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-sm text-rose">{movementError}</p> : null}
      </ManagementModal>

      <ConfirmDelete
        isOpen={deleteTarget !== null}
        title="Excluir caixinha?"
        description="Voce esta prestes a remover esta caixinha e o historico associado a ela."
        details={[
          deleteTarget?.name ?? "Caixinha sem nome",
          deleteTarget?.type ?? "Tipo nao informado",
          deleteTarget ? formatCurrency(deleteTarget.currentBalance) : "-"
        ]}
        confirmLabel="Excluir caixinha"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

