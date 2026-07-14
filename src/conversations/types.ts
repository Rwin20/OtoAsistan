export type IncomingMessageType = "text" | "image" | "unsupported";
export type ConversationStatus = "ai_active" | "operator_active" | "waiting_operator" | "ignored";
export type ResponseMode = "safe_auto" | "always_auto";

export interface IncomingMessage {
  id: string;
  accountId?: string;
  chatId: string;
  chatName?: string;
  fromMe: boolean;
  isGroup: boolean;
  type: IncomingMessageType;
  text?: string;
  image?: {
    mimeType: string;
    data: Buffer;
  };
  timestamp: Date;
}

export interface StoredMessage {
  id: string;
  accountId: string;
  chatId: string;
  chatName?: string;
  direction: "incoming" | "outgoing";
  author: "customer" | "ai" | "operator" | "system";
  text: string;
  timestamp: Date;
}

export interface Conversation {
  accountId: string;
  chatId: string;
  chatName?: string;
  status: ConversationStatus;
  handoffReason?: string;
  activePersona?: string;
  updatedAt: Date;
}

export interface ConversationStore {
  hasProcessedMessage(accountId: string, messageId: string): boolean;
  markProcessedMessage(accountId: string, messageId: string): void;
  getConversation(accountId: string, chatId: string): Conversation | undefined;
  upsertConversation(conversation: Conversation): void;
  appendMessage(message: StoredMessage): void;
  listConversations(accountId?: string): Conversation[];
  listMessages(accountId: string, chatId: string): StoredMessage[];
  clearAIErrors(): void;
}
