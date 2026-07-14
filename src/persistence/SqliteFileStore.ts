import Database from "better-sqlite3";

export interface StoredFile {
  id: string;
  filename: string;
  description: string;
  mimeType: string;
  path: string;
  createdAt: Date;
}

export class SqliteFileStore {
  constructor(private readonly db: Database.Database) {
    this.db.exec(`
      create table if not exists sent_files (
        id text primary key,
        filename text not null,
        description text not null,
        mime_type text not null,
        path text not null,
        created_at text not null
      );
    `);
  }

  list(): StoredFile[] {
    const rows = this.db.prepare("select * from sent_files order by created_at desc").all() as any[];
    return rows.map(row => ({
      id: row.id,
      filename: row.filename,
      description: row.description,
      mimeType: row.mime_type,
      path: row.path,
      createdAt: new Date(row.created_at)
    }));
  }

  insert(file: Omit<StoredFile, "createdAt">): StoredFile {
    const createdAt = new Date();
    this.db.prepare(`
      insert into sent_files (id, filename, description, mime_type, path, created_at)
      values (@id, @filename, @description, @mimeType, @path, @createdAt)
    `).run({
      id: file.id,
      filename: file.filename,
      description: file.description.trim(),
      mimeType: file.mimeType,
      path: file.path,
      createdAt: createdAt.toISOString()
    });
    return { ...file, createdAt };
  }

  delete(id: string): void {
    this.db.prepare("delete from sent_files where id = ?").run(id);
  }
  
  get(id: string): StoredFile | undefined {
    const row = this.db.prepare("select * from sent_files where id = ?").get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id,
      filename: row.filename,
      description: row.description,
      mimeType: row.mime_type,
      path: row.path,
      createdAt: new Date(row.created_at)
    };
  }
}
