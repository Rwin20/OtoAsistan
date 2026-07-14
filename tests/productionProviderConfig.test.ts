import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { AIProviderRegistry } from "../src/ai/AIProviderRegistry.js";
import { buildProductionAIRegistry } from "../src/ai/productionProviders.js";
import { SqliteAppSettingsStore } from "../src/persistence/SqliteAppSettingsStore.js";
import { LocalSecretStore } from "../src/security/LocalSecretStore.js";

describe("production AI provider configuration", () => {
  it("does not register fake or test providers in the production registry", async () => {
    const registry = buildProductionAIRegistry({
      settings: { responseMode: "safe_auto" },
      secretStore: new LocalSecretStore("provider-test")
    });

    expect(registry.list().map((provider) => provider.id)).toEqual([
      "openai",
      "gemini",
      "anthropic",
      "deepseek",
      "openrouter"
    ]);
    expect(registry.activeInfo()).toBeUndefined();
    await expect(registry.active().generate({
      userMessage: "Merhaba",
      context: []
    })).rejects.toThrow("AI sağlayıcısı panelden yapılandırılmadı");
  });

  it("persists encrypted provider credentials and exposes only safe metadata", () => {
    const db = new Database(":memory:");
    const secretStore = new LocalSecretStore("provider-test");
    const store = new SqliteAppSettingsStore(db, secretStore);

    const settings = store.updateAIProvider({
      providerId: "openai",
      model: "gpt-4.1-mini",
      apiKey: "sk-live-secret"
    });

    expect(settings.aiProvider).toEqual({
      providerId: "openai",
      model: "gpt-4.1-mini",
      hasApiKey: true
    });
    expect(JSON.stringify(db.prepare("select * from app_settings").all())).not.toContain("sk-live-secret");
    expect(store.getProviderSecret("openai")).toBe("sk-live-secret");
  });

  it("reports configured active provider metadata without exposing API keys", () => {
    const db = new Database(":memory:");
    const secretStore = new LocalSecretStore("provider-test");
    const store = new SqliteAppSettingsStore(db, secretStore);
    store.updateAIProvider({ providerId: "deepseek", model: "deepseek-chat", apiKey: "ds-secret" });

    const registry = buildProductionAIRegistry({
      settings: store.getSettings(),
      secretStore,
      providerSecret: store.getProviderSecret("deepseek")
    });

    expect(registry.activeInfo()).toEqual({
      id: "deepseek",
      label: "DeepSeek",
      supportsVision: false
    });
    expect(JSON.stringify(registry.list())).not.toContain("ds-secret");
  });

  it("registers OpenRouter Free as a vision-capable production provider", () => {
    const db = new Database(":memory:");
    const secretStore = new LocalSecretStore("provider-test");
    const store = new SqliteAppSettingsStore(db, secretStore);
    store.updateAIProvider({
      providerId: "openrouter",
      model: "openrouter/free",
      apiKey: "or-secret"
    });

    const registry = buildProductionAIRegistry({
      settings: store.getSettings(),
      secretStore,
      providerSecret: store.getProviderSecret("openrouter")
    });

    expect(registry.activeInfo()).toEqual({
      id: "openrouter",
      label: "OpenRouter Free",
      supportsVision: true
    });
  });
});
