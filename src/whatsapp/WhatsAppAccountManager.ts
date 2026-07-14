import type {
  WhatsAppAccount,
  WhatsAppAccountStatus,
  WhatsAppAdapter,
  WhatsAppAdapterFactory
} from "./types.js";
import type { IncomingMessage } from "../conversations/types.js";

export class WhatsAppAccountManager {
  private readonly accounts = new Map<string, WhatsAppAccount>();
  private readonly adapters = new Map<string, WhatsAppAdapter>();
  private readonly startPromises = new Map<string, Promise<void>>();
  private readonly statusListeners = new Set<(statuses: WhatsAppAccountStatus[]) => void>();

  constructor(private readonly adapterFactory: WhatsAppAdapterFactory) {}

  addAccount(account: WhatsAppAccount): WhatsAppAccount {
    if (this.accounts.has(account.id)) {
      throw new Error(`WhatsApp account already exists: ${account.id}`);
    }
    this.accounts.set(account.id, account);
    this.adapters.set(account.id, this.adapterFactory(account));
    this.notifyStatusListeners();
    return account;
  }

  listAccounts(): WhatsAppAccount[] {
    return [...this.accounts.values()];
  }

  async startAll(onMessage: (message: IncomingMessage) => Promise<void>): Promise<void> {
    await Promise.all(this.listAccounts().map((account) => this.startAccount(account.id, onMessage)));
  }

  async startFirstAccount(onMessage: (message: IncomingMessage) => Promise<void>): Promise<void> {
    const [firstAccount] = this.listAccounts();
    if (!firstAccount) {
      return;
    }
    await this.startAccount(firstAccount.id, onMessage);
  }

  async startAccount(accountId: string, onMessage: (message: IncomingMessage) => Promise<void>): Promise<void> {
    const existingStart = this.startPromises.get(accountId);
    if (existingStart) {
      return existingStart;
    }
    const adapter = this.adapterFor(accountId);
    const startPromise = adapter.start(
      (message) => onMessage({ ...message, accountId }),
      () => this.notifyStatusListeners()
    );
    this.startPromises.set(accountId, startPromise);
    try {
      await startPromise;
    } catch (error) {
      this.startPromises.delete(accountId);
      throw error;
    }
  }

  async sendText(accountId: string, chatId: string, text: string): Promise<void> {
    await this.adapterFor(accountId).sendText(chatId, text);
  }

  async sendFile(accountId: string, chatId: string, path: string, filename: string, caption?: string): Promise<void> {
    await this.adapterFor(accountId).sendFile(chatId, path, filename, caption);
  }

  statuses(): WhatsAppAccountStatus[] {
    return this.listAccounts().map((account) => ({
      ...account,
      ...this.adapterFor(account.id).status()
    }));
  }

  subscribeStatuses(listener: (statuses: WhatsAppAccountStatus[]) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.statuses());
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private adapterFor(accountId: string): WhatsAppAdapter {
    const adapter = this.adapters.get(accountId);
    if (!adapter) {
      throw new Error(`WhatsApp account not registered: ${accountId}`);
    }
    return adapter;
  }

  private notifyStatusListeners(): void {
    const snapshot = this.statuses();
    for (const listener of this.statusListeners) {
      listener(snapshot);
    }
  }
}
