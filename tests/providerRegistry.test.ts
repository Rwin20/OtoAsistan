import { describe, expect, it } from "vitest";
import { AIProviderRegistry } from "../src/ai/AIProviderRegistry.js";
import { FakeAIProvider } from "./helpers/FakeAIProvider.js";

describe("AIProviderRegistry", () => {
  it("selects exactly one active provider", async () => {
    const registry = new AIProviderRegistry();
    registry.register(new FakeAIProvider("openai answer", { id: "openai", supportsVision: true }));
    registry.register(new FakeAIProvider("gemini answer", { id: "gemini", supportsVision: true }));

    registry.setActive("gemini");

    const response = await registry.active().generate({
      userMessage: "Merhaba",
      context: [{ sourceId: "profile", title: "Profil", text: "Merhaba denir.", score: 1 }]
    });

    expect(response.text).toBe("gemini answer");
    expect(registry.list().map((provider) => provider.id)).toEqual(["openai", "gemini"]);
  });

  it("fails clearly when selecting an unknown provider", () => {
    const registry = new AIProviderRegistry();

    expect(() => registry.setActive("missing")).toThrow("AI provider not registered: missing");
  });
});
