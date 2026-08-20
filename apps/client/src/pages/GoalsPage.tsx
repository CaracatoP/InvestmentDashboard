import { FormEvent, useEffect, useMemo, useState } from "react";
import { ConfirmDelete, ManagementField, fieldClass, ManagementModal, ManagementTable, ManagementToolbar, RowActions } from "../components/ui/Management";
import { PageHeader } from "../components/ui/PageHeader";
import { ProgressBar } from "../components/ui/ProgressBar";
import { MobileDataCard } from "../components/ui/Responsive";
import { useWorkspaceInvalidation } from "../hooks/useWorkspaceInvalidation";
import { goalRecordsApi } from "../services/api";
import { useInvestmentStore } from "../stores/useInvestmentStore";
import type { Goal } from "../types/investments";
import type { GoalRecord, GoalType } from "../types/management";
import { formatCurrency, formatPercentage } from "../utils/formatters";

type GoalFormState = {
  title: string;
  description: string;
  type: GoalType;
  targetValue: string;
  targetQuantity: string;
  assetTicker: string;
  active: boolean;
  completed: boolean;
};

const emptyGoalForm: GoalFormState = {
  title: "",
  description: "",
  type: "wealth",
  targetValue: "",
  targetQuantity: "",
  assetTicker: "",
  active: true,
  completed: false
};

function parseGoalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

const goalTypeLabels: Record<GoalType, string> = {
  wealth: "Patrimonio",
  dividend: "Dividendos",
  shares: "Quantidade de cotas",
  invested: "Valor investido"
};

function goalIdentity(goal: GoalRecord) {
  return goal.id ?? goal.title;
}

function sortGoals(items: GoalRecord[]) {
  return [...items].sort((left, right) => left.title.localeCompare(right.title, "pt-BR"));
}

export function GoalsPage() {
  const calculatedGoals = useInvestmentStore((state) => state.goals);
  const [goals, setGoals] = useState<GoalRecord[]>([]);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("Todos");
  const [editing, setEditing] = useState<GoalRecord | null>(null);
  const [form, setForm] = useState<GoalFormState>(emptyGoalForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GoalRecord | null>(null);
  const [formError, setFormError] = useState("");

  async function loadGoals() {
    const records = await goalRecordsApi.list();
    setGoals(sortGoals(records));
  }

  useEffect(() => {
    void loadGoals();
  }, []);

  useWorkspaceInvalidation(["goals"], () => loadGoals());

  const calculatedById = useMemo(() => new Map(calculatedGoals.map((goal) => [goal.id, goal])), [calculatedGoals]);
  const types = useMemo(() => ["Todos", ...Object.values(goalTypeLabels)], []);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return goals.filter((goal) => {
      const matchesSearch = [goal.title, goal.description, goal.assetTicker, goalTypeLabels[goal.type]].some((value) => value?.toLowerCase().includes(term));
      const matchesType = type === "Todos" || goalTypeLabels[goal.type] === type;
      return matchesSearch && matchesType;
    });
  }, [goals, search, type]);

  function openCreate() {
    setEditing(null);
    setForm(emptyGoalForm);
    setFormError("");
    setIsModalOpen(true);
  }

  function openEdit(goal: GoalRecord) {
    setEditing(goal);
    setForm({
      title: goal.title,
      description: goal.description ?? "",
      type: goal.type,
      targetValue: goal.targetValue ? String(goal.targetValue) : "",
      targetQuantity: goal.targetQuantity ? String(goal.targetQuantity) : "",
      assetTicker: goal.assetTicker ?? "",
      active: goal.active,
      completed: goal.completed
    });
    setFormError("");
    setIsModalOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = form.title.trim();
    const targetValue = parseGoalNumber(form.targetValue);
    const targetQuantity = parseGoalNumber(form.targetQuantity);
    const assetTicker = form.assetTicker.trim().toUpperCase();

    if (!title) {
      setFormError("Informe o nome da meta.");
      return;
    }
    if (form.type === "shares") {
      if (!targetQuantity || targetQuantity <= 0) {
        setFormError("Informe a quantidade alvo que deseja acumular.");
        return;
      }
      if (!assetTicker) {
        setFormError("Informe o ticker do ativo vinculado a esta meta.");
        return;
      }
    } else if (!targetValue || targetValue <= 0) {
      setFormError("Informe um valor objetivo maior que zero.");
      return;
    }

    const payload = {
      title,
      description: form.description.trim(),
      type: form.type,
      targetValue: form.type === "shares" ? 0 : targetValue ?? 0,
      targetQuantity: form.type === "shares" ? targetQuantity ?? 0 : 0,
      assetTicker,
      active: form.active,
      completed: form.completed
    };
    const saved = editing?.id
      ? await goalRecordsApi.update(editing.id, payload)
      : await goalRecordsApi.create(payload);

    setGoals((current) => sortGoals([...current.filter((goal) => goalIdentity(goal) !== goalIdentity(saved)), saved]));
    setIsModalOpen(false);
    setEditing(null);
    setForm(emptyGoalForm);
    setFormError("");
  }

  async function confirmDelete() {
    if (!deleteTarget?.id) return;
    await goalRecordsApi.remove(deleteTarget.id);
    setGoals((current) => current.filter((goal) => goalIdentity(goal) !== goalIdentity(deleteTarget)));
    setDeleteTarget(null);
  }

  function formatTarget(goal: GoalRecord) {
    if (goal.type === "shares") return `${goal.targetQuantity ?? 0} cotas`;
    return formatCurrency(goal.targetValue ?? 0);
  }

  function formatCurrent(goal: Goal) {
    if (goal.type === "shares") return `${goal.current.toLocaleString("pt-BR")} cotas`;
    return formatCurrency(goal.current);
  }

  return (
    <div>
      <PageHeader eyebrow="Metas" title="Gerenciar metas" description="Cadastre objetivos de patrimonio, dividendos, quantidade de cotas e valor investido." />
      <ManagementToolbar
        search={search}
        onSearchChange={setSearch}
        filter={type}
        onFilterChange={setType}
        filterOptions={types}
        onCreate={openCreate}
        searchPlaceholder="Pesquise por titulo, descricao, tipo ou ativo"
        searchLabel="Pesquisar metas"
        filterLabel="Filtrar metas por tipo"
        createLabel="Nova meta"
      />
      <ManagementTable
        columns={["Titulo", "Tipo", "Atual", "Alvo", "Progresso", "Ativo"]}
        rows={filtered}
        getKey={(goal) => goal.id ?? goal.title}
        renderMobileCard={(goal) => {
          const calculated = calculatedById.get(goal.id);
          const progress = calculated?.progress ?? 0;

          return (
            <MobileDataCard title={goal.title} subtitle={goal.description} badge={goalTypeLabels[goal.type]}>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-elevated px-3 py-2">
                  <p className="text-xs text-muted">Atual</p>
                  <p className="font-medium text-ink">{calculated ? formatCurrent(calculated) : "-"}</p>
                </div>
                <div className="rounded-lg bg-elevated px-3 py-2">
                  <p className="text-xs text-muted">Alvo</p>
                  <p className="font-medium text-ink">{formatTarget(goal)}</p>
                </div>
                <div className="rounded-lg bg-elevated px-3 py-2">
                  <p className="text-xs text-muted">Ativo</p>
                  <p className="font-medium text-ink">{goal.assetTicker || "-"}</p>
                </div>
                <div className="rounded-lg bg-elevated px-3 py-2">
                  <p className="text-xs text-muted">Status</p>
                  <p className="font-medium text-ink">{progress >= 100 ? "Concluida" : "Em andamento"}</p>
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted">
                  <span>{formatPercentage(progress)}</span>
                  <span>{progress >= 100 ? "Concluida" : "Em andamento"}</span>
                </div>
                <ProgressBar value={progress} tone={progress >= 100 ? "green" : "blue"} />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => openEdit(goal)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink">
                  Editar
                </button>
                <button type="button" onClick={() => setDeleteTarget(goal)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-rose/50 hover:text-rose">
                  Excluir
                </button>
              </div>
            </MobileDataCard>
          );
        }}
        renderRow={(goal) => {
          const calculated = calculatedById.get(goal.id);

          return (
            <>
              <td className="py-3">
                <p className="font-medium text-ink">{goal.title}</p>
                <p className="text-xs text-muted">{goal.description}</p>
              </td>
              <td className="py-3">{goalTypeLabels[goal.type]}</td>
              <td className="py-3">{calculated ? formatCurrent(calculated) : "-"}</td>
              <td className="py-3">{formatTarget(goal)}</td>
              <td className="py-3">
                <div className="min-w-36">
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted">
                    <span>{formatPercentage(calculated?.progress ?? 0)}</span>
                    <span>{(calculated?.progress ?? 0) >= 100 ? "Concluida" : "Em andamento"}</span>
                  </div>
                  <ProgressBar value={calculated?.progress ?? 0} tone={(calculated?.progress ?? 0) >= 100 ? "green" : "blue"} />
                </div>
              </td>
              <td className="py-3">{goal.assetTicker || "-"}</td>
              <RowActions onEdit={() => openEdit(goal)} onDelete={() => setDeleteTarget(goal)} />
            </>
          );
        }}
      />

      <ManagementModal
        title={editing ? "Editar meta" : "Nova meta"}
        description="Defina o objetivo, o tipo de acompanhamento e, quando necessario, o ativo vinculado."
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmit}
      >
        <ManagementField label="Nome da meta" required helperText="Ex.: reserva de emergencia, renda passiva ou acumular cotas de um ativo.">
          <input required autoFocus value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className={fieldClass} placeholder="Ex.: Comprar carro" />
        </ManagementField>
        <ManagementField label="Descricao" optional>
          <input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className={fieldClass} placeholder="Explique o objetivo desta meta, se necessario" />
        </ManagementField>
        <ManagementField label="Tipo de meta" required>
          <select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as GoalType }))} className={fieldClass}>
            <option value="wealth">Patrimonio</option>
            <option value="dividend">Dividendos</option>
            <option value="shares">Quantidade de cotas</option>
            <option value="invested">Valor investido</option>
          </select>
        </ManagementField>
        {form.type === "shares" ? (
          <>
            <ManagementField label="Quantidade objetivo" required helperText="Use casas decimais apenas se este ativo permitir fracao.">
              <input type="number" min="0" step="0.00000001" value={form.targetQuantity} onChange={(event) => setForm((current) => ({ ...current, targetQuantity: event.target.value }))} className={fieldClass} placeholder="Ex.: 100" />
            </ManagementField>
            <ManagementField label="Ticker do ativo" required helperText="Informe o ativo que sera acompanhado por quantidade acumulada.">
              <input value={form.assetTicker} onChange={(event) => setForm((current) => ({ ...current, assetTicker: event.target.value.toUpperCase() }))} className={fieldClass} placeholder="Ex.: ITSA4" />
            </ManagementField>
          </>
        ) : (
          <ManagementField label="Valor objetivo" required helperText="Informe quanto deseja acumular para atingir esta meta.">
            <input type="number" min="0" step="0.01" value={form.targetValue} onChange={(event) => setForm((current) => ({ ...current, targetValue: event.target.value }))} className={fieldClass} placeholder="Ex.: 50000,00" />
          </ManagementField>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-3 rounded-lg border border-line bg-elevated px-3 py-3 text-sm text-muted">
            Meta ativa
            <input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} className="h-4 w-4 accent-accent" />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-line bg-elevated px-3 py-3 text-sm text-muted">
            Concluida
            <input type="checkbox" checked={form.completed} onChange={(event) => setForm((current) => ({ ...current, completed: event.target.checked }))} className="h-4 w-4 accent-accent" />
          </label>
        </div>
        {formError ? <p className="rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-sm text-rose">{formError}</p> : null}
      </ManagementModal>

      <ConfirmDelete
        isOpen={deleteTarget !== null}
        title="Excluir meta?"
        description="Voce esta prestes a remover este objetivo do acompanhamento financeiro."
        details={[
          deleteTarget?.title ?? "Meta sem titulo",
          deleteTarget ? goalTypeLabels[deleteTarget.type] : "-",
          deleteTarget ? formatTarget(deleteTarget) : "-"
        ]}
        confirmLabel="Excluir meta"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
