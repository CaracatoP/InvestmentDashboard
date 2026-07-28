import { baseFinancialSystemPrompt, jsonOnlyInstruction } from "./base.prompt";
import type { AiAnalysisType } from "../schemas/ai.schema";

const analysisLabels: Record<AiAnalysisType, string> = {
  complete: "analise completa financeira",
  planning: "analise do planejamento mensal",
  investments: "analise dos investimentos",
  category: "analise de uma categoria do planejamento",
  goals: "analise de metas",
  projections: "analise de projecoes"
};

export function buildAnalysisSystemPrompt(analysisType: AiAnalysisType) {
  return `${baseFinancialSystemPrompt}
Faca uma ${analysisLabels[analysisType]}.
Schema: {"title":"string","summary":"string","status":"healthy|attention|critical|insufficient_data","insights":[{"title":"string","description":"string","severity":"info|success|warning|danger"}],"risks":[],"opportunities":[],"actionItems":[{"title":"string","description":"string","priority":"low|medium|high"}],"disclaimer":"string"}
${jsonOnlyInstruction}`;
}

export function buildAnalysisUserPrompt(context: string) {
  return `<dados_usuario>
${context}
</dados_usuario>

Gere uma analise curta, priorizando ate 5 insights, ate 4 riscos, ate 4 oportunidades e ate 5 acoes praticas.`;
}
