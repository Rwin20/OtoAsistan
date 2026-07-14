import type { AIProvider } from "../ai/types.js";
import type { KnowledgeBase } from "../knowledge/types.js";
import type {
  Conversation,
  ConversationStore,
  IncomingMessage,
  ResponseMode,
  StoredMessage
} from "./types.js";

import type { QuickReply, SqliteQuickReplyStore } from "../persistence/SqliteQuickReplyStore.js";
import type { StoredFile, SqliteFileStore } from "../persistence/SqliteFileStore.js";
import type { SqliteCustomerStore } from "../persistence/SqliteCustomerStore.js";
import type { SqliteOrderStore } from "../persistence/SqliteOrderStore.js";

interface ConversationServiceOptions {
  store: ConversationStore;
  knowledgeBase: KnowledgeBase;
  aiProvider: AIProvider;
  sendMessage: (accountId: string, chatId: string, text: string) => Promise<void>;
  sendFile?: (accountId: string, chatId: string, path: string, filename: string) => Promise<void>;
  quickReplyStore?: SqliteQuickReplyStore;
  fileStore?: SqliteFileStore;
  customerStore?: SqliteCustomerStore;
  orderStore?: SqliteOrderStore;
  mode?: ResponseMode;
  fallbackText?: string;
  getLicenseStatus?: () => { valid: boolean, message: string };
  getPersonas?: () => Array<{ id: string; name: string; role: string; instruction: string }>;
}

export class ConversationService {
  private mode: ResponseMode;
  private fallbackText: string;
  private aiProvider: AIProvider;

  constructor(private readonly options: ConversationServiceOptions) {
    this.mode = options.mode ?? "safe_auto";
    this.fallbackText = options.fallbackText ?? "Bu konuda ekibimiz sizinle ilgilenecek.";
    this.aiProvider = options.aiProvider;
  }

  setMode(mode: ResponseMode): void {
    this.mode = mode;
  }

  setAIProvider(aiProvider: AIProvider): void {
    this.aiProvider = aiProvider;
  }

  async operatorReply(accountId: string, chatId: string, text: string): Promise<void> {
    this.takeOver(accountId, chatId);
    
    let cleanedText = text;
    const fileMatch = cleanedText.match(/\[SEND_FILE:([^\]]+)\]/);
    if (fileMatch && this.options.fileStore && this.options.sendFile) {
      const fileId = fileMatch[1];
      const file = this.options.fileStore.get(fileId);
      if (file) {
        await this.options.sendFile(accountId, chatId, file.path, file.filename);
      }
      cleanedText = cleanedText.replace(/\[SEND_FILE:[^\]]+\]/g, "").trim();
    }

    if (cleanedText) {
      await this.options.sendMessage(accountId, chatId, cleanedText);
    }

    this.options.store.appendMessage({
      id: `operator-${Date.now()}`,
      accountId,
      chatId,
      direction: "outgoing",
      author: "operator",
      text: cleanedText || "[Dosya gönderildi]",
      timestamp: new Date()
    });
  }

  async resumeAI(accountId: string, chatId: string): Promise<void> {
    const existing = this.options.store.getConversation(accountId, chatId);
    this.options.store.upsertConversation({
      accountId,
      chatId,
      chatName: existing?.chatName,
      status: "ai_active",
      handoffReason: undefined,
      updatedAt: new Date()
    });
  }

  async takeOver(accountId: string, chatId: string): Promise<void> {
    const existing = this.options.store.getConversation(accountId, chatId);
    this.options.store.upsertConversation({
      accountId,
      chatId,
      chatName: existing?.chatName,
      status: "operator_active",
      updatedAt: new Date()
    });
  }

  async ignore(accountId: string, chatId: string): Promise<void> {
    const existing = this.options.store.getConversation(accountId, chatId);
    this.options.store.upsertConversation({
      accountId,
      chatId,
      chatName: existing?.chatName,
      status: "ignored",
      handoffReason: undefined,
      updatedAt: new Date()
    });
  }

  async handleIncomingMessage(message: IncomingMessage): Promise<void> {
    if (message.fromMe || message.isGroup || message.type === "unsupported") {
      return;
    }
    const accountId = message.accountId ?? "default";
    if (this.options.store.hasProcessedMessage(accountId, message.id)) {
      return;
    }
    this.options.store.markProcessedMessage(accountId, message.id);
    this.options.store.appendMessage(toStoredIncoming(accountId, message));

    const existing = this.options.store.getConversation(accountId, message.chatId);
    if (existing?.status === "operator_active" || existing?.status === "ignored") {
      this.options.store.upsertConversation({ ...existing, updatedAt: new Date() });
      return;
    }

    if (this.options.getLicenseStatus) {
      const license = this.options.getLicenseStatus();
      if (!license.valid) {
        this.handoff(accountId, message.chatId, "Lisans süreniz doldu veya geçersiz (" + license.message + ")");
        return;
      }
    }

    const userText = message.text ?? "[Görsel mesaj]";
    const context = await this.options.knowledgeBase.search(
      buildKnowledgeSearchQuery(this.options.store.listMessages(accountId, message.chatId), userText),
      5
    );
    if (context.length === 0) {
      await this.handleNoKnowledge(accountId, message.chatId);
      return;
    }

    if (message.image && !this.aiProvider.supportsVision) {
      this.handoff(accountId, message.chatId, "vision_not_supported");
      return;
    }

    try {
      const response = await this.aiProvider.generate({
        userMessage: userText,
        context,
        image: message.image,
        quickReplies: this.options.quickReplyStore?.list(),
        files: this.options.fileStore?.list(),
        customerProfile: this.options.customerStore?.getProfile(accountId, message.chatId)?.notes,
        personas: this.options.getPersonas ? this.options.getPersonas() : undefined,
        activePersona: existing?.activePersona
      });
      let cleanedText = sanitizeAIText(response.text);

      const fileMatch = cleanedText.match(/\[SEND_FILE:([^\]]+)\]/);
      if (fileMatch && this.options.fileStore && this.options.sendFile) {
        const fileId = fileMatch[1];
        const file = this.options.fileStore.get(fileId);
        if (file) {
          await this.options.sendFile(accountId, message.chatId, file.path, file.filename);
        }
        cleanedText = cleanedText.replace(/\[SEND_FILE:[^\]]+\]/g, "").trim();
      }

      if (cleanedText.includes("[SENTIMENT:ANGRY]")) {
        cleanedText = cleanedText.replace(/\[SENTIMENT:ANGRY\]/g, "").trim();
        this.handoff(accountId, message.chatId, "Kızgın / Şikayetçi Müşteri", message.chatName);
        if (cleanedText) {
          await this.options.sendMessage(accountId, message.chatId, cleanedText);
        }
        return;
      }

      const orderMatch = cleanedText.match(/\[CREATE_ORDER:(.+?)\]/s);
      if (orderMatch && this.options.orderStore) {
        const orderDetails = orderMatch[1].trim();
        this.options.orderStore.createOrder(accountId, message.chatId, orderDetails);
        cleanedText = cleanedText.replace(/\[CREATE_ORDER:.+?\]/gs, "").trim();
      }

      const profileMatch = cleanedText.match(/\[UPDATE_PROFILE:(.+?)\]/s);
      if (profileMatch && this.options.customerStore) {
        const newNotes = profileMatch[1].trim();
        this.options.customerStore.appendNotes(accountId, message.chatId, newNotes);
        cleanedText = cleanedText.replace(/\[UPDATE_PROFILE:.+?\]/gs, "").trim();
      }

      let newPersona = existing?.activePersona;
      const personaMatch = cleanedText.match(/\[PERSONA:(.+?)\]/);
      if (personaMatch) {
        newPersona = personaMatch[1].trim();
        cleanedText = cleanedText.replace(/\[PERSONA:.+?\]/g, "").trim();
      }

      if (!cleanedText && !fileMatch) {
        this.handoff(accountId, message.chatId, "empty_ai_response", message.chatName);
        return;
      }

      if (cleanedText) {
        await this.options.sendMessage(accountId, message.chatId, cleanedText);
      }
      
      this.options.store.appendMessage({
        id: `ai-${accountId}-${message.id}`,
        accountId,
        chatId: message.chatId,
        chatName: message.chatName,
        direction: "outgoing",
        author: "ai",
        text: cleanedText,
        timestamp: new Date()
      });
      this.options.store.upsertConversation({
        ...active(accountId, message.chatId, message.chatName),
        activePersona: newPersona
      });
    } catch (error) {
      let reason = "AI yanıt veremedi.";
      const errorMsg = error instanceof Error ? error.message.toLowerCase() : "";
      if (errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("insufficient_quota")) {
        reason = "Bot kotası doldu (Token bitti), lütfen API anahtarınızı kontrol edin.";
      } else if (errorMsg.includes("401") || errorMsg.includes("unauthorized") || errorMsg.includes("invalid api key")) {
        reason = "API anahtarı geçersiz.";
      } else if (errorMsg.includes("timeout") || errorMsg.includes("network")) {
        reason = "Bağlantı zaman aşımına uğradı.";
      }
      this.handoff(accountId, message.chatId, reason, message.chatName);
    }
  }

  private async handleNoKnowledge(accountId: string, chatId: string): Promise<void> {
    if (this.mode === "always_auto") {
      await this.options.sendMessage(accountId, chatId, this.fallbackText);
      const existing = this.options.store.getConversation(accountId, chatId);
      this.options.store.appendMessage({
        id: `fallback-${accountId}-${Date.now()}`,
        accountId,
        chatId,
        chatName: existing?.chatName,
        direction: "outgoing",
        author: "ai",
        text: this.fallbackText,
        timestamp: new Date()
      });
      this.options.store.upsertConversation(active(accountId, chatId, existing?.chatName));
      return;
    }
    const existing = this.options.store.getConversation(accountId, chatId);
    this.handoff(accountId, chatId, "Bilgi tabanında eşleşme bulunamadı.", existing?.chatName);
  }

  private handoff(accountId: string, chatId: string, reason: string, chatName?: string): void {
    const existing = this.options.store.getConversation(accountId, chatId);
    this.options.store.upsertConversation({
      accountId,
      chatId,
      chatName: chatName ?? existing?.chatName,
      status: "waiting_operator",
      handoffReason: reason,
      updatedAt: new Date()
    });
  }
}

function buildKnowledgeSearchQuery(messages: StoredMessage[], currentText: string): string {
  const recentCustomerTexts = messages
    .filter((storedMessage) => storedMessage.author === "customer" && storedMessage.direction === "incoming")
    .slice(-6)
    .map((storedMessage) => storedMessage.text.trim())
    .filter(Boolean);

  if (recentCustomerTexts.length === 0) {
    return currentText;
  }

  return [...new Set([...recentCustomerTexts, currentText.trim()].filter(Boolean))].join("\n");
}

function active(accountId: string, chatId: string, chatName?: string): Conversation {
  return { accountId, chatId, chatName, status: "ai_active", updatedAt: new Date() };
}

function toStoredIncoming(accountId: string, message: IncomingMessage): StoredMessage {
  return {
    id: `${accountId}-${message.id}`,
    accountId,
    chatId: message.chatId,
    chatName: message.chatName,
    direction: "incoming",
    author: "customer",
    text: message.text ?? "[Görsel mesaj]",
    timestamp: message.timestamp
  };
}

function sanitizeAIText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^(?:user\s*)?safety\s*:\s*(?:safe|unsafe|unknown|blocked|allowed)\s*$/i.test(line))
    .filter((line) => !/^safety\s*:\s*.+$/i.test(line))
    .filter((line) => !/^safe_auto$/i.test(line))
    .join("\n")
    .trim();
}
