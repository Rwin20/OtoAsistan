import type { AIMessageInput, AIProvider, AIProviderInfo, AIResponse } from "../../src/ai/types.js";

export class FakeAIProvider implements AIProvider {
  readonly id: string;
  readonly label: string;
  readonly supportsVision: boolean;

  constructor(
    private readonly answer: string,
    info: Partial<AIProviderInfo> = {}
  ) {
    this.id = info.id ?? "test-provider";
    this.label = info.label ?? this.id;
    this.supportsVision = info.supportsVision ?? false;
  }

  async generate(input: AIMessageInput): Promise<AIResponse> {
    if (input.image && !this.supportsVision) {
      throw new Error(`AI provider ${this.id} does not support vision`);
    }

    return {
      text: this.answer,
      confidence: 0.9,
      usedSourceIds: input.context.map((item) => item.sourceId)
    };
  }
}
