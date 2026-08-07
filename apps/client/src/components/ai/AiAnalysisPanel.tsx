import { Bot, Clock, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useWorkspaceInvalidation } from "../../hooks/useWorkspaceInvalidation";
import { fetchAiAnalyses, generateAiAnalysis } from "../../services/api";
import { analysisDependencyDomains } from "../../services/workspace-mutation-effects";
import type { AiAnalysisResult, AiAnalysisType, AiStoredAnalysis } from "../../types/ai";

const analysisTypeLabels: Record<AiAnalysisType, string> = {
  complete: "Completa",
  planning: "Planejamento",
  investments: "Investimentos",
  category: "Categoria",
  goals: "Metas",
  projections: "Projecoes"
};

const statusLabels: Record<AiAnalysisResult["analysis"]["status"], string> = {
  healthy: "Saudavel",
  attention: "Atencao",
  critical: "Critico",
  insufficient_data: "Dados insuficientes"
};

const statusClasses: Record<AiAnalysisResult["analysis"]["status"], string> = {
  healthy: "bg-accent/10 text-accent",
  attention: "bg-amber/10 text-amber",
  critical: "bg-rose/10 text-rose",
  insufficient_data: "bg-elevated text-muted"
};

export type AiAnalysisPanelProps = {
  year: number;
  month: number;
  analysisType?: AiAnalysisType;
  categoryId?: string;
  compact?: boolean;
  showTypeSelector?: boolean;
  title?: string;
  description?: string;
};

function formatGeneratedAt(value?: string) {
  if (!value) return "Ainda nao gerado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function resultFromStored(stored: AiStoredAnalysis): AiAnalysisResult {
  return {
    analysis: stored.response,
    provider: stored.provider,
    model: stored.model,
    generatedAt: stored.generatedAt,
    durationMs: stored.durationMs,
    expiresAt: stored.expiresAt,
    contextHash: stored.contextHash,
    fromCache: true,
    disabled: false,
    request: {
      year: stored.year,
      month: stored.month,
      analysisType: stored.analysisType,
      categoryId: stored.categoryId
    }
  };
}

export function AiAnalysisPanel({
  year,
  month,
  analysisType = "complete",
  categoryId,
  compact = false,
  showTypeSelector = false,
  title = "Assistente financeiro",
  description = "Analise gerada pela IA com base nos dados reais do backend."
}: AiAnalysisPanelProps) {
  const [selectedType, setSelectedType] = useState<AiAnalysisType>(analysisType);
  const [analysis, setAnalysis] = useState<AiAnalysisResult | null>(null);
  const [history, setHistory] = useState<AiStoredAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    setSelectedType(analysisType);
  }, [analysisType]);

  useEffect(() => {
    let active = true;
    fetchAiAnalyses(30)
      .then((items) => {
        if (!active) return;
        setHistory(items);
        const latest = items.find(
          (item) =>
            item.year === year &&
            item.month === month &&
            item.analysisType === selectedType &&
            (item.categoryId ?? "") === (categoryId ?? "")
        );
        setAnalysis(latest ? resultFromStored(latest) : null);
      })
      .catch(() => {
        if (active) setHistory([]);
      });

    return () => {
      active = false;
    };
  }, [categoryId, month, selectedType, year]);

  useEffect(() => {
    setIsStale(false);
  }, [categoryId, month, selectedType, year]);

  useWorkspaceInvalidation(["ai"], async () => {
    const items = await fetchAiAnalyses(30);
    setHistory(items);
  });

  useWorkspaceInvalidation(analysisDependencyDomains[selectedType], () => {
    if (analysis) setIsStale(true);
  });

  async function handleGenerate(forceRefresh = false) {
    setIsLoading(true);
    setError("");
    try {
      const result = await generateAiAnalysis({
        year,
        month,
        analysisType: selectedType,
        categoryId,
        forceRefresh
      });
      setAnalysis(result);
      setHistory(await fetchAiAnalyses(30));
      setIsStale(false);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Nao foi possivel gerar a analise.");
    } finally {
      setIsLoading(false);
    }
  }

  const visibleInsights = useMemo(() => analysis?.analysis.insights.slice(0, compact ? 3 : 5) ?? [], [analysis?.analysis.insights, compact]);
  const historyItems = history.filter((item) => item.analysisType === selectedType).slice(0, 5);

  return (
    <article className="mb-4 min-w-0 rounded-lg border border-line bg-panel p-4 shadow-soft">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
            <Sparkles size={14} />
            Gerado com Groq
          </div>
          <h2 className="mt-3 text-base font-semibold text-ink">{title}</h2>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {showTypeSelector ? (
            <select
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value as AiAnalysisType)}
              className="h-11 rounded-lg border border-line bg-elevated px-3 text-sm text-ink outline-none focus:border-accent"
              aria-label="Tipo de analise IA"
            >
              {Object.entries(analysisTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            onClick={() => void handleGenerate(false)}
            disabled={isLoading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Bot size={16} />
            {analysis ? "Gerar" : "Gerar analise"}
          </button>
          <button
            type="button"
            onClick={() => void handleGenerate(true)}
            disabled={isLoading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-elevated px-4 text-sm text-muted transition hover:border-accent/60 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            Atualizar
          </button>
          {compact ? (
            <Link
              to="/planejamento-mensal/analises"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-line bg-elevated px-4 text-sm text-muted transition hover:border-accent/60 hover:text-ink"
            >
              Ver completa
            </Link>
          ) : null}
        </div>
      </div>

      {error ? <p className="mt-3 rounded-lg bg-amber/10 px-3 py-2 text-sm text-amber">{error}</p> : null}
      {isStale ? (
        <p className="mt-3 rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-sm text-amber">
          Dados alterados desde a ultima analise. Atualize para sincronizar este resumo com o estado atual do sistema.
        </p>
      ) : null}

      <div className="mt-4 grid gap-3">
        {analysis ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className={`rounded-full px-2 py-1 ${statusClasses[analysis.analysis.status]}`}>
                {statusLabels[analysis.analysis.status]}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock size={14} />
                {formatGeneratedAt(analysis.generatedAt)}
              </span>
              <span>{analysis.fromCache ? "Cache reaproveitado" : `${analysis.durationMs}ms`}</span>
              <span>{analysis.model}</span>
            </div>
            <p className="rounded-lg bg-elevated px-3 py-3 text-sm leading-relaxed text-muted">{analysis.analysis.summary}</p>
            <div className="grid gap-2">
              {visibleInsights.length > 0 ? (
                visibleInsights.map((insight) => (
                  <div key={`${insight.title}-${insight.description}`} className="rounded-lg border border-line bg-elevated px-3 py-2">
                    <p className="text-sm font-medium text-ink">{insight.title}</p>
                    <p className="mt-1 text-sm text-muted">{insight.description}</p>
                  </div>
                ))
              ) : (
                <p className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">Gere uma analise para exibir insights da IA.</p>
              )}
            </div>

            {!compact ? (
              <div className="grid gap-3 lg:grid-cols-3">
                <section className="rounded-lg border border-line bg-elevated p-3">
                  <h3 className="text-sm font-semibold text-ink">Riscos</h3>
                  <div className="mt-2 space-y-2 text-sm text-muted">
                    {analysis.analysis.risks.length > 0 ? analysis.analysis.risks.map((item) => <p key={item.title}>{item.description}</p>) : <p>Nenhum risco destacado.</p>}
                  </div>
                </section>
                <section className="rounded-lg border border-line bg-elevated p-3">
                  <h3 className="text-sm font-semibold text-ink">Oportunidades</h3>
                  <div className="mt-2 space-y-2 text-sm text-muted">
                    {analysis.analysis.opportunities.length > 0 ? analysis.analysis.opportunities.map((item) => <p key={item.title}>{item.description}</p>) : <p>Nenhuma oportunidade destacada.</p>}
                  </div>
                </section>
                <section className="rounded-lg border border-line bg-elevated p-3">
                  <h3 className="text-sm font-semibold text-ink">Acoes sugeridas</h3>
                  <div className="mt-2 space-y-2 text-sm text-muted">
                    {analysis.analysis.actionItems.length > 0 ? analysis.analysis.actionItems.map((item) => <p key={item.title}>{item.description}</p>) : <p>Nenhuma acao sugerida.</p>}
                  </div>
                </section>
              </div>
            ) : null}
          </>
        ) : (
          <p className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">Nenhuma analise encontrada para este periodo. Clique em gerar para consultar a IA.</p>
        )}

        {!compact ? (
          <section className="rounded-lg border border-line bg-elevated p-3">
            <h3 className="text-sm font-semibold text-ink">Historico recente</h3>
            <div className="mt-2 grid gap-2">
              {historyItems.length > 0 ? (
                historyItems.map((item) => (
                  <button
                    key={item.id ?? `${item.contextHash}-${item.generatedAt}`}
                    type="button"
                    onClick={() => setAnalysis(resultFromStored(item))}
                    className="rounded-lg bg-panel px-3 py-2 text-left text-sm text-muted transition hover:text-ink"
                  >
                    {analysisTypeLabels[item.analysisType]} - {formatGeneratedAt(item.generatedAt)}
                  </button>
                ))
              ) : (
                <p className="text-sm text-muted">Sem historico salvo ainda.</p>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </article>
  );
}
