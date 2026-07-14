import { describe, expect, it } from "vitest";
import { LocalSecretStore } from "../src/security/LocalSecretStore.js";

describe("LocalSecretStore", () => {
  it("does not expose plaintext in persisted values", () => {
    const store = new LocalSecretStore("test-user-scope");

    const encrypted = store.encrypt("sk-secret");

    expect(encrypted).not.toContain("sk-secret");
    expect(store.decrypt(encrypted)).toBe("sk-secret");
  });
});
