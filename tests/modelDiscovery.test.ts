import { describe, expect, it } from "vitest";
import {
  discoverProviderModels,
  filterOpenAICompatibleModels,
  normalizeGeminiModels
} from "../src/ai/modelDiscovery.js";

describe("model discovery", () => {
  it("filters OpenAI-compatible lists to conversational generation models", () => {
    const models = filterOpenAICompatibleModels([
      "gpt-4.1-mini",
      "o3-mini",
      "text-embedding-3-small",
      "omni-moderation-latest",
      "whisper-1",
      "tts-1",
      "dall-e-3",
      "gpt-image-1",
      "davinci-002",
      "babbage-002"
    ]);

    expect(models).toEqual(["gpt-4.1-mini", "o3-mini"]);
  });

  it("normalizes Gemini models that support generateContent", () => {
    const models = normalizeGeminiModels([
      { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", supportedActions: ["generateContent"] },
      { name: "models/text-embedding-004", displayName: "Embedding", supportedActions: ["embedContent"] }
    ]);

    expect(models).toEqual([
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }
    ]);
  });

  it("uses a saved API key when a new key is not supplied", async () => {
    const calls: Array<{ providerId: string; apiKey: string }> = [];
    const models = await discoverProviderModels({
      providerId: "openai",
      savedApiKey: "saved-secret",
      clients: {
        validateOpenRouter: async () => {},
        listOpenAICompatible: async (providerId, apiKey) => {
          calls.push({ providerId, apiKey });
          return ["gpt-4.1-mini"];
        },
        listGemini: async () => [],
        listAnthropic: async () => []
      }
    });

    expect(calls).toEqual([{ providerId: "openai", apiKey: "saved-secret" }]);
    expect(models).toEqual([{ id: "gpt-4.1-mini", label: "gpt-4.1-mini" }]);
  });

  it("offers the OpenRouter free router as the only OpenRouter model", async () => {
    const validatedKeys: string[] = [];
    const clients = {
      validateOpenRouter: async (apiKey: string) => {
        validatedKeys.push(apiKey);
      },
      listOpenAICompatible: async () => {
        throw new Error("OpenRouter free discovery should not list provider models");
      },
      listGemini: async () => [],
      listAnthropic: async () => []
    };
    const models = await discoverProviderModels({
      providerId: "openrouter",
      apiKey: "or-secret",
      clients
    });

    expect(validatedKeys).toEqual(["or-secret"]);
    expect(models).toEqual([
      { id: "openrouter/free", label: "OpenRouter Free Router" }
    ]);
  });

  it("rejects discovery when no API key is available", async () => {
    await expect(discoverProviderModels({
      providerId: "openai",
      clients: {
        validateOpenRouter: async () => {},
        listOpenAICompatible: async () => [],
        listGemini: async () => [],
        listAnthropic: async () => []
      }
    })).rejects.toThrow("API anahtarı zorunludur");
  });
});
