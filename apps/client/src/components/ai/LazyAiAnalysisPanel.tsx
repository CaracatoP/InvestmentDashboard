import { lazy, Suspense } from "react";
import { DeferredRender } from "../ui/DeferredRender";
import type { AiAnalysisPanelProps } from "./AiAnalysisPanel";

const AiAnalysisPanelModule = lazy(() => import("./AiAnalysisPanel").then((module) => ({ default: module.AiAnalysisPanel })));

function AiAnalysisFallback() {
  return (
    <article className="mb-4 min-w-0 animate-pulse rounded-lg border border-line bg-panel p-4 shadow-soft" role="status" aria-label="Carregando analise com IA">
      <div className="h-5 w-36 rounded bg-elevated" />
      <div className="mt-4 h-4 w-2/3 rounded bg-elevated" />
      <div className="mt-3 h-20 rounded-lg bg-elevated/70" />
    </article>
  );
}

export function LazyAiAnalysisPanel(props: AiAnalysisPanelProps) {
  const fallback = <AiAnalysisFallback />;

  return (
    <DeferredRender fallback={fallback}>
      <Suspense fallback={fallback}>
        <AiAnalysisPanelModule {...props} />
      </Suspense>
    </DeferredRender>
  );
}
