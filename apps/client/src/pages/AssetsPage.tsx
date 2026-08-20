import { FormEvent, KeyboardEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye } from "lucide-react";
import { ConfirmDelete, ManagementField, fieldClass, ManagementModal, ManagementTable, ManagementToolbar, RowActions } from "../components/ui/Management";
import { PageHeader } from "../components/ui/PageHeader";
import { MobileDataCard } from "../components/ui/Responsive";
import { useWorkspaceInvalidation } from "../hooks/useWorkspaceInvalidation";
import { assetRecordsApi } from "../services/api";
import type { AssetCategory, AssetRecord, CryptoAssetSearchResult } from "../types/management";

const emptyAsset: AssetRecord = {
  name: "",
  ticker: "",
  category: "FII",
  coingeckoId: "",
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
  const [cryptoSearch, setCryptoSearch] = useState("");
  const [cryptoResults, setCryptoResults] = useState<CryptoAssetSearchResult[]>([]);
  const [isCryptoSearching, setIsCryptoSearching] = useState(false);
  const [cryptoSearchError, setCryptoSearchError] = useState("");

  const isCryptoCategory = form.category === "CRIPTO";

  async function loadAssets() {
    setAssets(sortAssets(await assetRecordsApi.list()));
  }

  useEffect(() => {
    void loadAssets();
  }, []);

  useWorkspaceInvalidation(["assets", "portfolio"], () => loadAssets());

  useEffect(() => {
    if (!isModalOpen || !isCryptoCategory) {
      setCryptoResults([]);
      setIsCryptoSearching(false);
      setCryptoSearchError("");
      return;
    }

    const query = cryptoSearch.trim();
    if (query.length < 2) {
      setCryptoResults([]);
      setIsCryptoSearching(false);
      setCryptoSearchError("");
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setIsCryptoSearching(true);
      setCryptoSearchError("");

      try {
        const results = await assetRecordsApi.searchCrypto(query);
        if (cancelled) return;
        setCryptoResults(results);
      } catch (error) {
        if (cancelled) return;
        setCryptoResults([]);
        setCryptoSearchError(error instanceof Error ? error.message : "Nao foi possivel buscar criptomoedas.");
      } finally {
        if (!cancelled) setIsCryptoSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [cryptoSearch, isCryptoCategory, isModalOpen]);

  const categories = useMemo(() => ["Todos", ...Array.from(new Set(assets.map((asset) => asset.category)))], [assets]);
  const filteredAssets = useMemo(() => {
    const term = search.trim().toLowerCase();
    return assets.filter((asset) => {
      const matchesSearch = [asset.name, asset.ticker, asset.coingeckoId, asset.sector, asset.subcategory].some((value) => value?.toLowerCase().includes(term));
      const matchesCategory = category === "Todos" || asset.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [assets, category, search]);

  function resetCryptoSearch() {
    setCryptoSearch("");
    setCryptoResults([]);
    setIsCryptoSearching(false);
    setCryptoSearchError("");
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyAsset);
    resetCryptoSearch();
    setIsModalOpen(true);
  }

  function openEdit(asset: AssetRecord) {
    setEditing(asset);
    setForm({
      ...asset,
      coingeckoId: asset.coingeckoId ?? ""
    });
    setCryptoSearch(asset.category === "CRIPTO" ? asset.name : "");
    setCryptoResults([]);
    setCryptoSearchError("");
    setIsModalOpen(true);
  }

  function selectCryptoResult(result: CryptoAssetSearchResult) {
    setForm((current) => ({
      ...current,
      name: result.name,
      ticker: result.symbol,
      coingeckoId: result.coingeckoId,
      currency: "BRL"
    }));
    setCryptoSearch(result.name);
    setCryptoSearchError("");
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

    if (isCryptoCategory && !form.coingeckoId) {
      setCryptoSearchError("Selecione uma criptomoeda retornada pela CoinGecko antes de salvar.");
      return;
    }

    const payload: AssetRecord = {
      ...form,
      ticker: form.ticker.toUpperCase(),
      coingeckoId: form.coingeckoId?.trim().toLowerCase(),
      currency: isCryptoCategory ? "BRL" : form.currency.toUpperCase()
    };
    const saved = editing?.id || editing?.ticker
      ? await assetRecordsApi.update(editing.id ?? editing.ticker, payload)
      : await assetRecordsApi.create(payload);

    setAssets((current) => sortAssets([...current.filter((asset) => assetIdentity(asset) !== assetIdentity(saved)), saved]));
    setEditing(null);
    setForm(emptyAsset);
    resetCryptoSearch();
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
      <ManagementToolbar
        search={search}
        onSearchChange={setSearch}
        filter={category}
        onFilterChange={setCategory}
        filterOptions={categories}
        onCreate={openCreate}
        searchPlaceholder="Pesquise por nome, ticker, setor ou CoinGecko ID"
        searchLabel="Pesquisar ativos"
        filterLabel="Filtrar ativos por categoria"
        createLabel="Novo ativo"
      />
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
            {asset.coingeckoId ? <p className="mt-3 text-xs text-muted">CoinGecko ID: <span className="font-medium text-ink">{asset.coingeckoId}</span></p> : null}
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

      <ManagementModal
        title={editing ? "Editar ativo" : "Novo ativo"}
        description="Cadastre os dados basicos do ativo e, para cripto, vincule o identificador oficial retornado pela CoinGecko."
        isOpen={isModalOpen}
        onClose={() => {
          setEditing(null);
          setForm(emptyAsset);
          resetCryptoSearch();
          setIsModalOpen(false);
        }}
        onSubmit={handleSubmit}
      >
        <ManagementField label="Categoria do ativo" required>
          <select
            value={form.category}
            onChange={(event) => {
              const nextCategory = event.target.value as AssetCategory;
              setForm((current) => ({
                ...current,
                category: nextCategory,
                currency: nextCategory === "CRIPTO" ? "BRL" : current.currency,
                coingeckoId: nextCategory === "CRIPTO" ? current.coingeckoId ?? "" : ""
              }));
              if (nextCategory !== "CRIPTO") resetCryptoSearch();
            }}
            className={fieldClass}
          >
            <option value="FII">FII</option>
            <option value="ACAO">ACAO</option>
            <option value="ETF">ETF</option>
            <option value="CRIPTO">CRIPTO</option>
            <option value="RENDA_FIXA">RENDA_FIXA</option>
          </select>
        </ManagementField>

        {isCryptoCategory ? (
          <>
            <div className="rounded-2xl border border-line bg-elevated/60 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Buscar criptomoeda</p>
              <input
                value={cryptoSearch}
                onChange={(event) => setCryptoSearch(event.target.value)}
                className={`${fieldClass} mt-3`}
                placeholder="Ex.: Bitcoin ou BTC"
              />
              <p className="mt-2 text-xs text-muted">Pesquise por nome, simbolo ou CoinGecko ID. O ativo sera salvo usando o identificador oficial da CoinGecko.</p>

              {isCryptoSearching ? <p className="mt-3 text-xs text-muted">Buscando resultados...</p> : null}
              {cryptoSearchError ? <p className="mt-3 text-xs text-rose-400">{cryptoSearchError}</p> : null}

              {cryptoResults.length > 0 ? (
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                  {cryptoResults.map((result) => {
                    const selected = form.coingeckoId === result.coingeckoId;
                    return (
                      <button
                        key={result.coingeckoId}
                        type="button"
                        onClick={() => selectCryptoResult(result)}
                        className={[
                          "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition",
                          selected ? "border-accent bg-accent/10" : "border-line bg-panel hover:border-accent/40"
                        ].join(" ")}
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{result.name} <span className="text-muted">({result.symbol})</span></p>
                          <p className="truncate text-xs text-muted">{result.coingeckoId}</p>
                        </div>
                        <span className="text-xs font-medium text-accent">CoinGecko</span>
                      </button>
                    );
                  })}
                </div>
              ) : cryptoSearch.trim().length >= 2 && !isCryptoSearching && !cryptoSearchError ? (
                <p className="mt-3 text-xs text-muted">Nenhum criptoativo encontrado para essa busca.</p>
              ) : null}
            </div>

            <ManagementField label="Nome" required helperText="Preenchido automaticamente com base no resultado selecionado da CoinGecko.">
              <input readOnly value={form.name} className={fieldClass} placeholder="Nome retornado pela CoinGecko" />
            </ManagementField>
            <ManagementField label="Ticker" required>
              <input readOnly value={form.ticker} className={fieldClass} placeholder="Ticker retornado pela CoinGecko" />
            </ManagementField>
            <ManagementField label="CoinGecko ID" required>
              <input readOnly value={form.coingeckoId ?? ""} className={fieldClass} placeholder="Identificador oficial da CoinGecko" />
            </ManagementField>
            <ManagementField label="Moeda" required>
              <input readOnly value="BRL" className={fieldClass} placeholder="Moeda de exibicao do ativo" />
            </ManagementField>
          </>
        ) : (
          <>
            <ManagementField label="Nome" required helperText="Ex.: Vale, Tesouro Selic ou ETF internacional.">
              <input required autoFocus value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className={fieldClass} placeholder="Ex.: Vale" />
            </ManagementField>
            <ManagementField label="Ticker" required helperText="Use o ticker principal que sera referenciado nas demais telas.">
              <input required value={form.ticker} onChange={(event) => setForm((current) => ({ ...current, ticker: event.target.value.toUpperCase() }))} className={fieldClass} placeholder="Ex.: VALE3" />
            </ManagementField>
            <ManagementField label="Moeda" required>
              <input value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} className={fieldClass} placeholder="Ex.: BRL" />
            </ManagementField>
          </>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <ManagementField label="Subcategoria" optional>
            <input value={form.subcategory ?? ""} onChange={(event) => setForm((current) => ({ ...current, subcategory: event.target.value }))} className={fieldClass} placeholder="Ex.: tijolo, logistica, large caps" />
          </ManagementField>
          <ManagementField label="Setor" optional>
            <input value={form.sector ?? ""} onChange={(event) => setForm((current) => ({ ...current, sector: event.target.value }))} className={fieldClass} placeholder="Ex.: mineracao, bancos, tecnologia" />
          </ManagementField>
        </div>
      </ManagementModal>

      <ConfirmDelete
        isOpen={deleteTarget !== null}
        title="Excluir ativo?"
        description="Voce esta prestes a remover este ativo do cadastro base usado nas demais telas do Invest Hub."
        details={[
          deleteTarget?.ticker ?? "Ticker nao informado",
          deleteTarget?.name ?? "Nome nao informado",
          deleteTarget?.category ?? "Categoria nao informada"
        ]}
        confirmLabel="Excluir ativo"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
