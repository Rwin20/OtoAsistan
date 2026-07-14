import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { buildCompanyPrompt } from "./PromptBuilder.js";
import type { AIMessageInput, AIProvider, AIResponse } from "./types.js";

interface ProviderConfig {
  apiKey: string;
  model: string;
}

function sourceIds(input: AIMessageInput): string[] {
  return [...new Set(input.context.map((item) => item.sourceId))];
}

export class OpenAIProvider implements AIProvider {
  readonly id = "openai";
  readonly label = "OpenAI";
  readonly supportsVision = true;
  private readonly client: OpenAI;

  constructor(private readonly config: ProviderConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
  }

  async generate(input: AIMessageInput): Promise<AIResponse> {
    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: "text", text: buildCompanyPrompt(input) }
    ];
    if (input.image) {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${input.image.mimeType};base64,${input.image.data.toString("base64")}`
        }
      });
    }
    const response = await this.client.chat.completions.create({
      model: this.config.model,
      messages: [{ role: "user", content }]
    });
    return {
      text: response.choices[0]?.message.content?.trim() ?? "",
      confidence: 0.8,
      usedSourceIds: sourceIds(input)
    };
  }
}

export class OpenRouterProvider implements AIProvider {
  readonly id = "openrouter";
  readonly label = "OpenRouter Free";
  readonly supportsVision = true;
  private readonly client: OpenAI;

  constructor(private readonly config: ProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "X-OpenRouter-Title": "WhatsApp Isletme AI"
      }
    });
  }

  async generate(input: AIMessageInput): Promise<AIResponse> {
    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: "text", text: buildCompanyPrompt(input) }
    ];
    if (input.image) {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${input.image.mimeType};base64,${input.image.data.toString("base64")}`
        }
      });
    }
    const response = await this.client.chat.completions.create({
      model: this.config.model,
      messages: [{ role: "user", content }]
    });
    return {
      text: response.choices[0]?.message.content?.trim() ?? "",
      confidence: 0.8,
      usedSourceIds: sourceIds(input)
    };
  }
}

export class DeepSeekProvider implements AIProvider {
  readonly id = "deepseek";
  readonly label = "DeepSeek";
  readonly supportsVision = false;
  private readonly client: OpenAI;

  constructor(private readonly config: ProviderConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey, baseURL: "https://api.deepseek.com" });
  }

  async generate(input: AIMessageInput): Promise<AIResponse> {
    if (input.image) {
      throw new Error("DeepSeek provider does not support vision in this adapter");
    }
    const response = await this.client.chat.completions.create({
      model: this.config.model,
      messages: [{ role: "user", content: buildCompanyPrompt(input) }]
    });
    return {
      text: response.choices[0]?.message.content?.trim() ?? "",
      confidence: 0.8,
      usedSourceIds: sourceIds(input)
    };
  }
}

export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic";
  readonly label = "Claude";
  readonly supportsVision = true;
  private readonly client: Anthropic;

  constructor(private readonly config: ProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  async generate(input: AIMessageInput): Promise<AIResponse> {
    const content: Anthropic.Messages.ContentBlockParam[] = [{ type: "text", text: buildCompanyPrompt(input) }];
    if (input.image) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: input.image.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: input.image.data.toString("base64")
        }
      });
    }
    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: 600,
      messages: [{ role: "user", content }]
    });
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    return { text, confidence: 0.8, usedSourceIds: sourceIds(input) };
  }
}

export class GeminiProvider implements AIProvider {
  readonly id = "gemini";
  readonly label = "Google Gemini";
  readonly supportsVision = true;
  private readonly client: GoogleGenAI;

  constructor(private readonly config: ProviderConfig) {
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
  }

  async generate(input: AIMessageInput): Promise<AIResponse> {
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: buildCompanyPrompt(input) }
    ];
    if (input.image) {
      parts.push({
        inlineData: {
          mimeType: input.image.mimeType,
          data: input.image.data.toString("base64")
        }
      });
    }
    const response = await this.client.models.generateContent({
      model: this.config.model,
      contents: [{ role: "user", parts }]
    });
    return {
      text: response.text?.trim() ?? "",
      confidence: 0.8,
      usedSourceIds: sourceIds(input)
    };
  }
}
