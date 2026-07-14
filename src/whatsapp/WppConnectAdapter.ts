import path from "node:path";
import type { IncomingMessage } from "../conversations/types.js";
import type { WhatsAppAccount, WhatsAppAdapter, WhatsAppStatus } from "./types.js";

type WppClient = {
  onMessage(handler: (message: WppMessage) => void): void;
  sendText(chatId: string, text: string): Promise<unknown>;
  sendFile(chatId: string, path: string, filename: string, caption?: string): Promise<unknown>;
  decryptFile?(message: WppMessage): Promise<Buffer>;
};

interface WppMessage {
  id: string;
  from: string;
  body?: string;
  isGroupMsg?: boolean;
  fromMe?: boolean;
  type?: string;
  mimetype?: string;
  sender?: {
    name?: string;
    pushname?: string;
    formattedName?: string;
  };
}

export class WppConnectAdapter implements WhatsAppAdapter {
  private client: WppClient | undefined;
  private currentStatus: WhatsAppStatus = { connected: false, detail: "not_started" };

  constructor(private readonly account: WhatsAppAccount = {
    id: "default",
    label: "Varsayilan",
    sessionName: "whatsappisletme"
  }) {}

  async start(
    onMessage: (message: IncomingMessage) => Promise<void>,
    onStatusChange?: () => void
  ): Promise<void> {
    const wppconnect = await import("@wppconnect-team/wppconnect");
    this.client = await wppconnect.create({
      session: this.account.sessionName,
      logQR: false,
      updatesLog: false,
      disableWelcome: true,
      autoClose: 0,
      whatsappVersion: undefined,
      puppeteerOptions: {
        executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        userDataDir: path.resolve(process.cwd(), "tokens", sanitizeSessionName(this.account.sessionName))
      },
      catchQR: (base64Qr: string) => {
        this.currentStatus = statusAfterQr(this.currentStatus, base64Qr);
        onStatusChange?.();
      },
      statusFind: (status: string) => {
        this.currentStatus = statusAfterWppStatus(this.currentStatus, status);
        onStatusChange?.();
      }
    }) as WppClient;

    this.client.onMessage((raw) => {
      if (raw.from === "status@broadcast" || raw.from.includes("@newsletter") || raw.from.includes("@broadcast")) {
        return;
      }
      void this.toIncoming(raw).then(onMessage);
    });
  }

  async sendText(chatId: string, text: string): Promise<void> {
    if (!this.client) {
      throw new Error("WhatsApp client not started");
    }
    await this.client.sendText(chatId, text);
  }

  async sendFile(chatId: string, path: string, filename: string, caption?: string): Promise<void> {
    if (!this.client) {
      throw new Error("WhatsApp client not started");
    }
    await this.client.sendFile(chatId, path, filename, caption);
  }

  status(): WhatsAppStatus {
    return this.currentStatus;
  }

  private async toIncoming(raw: WppMessage): Promise<IncomingMessage> {
    const isImage = raw.type === "image";
    const image = isImage && this.client?.decryptFile
      ? { mimeType: raw.mimetype ?? "image/jpeg", data: await this.client.decryptFile(raw) }
      : undefined;
    return {
      id: raw.id,
      accountId: this.account.id,
      chatId: raw.from,
      chatName: raw.sender?.name || raw.sender?.pushname || raw.sender?.formattedName || formatPhoneNumber(raw.from),
      fromMe: Boolean(raw.fromMe),
      isGroup: Boolean(raw.isGroupMsg),
      type: isImage ? "image" : raw.type === "chat" || raw.body ? "text" : "unsupported",
      text: raw.body,
      image,
      timestamp: new Date()
    };
  }
}

function formatPhoneNumber(jid: string): string {
  const number = jid.split('@')[0];
  if (!number) return jid;
  // Format simple if possible (e.g., 905551234567 -> +90 555 123 45 67)
  if (number.startsWith("90") && number.length === 12) {
    return `+90 ${number.slice(2, 5)} ${number.slice(5, 8)} ${number.slice(8, 10)} ${number.slice(10)}`;
  }
  return `+${number}`;
}

export function normalizeQrImage(qr: string): string {
  const trimmed = qr.trim();
  if (trimmed.startsWith("data:")) {
    return trimmed;
  }
  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed)) {
    return `data:image/png;base64,${trimmed.replace(/\s+/g, "")}`;
  }
  return trimmed;
}

export function statusAfterQr(_current: WhatsAppStatus, qr: string): WhatsAppStatus {
  return { connected: false, qr: normalizeQrImage(qr), detail: "qr_required" };
}

export function statusAfterWppStatus(current: WhatsAppStatus, status: string): WhatsAppStatus {
  const connected = status === "isLogged" || status === "qrReadSuccess";
  if (connected) {
    return { connected: true, detail: status };
  }
  return { ...current, connected: false, detail: status };
}

function sanitizeSessionName(sessionName: string): string {
  return sessionName.replace(/[^a-zA-Z0-9._-]/g, "_");
}
