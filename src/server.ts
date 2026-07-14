import "dotenv/config";
import cors from "cors";
import Database from "better-sqlite3";
import express from "express";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverProviderModels } from "./ai/modelDiscovery.js";
import { buildProductionAIRegistry } from "./ai/productionProviders.js";
import { ConversationService } from "./conversations/ConversationService.js";
import { parseKnowledgeDocument } from "./knowledge/documentParser.js";
import { createProductionEmbeddingFunction } from "./knowledge/localEmbedding.js";
import { loadConfig } from "./appConfig.js";
import { SqliteAppSettingsStore } from "./persistence/SqliteAppSettingsStore.js";
import { SqliteConversationStore } from "./persistence/SqliteConversationStore.js";
import { SqliteKnowledgeBase } from "./persistence/SqliteKnowledgeBase.js";
import { SqliteWhatsAppAccountStore } from "./persistence/SqliteWhatsAppAccountStore.js";
import { SqliteQuickReplyStore } from "./persistence/SqliteQuickReplyStore.js";
import { SqliteFileStore } from "./persistence/SqliteFileStore.js";
import { SqliteCustomerStore } from "./persistence/SqliteCustomerStore.js";
import { SqliteOrderStore } from "./persistence/SqliteOrderStore.js";
import { LocalSecretStore } from "./security/LocalSecretStore.js";
import { WhatsAppAccountManager } from "./whatsapp/WhatsAppAccountManager.js";
import { WppConnectAdapter } from "./whatsapp/WppConnectAdapter.js";
import { LicenseManager } from "./security/LicenseManager.js";

const config = loadConfig();
fs.mkdirSync(config.dataDir, { recursive: true });

const app = express();
app.use(cors({ origin: /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/ }));
app.use(express.json({ limit: "10mb" }));

const database = new Database(config.databasePath);
const secretStore = new LocalSecretStore();
const settingsStore = new SqliteAppSettingsStore(database, secretStore);
const store = new SqliteConversationStore(database);
const accountStore = new SqliteWhatsAppAccountStore(database);
accountStore.ensureDefaultAccount();

const quickReplyStore = new SqliteQuickReplyStore(database);
const fileStore = new SqliteFileStore(database);
const customerStore = new SqliteCustomerStore(database);
const orderStore = new SqliteOrderStore(database);
const knowledgeBase = new SqliteKnowledgeBase(database, createProductionEmbeddingFunction(), { minScore: 0.12 });

let providers = buildProviderRegistry();
const discoveredModels = new Map<string, Set<string>>();

const whatsapp = new WhatsAppAccountManager((account) => new WppConnectAdapter(account));
for (const account of accountStore.listAccounts()) {
  whatsapp.addAccount(account);
}

const service = new ConversationService({
  store,
  knowledgeBase,
  aiProvider: providers.active(),
  mode: settingsStore.getSettings().responseMode,
  sendMessage: (accountId, chatId, text) => whatsapp.sendText(accountId, chatId, text),
  sendFile: (accountId, chatId, filePath, filename) => whatsapp.sendFile(accountId, chatId, filePath, filename),
  quickReplyStore,
  fileStore,
  customerStore,
  orderStore,
  getLicenseStatus: () => LicenseManager.verifyLicense(settingsStore.getSettings().systemLicenseKey),
  getPersonas: () => settingsStore.getSettings().personas ?? []
});

app.get("/api/status", (_request, response) => {
  setNoStore(response);
  response.json({
    whatsapps: whatsapp.statuses(),
    providers: providers.list(),
    activeProvider: providers.activeInfo(),
    quickReplies: quickReplyStore.list(),
    files: fileStore.list()
  });
});

app.get("/api/status/stream", (request, response) => {
  response.status(200);
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders();

  const unsubscribe = whatsapp.subscribeStatuses((whatsapps) => {
    response.write(`event: status\n`);
    response.write(`data: ${JSON.stringify({
      whatsapps,
      providers: providers.list(),
      activeProvider: providers.activeInfo(),
      quickReplies: quickReplyStore.list(),
      files: fileStore.list()
    })}\n\n`);
  });

  response.write(`event: ready\ndata: {}\n\n`);

  const heartbeat = windowedHeartbeat(response);

  requestClose(request, () => {
    heartbeat();
    unsubscribe();
  });
});

app.get("/api/whatsapp/accounts", (_request, response) => {
  setNoStore(response);
  response.json(whatsapp.statuses());
});

app.post("/api/whatsapp/accounts", (request, response) => {
  const label = String(request.body.label ?? "").trim();
  if (!label) {
    response.status(400).json({ error: "Hesap adi zorunludur." });
    return;
  }
  const account = accountStore.createAccount(label);
  whatsapp.addAccount(account);
  void whatsapp.startAccount(account.id, (message) => service.handleIncomingMessage(message))
    .catch((error: unknown) => console.error("WhatsApp hesabi baslatilamadi", error));
  response.status(201).json(account);
});

app.post("/api/whatsapp/accounts/:accountId/start", (request, response) => {
  void whatsapp.startAccount(request.params.accountId, (message) => service.handleIncomingMessage(message))
    .catch((error: unknown) => console.error("WhatsApp hesabi baslatilamadi", error));
  response.status(202).json({ started: true });
});

app.get("/api/accounts/:accountId/conversations", (request, response) => {
  response.json(store.listConversations(request.params.accountId));
});

app.get("/api/accounts/:accountId/customers/:chatId", (request, response) => {
  response.json(customerStore.getProfile(request.params.accountId, request.params.chatId) || null);
});

app.post("/api/accounts/:accountId/customers/:chatId", (request, response) => {
  const profile = {
    accountId: request.params.accountId,
    chatId: request.params.chatId,
    name: request.body.name ?? "İsimsiz Müşteri",
    notes: request.body.notes ?? "",
    updatedAt: new Date()
  };
  customerStore.upsertProfile(profile);
  response.json(profile);
});

app.get("/api/orders", (_request, response) => {
  response.json(orderStore.list());
});

app.put("/api/orders/:id/status", (request, response) => {
  orderStore.updateStatus(request.params.id, request.body.status);
  response.status(204).end();
});

app.get("/api/accounts/:accountId/conversations/:chatId/messages", (request, response) => {
  response.json(store.listMessages(request.params.accountId, request.params.chatId));
});

app.post("/api/accounts/:accountId/conversations/:chatId/operator-reply", async (request, response) => {
  await service.operatorReply(request.params.accountId, request.params.chatId, String(request.body.text ?? ""));
  response.status(204).end();
});

app.post("/api/accounts/:accountId/conversations/:chatId/take-over", async (request, response) => {
  await service.takeOver(request.params.accountId, request.params.chatId);
  response.status(204).end();
});

app.post("/api/accounts/:accountId/conversations/:chatId/resume-ai", async (request, response) => {
  await service.resumeAI(request.params.accountId, request.params.chatId);
  response.status(204).end();
});

app.post("/api/accounts/:accountId/conversations/:chatId/ignore", async (request, response) => {
  await service.ignore(request.params.accountId, request.params.chatId);
  response.status(204).end();
});

app.get("/api/knowledge/sources", (_request, response) => {
  response.json(knowledgeBase.listSources());
});

app.post("/api/knowledge/sources", async (request, response) => {
  const { id, title, text } = request.body as { id?: string; title?: string; text?: string };
  const cleanTitle = String(title ?? "").trim();
  const cleanText = String(text ?? "").trim();
  if (!cleanTitle || !cleanText) {
    response.status(400).json({ error: "Baslik ve sirket bilgisi zorunludur." });
    return;
  }

  const sourceId = String(id ?? "").trim() || `text-${randomUUID()}`;
  await knowledgeBase.upsertSource({
    id: sourceId,
    title: cleanTitle,
    text: cleanText,
    type: "text"
  });
  response.status(201).json(knowledgeBase.listSources().find((source) => source.id === sourceId));
});

app.delete("/api/knowledge/sources/:sourceId", (request, response) => {
  knowledgeBase.deleteSource(request.params.sourceId);
  response.status(204).end();
});

app.post("/api/knowledge/documents", async (request, response) => {
  const { filename, mimeType, base64 } = request.body as { filename: string; mimeType: string; base64: string };
  const text = await parseKnowledgeDocument({
    filename,
    mimeType,
    buffer: Buffer.from(base64, "base64")
  });
  const sourceId = `document-${randomUUID()}`;
  await knowledgeBase.upsertSource({
    id: sourceId,
    title: filename,
    text,
    type: "document",
    filename,
    mimeType
  });
  response.status(201).json(knowledgeBase.listSources().find((source) => source.id === sourceId));
});

app.get("/api/quick-replies", (_request, response) => {
  response.json(quickReplyStore.list());
});

app.post("/api/quick-replies", (request, response) => {
  const { id, title, text } = request.body as { id?: string; title?: string; text?: string };
  const cleanTitle = String(title ?? "").trim();
  const cleanText = String(text ?? "").trim();
  if (!cleanTitle || !cleanText) {
    response.status(400).json({ error: "Baslik ve metin zorunludur." });
    return;
  }
  const replyId = String(id ?? "").trim() || `qr-${randomUUID()}`;
  quickReplyStore.upsert({ id: replyId, title: cleanTitle, text: cleanText });
  response.status(201).json({ id: replyId, title: cleanTitle, text: cleanText });
});

app.delete("/api/quick-replies/:id", (request, response) => {
  quickReplyStore.delete(request.params.id);
  response.status(204).end();
});

app.get("/api/files", (_request, response) => {
  response.json(fileStore.list());
});

app.post("/api/files", (request, response) => {
  const { filename, description, mimeType, base64 } = request.body as { filename: string; description: string; mimeType: string; base64: string };
  const id = `file-${randomUUID()}`;
  const buffer = Buffer.from(base64, "base64");
  const uploadDir = path.join(config.dataDir, "uploads");
  fs.mkdirSync(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, `${id}-${filename}`);
  fs.writeFileSync(filePath, buffer);
  
  const stored = fileStore.insert({
    id,
    filename,
    description,
    mimeType,
    path: filePath
  });
  response.status(201).json(stored);
});

app.delete("/api/files/:id", (request, response) => {
  const file = fileStore.get(request.params.id);
  if (file) {
    try {
      fs.unlinkSync(file.path);
    } catch {
      // Ignore if file is already deleted from disk
    }
    fileStore.delete(file.id);
  }
  response.status(204).end();
});

app.get("/api/settings", (_request, response) => {
  const settings = settingsStore.getSettings();
  const licenseStatus = LicenseManager.verifyLicense(settings.systemLicenseKey);
  response.json({ ...settings, licenseStatus });
});

app.post("/api/settings/personas", (request, response) => {
  const personas = request.body.personas;
  if (!Array.isArray(personas)) {
    response.status(400).json({ error: "Geçersiz veri." });
    return;
  }
  const settings = settingsStore.updateSettings({ personas });
  const licenseStatus = LicenseManager.verifyLicense(settings.systemLicenseKey);
  response.json({ ...settings, licenseStatus });
});

app.post("/api/settings/license", (request, response) => {
  const key = String(request.body.key ?? "").trim();
  const status = LicenseManager.verifyLicense(key);
  if (!status.valid) {
    response.status(400).json({ error: status.message });
    return;
  }
  const settings = settingsStore.updateSettings({ systemLicenseKey: key });
  response.json({ ...settings, licenseStatus: status });
});

app.post("/api/settings/response-mode", (request, response) => {
  const responseMode = request.body.mode === "always_auto" ? "always_auto" : "safe_auto";
  const settings = settingsStore.updateSettings({ responseMode });
  service.setMode(settings.responseMode);
  response.json(settings);
});

app.post("/api/settings/ai-provider", (request, response) => {
  const providerId = String(request.body.providerId ?? "").trim();
  const model = String(request.body.model ?? "").trim();
  const apiKey = String(request.body.apiKey ?? "").trim();
  if (!providerId || !model) {
    response.status(400).json({ error: "AI saglayicisi ve model zorunludur." });
    return;
  }
  if (!discoveredModels.get(providerId)?.has(model)) {
    response.status(400).json({ error: "Model, saglayicidan alinan kullanilabilir model listesinden secilmelidir." });
    return;
  }
  const settings = settingsStore.updateAIProvider({
    providerId,
    model,
    apiKey: apiKey || undefined
  });
  providers = buildProviderRegistry();
  service.setAIProvider(providers.active());
  store.clearAIErrors();
  response.json(settings);
});

app.post("/api/settings/ai-provider/models", async (request, response) => {
  const providerId = String(request.body.providerId ?? "").trim();
  const apiKey = String(request.body.apiKey ?? "").trim();
  if (!providerId) {
    response.status(400).json({ error: "AI saglayicisi zorunludur." });
    return;
  }

  try {
    const models = await discoverProviderModels({
      providerId,
      apiKey: apiKey || undefined,
      savedApiKey: settingsStore.getProviderSecret(providerId)
    });
    discoveredModels.set(providerId, new Set(models.map((model) => model.id)));
    response.json({ models });
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Model listesi alinamadi."
    });
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, "..", "web");
if (fs.existsSync(webDir)) {
  app.use(express.static(webDir));
  app.get(/.*/, (_request, response) => {
    response.sendFile(path.join(webDir, "index.html"));
  });
} else {
  console.error("Web directory not found at:", webDir);
}

app.listen(config.port, config.host, () => {
  console.log(`whatsappisletme listening on http://${config.host}:${config.port}`);
  if (process.env.START_WHATSAPP === "true") {
    void whatsapp.startFirstAccount((message) => service.handleIncomingMessage(message))
      .catch((error: unknown) => console.error("WhatsApp hesabi baslatilamadi", error));
  }
});

function buildProviderRegistry() {
  const settings = settingsStore.getSettings();
  return buildProductionAIRegistry({
    settings,
    secretStore,
    providerSecret: settings.aiProvider?.providerId
      ? settingsStore.getProviderSecret(settings.aiProvider.providerId)
      : undefined
  });
}

function setNoStore(response: express.Response): void {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
}

function windowedHeartbeat(response: express.Response): () => void {
  const timer = setInterval(() => {
    response.write(": keep-alive\n\n");
  }, 15000);
  return () => clearInterval(timer);
}

function requestClose(request: express.Request, cleanup: () => void): void {
  request.on("close", cleanup);
  request.on("aborted", cleanup);
}
