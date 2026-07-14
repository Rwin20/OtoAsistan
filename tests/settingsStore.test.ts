import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { SqliteAppSettingsStore } from "../src/persistence/SqliteAppSettingsStore.js";

describe("SqliteAppSettingsStore", () => {
  it("persists response mode changes from the panel", () => {
    const db = new Database(":memory:");
    const store = new SqliteAppSettingsStore(db);

    expect(store.getSettings().responseMode).toBe("safe_auto");

    store.updateSettings({ responseMode: "always_auto" });

    expect(new SqliteAppSettingsStore(db).getSettings().responseMode).toBe("always_auto");
  });
});
