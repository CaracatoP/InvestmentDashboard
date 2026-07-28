import { stringifySafeContext } from "./ai-sensitive-data-filter";

const charactersPerTokenEstimate = 4;
export const defaultAiContextTokenBudget = 1800;
export const maxAiContextTokenBudget = 2200;

export function estimateAiTokens(text: string) {
  return Math.ceil(text.length / charactersPerTokenEstimate);
}

export function compactText(value: string, maxCharacters: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxCharacters ? `${normalized.slice(0, maxCharacters)}...` : normalized;
}

export function stringifyContextForAi(context: unknown, tokenBudget = defaultAiContextTokenBudget) {
  const effectiveBudget = Math.min(Math.max(tokenBudget, 600), maxAiContextTokenBudget);
  const maxCharacters = effectiveBudget * charactersPerTokenEstimate;
  const serialized = stringifySafeContext(context);

  if (serialized.length <= maxCharacters) return serialized;
  return `${serialized.slice(0, maxCharacters)}\n...[contexto compacto truncado para caber no limite do provider]`;
}

export function contextMetadata(context: unknown, tokenBudget = defaultAiContextTokenBudget) {
  const serialized = stringifyContextForAi(context, tokenBudget);
  return {
    estimatedTokens: estimateAiTokens(serialized),
    characters: serialized.length,
    tokenBudget: Math.min(Math.max(tokenBudget, 600), maxAiContextTokenBudget)
  };
}
