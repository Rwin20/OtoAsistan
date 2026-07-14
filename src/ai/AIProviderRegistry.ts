import type { AIProvider, AIProviderInfo } from "./types.js";

export class AIProviderRegistry {
  private readonly providers = new Map<string, AIProvider>();
  private readonly availableProviders = new Map<string, AIProviderInfo>();
  private activeProviderId: string | undefined;

  constructor(private readonly fallbackProvider?: AIProvider) {}

  register(provider: AIProvider): void {
    this.providers.set(provider.id, provider);
    this.availableProviders.set(provider.id, {
      id: provider.id,
      label: provider.label,
      supportsVision: provider.supportsVision
    });
    this.activeProviderId ??= provider.id;
  }

  addAvailableProvider(provider: AIProviderInfo): void {
    this.availableProviders.set(provider.id, provider);
  }

  setActive(providerId: string): void {
    if (!this.providers.has(providerId)) {
      throw new Error(`AI provider not registered: ${providerId}`);
    }
    this.activeProviderId = providerId;
  }

  active(): AIProvider {
    if (!this.activeProviderId) {
      if (this.fallbackProvider) {
        return this.fallbackProvider;
      }
      throw new Error("No active AI provider configured");
    }
    const provider = this.providers.get(this.activeProviderId);
    if (!provider) {
      throw new Error(`AI provider not registered: ${this.activeProviderId}`);
    }
    return provider;
  }

  activeInfo(): AIProviderInfo | undefined {
    if (!this.activeProviderId) {
      return undefined;
    }
    const provider = this.providers.get(this.activeProviderId);
    if (!provider) {
      return undefined;
    }
    return {
      id: provider.id,
      label: provider.label,
      supportsVision: provider.supportsVision
    };
  }

  list(): AIProviderInfo[] {
    return [...this.availableProviders.values()];
  }
}
