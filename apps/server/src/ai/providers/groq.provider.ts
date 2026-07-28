import Groq from "groq-sdk";
import { env } from "../../config/env";
import type { AiGenerateRequest, AiGenerateResult, AiProvider, AiProviderHealth, AiUsage } from "../ai-provider.interface";

export class GroqAiProvider implements AiProvider {
  name = "groq";
  model: string;
  private readonly client: Groq;

  constructor(apiKey = env.groqApiKey, model = env.groqModel) {
    this.model = model;
    this.client = new Groq({ apiKey });
  }

  async checkHealth(): Promise<AiProviderHealth> {
    const startedAt = Date.now();

    try {
      await this.runWithTimeout(
        this.client.chat.completions.create({
          model: this.model,
          messages: [{ role: "user", content: "Responda apenas: ok" }],
          max_completion_tokens: 8,
          temperature: 0
        })
      );

      return {
        provider: this.name,
        model: this.model,
        enabled: true,
        configured: true,
        status: "ok",
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt
      };
    } catch (error) {
      return {
        provider: this.name,
        model: this.model,
        enabled: true,
        configured: true,
        status: "error",
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Falha ao verificar Groq."
      };
    }
  }

  async generateAnalysis(request: AiGenerateRequest): Promise<AiGenerateResult> {
    return this.complete(request);
  }

  async generateProjection(request: AiGenerateRequest): Promise<AiGenerateResult> {
    return this.complete(request);
  }

  async chat(request: AiGenerateRequest): Promise<AiGenerateResult> {
    return this.complete(request);
  }

  private async complete(request: AiGenerateRequest): Promise<AiGenerateResult> {
    const startedAt = Date.now();
    const response = await this.runWithTimeout(
      this.client.chat.completions.create({
        model: this.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
        max_completion_tokens: request.maxTokens ?? 1200,
        response_format: request.json ? { type: "json_object" } : undefined
      })
    );
    const usage = response.usage
      ? ({
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens
        } satisfies AiUsage)
      : undefined;

    return {
      content: response.choices[0]?.message?.content ?? "",
      model: response.model ?? this.model,
      provider: this.name,
      durationMs: Date.now() - startedAt,
      usage
    };
  }

  private async runWithTimeout<T>(promise: Promise<T>): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => reject(new Error(`Groq timeout after ${env.groqTimeoutMs}ms`)), env.groqTimeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
