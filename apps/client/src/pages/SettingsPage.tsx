import { Bot, Download, FileDown, RefreshCw, Save, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/ui/PageHeader";
import { ProgressBar } from "../components/ui/ProgressBar";
import { fetchAiHealth, updateAllocations } from "../services/api";
import { useInvestmentStore } from "../stores/useInvestmentStore";
import type { AiHealth } from "../types/ai";
import type { SettingsResponse } from "../types/investments";
import { exportCsv, exportJson, formatPercentage } from "../utils/formatters";

export function SettingsPage() {
  const settings = useInvestmentStore((state) => state.settings);
  const portfolio = useInvestmentStore((state) => state.portfolio);
  const loadWorkspace = useInvestmentStore((state) => state.loadWorkspace);
  const [allocations, setAllocations] = useState<SettingsResponse["allocations"]>([]);
  const [aiHealth, setAiHealth] = useState<AiHealth | null>(null);
  const [isCheckingAi, setIsCheckingAi] = useState(false);

  useEffect(() => {
    setAllocations(settings?.allocations ?? []);
  }, [settings?.allocations]);

  async function loadAiHealth() {
    setIsCheckingAi(true);
    try {
      setAiHealth(await fetchAiHealth());
    } finally {
      setIsCheckingAi(false);
    }
  }

  useEffect(() => {
    void loadAiHealth();
  }, []);

  const allocationTotal = useMemo(() => allocations.reduce((total, item) => total + item.targetPercentage, 0), [allocations]);

  async function handleSave() {
    await updateAllocations(allocations);
    await loadWorkspace();
  }

  function updateAllocation(category: string, value: number) {
    setAllocations((current) =>
      current.map((item) => (item.category === category ? { ...item, targetPercentage: value } : item))
    );
  }

  function exportPortfolioCsv() {
    exportCsv(
      "carteira.csv",
      (portfolio?.assets ?? []).map((asset) => ({
        ticker: asset.ticker,
        nome: asset.name,
        categoria: asset.category,
        quantidade: asset.quantity,
        precoMedio: asset.averagePrice,
        precoAtual: asset.currentPrice,
        valorInvestido: asset.investedValue,
        valorAtual: asset.currentValue,
        lucro: asset.profit,
        peso: asset.portfolioWeight
      }))
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Configuracoes"
        title="Preferencias, alocacao e portabilidade"
        description="Tema, moeda, carteira ideal, backup local e exportacoes para analise externa."
      />

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
        <aside className="min-w-0 space-y-4">
          <article className="min-w-0 rounded-lg border border-line bg-panel p-4 shadow-soft">
            <h2 className="text-base font-semibold text-ink">Perfil</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-elevated px-3 py-2">
                <span className="text-muted">Nome</span>
                <span className="break-words font-medium text-ink">{settings?.profile.name}</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-elevated px-3 py-2">
                <span className="text-muted">Tema</span>
                <span className="break-words font-medium text-ink">{settings?.profile.theme}</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-elevated px-3 py-2">
                <span className="text-muted">Moeda</span>
                <span className="break-words font-medium text-ink">{settings?.profile.currency}</span>
              </div>
            </div>
          </article>

          <article className="min-w-0 rounded-lg border border-line bg-panel p-4 shadow-soft">
            <h2 className="text-base font-semibold text-ink">Backup e exportacao</h2>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => exportJson("backup-investimentos.json", { settings, portfolio })}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink"
              >
                <Download size={16} />
                Backup JSON
              </button>
              <button
                type="button"
                onClick={exportPortfolioCsv}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink"
              >
                <FileDown size={16} />
                Exportar Excel
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink"
              >
                <FileDown size={16} />
                Exportar PDF
              </button>
            </div>
          </article>

          <article className="min-w-0 rounded-lg border border-line bg-panel p-4 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">Inteligencia artificial</h2>
                <p className="mt-1 text-sm text-muted">Status do provider configurado no backend.</p>
              </div>
              <Bot size={18} className="text-accent" />
            </div>
            <div className="mt-4 space-y-3 text-sm">
              {[
                ["Provider", aiHealth?.provider ?? "-"],
                ["Modelo", aiHealth?.model ?? "-"],
                ["Status", aiHealth?.status ?? "-"],
                ["Ultimo teste", aiHealth?.checkedAt ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(aiHealth.checkedAt)) : "-"],
                ["Latencia", aiHealth?.latencyMs !== null && aiHealth?.latencyMs !== undefined ? `${aiHealth.latencyMs}ms` : "-"],
                ["Limite/hora", aiHealth?.limits.maxRequestsPerHour ?? "-"],
                ["Contexto efetivo", aiHealth?.limits.effectiveContextTokens ? `${aiHealth.limits.effectiveContextTokens} tokens` : "-"]
              ].map(([label, value]) => (
                <div key={label} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-elevated px-3 py-2">
                  <span className="text-muted">{label}</span>
                  <span className="break-words text-right font-medium text-ink">{value}</span>
                </div>
              ))}
              {aiHealth?.message ? <p className="rounded-lg bg-amber/10 px-3 py-2 text-sm text-amber">{aiHealth.message}</p> : null}
              <button
                type="button"
                onClick={() => void loadAiHealth()}
                disabled={isCheckingAi}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw size={16} className={isCheckingAi ? "animate-spin" : ""} />
                Testar conexao
              </button>
            </div>
          </article>
        </aside>

        <section className="min-w-0 rounded-lg border border-line bg-panel p-4 shadow-soft">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-ink">Alocacao ideal</h2>
              <p className="mt-1 text-sm text-muted">A soma deve fechar em 100%.</p>
            </div>
            <button
              type="button"
              onClick={() => void handleSave()}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-black transition hover:bg-accent/90 disabled:opacity-50 md:w-auto"
              disabled={allocationTotal !== 100}
            >
              <Save size={16} />
              Salvar
            </button>
          </div>

          <div className="mt-5 space-y-5">
            {allocations.map((allocation) => (
              <div key={allocation.category}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span className="inline-flex min-w-0 items-center gap-2 text-muted">
                    <SlidersHorizontal size={15} />
                    <span className="break-words">{allocation.category}</span>
                  </span>
                  <span className="font-medium text-ink">{formatPercentage(allocation.targetPercentage)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={allocation.targetPercentage}
                  onChange={(event) => updateAllocation(allocation.category, Number(event.target.value))}
                  className="w-full accent-accent"
                />
                <ProgressBar value={allocation.targetPercentage} tone="blue" />
              </div>
            ))}
          </div>

          <div className={`mt-5 rounded-lg px-3 py-2 text-sm ${allocationTotal === 100 ? "bg-accent/10 text-accent" : "bg-amber/10 text-amber"}`}>
            Total configurado: {formatPercentage(allocationTotal)}
          </div>
        </section>
      </section>
    </div>
  );
}
