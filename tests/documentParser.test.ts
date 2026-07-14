import { describe, expect, it } from "vitest";
import { parseKnowledgeDocument } from "../src/knowledge/documentParser.js";

describe("parseKnowledgeDocument", () => {
  it("parses txt and markdown buffers as utf8 text", async () => {
    await expect(parseKnowledgeDocument({
      filename: "bilgi.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Calisma saatleri 09:00-18:00", "utf8")
    })).resolves.toContain("Calisma saatleri");

    await expect(parseKnowledgeDocument({
      filename: "sss.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# SSS\nIade 14 gundur", "utf8")
    })).resolves.toContain("Iade 14 gundur");
  });

  it("rejects unsupported document types with a clear error", async () => {
    await expect(parseKnowledgeDocument({
      filename: "tablo.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("")
    })).rejects.toThrow("Unsupported knowledge document type: .xlsx");
  });
});
