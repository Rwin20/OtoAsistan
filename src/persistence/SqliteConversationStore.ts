import Database from "better-sqlite3";
import type { Conversation, ConversationStore, StoredMessage } from "../conversations/types.js";

export class SqliteConversationStore implements ConversationStore {
  constructor(private readonly db: Database.Database) {
    migrateConversationSchema(this.db);
    this.db.exec(`
      create table if not exists processed_messages (
        account_id text not null,
        id text not null,
        primary key (account_id, id)
      );
      create table if not exists conversations (
        account_id text not null,
        chat_id text not null,
        chat_name text,
        status text not null,
        handoff_reason text,
        active_persona text,
        updated_at text not null,
        primary key (account_id, chat_id)
      );
      create table if not exists messages (
        id text primary key,
        account_id text not null,
        chat_id text not null,
        direction text not null,
        author text not null,
        text text not null,
        timestamp text not null
      );
    `);
  }

  hasProcessedMessage(accountId: string, messageId: string): boolean {
    return Boolean(this.db.prepare("select 1 from processed_messages where account_id = ? and id = ?").get(accountId, messageId));
  }

  markProcessedMessage(accountId: string, messageId: string): void {
    this.db.prepare("insert or ignore into processed_messages (account_id, id) values (?, ?)").run(accountId, messageId);
  }

  getConversation(accountId: string, chatId: string): Conversation | undefined {
    const row = this.db.prepare("select * from conversations where account_id = ? and chat_id = ?").get(accountId, chatId) as Row | undefined;
    return row ? toConversation(row) : undefined;
  }

  upsertConversation(conversation: Conversation): void {
    this.db.prepare(`
      insert into conversations (account_id, chat_id, chat_name, status, handoff_reason, active_persona, updated_at)
      values (@accountId, @chatId, @chatName, @status, @handoffReason, @activePersona, @updatedAt)
      on conflict(account_id, chat_id) do update set
        chat_name = coalesce(excluded.chat_name, chat_name),
        status = excluded.status,
        handoff_reason = excluded.handoff_reason,
        active_persona = coalesce(excluded.active_persona, active_persona),
        updated_at = excluded.updated_at
    `).run({
      accountId: conversation.accountId,
      chatId: conversation.chatId,
      chatName: conversation.chatName ?? null,
      status: conversation.status,
      handoffReason: conversation.handoffReason ?? null,
      activePersona: conversation.activePersona ?? null,
      updatedAt: conversation.updatedAt.toISOString()
    });
  }

  appendMessage(message: StoredMessage): void {
    this.db.prepare(`
      insert or ignore into messages (id, account_id, chat_id, direction, author, text, timestamp)
      values (@id, @accountId, @chatId, @direction, @author, @text, @timestamp)
    `).run({
      ...message,
      timestamp: message.timestamp.toISOString()
    });
  }

  listConversations(accountId?: string): Conversation[] {
    const rows = accountId
      ? this.db.prepare("select * from conversations where account_id = ? order by updated_at desc").all(accountId)
      : this.db.prepare("select * from conversations order by updated_at desc").all();
    return (rows as Row[]).map(toConversation);
  }

  listMessages(accountId: string, chatId: string): StoredMessage[] {
    return (this.db.prepare("select * from messages where account_id = ? and chat_id = ? order by timestamp asc").all(accountId, chatId) as MessageRow[])
      .map((row) => ({
        id: row.id,
        accountId: row.account_id,
        chatId: row.chat_id,
        direction: row.direction as StoredMessage["direction"],
        author: row.author as StoredMessage["author"],
        text: row.text,
        timestamp: new Date(row.timestamp)
      }));
  }

  clearAIErrors(): void {
    this.db.prepare(`
      update conversations
      set status = 'ai_active', handoff_reason = null
      where status = 'waiting_operator'
        and (
          handoff_reason like '%Bot kotası doldu%' or 
          handoff_reason like '%API anahtarı geçersiz%' or 
          handoff_reason like '%Bağlantı zaman aşımına uğradı%'
        )
    `).run();
  }
}

interface Row {
  account_id: string;
  chat_id: string;
  chat_name: string | null;
  status: Conversation["status"];
  handoff_reason: string | null;
  active_persona: string | null;
  updated_at: string;
}

interface MessageRow {
  id: string;
  account_id: string;
  chat_id: string;
  direction: string;
  author: string;
  text: string;
  timestamp: string;
}

function toConversation(row: Row): Conversation {
  return {
    accountId: row.account_id,
    chatId: row.chat_id,
    chatName: row.chat_name ?? undefined,
    status: row.status,
    handoffReason: row.handoff_reason ?? undefined,
    activePersona: row.active_persona ?? undefined,
    updatedAt: new Date(row.updated_at)
  };
}

function migrateConversationSchema(db: Database.Database): void {
  const processedInfo = db.prepare("pragma table_info(processed_messages)").all() as Array<{ name: string }>;
  if (processedInfo.length > 0 && !processedInfo.some((column) => column.name === "account_id")) {
    db.exec(`
      alter table processed_messages rename to processed_messages_legacy;
      create table processed_messages (
        account_id text not null,
        id text not null,
        primary key (account_id, id)
      );
      insert or ignore into processed_messages (account_id, id)
      select 'default', id from processed_messages_legacy;
      drop table processed_messages_legacy;
    `);
  }

  const conversationInfo = db.prepare("pragma table_info(conversations)").all() as Array<{ name: string }>;
  if (conversationInfo.length > 0 && !conversationInfo.some((column) => column.name === "account_id")) {
    db.exec(`
      alter table conversations rename to conversations_legacy;
      create table conversations (
        account_id text not null,
        chat_id text not null,
        chat_name text,
        status text not null,
        handoff_reason text,
        active_persona text,
        updated_at text not null,
        primary key (account_id, chat_id)
      );
      insert or ignore into conversations (account_id, chat_id, status, handoff_reason, updated_at)
      select 'default', chat_id, status, handoff_reason, updated_at from conversations_legacy;
      drop table conversations_legacy;
    `);
  } else {
    if (!conversationInfo.some((column) => column.name === "chat_name")) {
      db.exec(`alter table conversations add column chat_name text;`);
    }
    if (!conversationInfo.some((column) => column.name === "active_persona")) {
      db.exec(`alter table conversations add column active_persona text;`);
    }
  }

  const messageInfo = db.prepare("pragma table_info(messages)").all() as Array<{ name: string }>;
  if (messageInfo.length > 0 && !messageInfo.some((column) => column.name === "account_id")) {
    db.exec(`
      alter table messages rename to messages_legacy;
      create table messages (
        id text primary key,
        account_id text not null,
        chat_id text not null,
        direction text not null,
        author text not null,
        text text not null,
        timestamp text not null
      );
      insert or ignore into messages (id, account_id, chat_id, direction, author, text, timestamp)
      select id, 'default', chat_id, direction, author, text, timestamp from messages_legacy;
      drop table messages_legacy;
    `);
  }
}
