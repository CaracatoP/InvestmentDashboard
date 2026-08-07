import { FormEvent, KeyboardEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye } from "lucide-react";
import { ConfirmDelete, fieldClass, ManagementModal, ManagementTable, ManagementToolbar, RowActions } from "../components/ui/Management";
import { PageHeader } from "../components/ui/PageHeader";
import { MobileDataCard } from "../components/ui/Responsive";
import { useWorkspaceInvalidation } from "../hooks/useWorkspaceInvalidation";
import { assetRecordsApi } from "../services/api";
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

function assetIdentity(asset: AssetRecord) {
  return asset.id ?? asset.ticker;
}

function sortAssets(items: AssetRecord[]) {
  return [...items].sort((left, right) => left.ticker.localeCompare(right.ticker, "pt-BR"));
}

export function AssetsPage() {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [editing, setEditing] = useState<AssetRecord | null>(null);
  const [form, setForm] = useState<AssetRecord>(emptyAsset);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AssetRecord | null>(null);

  async function loadAssets() {
    setAssets(sortAssets(await assetRecordsApi.list()));
  }

  useEffect(() => {
    void loadAssets();
  }, []);

  useWorkspaceInvalidation(["assets", "portfolio"], () => loadAssets());

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

  function assetDetailsPath(asset: AssetRecord) {
    return `/ativos/${asset.ticker}`;
  }

  function openDetails(asset: AssetRecord) {
    navigate(assetDetailsPath(asset));
  }

  function isInteractiveTarget(target: EventTarget | null) {
    return target instanceof HTMLElement && Boolean(target.closest("a,button,input,select,textarea"));
  }

  function handleRowClick(asset: AssetRecord, event: MouseEvent<HTMLTableRowElement>) {
    if (isInteractiveTarget(event.target)) return;
    openDetails(asset);
  }

  function handleRowKeyDown(asset: AssetRecord, event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    openDetails(asset);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = { ...form, ticker: form.ticker.toUpperCase() };
    const saved = editing?.id || editing?.ticker
      ? await assetRecordsApi.update(editing.id ?? editing.ticker, payload)
      : await assetRecordsApi.create(payload);

    setAssets((current) => sortAssets([...current.filter((asset) => assetIdentity(asset) !== assetIdentity(saved)), saved]));
    setEditing(null);
    setForm(emptyAsset);
    setIsModalOpen(false);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await assetRecordsApi.remove(deleteTarget.id ?? deleteTarget.ticker);
    setAssets((current) => current.filter((asset) => assetIdentity(asset) !== assetIdentity(deleteTarget)));
    setDeleteTarget(null);
  }

  return (
    <div>
      <PageHeader eyebrow="Ativos" title="Gerenciar ativos" description="Cadastre e mantenha os ativos usados nos calculos da carteira." />
      <ManagementToolbar search={search} onSearchChange={setSearch} filter={category} onFilterChange={setCategory} filterOptions={categories} onCreate={openCreate} />
      <ManagementTable
        columns={["Nome", "Ticker", "Categoria", "Subcategoria", "Setor", "Moeda"]}
        rows={filteredAssets}
        getKey={(asset) => asset.id ?? asset.ticker}
        getRowProps={(asset) => ({
          onClick: (event) => handleRowClick(asset, event),
          onKeyDown: (event) => handleRowKeyDown(asset, event),
          tabIndex: 0,
          role: "link",
          "aria-label": `Abrir detalhes de ${asset.ticker}`,
          className: "cursor-pointer transition hover:bg-elevated/40 focus-visible:bg-elevated/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        })}
        renderMobileCard={(asset) => (
          <MobileDataCard
            title={
              <Link
                to={assetDetailsPath(asset)}
                className="rounded-sm transition hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                aria-label={`Ver detalhes de ${asset.ticker}`}
              >
                {asset.ticker}
              </Link>
            }
            subtitle={
              <Link
                to={assetDetailsPath(asset)}
                className="rounded-sm transition hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                aria-label={`Ver detalhes de ${asset.name}`}
              >
                {asset.name}
              </Link>
            }
            badge={asset.currency}
          >
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-elevated px-3 py-2">
                <p className="text-xs text-muted">Categoria</p>
                <p className="font-medium text-ink">{asset.category}</p>
              </div>
              <div className="rounded-lg bg-elevated px-3 py-2">
                <p className="text-xs text-muted">Subcategoria</p>
                <p className="break-words font-medium text-ink">{asset.subcategory || "-"}</p>
              </div>
              <div className="rounded-lg bg-elevated px-3 py-2">
                <p className="text-xs text-muted">Setor</p>
                <p className="break-words font-medium text-ink">{asset.sector || "-"}</p>
              </div>
              <div className="rounded-lg bg-elevated px-3 py-2">
                <p className="text-xs text-muted">Moeda</p>
                <p className="font-medium text-ink">{asset.currency}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <Link
                to={assetDetailsPath(asset)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-ink transition hover:border-accent/50 focus-visible:border-accent focus-visible:outline-none"
                aria-label={`Ver detalhes de ${asset.ticker}`}
              >
                <Eye size={15} />
                Ver detalhes
              </Link>
              <button type="button" onClick={() => openEdit(asset)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink focus-visible:border-accent focus-visible:outline-none">
                Editar
              </button>
              <button type="button" onClick={() => setDeleteTarget(asset)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-rose/50 hover:text-rose focus-visible:border-rose focus-visible:outline-none">
                Excluir
              </button>
            </div>
          </MobileDataCard>
        )}
        renderRow={(asset) => (
          <>
            <td className="py-3 font-medium text-ink">
              <Link
                to={assetDetailsPath(asset)}
                className="rounded-sm transition hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                aria-label={`Ver detalhes de ${asset.name}`}
              >
                {asset.name}
              </Link>
            </td>
            <td className="py-3">
              <Link
                to={assetDetailsPath(asset)}
                className="rounded-sm font-medium text-ink transition hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                aria-label={`Ver detalhes de ${asset.ticker}`}
              >
                {asset.ticker}
              </Link>
            </td>
            <td className="py-3">{asset.category}</td>
            <td className="py-3">{asset.subcategory}</td>
            <td className="py-3">{asset.sector}</td>
            <td className="py-3">{asset.currency}</td>
            <RowActions
              onView={() => openDetails(asset)}
              onEdit={() => openEdit(asset)}
              onDelete={() => setDeleteTarget(asset)}
              viewLabel={`Ver detalhes de ${asset.ticker}`}
              editLabel={`Editar ${asset.ticker}`}
              deleteLabel={`Excluir ${asset.ticker}`}
              viewIcon={<Eye size={15} />}
            />
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
