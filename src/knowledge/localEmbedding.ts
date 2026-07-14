import { hashEmbedding } from "./hashEmbedding.js";
import type { EmbeddingFunction } from "./types.js";

type FeatureExtractionPipeline = (text: string, options: { pooling: "mean"; normalize: boolean }) => Promise<unknown>;
type TransformersModule = {
  pipeline: (task: string, model: string) => Promise<unknown>;
};

let pipelinePromise: Promise<FeatureExtractionPipeline> | undefined;
let warned = false;

export function createProductionEmbeddingFunction(): EmbeddingFunction {
  return async (text: string) => {
    if (process.env.KNOWLEDGE_EMBEDDINGS === "hash") {
      return hashEmbedding(text);
    }

    try {
      const extractor = await getPipeline();
      const output = await extractor(`query: ${text}`, { pooling: "mean", normalize: true });
      const vector = readVector(output);
      return vector.length > 0 ? vector : hashEmbedding(text);
    } catch (error) {
      if (!warned) {
        warned = true;
        console.warn(
          "Yerel anlamsal arama modeli yuklenemedi; anahtar kelime agirlikli arama ile devam ediliyor.",
          error instanceof Error ? error.message : error
        );
      }
      return hashEmbedding(text);
    }
  };
}

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  pipelinePromise ??= import("@huggingface/transformers").then(async (module) => {
    const { pipeline } = module as unknown as TransformersModule;
    return await pipeline("feature-extraction", "Xenova/multilingual-e5-small") as FeatureExtractionPipeline;
  });
  return pipelinePromise;
}

function readVector(output: unknown): number[] {
  if (output && typeof output === "object" && "data" in output) {
    const data = (output as { data: unknown }).data;
    if (Array.isArray(data) || ArrayBuffer.isView(data)) {
      return Array.from(data as ArrayLike<number>, Number);
    }
  }
  if (Array.isArray(output)) {
    return output.map(Number);
  }
  return [];
}
