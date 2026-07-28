import type { AiGenerateRequest, AiGenerateResult, AiProvider, AiProviderHealth } from "../ai-provider.interface";

export class DisabledAiProvider implements AiProvider {
  name = "disabled";
  model = "disabled";

  constructor(private readonly reason = "Inteligencia artificial desativada ou sem chave configurada.") {}

  async checkHealth(): Promise<AiProviderHealth> {
    return {
      provider: this.name,
      model: this.model,
      enabled: false,
      configured: false,
      status: "disabled",
      checkedAt: new Date().toISOString(),
      latencyMs: null,
      message: this.reason
    };
  }

  async generateAnalysis(_request: AiGenerateRequest): Promise<AiGenerateResult> {
    throw new Error(this.reason);
  }

  async generateProjection(_request: AiGenerateRequest): Promise<AiGenerateResult> {
    throw new Error(this.reason);
  }

  async chat(_request: AiGenerateRequest): Promise<AiGenerateResult> {
    throw new Error(this.reason);
  }
}
