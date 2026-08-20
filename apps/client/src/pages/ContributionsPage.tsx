import { FormEvent, useEffect, useMemo, useState } from "react";
import { ConfirmDelete, ManagementField, fieldClass, ManagementModal, ManagementTable, ManagementToolbar, RowActions } from "../components/ui/Management";
import { PageHeader } from "../components/ui/PageHeader";
import { MobileDataCard } from "../components/ui/Responsive";
import { MoneyValue } from "../components/ui/ValueDisplay";
import { useWorkspaceInvalidation } from "../hooks/useWorkspaceInvalidation";
import { contributionRecordsApi } from "../services/api";
import type { ContributionRecord } from "../types/management";
import { formatCurrency } from "../utils/formatters";

type ContributionFormState = {
  date: string;
  value: string;
  description: string;
};

const emptyContributionForm: ContributionFormState = {
  date: new Date().toISOString().slice(0, 10),
  value: "",
  description: ""
};

function parseContributionValue(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function contributionIdentity(contribution: ContributionRecord) {
  return contribution.id ?? `${contribution.date}-${contribution.value}-${contribution.description ?? ""}`;
}

function sortContributions(items: ContributionRecord[]) {
  return [...items].sort((left, right) => {
    const byDate = new Date(String(right.date)).getTime() - new Date(String(left.date)).getTime();
    if (byDate !== 0) return byDate;
    return (right.value ?? 0) - (left.value ?? 0);
  });
}

export function ContributionsPage() {
  const [contributions, setContributions] = useState<ContributionRecord[]>([]);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("Todos");
  const [editing, setEditing] = useState<ContributionRecord | null>(null);
  const [form, setForm] = useState<ContributionFormState>(emptyContributionForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ContributionRecord | null>(null);
  const [formError, setFormError] = useState("");

  async function loadContributions() {
    setContributions(sortContributions(await contributionRecordsApi.list()));
  }

  useEffect(() => {
    void loadContributions();
  }, []);

  useWorkspaceInvalidation(["contributions"], () => loadContributions());

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
    setForm(emptyContributionForm);
    setFormError("");
    setIsModalOpen(true);
  }

  function openEdit(contribution: ContributionRecord) {
    setEditing(contribution);
    setForm({
      date: String(contribution.date).slice(0, 10),
      value: contribution.value ? String(contribution.value) : "",
      description: contribution.description ?? ""
    });
    setFormError("");
    setIsModalOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedValue = parseContributionValue(form.value);
    const description = form.description.trim();

    if (!form.date) {
      setFormError("Selecione a data do aporte.");
      return;
    }
    if (!parsedValue || parsedValue <= 0) {
      setFormError("Informe um valor de aporte maior que zero.");
      return;
    }

    const payload: ContributionRecord = {
      date: form.date,
      value: parsedValue,
      description
    };
    const saved = editing?.id
      ? await contributionRecordsApi.update(editing.id, payload)
      : await contributionRecordsApi.create(payload);

    setContributions((current) => sortContributions([...current.filter((contribution) => contributionIdentity(contribution) !== contributionIdentity(saved)), saved]));
    setIsModalOpen(false);
    setEditing(null);
    setForm(emptyContributionForm);
    setFormError("");
  }

  async function confirmDelete() {
    if (!deleteTarget?.id) return;
    await contributionRecordsApi.remove(deleteTarget.id);
    setContributions((current) => current.filter((contribution) => contributionIdentity(contribution) !== contributionIdentity(deleteTarget)));
    setDeleteTarget(null);
  }

  return (
    <div>
      <PageHeader eyebrow="Aportes" title="Gerenciar aportes" description="Cadastre, edite e acompanhe cada aporte registrado." />
      <ManagementToolbar
        search={search}
        onSearchChange={setSearch}
        filter={period}
        onFilterChange={setPeriod}
        filterOptions={periods}
        onCreate={openCreate}
        searchPlaceholder="Pesquise por descricao ou data do aporte"
        searchLabel="Pesquisar aportes"
        filterLabel="Filtrar aportes por periodo"
        createLabel="Novo aporte"
      />
      <ManagementTable
        columns={["Data", "Valor", "Descricao"]}
        rows={filtered}
        getKey={(contribution) => contribution.id ?? `${contribution.date}-${contribution.value}`}
        renderMobileCard={(contribution) => (
          <MobileDataCard
            title={<MoneyValue value={formatCurrency(contribution.value)} size="card" />}
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
            <td className="py-3 text-right font-medium text-accent">
              <MoneyValue value={formatCurrency(contribution.value)} size="table" />
            </td>
            <td className="py-3">{contribution.description}</td>
            <RowActions onEdit={() => openEdit(contribution)} onDelete={() => setDeleteTarget(contribution)} />
          </>
        )}
      />

      <ManagementModal
        title={editing ? "Editar aporte" : "Novo aporte"}
        description="Registre quando e quanto voce aportou para manter o historico da carteira consistente."
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmit}
      >
        <ManagementField label="Data do aporte" required>
          <input autoFocus type="date" required value={String(form.date).slice(0, 10)} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} className={fieldClass} />
        </ManagementField>
        <ManagementField label="Valor do aporte" required helperText="Informe o valor efetivamente investido neste aporte.">
          <input type="number" min="0" step="0.01" required value={form.value} onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} className={fieldClass} placeholder="Ex.: 1000,00" />
        </ManagementField>
        <ManagementField label="Descricao" optional helperText="Ex.: aporte mensal, reforco da reserva ou investimento extra.">
          <input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className={fieldClass} placeholder="Descreva este aporte, se necessario" />
        </ManagementField>
        {formError ? <p className="rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-sm text-rose">{formError}</p> : null}
      </ManagementModal>

      <ConfirmDelete
        isOpen={deleteTarget !== null}
        title="Excluir aporte?"
        description="Voce esta prestes a remover este aporte do historico da carteira."
        details={[
          deleteTarget ? formatCurrency(deleteTarget.value) : "-",
          deleteTarget ? new Date(deleteTarget.date).toLocaleDateString("pt-BR") : "-",
          deleteTarget?.description?.trim() || "Sem descricao"
        ]}
        confirmLabel="Excluir aporte"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
