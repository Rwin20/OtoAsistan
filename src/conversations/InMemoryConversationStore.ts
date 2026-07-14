import type { Conversation, ConversationStore, StoredMessage } from "./types.js";

export class InMemoryConversationStore implements ConversationStore {
  private readonly processedMessages = new Set<string>();
  private readonly conversations = new Map<string, Conversation>();
  private readonly messages: StoredMessage[] = [];

  hasProcessedMessage(accountId: string, messageId: string): boolean {
    return this.processedMessages.has(key(accountId, messageId));
  }

  markProcessedMessage(accountId: string, messageId: string): void {
    this.processedMessages.add(key(accountId, messageId));
  }

  getConversation(accountId: string, chatId: string): Conversation | undefined {
    return this.conversations.get(key(accountId, chatId));
  }

  upsertConversation(conversation: Conversation): void {
    this.conversations.set(key(conversation.accountId, conversation.chatId), conversation);
  }

  appendMessage(message: StoredMessage): void {
    this.messages.push(message);
  }

  listConversations(accountId?: string): Conversation[] {
    return [...this.conversations.values()]
      .filter((conversation) => !accountId || conversation.accountId === accountId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  listMessages(accountId: string, chatId: string): StoredMessage[] {
    return this.messages
      .filter((message) => message.accountId === accountId && message.chatId === chatId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  clearAIErrors(): void {
    for (const [, conversation] of this.conversations) {
      if (
        conversation.status === "waiting_operator" &&
        conversation.handoffReason &&
        (conversation.handoffReason.includes("Bot kotası doldu") ||
          conversation.handoffReason.includes("API anahtarı geçersiz") ||
          conversation.handoffReason.includes("Bağlantı zaman aşımına uğradı"))
      ) {
        conversation.status = "ai_active";
        conversation.handoffReason = undefined;
        conversation.updatedAt = new Date();
      }
    }
  }
}

function key(accountId: string, id: string): string {
  return `${accountId}:${id}`;
}
