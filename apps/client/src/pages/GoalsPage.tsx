import { FormEvent, useEffect, useMemo, useState } from "react";
import { ConfirmDelete, fieldClass, ManagementModal, ManagementTable, ManagementToolbar, RowActions } from "../components/ui/Management";
import { PageHeader } from "../components/ui/PageHeader";
import { ProgressBar } from "../components/ui/ProgressBar";
import { MobileDataCard } from "../components/ui/Responsive";
import { useWorkspaceInvalidation } from "../hooks/useWorkspaceInvalidation";
import { goalRecordsApi } from "../services/api";
import { useInvestmentStore } from "../stores/useInvestmentStore";
import type { Goal } from "../types/investments";
import type { GoalRecord, GoalType } from "../types/management";
import { formatCurrency, formatPercentage } from "../utils/formatters";

const emptyGoal: GoalRecord = {
  title: "",
  description: "",
  type: "wealth",
  targetValue: 0,
  targetQuantity: 0,
  assetTicker: "",
  active: true,
  completed: false
};

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
  const [form, setForm] = useState<GoalRecord>(emptyGoal);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GoalRecord | null>(null);

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
    setForm(emptyGoal);
    setIsModalOpen(true);
  }

  function openEdit(goal: GoalRecord) {
    setEditing(goal);
    setForm(goal);
    setIsModalOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      ...form,
      targetValue: form.type === "shares" ? 0 : form.targetValue,
      targetQuantity: form.type === "shares" ? form.targetQuantity : 0,
      assetTicker: form.assetTicker?.toUpperCase()
    };
    const saved = editing?.id
      ? await goalRecordsApi.update(editing.id, payload)
      : await goalRecordsApi.create(payload);

    setGoals((current) => sortGoals([...current.filter((goal) => goalIdentity(goal) !== goalIdentity(saved)), saved]));
    setIsModalOpen(false);
    setEditing(null);
    setForm(emptyGoal);
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
      <ManagementToolbar search={search} onSearchChange={setSearch} filter={type} onFilterChange={setType} filterOptions={types} onCreate={openCreate} />
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

      <ManagementModal title={editing ? "Editar meta" : "Nova meta"} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleSubmit}>
        <input required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className={fieldClass} placeholder="Titulo" />
        <input value={form.description ?? ""} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className={fieldClass} placeholder="Descricao" />
        <select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as GoalType }))} className={fieldClass}>
          <option value="wealth">Patrimonio</option>
          <option value="dividend">Dividendos</option>
          <option value="shares">Quantidade de cotas</option>
          <option value="invested">Valor investido</option>
        </select>
        {form.type === "shares" ? (
          <input type="number" min="0" step="0.000001" value={form.targetQuantity ?? 0} onChange={(event) => setForm((current) => ({ ...current, targetQuantity: Number(event.target.value) }))} className={fieldClass} placeholder="Quantidade objetivo" />
        ) : (
          <input type="number" min="0" step="0.01" value={form.targetValue ?? 0} onChange={(event) => setForm((current) => ({ ...current, targetValue: Number(event.target.value) }))} className={fieldClass} placeholder="Valor objetivo" />
        )}
        {form.type === "shares" ? (
          <input value={form.assetTicker ?? ""} onChange={(event) => setForm((current) => ({ ...current, assetTicker: event.target.value.toUpperCase() }))} className={fieldClass} placeholder="Ticker do ativo" />
        ) : null}
        <label className="flex items-center justify-between gap-3 rounded-lg border border-line bg-elevated px-3 py-3 text-sm text-muted">
          Concluida
          <input type="checkbox" checked={form.completed} onChange={(event) => setForm((current) => ({ ...current, completed: event.target.checked }))} className="h-4 w-4 accent-accent" />
        </label>
      </ManagementModal>

      <ConfirmDelete isOpen={deleteTarget !== null} title={`Excluir meta ${deleteTarget?.title ?? ""}?`} onCancel={() => setDeleteTarget(null)} onConfirm={() => void confirmDelete()} />
    </div>
  );
}
