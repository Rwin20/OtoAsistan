import type { AIMessageInput, AIProvider, AIResponse } from "./types.js";

export class UnconfiguredAIProvider implements AIProvider {
  readonly id = "unconfigured";
  readonly label = "AI sağlayıcısı yapılandırılmadı";
  readonly supportsVision = false;

  async generate(_input: AIMessageInput): Promise<AIResponse> {
    throw new Error("AI sağlayıcısı panelden yapılandırılmadı");
  }
}
