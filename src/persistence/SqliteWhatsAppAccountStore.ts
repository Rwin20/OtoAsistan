import Database from "better-sqlite3";
import type { WhatsAppAccount } from "../whatsapp/types.js";

export class SqliteWhatsAppAccountStore {
  constructor(private readonly db: Database.Database) {
    this.db.exec(`
      create table if not exists whatsapp_accounts (
        id text primary key,
        label text not null,
        session_name text not null unique
      );
    `);
  }

  ensureDefaultAccount(): void {
    if (this.listAccounts().length === 0) {
      this.addAccount({ id: "default", label: "Ana WhatsApp", sessionName: "whatsappisletme-default" });
    }
  }

  addAccount(account: WhatsAppAccount): void {
    this.db.prepare(`
      insert into whatsapp_accounts (id, label, session_name)
      values (@id, @label, @sessionName)
    `).run(account);
  }

  createAccount(label: string): WhatsAppAccount {
    const baseId = slug(label);
    let id = baseId;
    let suffix = 2;
    while (this.exists(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    const account = { id, label, sessionName: `whatsappisletme-${id}` };
    this.addAccount(account);
    return account;
  }

  listAccounts(): WhatsAppAccount[] {
    return (this.db.prepare("select id, label, session_name from whatsapp_accounts order by label asc").all() as Row[])
      .map((row) => ({ id: row.id, label: row.label, sessionName: row.session_name }));
  }

  private exists(id: string): boolean {
    return Boolean(this.db.prepare("select 1 from whatsapp_accounts where id = ?").get(id));
  }
}

interface Row {
  id: string;
  label: string;
  session_name: string;
}

function slug(value: string): string {
  const normalized = value
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || `wa-${Date.now()}`;
}
