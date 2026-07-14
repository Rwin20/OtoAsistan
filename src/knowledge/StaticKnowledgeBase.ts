import type { KnowledgeBase, KnowledgeResult } from "./types.js";

export class StaticKnowledgeBase implements KnowledgeBase {
  constructor(private readonly results: KnowledgeResult[]) {}

  async search(_query: string, limit = 5): Promise<KnowledgeResult[]> {
    return this.results.slice(0, limit);
  }
}
