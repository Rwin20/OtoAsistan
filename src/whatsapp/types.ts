import type { IncomingMessage } from "../conversations/types.js";

export interface WhatsAppStatus {
  connected: boolean;
  qr?: string;
  detail: string;
}

export interface WhatsAppAccount {
  id: string;
  label: string;
  sessionName: string;
}

export interface WhatsAppAccountStatus extends WhatsAppAccount, WhatsAppStatus {}

export interface WhatsAppAdapter {
  start(
    onMessage: (message: IncomingMessage) => Promise<void>,
    onStatusChange?: () => void
  ): Promise<void>;
  sendText(chatId: string, text: string): Promise<void>;
  sendFile(chatId: string, path: string, filename: string, caption?: string): Promise<void>;
  status(): WhatsAppStatus;
}

export type WhatsAppAdapterFactory = (account: WhatsAppAccount) => WhatsAppAdapter;
