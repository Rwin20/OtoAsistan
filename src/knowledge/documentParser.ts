import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import path from "node:path";

export interface KnowledgeDocumentInput {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

export async function parseKnowledgeDocument(input: KnowledgeDocumentInput): Promise<string> {
  const extension = path.extname(input.filename).toLocaleLowerCase("tr-TR");

  if (extension === ".txt" || extension === ".md") {
    return input.buffer.toString("utf8").trim();
  }

  if (extension === ".pdf") {
    const parsed = await pdfParse(input.buffer);
    return parsed.text.trim();
  }

  if (extension === ".docx") {
    const parsed = await mammoth.extractRawText({ buffer: input.buffer });
    return parsed.value.trim();
  }

  throw new Error(`Unsupported knowledge document type: ${extension || input.mimeType}`);
}
