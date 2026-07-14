import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { SqliteWhatsAppAccountStore } from "../src/persistence/SqliteWhatsAppAccountStore.js";

describe("SqliteWhatsAppAccountStore", () => {
  it("creates unique ids and session names for duplicate labels", () => {
    const store = new SqliteWhatsAppAccountStore(new Database(":memory:"));

    const first = store.createAccount("Satis");
    const second = store.createAccount("Satis");

    expect(first).toEqual({ id: "satis", label: "Satis", sessionName: "whatsappisletme-satis" });
    expect(second).toEqual({ id: "satis-2", label: "Satis", sessionName: "whatsappisletme-satis-2" });
  });
});
