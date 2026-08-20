import { FormEvent, useEffect, useMemo, useState } from "react";
import { ConfirmDelete, ManagementField, fieldClass, areaClass, ManagementModal, ManagementTable, ManagementToolbar, RowActions } from "../components/ui/Management";
import { PageHeader } from "../components/ui/PageHeader";
import { MobileDataCard } from "../components/ui/Responsive";
import { MoneyValue } from "../components/ui/ValueDisplay";
import { useWorkspaceInvalidation } from "../hooks/useWorkspaceInvalidation";
import { assetRecordsApi, operationRecordsApi } from "../services/api";
import type { AssetRecord, OperationRecord, OperationType } from "../types/management";
import { formatCurrency } from "../utils/formatters";

type OperationFormState = {
  assetTicker: string;
  type: OperationType;
  quantity: string;
  price: string;
  fees: string;
  date: string;
  notes: string;
};

const emptyOperationForm: OperationFormState = {
  assetTicker: "",
  type: "COMPRA",
  quantity: "",
  price: "",
  fees: "",
  date: new Date().toISOString().slice(0, 10),
  notes: ""
};

function formatOperationNumber(value?: number | null, decimals = 6) {
  if (!Number.isFinite(value)) return "";
  const formatted = Number(value).toFixed(decimals);
  return decimals > 2 ? formatted.replace(/\.?0+$/, "") : formatted;
}

function parsePositiveNumberInput(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function operationIdentity(operation: OperationRecord) {
  return operation.id ?? `${operation.type}-${operation.date}-${operation.assetTicker}`;
}

function sortOperations(items: OperationRecord[]) {
  return [...items].sort((left, right) => {
    const byDate = new Date(String(right.date)).getTime() - new Date(String(left.date)).getTime();
    if (byDate !== 0) return byDate;
    return `${left.assetTicker}-${left.type}`.localeCompare(`${right.assetTicker}-${right.type}`, "pt-BR");
  });
}

export function OperationsPage() {
  const [operations, setOperations] = useState<OperationRecord[]>([]);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("Todos");
  const [editing, setEditing] = useState<OperationRecord | null>(null);
  const [form, setForm] = useState<OperationFormState>(emptyOperationForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OperationRecord | null>(null);
  const [formError, setFormError] = useState("");

  async function loadData() {
    const [operationData, assetData] = await Promise.all([operationRecordsApi.list(), assetRecordsApi.list()]);
    setOperations(sortOperations(operationData));
    setAssets(assetData);
  }

  useEffect(() => {
    void loadData();
  }, []);

  useWorkspaceInvalidation(["operations", "assets", "portfolio"], () => loadData());

  const types = useMemo(() => ["Todos", ...Array.from(new Set(operations.map((operation) => operation.type)))], [operations]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return operations.filter((operation) => {
      const matchesSearch = [operation.assetTicker, operation.type, operation.notes].some((value) => value?.toLowerCase().includes(term));
      const matchesType = type === "Todos" || operation.type === type;
      return matchesSearch && matchesType;
    });
  }, [operations, search, type]);

  function openCreate() {
    setEditing(null);
    setForm(emptyOperationForm);
    setFormError("");
    setIsModalOpen(true);
  }

  function openEdit(operation: OperationRecord) {
    setEditing(operation);
    setForm({
      assetTicker: operation.assetTicker ?? "",
      type: operation.type,
      quantity: formatOperationNumber(operation.quantity, 6),
      price: formatOperationNumber(operation.price, 2),
      fees: formatOperationNumber(operation.fees, 2),
      date: String(operation.date).slice(0, 10),
      notes: operation.notes ?? ""
    });
    setFormError("");
    setIsModalOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = parsePositiveNumberInput(form.quantity);
    const price = parsePositiveNumberInput(form.price);
    const fees = parsePositiveNumberInput(form.fees) ?? 0;
    const assetTicker = form.assetTicker.trim().toUpperCase();

    if (!form.date) {
      setFormError("Selecione a data da operacao.");
      return;
    }
    if (!assetTicker) {
      setFormError("Selecione o ativo da operacao.");
      return;
    }
    if (!quantity || quantity <= 0) {
      setFormError("Informe uma quantidade maior que zero.");
      return;
    }
    if (!price || price <= 0) {
      setFormError("Informe o preco unitario da operacao.");
      return;
    }

    const asset = assets.find((item) => item.ticker === form.assetTicker);
    const payload: OperationRecord = {
      assetId: asset?.id,
      assetTicker,
      type: form.type,
      quantity,
      price,
      fees: Math.max(fees, 0),
      totalValue: quantity * price,
      date: form.date,
      notes: form.notes.trim()
    };
    const saved = editing?.id
      ? await operationRecordsApi.update(editing.id, payload)
      : await operationRecordsApi.create(payload);

    setOperations((current) => sortOperations([...current.filter((operation) => operationIdentity(operation) !== operationIdentity(saved)), saved]));
    setIsModalOpen(false);
    setEditing(null);
    setForm(emptyOperationForm);
    setFormError("");
  }

  async function confirmDelete() {
    if (!deleteTarget?.id) return;
    await operationRecordsApi.remove(deleteTarget.id);
    setOperations((current) => current.filter((operation) => operationIdentity(operation) !== operationIdentity(deleteTarget)));
    setDeleteTarget(null);
  }

  return (
    <div>
      <PageHeader eyebrow="Operacoes" title="Gerenciar operacoes" description="Compras, vendas, eventos e movimentacoes que alimentam os calculos." />
      <ManagementToolbar
        search={search}
        onSearchChange={setSearch}
        filter={type}
        onFilterChange={setType}
        filterOptions={types}
        onCreate={openCreate}
        searchPlaceholder="Pesquise por ativo, tipo de operacao ou observacao"
        searchLabel="Pesquisar operacoes"
        filterLabel="Filtrar operacoes por tipo"
        createLabel="Nova operacao"
      />
      <ManagementTable
        columns={["Data", "Tipo", "Ativo", "Quantidade", "Preco", "Taxas", "Total"]}
        rows={filtered}
        getKey={(operation) => operation.id ?? `${operation.type}-${operation.date}-${operation.assetTicker}`}
        renderMobileCard={(operation) => (
          <MobileDataCard
            title={`${operation.type} ${operation.assetTicker}`}
            subtitle={new Date(operation.date).toLocaleDateString("pt-BR")}
            badge={<span className="text-accent"><MoneyValue value={formatCurrency(operation.totalValue)} /></span>}
          >
            <div className="mobile-metric-grid text-sm">
              <div className="rounded-lg bg-elevated px-3 py-2">
                <p className="text-xs text-muted">Quantidade</p>
                <p className="font-medium text-ink">{operation.quantity}</p>
              </div>
              <div className="rounded-lg bg-elevated px-3 py-2">
                <p className="text-xs text-muted">Preco</p>
                <p className="min-w-0 font-medium text-ink">
                  <MoneyValue value={formatCurrency(operation.price)} />
                </p>
              </div>
              <div className="rounded-lg bg-elevated px-3 py-2">
                <p className="text-xs text-muted">Taxas</p>
                <p className="min-w-0 font-medium text-ink">
                  <MoneyValue value={formatCurrency(operation.fees)} />
                </p>
              </div>
              <div className="rounded-lg bg-elevated px-3 py-2">
                <p className="text-xs text-muted">Total</p>
                <p className="min-w-0 font-medium text-accent">
                  <MoneyValue value={formatCurrency(operation.totalValue)} />
                </p>
              </div>
            </div>
            {operation.notes ? <p className="mt-3 break-words text-sm text-muted">{operation.notes}</p> : null}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => openEdit(operation)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink">
                Editar
              </button>
              <button type="button" onClick={() => setDeleteTarget(operation)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-rose/50 hover:text-rose">
                Excluir
              </button>
            </div>
          </MobileDataCard>
        )}
        renderRow={(operation) => (
          <>
            <td className="py-3">{new Date(operation.date).toLocaleDateString("pt-BR")}</td>
            <td className="py-3">{operation.type}</td>
            <td className="py-3 font-medium text-ink">{operation.assetTicker}</td>
            <td className="py-3">{operation.quantity}</td>
            <td className="py-3 text-right"><MoneyValue value={formatCurrency(operation.price)} size="table" /></td>
            <td className="py-3 text-right"><MoneyValue value={formatCurrency(operation.fees)} size="table" /></td>
            <td className="py-3 text-right"><MoneyValue value={formatCurrency(operation.totalValue)} size="table" /></td>
            <RowActions onEdit={() => openEdit(operation)} onDelete={() => setDeleteTarget(operation)} />
          </>
        )}
      />
      <ManagementModal
        title={editing ? "Editar operacao" : "Nova operacao"}
        description="Informe os dados reais da movimentacao. O valor total continua sendo calculado automaticamente pela regra atual do formulario."
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmit}
      >
        <ManagementField label="Data da operacao" required>
          <input autoFocus type="date" value={String(form.date).slice(0, 10)} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} className={fieldClass} />
        </ManagementField>
        <ManagementField label="Tipo de operacao" required>
          <select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as OperationType }))} className={fieldClass}>
            <option value="COMPRA">Compra</option>
            <option value="VENDA">Venda</option>
            <option value="BONIFICACAO">Bonificacao</option>
            <option value="DESDOBRAMENTO">Desdobramento</option>
            <option value="GRUPAMENTO">Grupamento</option>
          </select>
        </ManagementField>
        <ManagementField label="Ativo" required helperText="Selecione o ticker cadastrado para registrar esta operacao.">
          <select value={form.assetTicker} onChange={(event) => setForm((current) => ({ ...current, assetTicker: event.target.value }))} className={fieldClass}>
            <option value="">Selecione o ativo</option>
            {assets.map((asset) => <option key={asset.ticker} value={asset.ticker}>{asset.ticker}</option>)}
          </select>
        </ManagementField>
        <div className="grid gap-3 sm:grid-cols-2">
          <ManagementField label="Quantidade" required helperText="Use casas decimais quando a operacao permitir fracoes.">
            <input type="number" min="0" step="0.000001" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} className={fieldClass} placeholder="Ex.: 10" />
          </ManagementField>
          <ManagementField label="Preco unitario" required helperText="Informe o preco pago ou recebido por unidade.">
            <input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} className={fieldClass} placeholder="Ex.: 12,50" />
          </ManagementField>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ManagementField label="Taxas" optional helperText="Corretagem, emolumentos ou custos adicionais da operacao.">
            <input type="number" min="0" step="0.01" value={form.fees} onChange={(event) => setForm((current) => ({ ...current, fees: event.target.value }))} className={fieldClass} placeholder="Informe as taxas, se houver" />
          </ManagementField>
          <ManagementField label="Valor total" helperText="Calculado automaticamente por quantidade x preco unitario, mantendo a regra atual do formulario.">
            <input type="text" value={formatCurrency((parsePositiveNumberInput(form.quantity) ?? 0) * (parsePositiveNumberInput(form.price) ?? 0))} readOnly className={fieldClass} />
          </ManagementField>
        </div>
        <ManagementField label="Observacoes" optional helperText="Adicione alguma informacao sobre esta operacao, se necessario.">
          <textarea value={form.notes ?? ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className={areaClass} placeholder="Ex.: compra manual para reforco da posicao" />
        </ManagementField>
        {formError ? <p className="rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-sm text-rose">{formError}</p> : null}
      </ManagementModal>
      <ConfirmDelete
        isOpen={deleteTarget !== null}
        title="Excluir operacao?"
        description="Voce esta prestes a remover esta operacao do historico financeiro."
        details={[
          `${deleteTarget?.type ?? "Operacao"} de ${deleteTarget?.assetTicker ?? "ativo"}`,
          `${deleteTarget ? formatCurrency(deleteTarget.totalValue) : "-"}`,
          deleteTarget ? new Date(deleteTarget.date).toLocaleDateString("pt-BR") : "-"
        ]}
        confirmLabel="Excluir operacao"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
