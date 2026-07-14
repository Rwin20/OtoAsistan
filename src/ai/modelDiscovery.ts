import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export interface AvailableModel {
  id: string;
  label: string;
}

export interface GeminiModelRecord {
  name?: string;
  displayName?: string;
  supportedActions?: string[];
  supportedGenerationMethods?: string[];
}

export interface ModelDiscoveryClients {
  validateOpenRouter(apiKey: string): Promise<void>;
  listOpenAICompatible(providerId: string, apiKey: string): Promise<string[]>;
  listGemini(apiKey: string): Promise<GeminiModelRecord[]>;
  listAnthropic(apiKey: string): Promise<AvailableModel[]>;
}

export interface DiscoverProviderModelsOptions {
  providerId: string;
  apiKey?: string;
  savedApiKey?: string;
  clients?: ModelDiscoveryClients;
}

const excludedOpenAIModelPatterns = [
  /^text-embedding-/i,
  /^omni-moderation/i,
  /^text-moderation/i,
  /^whisper/i,
  /^tts-/i,
  /transcribe/i,
  /realtime/i,
  /audio/i,
  /^dall-e/i,
  /image/i,
  /sora/i
];

export async function discoverProviderModels(options: DiscoverProviderModelsOptions): Promise<AvailableModel[]> {
  const apiKey = options.apiKey?.trim() || options.savedApiKey?.trim();
  if (!apiKey) {
    throw new Error("API anahtarı zorunludur.");
  }
  const clients = options.clients ?? productionModelDiscoveryClients;

  if (options.providerId === "gemini") {
    return normalizeGeminiModels(await clients.listGemini(apiKey));
  }
  if (options.providerId === "anthropic") {
    return sortModels(await clients.listAnthropic(apiKey));
  }
  if (options.providerId === "openrouter") {
    await clients.validateOpenRouter(apiKey);
    return [{ id: "openrouter/free", label: "OpenRouter Free Router" }];
  }
  if (options.providerId === "openai" || options.providerId === "deepseek") {
    const modelIds = await clients.listOpenAICompatible(options.providerId, apiKey);
    return filterOpenAICompatibleModels(modelIds).map((id) => ({ id, label: id }));
  }
  throw new Error(`Desteklenmeyen AI sağlayıcısı: ${options.providerId}`);
}

export function filterOpenAICompatibleModels(modelIds: string[]): string[] {
  return [...new Set(modelIds)]
    .filter((id) => /^(gpt-|chatgpt-|o[1-9]|deepseek-|ft:gpt-)/i.test(id))
    .filter((id) => !excludedOpenAIModelPatterns.some((pattern) => pattern.test(id)))
    .sort((left, right) => left.localeCompare(right));
}

export function normalizeGeminiModels(models: GeminiModelRecord[]): AvailableModel[] {
  const normalized = models
    .filter((model) => {
      const actions = model.supportedActions ?? model.supportedGenerationMethods ?? [];
      return actions.includes("generateContent");
    })
    .map((model) => ({
      id: (model.name ?? "").replace(/^models\//, ""),
      label: model.displayName || (model.name ?? "").replace(/^models\//, "")
    }))
    .filter((model) => model.id);
  return sortModels(normalized);
}

const productionModelDiscoveryClients: ModelDiscoveryClients = {
  async validateOpenRouter(apiKey) {
    const response = await fetch("https://openrouter.ai/api/v1/key", {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });
    if (!response.ok) {
      throw new Error(await providerError(response, "OpenRouter API anahtarı doğrulanamadı."));
    }
  },

  async listOpenAICompatible(providerId, apiKey) {
    const client = new OpenAI({
      apiKey,
      ...(providerId === "deepseek" ? { baseURL: "https://api.deepseek.com" } : {})
    });
    const page = await client.models.list();
    return page.data.map((model) => model.id);
  },

  async listGemini(apiKey) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`);
    if (!response.ok) {
      throw new Error(await providerError(response, "Gemini model listesi alınamadı."));
    }
    const payload = await response.json() as { models?: GeminiModelRecord[] };
    return payload.models ?? [];
  },

  async listAnthropic(apiKey) {
    const client = new Anthropic({ apiKey });
    const page = await client.models.list({ limit: 100 });
    return page.data.map((model) => ({
      id: model.id,
      label: model.display_name || model.id
    }));
  }
};

function sortModels(models: AvailableModel[]): AvailableModel[] {
  return [...models].sort((left, right) => left.label.localeCompare(right.label));
}

async function providerError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { error?: { message?: string } };
    return payload.error?.message || fallback;
  } catch {
    return fallback;
  }
}
