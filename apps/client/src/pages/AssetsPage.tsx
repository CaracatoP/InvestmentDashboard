import { FormEvent, useEffect, useMemo, useState } from "react";
import { ConfirmDelete, fieldClass, ManagementModal, ManagementTable, ManagementToolbar, RowActions } from "../components/ui/Management";
import { PageHeader } from "../components/ui/PageHeader";
import { assetRecordsApi } from "../services/api";
import { useInvestmentStore } from "../stores/useInvestmentStore";
import type { AssetCategory, AssetRecord } from "../types/management";

const emptyAsset: AssetRecord = {
  name: "",
  ticker: "",
  category: "FII",
  subcategory: "",
  sector: "",
  currency: "BRL",
  active: true
};

export function AssetsPage() {
  const loadWorkspace = useInvestmentStore((state) => state.loadWorkspace);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [editing, setEditing] = useState<AssetRecord | null>(null);
  const [form, setForm] = useState<AssetRecord>(emptyAsset);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AssetRecord | null>(null);

  async function loadAssets() {
    setAssets(await assetRecordsApi.list());
  }

  useEffect(() => {
    void loadAssets();
  }, []);

  const categories = useMemo(() => ["Todos", ...Array.from(new Set(assets.map((asset) => asset.category)))], [assets]);
  const filteredAssets = useMemo(() => {
    const term = search.trim().toLowerCase();
    return assets.filter((asset) => {
      const matchesSearch = [asset.name, asset.ticker, asset.sector, asset.subcategory].some((value) => value?.toLowerCase().includes(term));
      const matchesCategory = category === "Todos" || asset.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [assets, category, search]);

  function openCreate() {
    setEditing(null);
    setForm(emptyAsset);
    setIsModalOpen(true);
  }

  function openEdit(asset: AssetRecord) {
    setEditing(asset);
    setForm(asset);
    setIsModalOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = { ...form, ticker: form.ticker.toUpperCase() };
    if (editing?.id || editing?.ticker) {
      await assetRecordsApi.update(editing.id ?? editing.ticker, payload);
    } else {
      await assetRecordsApi.create(payload);
    }
    setEditing(null);
    setForm(emptyAsset);
    setIsModalOpen(false);
    await Promise.all([loadAssets(), loadWorkspace()]);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await assetRecordsApi.remove(deleteTarget.id ?? deleteTarget.ticker);
    setDeleteTarget(null);
    await Promise.all([loadAssets(), loadWorkspace()]);
  }

  return (
    <div>
      <PageHeader eyebrow="Ativos" title="Gerenciar ativos" description="Cadastre e mantenha os ativos usados nos calculos da carteira." />
      <ManagementToolbar search={search} onSearchChange={setSearch} filter={category} onFilterChange={setCategory} filterOptions={categories} onCreate={openCreate} />
      <ManagementTable
        columns={["Nome", "Ticker", "Categoria", "Subcategoria", "Setor", "Moeda"]}
        rows={filteredAssets}
        getKey={(asset) => asset.id ?? asset.ticker}
        renderRow={(asset) => (
          <>
            <td className="py-3 font-medium text-ink">{asset.name}</td>
            <td className="py-3">{asset.ticker}</td>
            <td className="py-3">{asset.category}</td>
            <td className="py-3">{asset.subcategory}</td>
            <td className="py-3">{asset.sector}</td>
            <td className="py-3">{asset.currency}</td>
            <RowActions onEdit={() => openEdit(asset)} onDelete={() => setDeleteTarget(asset)} />
          </>
        )}
      />

      <ManagementModal title={editing ? "Editar ativo" : "Novo ativo"} isOpen={isModalOpen} onClose={() => { setEditing(null); setForm(emptyAsset); setIsModalOpen(false); }} onSubmit={handleSubmit}>
        <input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className={fieldClass} placeholder="Nome" />
        <input required value={form.ticker} onChange={(event) => setForm((current) => ({ ...current, ticker: event.target.value.toUpperCase() }))} className={fieldClass} placeholder="Ticker" />
        <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as AssetCategory }))} className={fieldClass}>
          <option value="FII">FII</option>
          <option value="ACAO">ACAO</option>
          <option value="ETF">ETF</option>
          <option value="CRIPTO">CRIPTO</option>
          <option value="RENDA_FIXA">RENDA_FIXA</option>
        </select>
        <input value={form.subcategory ?? ""} onChange={(event) => setForm((current) => ({ ...current, subcategory: event.target.value }))} className={fieldClass} placeholder="Subcategoria" />
        <input value={form.sector ?? ""} onChange={(event) => setForm((current) => ({ ...current, sector: event.target.value }))} className={fieldClass} placeholder="Setor" />
        <input value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} className={fieldClass} placeholder="Moeda" />
      </ManagementModal>

      <ConfirmDelete isOpen={deleteTarget !== null} title={`Excluir ${deleteTarget?.ticker ?? "ativo"}?`} onCancel={() => setDeleteTarget(null)} onConfirm={() => void confirmDelete()} />
    </div>
  );
}
