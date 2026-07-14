import { describe, expect, it } from "vitest";
import { ConversationService } from "../src/conversations/ConversationService.js";
import { InMemoryConversationStore } from "../src/conversations/InMemoryConversationStore.js";
import { StaticKnowledgeBase } from "../src/knowledge/StaticKnowledgeBase.js";
import type { KnowledgeBase, KnowledgeResult } from "../src/knowledge/types.js";
import { FakeAIProvider } from "./helpers/FakeAIProvider.js";

describe("ConversationService", () => {
  it("answers a private text message once when supported knowledge is found", async () => {
    const store = new InMemoryConversationStore();
    const sent: Array<{ accountId: string; chatId: string; text: string }> = [];
    const service = new ConversationService({
      store,
      knowledgeBase: new StaticKnowledgeBase([
        { sourceId: "faq-1", title: "Kargo", text: "Kargo teslimati 2 is gunu surer.", score: 0.91 }
      ]),
      aiProvider: new FakeAIProvider("Kargonuz 2 is gunu icinde teslim edilir."),
      sendMessage: async (accountId, chatId, text) => {
        sent.push({ accountId, chatId, text });
      }
    });

    await service.handleIncomingMessage({
      id: "msg-1",
      chatId: "905551112233@s.whatsapp.net",
      fromMe: false,
      isGroup: false,
      type: "text",
      text: "Kargo kac gunde gelir?",
      timestamp: new Date("2026-06-06T10:00:00Z")
    });
    await service.handleIncomingMessage({
      id: "msg-1",
      chatId: "905551112233@s.whatsapp.net",
      fromMe: false,
      isGroup: false,
      type: "text",
      text: "Kargo kac gunde gelir?",
      timestamp: new Date("2026-06-06T10:00:00Z")
    });

    expect(sent).toEqual([{
      accountId: "default",
      chatId: "905551112233@s.whatsapp.net",
      text: "Kargonuz 2 is gunu icinde teslim edilir."
    }]);
    expect(store.getConversation("default", "905551112233@s.whatsapp.net")?.status).toBe("ai_active");
  });

  it("keeps the same customer on different WhatsApp accounts as separate conversations", async () => {
    const store = new InMemoryConversationStore();
    const sent: Array<{ accountId: string; chatId: string; text: string }> = [];
    const service = new ConversationService({
      store,
      knowledgeBase: new StaticKnowledgeBase([
        { sourceId: "faq-1", title: "Kargo", text: "Kargo teslimati 2 is gunu surer.", score: 0.91 }
      ]),
      aiProvider: new FakeAIProvider("Kargonuz 2 is gunu icinde teslim edilir."),
      sendMessage: async (accountId, chatId, text) => {
        sent.push({ accountId, chatId, text });
      }
    });

    await service.handleIncomingMessage({
      id: "same-msg-id",
      accountId: "sales",
      chatId: "905551112233@s.whatsapp.net",
      fromMe: false,
      isGroup: false,
      type: "text",
      text: "Kargo kac gunde gelir?",
      timestamp: new Date("2026-06-06T10:00:00Z")
    });
    await service.handleIncomingMessage({
      id: "same-msg-id",
      accountId: "support",
      chatId: "905551112233@s.whatsapp.net",
      fromMe: false,
      isGroup: false,
      type: "text",
      text: "Kargo kac gunde gelir?",
      timestamp: new Date("2026-06-06T10:00:00Z")
    });

    expect(sent).toEqual([
      { accountId: "sales", chatId: "905551112233@s.whatsapp.net", text: "Kargonuz 2 is gunu icinde teslim edilir." },
      { accountId: "support", chatId: "905551112233@s.whatsapp.net", text: "Kargonuz 2 is gunu icinde teslim edilir." }
    ]);
    expect(store.getConversation("sales", "905551112233@s.whatsapp.net")?.status).toBe("ai_active");
    expect(store.getConversation("support", "905551112233@s.whatsapp.net")?.status).toBe("ai_active");
    expect(store.listConversations("sales")).toHaveLength(1);
    expect(store.listConversations("support")).toHaveLength(1);
  });

  it("hands off unsupported questions in safe mode", async () => {
    const store = new InMemoryConversationStore();
    const service = new ConversationService({
      store,
      knowledgeBase: new StaticKnowledgeBase([]),
      aiProvider: new FakeAIProvider("Bu cevap gonderilmemeli."),
      sendMessage: async () => {
        throw new Error("send should not be called");
      }
    });

    await service.handleIncomingMessage({
      id: "msg-2",
      chatId: "905551112233@s.whatsapp.net",
      fromMe: false,
      isGroup: false,
      type: "text",
      text: "Fiyat nedir?",
      timestamp: new Date("2026-06-06T10:01:00Z")
    });

    expect(store.getConversation("default", "905551112233@s.whatsapp.net")?.status).toBe("waiting_operator");
    expect(store.getConversation("default", "905551112233@s.whatsapp.net")?.handoffReason).toBe("knowledge_not_found");
  });

  it("filters AI meta text and lets AI answer again after a handoff when the operator has not taken over", async () => {
    const store = new InMemoryConversationStore();
    const sent: string[] = [];
    const knowledgeBase = new MutableKnowledgeBase([]);
    const service = new ConversationService({
      store,
      knowledgeBase,
      aiProvider: new FakeAIProvider("user safety: safe\nKargonuz 2 is gunu icinde teslim edilir."),
      sendMessage: async (_accountId, _chatId, text) => {
        sent.push(text);
      }
    });

    await service.handleIncomingMessage({
      id: "handoff-1",
      chatId: "905551112233@s.whatsapp.net",
      fromMe: false,
      isGroup: false,
      type: "text",
      text: "Fiyat nedir?",
      timestamp: new Date("2026-06-06T10:01:00Z")
    });

    expect(store.getConversation("default", "905551112233@s.whatsapp.net")?.status).toBe("waiting_operator");

    knowledgeBase.setResults([
      { sourceId: "faq-2", title: "Teslimat", text: "Kargo teslimati 2 is gunu surer.", score: 0.95 }
    ]);

    await service.handleIncomingMessage({
      id: "handoff-2",
      chatId: "905551112233@s.whatsapp.net",
      fromMe: false,
      isGroup: false,
      type: "text",
      text: "Peki teslimat süresi?",
      timestamp: new Date("2026-06-06T10:03:00Z")
    });

    expect(sent).toEqual(["Kargonuz 2 is gunu icinde teslim edilir."]);
    expect(store.getConversation("default", "905551112233@s.whatsapp.net")?.status).toBe("ai_active");
  });

  it("keeps AI silent after the operator takes over and allows a later resume", async () => {
    const store = new InMemoryConversationStore();
    const sent: string[] = [];
    const service = new ConversationService({
      store,
      knowledgeBase: new StaticKnowledgeBase([
        { sourceId: "faq-1", title: "Adres", text: "Adres Istanbul.", score: 0.9 }
      ]),
      aiProvider: new FakeAIProvider("Adres Istanbul."),
      sendMessage: async (_accountId, _chatId, text) => {
        sent.push(text);
      }
    });

    await service.takeOver("default", "905551112233@s.whatsapp.net");

    await service.handleIncomingMessage({
      id: "operator-owned",
      chatId: "905551112233@s.whatsapp.net",
      fromMe: false,
      isGroup: false,
      type: "text",
      text: "Adres?",
      timestamp: new Date("2026-06-06T10:04:00Z")
    });

    expect(sent).toEqual([]);
    expect(store.getConversation("default", "905551112233@s.whatsapp.net")?.status).toBe("operator_active");

    await service.resumeAI("default", "905551112233@s.whatsapp.net");

    await service.handleIncomingMessage({
      id: "ai-resumed",
      chatId: "905551112233@s.whatsapp.net",
      fromMe: false,
      isGroup: false,
      type: "text",
      text: "Adres?",
      timestamp: new Date("2026-06-06T10:05:00Z")
    });

    expect(sent).toEqual(["Adres Istanbul."]);
    expect(store.getConversation("default", "905551112233@s.whatsapp.net")?.status).toBe("ai_active");
  });

  it("uses recent conversation context when searching knowledge for follow-up price questions", async () => {
    const store = new InMemoryConversationStore();
    store.appendMessage({
      id: "old-customer-message",
      accountId: "default",
      chatId: "905551112233@s.whatsapp.net",
      direction: "incoming",
      author: "customer",
      text: "Premium temizlik paketi var mi?",
      timestamp: new Date("2026-06-06T09:59:00Z")
    });
    const knowledgeBase = new RecordingKnowledgeBase([
      {
        sourceId: "price-list",
        title: "Fiyat Listesi",
        text: "Premium temizlik paketi fiyati 2500 TL.",
        score: 0.9
      }
    ]);
    const sent: string[] = [];
    const service = new ConversationService({
      store,
      knowledgeBase,
      aiProvider: new FakeAIProvider("Premium temizlik paketi 2500 TL."),
      sendMessage: async (_accountId, _chatId, text) => {
        sent.push(text);
      }
    });

    await service.handleIncomingMessage({
      id: "msg-follow-up",
      chatId: "905551112233@s.whatsapp.net",
      fromMe: false,
      isGroup: false,
      type: "text",
      text: "Fiyati ne kadar?",
      timestamp: new Date("2026-06-06T10:00:00Z")
    });

    expect(knowledgeBase.queries[0]).toContain("Premium temizlik paketi");
    expect(knowledgeBase.queries[0]).toContain("Fiyati ne kadar?");
    expect(sent).toEqual(["Premium temizlik paketi 2500 TL."]);
  });

  it("uses fallback text when always-auto mode has no knowledge", async () => {
    const sent: string[] = [];
    const service = new ConversationService({
      store: new InMemoryConversationStore(),
      knowledgeBase: new StaticKnowledgeBase([]),
      aiProvider: new FakeAIProvider("Bu cevap gonderilmemeli."),
      mode: "always_auto",
      fallbackText: "Bu konuda ekibimiz sizinle ilgilenecek.",
      sendMessage: async (_accountId, _chatId, text) => {
        sent.push(text);
      }
    });

    await service.handleIncomingMessage({
      id: "msg-3",
      chatId: "905551112233@s.whatsapp.net",
      fromMe: false,
      isGroup: false,
      type: "text",
      text: "Bilmiyorum",
      timestamp: new Date("2026-06-06T10:02:00Z")
    });

    expect(sent).toEqual(["Bu konuda ekibimiz sizinle ilgilenecek."]);
  });

  it("ignores group and own messages", async () => {
    const sent: string[] = [];
    const service = new ConversationService({
      store: new InMemoryConversationStore(),
      knowledgeBase: new StaticKnowledgeBase([
        { sourceId: "faq-1", title: "Adres", text: "Adres Istanbul.", score: 0.9 }
      ]),
      aiProvider: new FakeAIProvider("Adres Istanbul."),
      sendMessage: async (_accountId, _chatId, text) => {
        sent.push(text);
      }
    });

    await service.handleIncomingMessage({
      id: "group-1",
      chatId: "123@g.us",
      fromMe: false,
      isGroup: true,
      type: "text",
      text: "Adres?",
      timestamp: new Date()
    });
    await service.handleIncomingMessage({
      id: "own-1",
      chatId: "905551112233@s.whatsapp.net",
      fromMe: true,
      isGroup: false,
      type: "text",
      text: "Adres?",
      timestamp: new Date()
    });

    expect(sent).toEqual([]);
  });
});

class RecordingKnowledgeBase implements KnowledgeBase {
  readonly queries: string[] = [];

  constructor(private readonly results: KnowledgeResult[]) {}

  async search(query: string): Promise<KnowledgeResult[]> {
    this.queries.push(query);
    return this.results;
  }
}

class MutableKnowledgeBase implements KnowledgeBase {
  constructor(private results: KnowledgeResult[]) {}

  setResults(results: KnowledgeResult[]): void {
    this.results = results;
  }

  async search(_query: string): Promise<KnowledgeResult[]> {
    return this.results;
  }
}
