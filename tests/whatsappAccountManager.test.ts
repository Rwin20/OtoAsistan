import { describe, expect, it } from "vitest";
import { WhatsAppAccountManager } from "../src/whatsapp/WhatsAppAccountManager.js";
import type { IncomingMessage } from "../src/conversations/types.js";
import type { WhatsAppAdapterFactory } from "../src/whatsapp/types.js";

describe("WhatsAppAccountManager", () => {
  it("starts and routes multiple WhatsApp accounts independently", async () => {
    const sent: Array<{ sessionName: string; chatId: string; text: string }> = [];
    const factory: WhatsAppAdapterFactory = (account) => ({
      start: async (onMessage) => {
        await onMessage(messageFor(account.id));
      },
      sendText: async (chatId, text) => {
        sent.push({ sessionName: account.sessionName, chatId, text });
      },
      sendFile: async () => {},
      status: () => ({ connected: true, detail: `connected:${account.sessionName}` })
    });
    const manager = new WhatsAppAccountManager(factory);
    const received: IncomingMessage[] = [];

    manager.addAccount({ id: "sales", label: "Satis", sessionName: "wa-sales" });
    manager.addAccount({ id: "support", label: "Destek", sessionName: "wa-support" });
    await manager.startAll((message) => {
      received.push(message);
      return Promise.resolve();
    });
    await manager.sendText("support", "905551112233@s.whatsapp.net", "Merhaba");

    expect(received.map((message) => message.accountId)).toEqual(["sales", "support"]);
    expect(sent).toEqual([
      { sessionName: "wa-support", chatId: "905551112233@s.whatsapp.net", text: "Merhaba" }
    ]);
    expect(manager.statuses()).toEqual([
      { id: "sales", label: "Satis", sessionName: "wa-sales", connected: true, detail: "connected:wa-sales" },
      { id: "support", label: "Destek", sessionName: "wa-support", connected: true, detail: "connected:wa-support" }
    ]);
  });

  it("does not start the same account more than once", async () => {
    let starts = 0;
    const factory: WhatsAppAdapterFactory = () => ({
      start: async () => {
        starts += 1;
      },
      sendText: async () => {},
      sendFile: async () => {},
      status: () => ({ connected: true, detail: "connected" })
    });
    const manager = new WhatsAppAccountManager(factory);
    manager.addAccount({ id: "sales", label: "Satis", sessionName: "wa-sales" });

    await manager.startAccount("sales", async () => {});
    await manager.startAccount("sales", async () => {});

    expect(starts).toBe(1);
  });

  it("can start only the first account for fast QR startup", async () => {
    const started: string[] = [];
    const factory: WhatsAppAdapterFactory = (account) => ({
      start: async () => {
        started.push(account.id);
      },
      sendText: async () => {},
      sendFile: async () => {},
      status: () => ({ connected: false, detail: "not_started" })
    });
    const manager = new WhatsAppAccountManager(factory);

    manager.addAccount({ id: "default", label: "Ana WhatsApp", sessionName: "wa-default" });
    manager.addAccount({ id: "deneme", label: "Deneme", sessionName: "wa-deneme" });

    await manager.startFirstAccount(async () => {});

    expect(started).toEqual(["default"]);
  });

  it("broadcasts status updates as soon as an adapter changes state", async () => {
    const factory: WhatsAppAdapterFactory = () => ({
      start: async (_onMessage, onStatusChange) => {
        onStatusChange?.();
      },
      sendText: async () => {},
      sendFile: async () => {},
      status: () => ({ connected: false, qr: "data:image/png;base64,AAAA", detail: "qr_required" })
    });
    const manager = new WhatsAppAccountManager(factory);
    const snapshots: Array<{ detail: string; qr?: string }> = [];

    manager.subscribeStatuses((statuses) => {
      snapshots.push({
        detail: statuses[0]?.detail ?? "missing",
        qr: statuses[0]?.qr
      });
    });

    manager.addAccount({ id: "sales", label: "Satis", sessionName: "wa-sales" });
    await manager.startAccount("sales", async () => {});

    expect(snapshots.at(-1)).toEqual({
      detail: "qr_required",
      qr: "data:image/png;base64,AAAA"
    });
  });
});

function messageFor(accountId: string): IncomingMessage {
  return {
    id: "incoming-1",
    accountId,
    chatId: "905551112233@s.whatsapp.net",
    fromMe: false,
    isGroup: false,
    type: "text",
    text: "Merhaba",
    timestamp: new Date("2026-06-06T10:00:00Z")
  };
}
