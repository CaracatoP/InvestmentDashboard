import { env } from "../config/env";
import { DisabledAiProvider } from "./providers/disabled.provider";
import { GroqAiProvider } from "./providers/groq.provider";
import type { AiProvider } from "./ai-provider.interface";

export function getAiProvider(): AiProvider {
  if (!env.aiEnabled || env.aiProvider === "disabled") {
    return new DisabledAiProvider("Inteligencia artificial desativada por configuracao.");
  }

  if (env.aiProvider !== "groq") {
    return new DisabledAiProvider(`Provider de IA nao suportado: ${env.aiProvider}.`);
  }

  if (!env.groqApiKey.trim()) {
    return new DisabledAiProvider("GROQ_API_KEY nao configurada.");
  }

  return new GroqAiProvider();
}
