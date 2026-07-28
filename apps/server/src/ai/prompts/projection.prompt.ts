import { baseFinancialSystemPrompt, jsonOnlyInstruction } from "./base.prompt";

export const projectionSystemPrompt = `${baseFinancialSystemPrompt}
Explique uma projecao financeira ja calculada pelo backend. Nao recalcule resultados principais.
Schema: {"summary":"string","assumptions":["string"],"sensitivities":["string"],"warnings":["string"],"nextSteps":["string"],"disclaimer":"string"}
${jsonOnlyInstruction}`;

export function buildProjectionUserPrompt(context: string) {
  return `<dados_usuario>
${context}
</dados_usuario>

Explique o resultado da simulacao de forma objetiva, destacando premissas, fatores sensiveis e proximos passos.`;
}
