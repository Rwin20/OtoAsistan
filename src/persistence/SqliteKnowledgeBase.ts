import Database from "better-sqlite3";
import { chunkText } from "../knowledge/chunkText.js";
import { expandQuery, scoreKnowledgeResult } from "../knowledge/HybridKnowledgeBase.js";
import type {
  EmbeddingFunction,
  KnowledgeResult,
  KnowledgeSource,
  KnowledgeSourceSummary,
  ManageableKnowledgeBase
} from "../knowledge/types.js";

export class SqliteKnowledgeBase implements ManageableKnowledgeBase {
  constructor(
    private readonly db: Database.Database,
    private readonly embed: EmbeddingFunction,
    private readonly options: { minScore?: number } = {}
  ) {
    this.db.exec(`
      create table if not exists knowledge_sources (
        id text primary key,
        title text not null,
        type text not null,
        filename text,
        mime_type text,
        text text not null,
        created_at text not null,
        updated_at text not null
      );

      create table if not exists knowledge_chunks (
        id integer primary key autoincrement,
        source_id text not null,
        title text not null,
        text text not null,
        embedding text not null,
        chunk_index integer not null,
        foreign key(source_id) references knowledge_sources(id) on delete cascade
      );

      create index if not exists idx_knowledge_chunks_source_id
        on knowledge_chunks(source_id);
    `);
  }

  async upsertSource(source: KnowledgeSource): Promise<void> {
    const id = source.id.trim();
    const title = source.title.trim();
    const text = source.text.trim();
    if (!id || !title || !text) {
      throw new Error("Bilgi kaynagi icin id, baslik ve metin zorunludur.");
    }

    const now = new Date().toISOString();
    const existing = this.db.prepare("select created_at from knowledge_sources where id = ?").get(id) as SourceDateRow | undefined;
    const chunks = await Promise.all(chunkText(text).map(async (chunk, index) => ({
      sourceId: id,
      title,
      text: chunk,
      embedding: JSON.stringify(await this.embed(chunk)),
      chunkIndex: index
    })));

    const transaction = this.db.transaction(() => {
      this.db.prepare(`
        insert into knowledge_sources (id, title, type, filename, mime_type, text, created_at, updated_at)
        values (@id, @title, @type, @filename, @mimeType, @text, @createdAt, @updatedAt)
        on conflict(id) do update set
          title = excluded.title,
          type = excluded.type,
          filename = excluded.filename,
          mime_type = excluded.mime_type,
          text = excluded.text,
          updated_at = excluded.updated_at
      `).run({
        id,
        title,
        type: source.type ?? "text",
        filename: source.filename ?? null,
        mimeType: source.mimeType ?? null,
        text,
        createdAt: existing?.created_at ?? now,
        updatedAt: now
      });

      this.db.prepare("delete from knowledge_chunks where source_id = ?").run(id);
      const insertChunk = this.db.prepare(`
        insert into knowledge_chunks (source_id, title, text, embedding, chunk_index)
        values (@sourceId, @title, @text, @embedding, @chunkIndex)
      `);
      for (const chunk of chunks) {
        insertChunk.run(chunk);
      }
    });

    transaction();
  }

  listSources(): KnowledgeSourceSummary[] {
    const rows = this.db.prepare(`
      select
        sources.id,
        sources.title,
        sources.type,
        sources.filename,
        sources.mime_type,
        sources.text,
        sources.created_at,
        sources.updated_at,
        count(chunks.id) as chunk_count
      from knowledge_sources sources
      left join knowledge_chunks chunks on chunks.source_id = sources.id
      group by sources.id
      order by sources.updated_at desc
    `).all() as SourceRow[];

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      type: row.type === "document" ? "document" : "text",
      filename: row.filename ?? undefined,
      mimeType: row.mime_type ?? undefined,
      text: row.text,
      chunkCount: row.chunk_count,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  deleteSource(sourceId: string): void {
    const transaction = this.db.transaction(() => {
      this.db.prepare("delete from knowledge_chunks where source_id = ?").run(sourceId);
      this.db.prepare("delete from knowledge_sources where id = ?").run(sourceId);
    });
    transaction();
  }

  async search(query: string, limit = 5): Promise<KnowledgeResult[]> {
    const expandedQuery = expandQuery(query);
    const queryEmbedding = await this.embed(expandedQuery);
    const minScore = this.options.minScore ?? 0.08;
    const rows = this.db.prepare(`
      select source_id, title, text, embedding
      from knowledge_chunks
    `).all() as ChunkRow[];

    return rows
      .map((row) => scoreKnowledgeResult(query, queryEmbedding, {
        sourceId: row.source_id,
        title: row.title,
        text: row.text,
        embedding: parseEmbedding(row.embedding)
      }))
      .filter((result) => result.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

interface SourceDateRow {
  created_at: string;
}

interface SourceRow {
  id: string;
  title: string;
  type: string;
  filename: string | null;
  mime_type: string | null;
  text: string;
  created_at: string;
  updated_at: string;
  chunk_count: number;
}

interface ChunkRow {
  source_id: string;
  title: string;
  text: string;
  embedding: string;
}

function parseEmbedding(value: string): number[] {
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed.map(Number) : [];
}
