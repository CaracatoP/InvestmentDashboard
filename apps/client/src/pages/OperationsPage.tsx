import { FormEvent, useEffect, useMemo, useState } from "react";
import { ConfirmDelete, fieldClass, ManagementModal, ManagementTable, ManagementToolbar, RowActions } from "../components/ui/Management";
import { PageHeader } from "../components/ui/PageHeader";
import { MobileDataCard } from "../components/ui/Responsive";
import { MoneyValue } from "../components/ui/ValueDisplay";
import { assetRecordsApi, operationRecordsApi } from "../services/api";
import { useInvestmentStore } from "../stores/useInvestmentStore";
import type { AssetRecord, OperationRecord, OperationType } from "../types/management";
import { formatCurrency } from "../utils/formatters";

const emptyOperation: OperationRecord = {
  assetTicker: "",
  type: "COMPRA",
  quantity: 0,
  price: 0,
  fees: 0,
  totalValue: 0,
  date: new Date().toISOString().slice(0, 10),
  notes: ""
};

export function OperationsPage() {
  const loadWorkspace = useInvestmentStore((state) => state.loadWorkspace);
  const [operations, setOperations] = useState<OperationRecord[]>([]);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("Todos");
  const [editing, setEditing] = useState<OperationRecord | null>(null);
  const [form, setForm] = useState<OperationRecord>(emptyOperation);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OperationRecord | null>(null);

  async function loadData() {
    const [operationData, assetData] = await Promise.all([operationRecordsApi.list(), assetRecordsApi.list()]);
    setOperations(operationData);
    setAssets(assetData);
  }

  useEffect(() => {
    void loadData();
  }, []);

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
    setForm(emptyOperation);
    setIsModalOpen(true);
  }

  function openEdit(operation: OperationRecord) {
    setEditing(operation);
    setForm({ ...operation, date: String(operation.date).slice(0, 10) });
    setIsModalOpen(true);
  }

  useEffect(() => {
    setForm((current) => ({ ...current, totalValue: current.quantity * current.price }));
  }, [form.quantity, form.price]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const asset = assets.find((item) => item.ticker === form.assetTicker);
    const payload = { ...form, assetId: asset?.id, assetTicker: form.assetTicker?.toUpperCase(), totalValue: form.quantity * form.price };
    if (editing?.id) await operationRecordsApi.update(editing.id, payload);
    else await operationRecordsApi.create(payload);
    setIsModalOpen(false);
    await Promise.all([loadData(), loadWorkspace()]);
  }

  async function confirmDelete() {
    if (!deleteTarget?.id) return;
    await operationRecordsApi.remove(deleteTarget.id);
    setDeleteTarget(null);
    await Promise.all([loadData(), loadWorkspace()]);
  }

  return (
    <div>
      <PageHeader eyebrow="Operacoes" title="Gerenciar operacoes" description="Compras, vendas, eventos e movimentacoes que alimentam os calculos." />
      <ManagementToolbar search={search} onSearchChange={setSearch} filter={type} onFilterChange={setType} filterOptions={types} onCreate={openCreate} />
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
      <ManagementModal title={editing ? "Editar operacao" : "Nova operacao"} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleSubmit}>
        <input type="date" value={String(form.date).slice(0, 10)} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} className={fieldClass} />
        <select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as OperationType }))} className={fieldClass}>
          {["COMPRA", "VENDA", "BONIFICACAO", "DESDOBRAMENTO", "GRUPAMENTO"].map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={form.assetTicker ?? ""} onChange={(event) => setForm((current) => ({ ...current, assetTicker: event.target.value }))} className={fieldClass}>
          <option value="">Ativo</option>
          {assets.map((asset) => <option key={asset.ticker} value={asset.ticker}>{asset.ticker}</option>)}
        </select>
        <input type="number" min="0" step="0.000001" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: Number(event.target.value) }))} className={fieldClass} placeholder="Quantidade" />
        <input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm((current) => ({ ...current, price: Number(event.target.value) }))} className={fieldClass} placeholder="Preco" />
        <input type="number" min="0" step="0.01" value={form.fees} onChange={(event) => setForm((current) => ({ ...current, fees: Number(event.target.value) }))} className={fieldClass} placeholder="Taxas" />
        <input type="number" min="0" step="0.01" value={form.totalValue} readOnly className={fieldClass} placeholder="Valor total" />
        <textarea value={form.notes ?? ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-24 w-full rounded-lg border border-line bg-elevated px-3 py-2 text-base text-ink outline-none focus:border-accent sm:text-sm" placeholder="Observacao" />
      </ManagementModal>
      <ConfirmDelete isOpen={deleteTarget !== null} title={`Excluir operacao ${deleteTarget?.type ?? ""}?`} onCancel={() => setDeleteTarget(null)} onConfirm={() => void confirmDelete()} />
    </div>
  );
}
