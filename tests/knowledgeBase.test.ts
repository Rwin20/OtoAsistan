import { describe, expect, it } from "vitest";
import { HybridKnowledgeBase } from "../src/knowledge/HybridKnowledgeBase.js";
import { hashEmbedding } from "../src/knowledge/hashEmbedding.js";
import { chunkText } from "../src/knowledge/chunkText.js";
import Database from "better-sqlite3";
import { SqliteKnowledgeBase } from "../src/persistence/SqliteKnowledgeBase.js";

describe("HybridKnowledgeBase", () => {
  it("combines keyword and embedding scores for Turkish company knowledge", async () => {
    const kb = new HybridKnowledgeBase(hashEmbedding);
    await kb.upsertSource({
      id: "company-profile",
      title: "Sirket Profili",
      text: "Kargo teslimati Istanbul icinde 2 is gunu surer. Iade suresi 14 gundur."
    });

    const results = await kb.search("Kargo kac gunde teslim edilir?", 3);

    expect(results[0]?.sourceId).toBe("company-profile");
    expect(results[0]?.text).toContain("Kargo teslimati");
    expect(results[0]?.score).toBeGreaterThan(0);
  });

  it("replaces chunks when a source changes", async () => {
    const kb = new HybridKnowledgeBase(hashEmbedding);
    await kb.upsertSource({ id: "faq", title: "SSS", text: "Eski adres Ankara." });
    await kb.upsertSource({ id: "faq", title: "SSS", text: "Yeni adres Istanbul." });

    const results = await kb.search("adres", 5);

    expect(results.map((result) => result.text).join(" ")).toContain("Yeni adres Istanbul");
    expect(results.map((result) => result.text).join(" ")).not.toContain("Eski adres Ankara");
  });

  it("ignores weak matches instead of answering from unrelated knowledge", async () => {
    const kb = new HybridKnowledgeBase(hashEmbedding, { minScore: 0.2 });
    await kb.upsertSource({
      id: "company-profile",
      title: "Sirket Profili",
      text: "Kargo teslimati Istanbul icinde 2 is gunu surer."
    });

    const results = await kb.search("Taksit secenekleri nelerdir?", 3);

    expect(results).toEqual([]);
  });
});

describe("SqliteKnowledgeBase", () => {
  it("persists sources, lists them, and removes deleted source chunks", async () => {
    const db = new Database(":memory:");
    const first = new SqliteKnowledgeBase(db, hashEmbedding);
    await first.upsertSource({
      id: "price-list",
      title: "Fiyat Listesi",
      type: "text",
      text: "Premium temizlik paketi fiyati 2500 TL."
    });

    const restarted = new SqliteKnowledgeBase(db, hashEmbedding);
    expect(restarted.listSources()).toEqual([
      expect.objectContaining({
        id: "price-list",
        title: "Fiyat Listesi",
        type: "text"
      })
    ]);
    expect((await restarted.search("Premium temizlik paketi ucreti nedir?", 3))[0]?.text)
      .toContain("2500 TL");

    restarted.deleteSource("price-list");

    expect(restarted.listSources()).toEqual([]);
    expect(await restarted.search("Premium temizlik paketi ucreti nedir?", 3)).toEqual([]);
  });
});

describe("chunkText", () => {
  it("creates overlapping text chunks", () => {
    const chunks = chunkText("bir iki uc dort bes alti yedi sekiz", { maxWords: 4, overlapWords: 1 });

    expect(chunks).toEqual(["bir iki uc dort", "dort bes alti yedi", "yedi sekiz"]);
  });
});
