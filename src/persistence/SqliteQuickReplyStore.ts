import Database from "better-sqlite3";

export interface QuickReply {
  id: string;
  title: string;
  text: string;
}

export class SqliteQuickReplyStore {
  constructor(private readonly db: Database.Database) {
    this.db.exec(`
      create table if not exists quick_replies (
        id text primary key,
        title text not null,
        text text not null
      );
    `);
  }

  list(): QuickReply[] {
    const rows = this.db.prepare("select * from quick_replies order by title asc").all() as QuickReply[];
    return rows;
  }

  upsert(quickReply: QuickReply): void {
    this.db.prepare(`
      insert into quick_replies (id, title, text)
      values (@id, @title, @text)
      on conflict(id) do update set
        title = excluded.title,
        text = excluded.text
    `).run({
      id: quickReply.id,
      title: quickReply.title.trim(),
      text: quickReply.text.trim()
    });
  }

  delete(id: string): void {
    this.db.prepare("delete from quick_replies where id = ?").run(id);
  }
}
