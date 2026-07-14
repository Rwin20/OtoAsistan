import Database from "better-sqlite3";
import type { ResponseMode } from "../conversations/types.js";
import { LocalSecretStore } from "../security/LocalSecretStore.js";

export interface AppSettings {
  responseMode: ResponseMode;
  aiProvider?: AIProviderSettings;
  systemLicenseKey?: string;
  personas?: Persona[];
}

export interface Persona {
  id: string;
  name: string;
  role: string;
  instruction: string;
}

export interface AIProviderSettings {
  providerId: string;
  model: string;
  hasApiKey: boolean;
}

export interface AIProviderUpdate {
  providerId: string;
  model: string;
  apiKey?: string;
}

export class SqliteAppSettingsStore {
  constructor(
    private readonly db: Database.Database,
    private readonly secretStore = new LocalSecretStore()
  ) {
    this.db.exec(`
      create table if not exists app_settings (
        key text primary key,
        value text not null
      );
    `);
  }

  getSettings(): AppSettings {
    const defaultPersonas: Persona[] = [
      { id: "p1", name: "Ayşe", role: "Destek Temsilcisi", instruction: "Güler yüzlü ve yardımsever ol, sadece bilgi ver." },
      { id: "p2", name: "Cenk", role: "Satış Uzmanı", instruction: "Enerjik ve ikna edici ol, fiyat ver ve satışı kapatmaya çalış." },
      { id: "p3", name: "Hakan Bey", role: "Müşteri İlişkileri Yöneticisi", instruction: "Resmi, çözüm odaklı ve alttan alan bir üslupla konuş." }
    ];
    let personas = defaultPersonas;
    const storedPersonas = this.get("personas");
    if (storedPersonas) {
      try {
        personas = JSON.parse(storedPersonas) as Persona[];
      } catch (e) {
        // use default
      }
    }

    return {
      responseMode: this.getResponseMode(),
      aiProvider: this.getAIProvider(),
      systemLicenseKey: this.get("systemLicenseKey"),
      personas
    };
  }

  updateSettings(settings: Partial<AppSettings>): AppSettings {
    if (settings.responseMode) {
      this.set("responseMode", settings.responseMode);
    }
    if (settings.systemLicenseKey !== undefined) {
      this.set("systemLicenseKey", settings.systemLicenseKey);
    }
    if (settings.personas !== undefined) {
      this.set("personas", JSON.stringify(settings.personas));
    }
    return this.getSettings();
  }

  updateAIProvider(update: AIProviderUpdate): AppSettings {
    this.set("aiProviderId", update.providerId);
    this.set("aiModel", update.model);
    if (update.apiKey?.trim()) {
      this.set(`aiApiKey:${update.providerId}`, this.secretStore.encrypt(update.apiKey.trim()));
    }
    return this.getSettings();
  }

  getProviderSecret(providerId: string): string | undefined {
    const encrypted = this.get(`aiApiKey:${providerId}`);
    if (!encrypted) {
      return undefined;
    }
    return this.secretStore.decrypt(encrypted);
  }

  private getResponseMode(): ResponseMode {
    const value = this.get("responseMode");
    return value === "always_auto" ? "always_auto" : "safe_auto";
  }

  private getAIProvider(): AIProviderSettings | undefined {
    const providerId = this.get("aiProviderId");
    const model = this.get("aiModel");
    if (!providerId || !model) {
      return undefined;
    }
    return {
      providerId,
      model,
      hasApiKey: Boolean(this.get(`aiApiKey:${providerId}`))
    };
  }

  private get(key: string): string | undefined {
    const row = this.db.prepare("select value from app_settings where key = ?").get(key) as Row | undefined;
    return row?.value;
  }

  private set(key: string, value: string): void {
    this.db.prepare(`
      insert into app_settings (key, value)
      values (?, ?)
      on conflict(key) do update set value = excluded.value
    `).run(key, value);
  }
}

interface Row {
  value: string;
}
