export interface KnowledgeSource {
  id: string;
  title: string;
  text: string;
  type?: "text" | "document";
  filename?: string;
  mimeType?: string;
}

export interface KnowledgeResult {
  sourceId: string;
  title: string;
  text: string;
  score: number;
}

export type EmbeddingFunction = (text: string) => Promise<number[]> | number[];

export interface KnowledgeBase {
  search(query: string, limit?: number): Promise<KnowledgeResult[]>;
}

export interface KnowledgeSourceSummary {
  id: string;
  title: string;
  type: "text" | "document";
  filename?: string;
  mimeType?: string;
  text: string;
  chunkCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ManageableKnowledgeBase extends KnowledgeBase {
  upsertSource(source: KnowledgeSource): Promise<void>;
  listSources(): KnowledgeSourceSummary[];
  deleteSource(sourceId: string): void;
}
