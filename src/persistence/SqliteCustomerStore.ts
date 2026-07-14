import Database from "better-sqlite3";

export interface CustomerProfile {
  accountId: string;
  chatId: string;
  name: string;
  notes: string;
  updatedAt: Date;
}

export class SqliteCustomerStore {
  constructor(private readonly db: Database.Database) {
    this.db.exec(`
      create table if not exists customers (
        account_id text not null,
        chat_id text not null,
        name text not null,
        notes text not null,
        updated_at text not null,
        primary key (account_id, chat_id)
      );
    `);
  }

  getProfile(accountId: string, chatId: string): CustomerProfile | undefined {
    const row = this.db.prepare("select * from customers where account_id = ? and chat_id = ?").get(accountId, chatId) as any;
    if (!row) return undefined;
    return {
      accountId: row.account_id,
      chatId: row.chat_id,
      name: row.name,
      notes: row.notes,
      updatedAt: new Date(row.updated_at)
    };
  }

  upsertProfile(profile: CustomerProfile): void {
    this.db.prepare(`
      insert into customers (account_id, chat_id, name, notes, updated_at)
      values (@accountId, @chatId, @name, @notes, @updatedAt)
      on conflict(account_id, chat_id) do update set
        name = excluded.name,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `).run({
      accountId: profile.accountId,
      chatId: profile.chatId,
      name: profile.name,
      notes: profile.notes,
      updatedAt: profile.updatedAt.toISOString()
    });
  }

  appendNotes(accountId: string, chatId: string, newNotes: string): void {
    const current = this.getProfile(accountId, chatId);
    const updatedNotes = current && current.notes ? `${current.notes}\n- ${newNotes}` : `- ${newNotes}`;
    this.upsertProfile({
      accountId,
      chatId,
      name: current ? current.name : "İsimsiz Müşteri",
      notes: updatedNotes,
      updatedAt: new Date()
    });
  }
}
