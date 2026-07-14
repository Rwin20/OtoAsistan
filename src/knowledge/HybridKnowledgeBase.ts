import { chunkText } from "./chunkText.js";
import { tokenize } from "./hashEmbedding.js";
import type { EmbeddingFunction, KnowledgeBase, KnowledgeResult, KnowledgeSource } from "./types.js";

export interface KnowledgeChunk {
  sourceId: string;
  title: string;
  text: string;
  embedding: number[];
}

export class HybridKnowledgeBase implements KnowledgeBase {
  private readonly chunks: KnowledgeChunk[] = [];

  constructor(
    private readonly embed: EmbeddingFunction,
    private readonly options: { minScore?: number } = {}
  ) {}

  async upsertSource(source: KnowledgeSource): Promise<void> {
    for (let index = this.chunks.length - 1; index >= 0; index -= 1) {
      if (this.chunks[index]?.sourceId === source.id) {
        this.chunks.splice(index, 1);
      }
    }

    for (const text of chunkText(source.text)) {
      this.chunks.push({
        sourceId: source.id,
        title: source.title,
        text,
        embedding: await this.embed(text)
      });
    }
  }

  async search(query: string, limit = 5): Promise<KnowledgeResult[]> {
    const expandedQuery = expandQuery(query);
    const queryEmbedding = await this.embed(expandedQuery);
    const queryTokens = new Set(tokenize(expandedQuery));
    const minScore = this.options.minScore ?? 0.08;
    return this.chunks
      .map((chunk) => {
        const keywordScore = keywordOverlap(queryTokens, tokenize(chunk.text));
        const semanticScore = cosine(queryEmbedding, chunk.embedding);
        return {
          sourceId: chunk.sourceId,
          title: chunk.title,
          text: chunk.text,
          score: keywordScore * 0.55 + semanticScore * 0.45
        };
      })
      .filter((result) => result.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

export function scoreKnowledgeResult(
  query: string,
  queryEmbedding: number[],
  chunk: KnowledgeChunk
): KnowledgeResult {
  const queryTokens = new Set(tokenize(expandQuery(query)));
  const keywordScore = keywordOverlap(queryTokens, tokenize(chunk.text));
  const semanticScore = cosine(queryEmbedding, chunk.embedding);
  return {
    sourceId: chunk.sourceId,
    title: chunk.title,
    text: chunk.text,
    score: keywordScore * 0.55 + semanticScore * 0.45
  };
}

export function expandQuery(query: string): string {
  const tokens = tokenize(query);
  const hasPriceIntent = tokens.some((token) => PRICE_TOKENS.has(token));
  if (!hasPriceIntent) {
    return query;
  }
  return `${query} fiyat fiyati fiyatı ucret ücret ücreti tutar bedel`;
}

const PRICE_TOKENS = new Set([
  "fiyat",
  "fiyati",
  "fiyatı",
  "ucret",
  "ücret",
  "ucreti",
  "ücreti",
  "tutar",
  "bedel",
  "kadar"
]);

function keywordOverlap(queryTokens: Set<string>, textTokens: string[]): number {
  if (queryTokens.size === 0) {
    return 0;
  }
  const textSet = new Set(textTokens);
  let matches = 0;
  for (const token of queryTokens) {
    if (textSet.has(token)) {
      matches += 1;
    }
  }
  return matches / queryTokens.size;
}

function cosine(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < length; index += 1) {
    dot += left[index]! * right[index]!;
    leftMagnitude += left[index]! * left[index]!;
    rightMagnitude += right[index]! * right[index]!;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}
