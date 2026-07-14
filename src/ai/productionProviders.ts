import { AIProviderRegistry } from "./AIProviderRegistry.js";
import {
  AnthropicProvider,
  DeepSeekProvider,
  GeminiProvider,
  OpenAIProvider,
  OpenRouterProvider
} from "./providers.js";
import { UnconfiguredAIProvider } from "./UnconfiguredAIProvider.js";
import type { AIProvider, AIProviderInfo } from "./types.js";
import type { AppSettings } from "../persistence/SqliteAppSettingsStore.js";
import type { LocalSecretStore } from "../security/LocalSecretStore.js";

export interface ProductionRegistryOptions {
  settings: AppSettings;
  secretStore: LocalSecretStore;
  providerSecret?: string;
}

export const productionProviderCatalog: AIProviderInfo[] = [
  { id: "openai", label: "OpenAI", supportsVision: true },
  { id: "gemini", label: "Google Gemini", supportsVision: true },
  { id: "anthropic", label: "Claude", supportsVision: true },
  { id: "deepseek", label: "DeepSeek", supportsVision: false },
  { id: "openrouter", label: "OpenRouter Free", supportsVision: true }
];

export function buildProductionAIRegistry(options: ProductionRegistryOptions): AIProviderRegistry {
  const registry = new AIProviderRegistry(new UnconfiguredAIProvider());
  for (const provider of productionProviderCatalog) {
    registry.addAvailableProvider(provider);
  }

  const configured = options.settings.aiProvider;
  if (!configured?.providerId || !configured.model || !configured.hasApiKey) {
    return registry;
  }

  const apiKey = options.providerSecret;
  if (!apiKey) {
    return registry;
  }

  registry.register(createProvider(configured.providerId, configured.model, apiKey));
  registry.setActive(configured.providerId);
  return registry;
}

function createProvider(providerId: string, model: string, apiKey: string): AIProvider {
  switch (providerId) {
    case "openai":
      return new OpenAIProvider({ apiKey, model });
    case "gemini":
      return new GeminiProvider({ apiKey, model });
    case "anthropic":
      return new AnthropicProvider({ apiKey, model });
    case "deepseek":
      return new DeepSeekProvider({ apiKey, model });
    case "openrouter":
      return new OpenRouterProvider({ apiKey, model });
    default:
      throw new Error(`Desteklenmeyen AI sağlayıcısı: ${providerId}`);
  }
}
