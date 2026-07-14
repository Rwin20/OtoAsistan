import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export interface Order {
  id: string;
  accountId: string;
  chatId: string;
  details: string;
  status: "pending" | "completed" | "cancelled";
  createdAt: Date;
}

export class SqliteOrderStore {
  constructor(private readonly db: Database.Database) {
    this.db.exec(`
      create table if not exists orders (
        id text primary key,
        account_id text not null,
        chat_id text not null,
        details text not null,
        status text not null,
        created_at text not null
      );
    `);
  }

  list(): Order[] {
    const rows = this.db.prepare("select * from orders order by created_at desc").all() as any[];
    return rows.map(row => ({
      id: row.id,
      accountId: row.account_id,
      chatId: row.chat_id,
      details: row.details,
      status: row.status as Order["status"],
      createdAt: new Date(row.created_at)
    }));
  }
  
  createOrder(accountId: string, chatId: string, details: string): Order {
    const order: Order = {
      id: `order-${randomUUID()}`,
      accountId,
      chatId,
      details,
      status: "pending",
      createdAt: new Date()
    };
    
    this.db.prepare(`
      insert into orders (id, account_id, chat_id, details, status, created_at)
      values (@id, @accountId, @chatId, @details, @status, @createdAt)
    `).run({
      id: order.id,
      accountId: order.accountId,
      chatId: order.chatId,
      details: order.details,
      status: order.status,
      createdAt: order.createdAt.toISOString()
    });
    
    return order;
  }

  updateStatus(id: string, status: Order["status"]): void {
    this.db.prepare("update orders set status = ? where id = ?").run(status, id);
  }
}
