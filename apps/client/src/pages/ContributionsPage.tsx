import { FormEvent, useEffect, useMemo, useState } from "react";
import { ConfirmDelete, fieldClass, ManagementModal, ManagementTable, ManagementToolbar, RowActions } from "../components/ui/Management";
import { PageHeader } from "../components/ui/PageHeader";
import { MobileDataCard } from "../components/ui/Responsive";
import { contributionRecordsApi } from "../services/api";
import { useInvestmentStore } from "../stores/useInvestmentStore";
import type { ContributionRecord } from "../types/management";
import { formatCurrency } from "../utils/formatters";

const emptyContribution: ContributionRecord = {
  date: new Date().toISOString().slice(0, 10),
  value: 0,
  description: ""
};

export function ContributionsPage() {
  const loadWorkspace = useInvestmentStore((state) => state.loadWorkspace);
  const [contributions, setContributions] = useState<ContributionRecord[]>([]);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("Todos");
  const [editing, setEditing] = useState<ContributionRecord | null>(null);
  const [form, setForm] = useState<ContributionRecord>(emptyContribution);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ContributionRecord | null>(null);

  async function loadContributions() {
    setContributions(await contributionRecordsApi.list());
  }

  useEffect(() => {
    void loadContributions();
  }, []);

  const periods = useMemo(() => ["Todos", ...Array.from(new Set(contributions.map((contribution) => String(contribution.date).slice(0, 7))))], [contributions]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return contributions.filter((contribution) => {
      const matchesSearch = [contribution.description, contribution.date].some((value) => value?.toLowerCase().includes(term));
      const matchesPeriod = period === "Todos" || String(contribution.date).startsWith(period);
      return matchesSearch && matchesPeriod;
    });
  }, [contributions, period, search]);

  function openCreate() {
    setEditing(null);
    setForm(emptyContribution);
    setIsModalOpen(true);
  }

  function openEdit(contribution: ContributionRecord) {
    setEditing(contribution);
    setForm({ ...contribution, date: String(contribution.date).slice(0, 10) });
    setIsModalOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editing?.id) await contributionRecordsApi.update(editing.id, form);
    else await contributionRecordsApi.create(form);
    setIsModalOpen(false);
    setEditing(null);
    await Promise.all([loadContributions(), loadWorkspace()]);
  }

  async function confirmDelete() {
    if (!deleteTarget?.id) return;
    await contributionRecordsApi.remove(deleteTarget.id);
    setDeleteTarget(null);
    await Promise.all([loadContributions(), loadWorkspace()]);
  }

  return (
    <div>
      <PageHeader eyebrow="Aportes" title="Gerenciar aportes" description="Cadastre, edite e acompanhe cada aporte registrado." />
      <ManagementToolbar search={search} onSearchChange={setSearch} filter={period} onFilterChange={setPeriod} filterOptions={periods} onCreate={openCreate} />
      <ManagementTable
        columns={["Data", "Valor", "Descricao"]}
        rows={filtered}
        getKey={(contribution) => contribution.id ?? `${contribution.date}-${contribution.value}`}
        renderMobileCard={(contribution) => (
          <MobileDataCard
            title={formatCurrency(contribution.value)}
            subtitle={new Date(contribution.date).toLocaleDateString("pt-BR")}
            badge="Aporte"
          >
            <p className="break-words rounded-lg bg-elevated px-3 py-2 text-sm text-muted">{contribution.description || "Sem descricao"}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => openEdit(contribution)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink">
                Editar
              </button>
              <button type="button" onClick={() => setDeleteTarget(contribution)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-rose/50 hover:text-rose">
                Excluir
              </button>
            </div>
          </MobileDataCard>
        )}
        renderRow={(contribution) => (
          <>
            <td className="py-3">{new Date(contribution.date).toLocaleDateString("pt-BR")}</td>
            <td className="py-3 font-medium text-accent">{formatCurrency(contribution.value)}</td>
            <td className="py-3">{contribution.description}</td>
            <RowActions onEdit={() => openEdit(contribution)} onDelete={() => setDeleteTarget(contribution)} />
          </>
        )}
      />

      <ManagementModal title={editing ? "Editar aporte" : "Novo aporte"} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleSubmit}>
        <input type="date" required value={String(form.date).slice(0, 10)} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} className={fieldClass} />
        <input type="number" min="0" step="0.01" required value={form.value} onChange={(event) => setForm((current) => ({ ...current, value: Number(event.target.value) }))} className={fieldClass} placeholder="Valor" />
        <input value={form.description ?? ""} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className={fieldClass} placeholder="Descricao" />
      </ManagementModal>

      <ConfirmDelete isOpen={deleteTarget !== null} title={`Excluir aporte de ${formatCurrency(deleteTarget?.value ?? 0)}?`} onCancel={() => setDeleteTarget(null)} onConfirm={() => void confirmDelete()} />
    </div>
  );
}
