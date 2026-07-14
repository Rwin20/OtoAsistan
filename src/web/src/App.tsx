import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

interface ProviderInfo {
  id: string;
  label: string;
  supportsVision: boolean;
}

interface AvailableModel {
  id: string;
  label: string;
}

interface QuickReply {
  id: string;
  title: string;
  text: string;
}

interface StoredFile {
  id: string;
  filename: string;
  description: string;
  mimeType: string;
  path: string;
  createdAt: string;
}

interface StatusResponse {
  whatsapps: WhatsAppAccount[];
  providers: ProviderInfo[];
  activeProvider?: ProviderInfo;
  quickReplies?: QuickReply[];
  files?: StoredFile[];
}

interface WhatsAppAccount {
  id: string;
  label: string;
  sessionName: string;
  connected: boolean;
  qr?: string;
  detail: string;
}

interface Conversation {
  accountId: string;
  chatId: string;
  chatName?: string;
  status: string;
  handoffReason?: string;
  updatedAt: string;
}

interface ConversationMessage {
  id: string;
  accountId: string;
  chatId: string;
  chatName?: string;
  direction: "incoming" | "outgoing";
  author: "customer" | "ai" | "operator" | "system";
  text: string;
  timestamp: string;
}

interface Order {
  id: string;
  accountId: string;
  chatId: string;
  details: string;
  status: "pending" | "completed" | "cancelled";
  createdAt: string;
}

interface CustomerProfile {
  accountId: string;
  chatId: string;
  name: string;
  notes: string;
  updatedAt: string;
}

interface AppSettings {
  responseMode: "safe_auto" | "always_auto";
  aiProvider?: {
    providerId: string;
    model: string;
    hasApiKey: boolean;
  };
  systemLicenseKey?: string;
  licenseStatus?: {
    valid: boolean;
    expired: boolean;
    daysRemaining?: number;
    message: string;
  };
  personas?: Persona[];
}

interface Persona {
  id: string;
  name: string;
  role: string;
  instruction: string;
}

interface KnowledgeSource {
  id: string;
  title: string;
  type: "text" | "document";
  filename?: string;
  text: string;
  chunkCount: number;
  updatedAt: string;
}

function App() {
  const [status, setStatus] = useState<StatusResponse | undefined>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [activeAccountId, setActiveAccountId] = useState("");
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [settings, setSettings] = useState<AppSettings>({ responseMode: "safe_auto" });
  const [providerId, setProviderId] = useState("openai");
  const [model, setModel] = useState("");
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [knowledgeSources, setKnowledgeSources] = useState<KnowledgeSource[]>([]);
  const [knowledgeSourceId, setKnowledgeSourceId] = useState("");
  const [knowledgeTitle, setKnowledgeTitle] = useState("Sirket Bilgileri");
  const [knowledgeText, setKnowledgeText] = useState("");
  const [knowledgeMessage, setKnowledgeMessage] = useState("");
  const [fileMessage, setFileMessage] = useState("");
  const [selectedChatId, setSelectedChatId] = useState("");
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [operatorReply, setOperatorReply] = useState("");
  const [conversationActionMessage, setConversationActionMessage] = useState("");
  const providerFormInitialized = useRef(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  const [knowledgeSaving, setKnowledgeSaving] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);

  const [qrTitle, setQrTitle] = useState("");
  const [qrText, setQrText] = useState("");
  const [qrMessage, setQrMessage] = useState("");

  const [aiFileDesc, setAiFileDesc] = useState("");
  const [aiFileMessage, setAiFileMessage] = useState("");

  const [licenseKeyInput, setLicenseKeyInput] = useState("");
  const [licenseMessage, setLicenseMessage] = useState("");

  const [editPersonas, setEditPersonas] = useState<Persona[]>([]);
  const [personasMessage, setPersonasMessage] = useState("");
  const waitingOperatorChats = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (theme === "dark") {
      document.body.classList.add("dark-theme");
    } else {
      document.body.classList.remove("dark-theme");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme(prev => prev === "light" ? "dark" : "light");
  }

  async function refresh(accountId = activeAccountId) {
    const [statusResponse, settingsResponse, knowledgeResponse, ordersResponse] = await Promise.all([
      fetch("/api/status"),
      fetch("/api/settings"),
      fetch("/api/knowledge/sources"),
      fetch("/api/orders")
    ]);
    const nextStatus = await statusResponse.json() as StatusResponse;
    const nextSettings = await settingsResponse.json() as AppSettings;
    const nextKnowledgeSources = await knowledgeResponse.json() as KnowledgeSource[];
    const nextOrders = await ordersResponse.json() as Order[];
    setStatus(nextStatus);
    setSettings(nextSettings);
    setKnowledgeSources(nextKnowledgeSources);
    setOrders(nextOrders);
    if (nextSettings.personas && editPersonas.length === 0) {
      setEditPersonas(nextSettings.personas);
    }

    if (nextSettings.aiProvider && !providerFormInitialized.current) {
      setProviderId(nextSettings.aiProvider.providerId);
      setModel(nextSettings.aiProvider.model);
      setAvailableModels([{ id: nextSettings.aiProvider.model, label: nextSettings.aiProvider.model }]);
      providerFormInitialized.current = true;
    }

    const nextActiveAccountId = accountId || nextStatus.whatsapps[0]?.id || "";
    if (!activeAccountId && nextActiveAccountId) {
      setActiveAccountId(nextActiveAccountId);
    }
    if (nextActiveAccountId) {
      const conversationResponse = await fetch(`/api/accounts/${encodeURIComponent(nextActiveAccountId)}/conversations`);
      const nextConversations = await conversationResponse.json() as Conversation[];
      setConversations(nextConversations);
      
      let shouldPlayAlert = false;
      const currentWaiting = new Set<string>();
      nextConversations.forEach(c => {
        if (c.status === "waiting_operator") {
          currentWaiting.add(c.chatId);
          if (!waitingOperatorChats.current.has(c.chatId)) {
            shouldPlayAlert = true;
          }
        }
      });
      waitingOperatorChats.current = currentWaiting;
      if (shouldPlayAlert) {
        const audio = new Audio("https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1539c.mp3?filename=success-1-6297.mp3");
        audio.play().catch(e => console.log("Ses oynatma hatası:", e));
      }

      const nextSelectedChatId = nextConversations.some((conversation) => conversation.chatId === selectedChatId)
        ? selectedChatId
        : nextConversations[0]?.chatId ?? "";
      if (nextSelectedChatId && nextSelectedChatId !== selectedChatId) {
        setSelectedChatId(nextSelectedChatId);
      }
      if (nextSelectedChatId) {
        const [conversationMessagesResponse, customerProfileResponse] = await Promise.all([
          fetch(`/api/accounts/${encodeURIComponent(nextActiveAccountId)}/conversations/${encodeURIComponent(nextSelectedChatId)}/messages`),
          fetch(`/api/accounts/${encodeURIComponent(nextActiveAccountId)}/customers/${encodeURIComponent(nextSelectedChatId)}`)
        ]);
        setConversationMessages(await conversationMessagesResponse.json() as ConversationMessage[]);
        setCustomerProfile(await customerProfileResponse.json() as CustomerProfile | null);
      } else {
        setConversationMessages([]);
        setCustomerProfile(null);
      }
    } else {
      setConversations([]);
      setSelectedChatId("");
      setConversationMessages([]);
    }
  }

  async function loadConversationMessages(accountId = activeAccountId, chatId = selectedChatId) {
    if (!accountId || !chatId) {
      setConversationMessages([]);
      setCustomerProfile(null);
      return;
    }
    const [response, profileResponse] = await Promise.all([
      fetch(`/api/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(chatId)}/messages`),
      fetch(`/api/accounts/${encodeURIComponent(accountId)}/customers/${encodeURIComponent(chatId)}`)
    ]);
    setConversationMessages(await response.json() as ConversationMessage[]);
    setCustomerProfile(await profileResponse.json() as CustomerProfile | null);
  }

  async function updateCustomerProfile(notes: string) {
    if (!activeAccountId || !selectedChatId) return;
    setProfileSaving(true);
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(activeAccountId)}/customers/${encodeURIComponent(selectedChatId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes, name: customerProfile?.name })
      });
      setCustomerProfile(await response.json() as CustomerProfile);
    } finally {
      setProfileSaving(false);
    }
  }

  async function updateOrderStatus(id: string, status: Order["status"]) {
    await fetch(`/api/orders/${encodeURIComponent(id)}/status`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status })
    });
    await refresh(activeAccountId);
  }

  async function addAccount() {
    const label = newAccountLabel.trim();
    if (!label) {
      return;
    }
    const response = await fetch("/api/whatsapp/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label })
    });
    const account = await response.json() as WhatsAppAccount;
    setNewAccountLabel("");
    setActiveAccountId(account.id);
    setSelectedChatId("");
    await refresh(account.id);
  }

  async function startAccount(accountId: string) {
    await fetch(`/api/whatsapp/accounts/${encodeURIComponent(accountId)}/start`, { method: "POST" });
    await refresh(accountId);
  }

  async function changeResponseMode(responseMode: AppSettings["responseMode"]) {
    const response = await fetch("/api/settings/response-mode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: responseMode })
    });
    setSettings(await response.json() as AppSettings);
  }

  async function saveAIProvider() {
    const response = await fetch("/api/settings/ai-provider", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId, model, apiKey })
    });
    const nextSettings = await response.json() as AppSettings;
    setSettings(nextSettings);
    setApiKey("");
    setSettingsMessage("AI saglayicisi kaydedildi.");
    setTimeout(() => setSettingsMessage(""), 3000);
    await refresh(activeAccountId);
  }

  async function loadModels() {
    setModelsLoading(true);
    setModelsError("");
    setSettingsMessage("");
    try {
      const response = await fetch("/api/settings/ai-provider/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ providerId, apiKey })
      });
      const payload = await response.json() as { models?: AvailableModel[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Model listesi alinamadi.");
      }
      const models = payload.models ?? [];
      setAvailableModels(models);
      setModel(models[0]?.id ?? "");
      if (models.length === 0) {
        setModelsError("Bu API anahtari icin kullanilabilir sohbet modeli bulunamadi.");
      }
    } catch (error) {
      setAvailableModels([]);
      setModel("");
      setModelsError(error instanceof Error ? error.message : "Model listesi alinamadi.");
    } finally {
      setModelsLoading(false);
    }
  }

  async function saveKnowledge() {
    setKnowledgeSaving(true);
    setKnowledgeMessage("Kaydediliyor... (İlk işlemde arama modelinin inmesi 1-2 dakika sürebilir, lütfen bekleyin)");
    try {
      const response = await fetch("/api/knowledge/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: knowledgeSourceId || undefined,
          title: knowledgeTitle,
          text: knowledgeText
        })
      });
      if (!response.ok) throw new Error("Kaydedilemedi");
      const saved = await response.json() as KnowledgeSource;
      setKnowledgeSourceId(saved.id);
      setKnowledgeMessage("Bilgi başarıyla kaydedildi ve indekslendi!");
      setTimeout(() => setKnowledgeMessage(""), 4000);
      await refresh(activeAccountId);
    } catch (e) {
      setKnowledgeMessage("Kaydedilirken bir hata oluştu.");
    } finally {
      setKnowledgeSaving(false);
    }
  }

  function editKnowledgeSource(source: KnowledgeSource) {
    setKnowledgeSourceId(source.id);
    setKnowledgeTitle(source.title);
    setKnowledgeText(source.text);
    setKnowledgeMessage("");
  }

  function clearKnowledgeForm() {
    setKnowledgeSourceId("");
    setKnowledgeTitle("Sirket Bilgileri");
    setKnowledgeText("");
    setKnowledgeMessage("");
  }

  async function deleteKnowledgeSource(sourceId: string) {
    await fetch(`/api/knowledge/sources/${encodeURIComponent(sourceId)}`, { method: "DELETE" });
    if (sourceId === knowledgeSourceId) {
      clearKnowledgeForm();
    }
    await refresh(activeAccountId);
  }

  async function uploadDocument(file: File | undefined) {
    if (!file) {
      return;
    }
    setFileUploading(true);
    setFileMessage(`${file.name} işleniyor... (İlk işlemde arama modelinin inmesi 1-2 dakika sürebilir)`);
    try {
      const dataUrl = await readAsDataUrl(file);
      const base64 = dataUrl.split(",")[1] ?? "";
      const response = await fetch("/api/knowledge/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          base64
        })
      });
      if (!response.ok) throw new Error("Yüklenemedi");
      setFileMessage(`${file.name} başarıyla indekslendi.`);
      setTimeout(() => setFileMessage(""), 4000);
      await refresh(activeAccountId);
    } catch (e) {
      setFileMessage("Dosya yüklenirken bir hata oluştu.");
    } finally {
      setFileUploading(false);
    }
  }

  async function uploadAIFile(file: File | undefined) {
    if (!file || !aiFileDesc.trim()) {
      return;
    }
    setAiFileMessage(`${file.name} yükleniyor...`);
    try {
      const dataUrl = await readAsDataUrl(file);
      const base64 = dataUrl.split(",")[1] ?? "";
      const response = await fetch("/api/files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          description: aiFileDesc,
          mimeType: file.type || "application/octet-stream",
          base64
        })
      });
      if (!response.ok) throw new Error("Yüklenemedi");
      setAiFileMessage(`${file.name} başarıyla eklendi.`);
      setAiFileDesc("");
      setTimeout(() => setAiFileMessage(""), 4000);
      await refresh(activeAccountId);
    } catch (e) {
      setAiFileMessage("Dosya yüklenirken bir hata oluştu.");
    }
  }

  async function deleteAIFile(id: string) {
    await fetch(`/api/files/${encodeURIComponent(id)}`, { method: "DELETE" });
    await refresh(activeAccountId);
  }

  async function saveQuickReply() {
    if (!qrTitle.trim() || !qrText.trim()) return;
    try {
      const response = await fetch("/api/quick-replies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: qrTitle, text: qrText })
      });
      if (!response.ok) throw new Error("Kaydedilemedi");
      setQrMessage("Hazır cevap kaydedildi.");
      setQrTitle("");
      setQrText("");
      setTimeout(() => setQrMessage(""), 3000);
      await refresh(activeAccountId);
    } catch (e) {
      setQrMessage("Hata oluştu.");
    }
  }

  async function deleteQuickReply(id: string) {
    await fetch(`/api/quick-replies/${encodeURIComponent(id)}`, { method: "DELETE" });
    await refresh(activeAccountId);
  }

  async function sendFileToCustomer(accountId: string, chatId: string, fileId: string) {
    // A trick: We send the [SEND_FILE:id] exactly to the operator endpoint, 
    // Wait, the operator endpoint doesn't process [SEND_FILE]. 
    // We can just append it and send. But wait, we need a special endpoint to send files directly as operator?
    // Oh! The user said: "Konuşma detay ekranındaki (Operatör) bölümüne... bir Dosya Gönder butonu eklenecek."
    // We can just add it to operatorReply textarea.
  }

  async function takeOverConversation(accountId: string, chatId: string) {
    await fetch(`/api/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(chatId)}/take-over`, {
      method: "POST"
    });
    setConversationActionMessage("Konusma ekip kontrolune alindi.");
    await refresh(accountId);
    await loadConversationMessages(accountId, chatId);
  }

  async function ignoreConversation(accountId: string, chatId: string) {
    await fetch(`/api/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(chatId)}/ignore`, {
      method: "POST"
    });
    setConversationActionMessage("Konuşma yoksayıldı. AI bu sohbete cevap vermeyecek.");
    await refresh(accountId);
    await loadConversationMessages(accountId, chatId);
  }

  async function resumeConversationAI(accountId: string, chatId: string) {
    await fetch(`/api/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(chatId)}/resume-ai`, {
      method: "POST"
    });
    setConversationActionMessage("Konusma AI'a devredildi.");
    await refresh(accountId);
    await loadConversationMessages(accountId, chatId);
  }

  async function sendOperatorReply(accountId: string, chatId: string) {
    const text = operatorReply.trim();
    if (!text) {
      return;
    }
    try {
      await fetch(`/api/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(chatId)}/operator-reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text })
      });
      setOperatorReply("");
      setConversationActionMessage("Mesaj gönderildi ve AI devredışı bırakıldı.");
      setTimeout(() => setConversationActionMessage(""), 3000);
      await refresh(accountId);
      await loadConversationMessages(accountId, chatId);
    } catch (error) {
      setConversationActionMessage("Mesaj gönderilemedi.");
    }
  }

  async function saveLicense() {
    try {
      const response = await fetch("/api/settings/license", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: licenseKeyInput })
      });
      if (!response.ok) {
        const errorData = await response.json() as { error: string };
        setLicenseMessage(errorData.error || "Geçersiz lisans anahtarı.");
        return;
      }
      const data = await response.json() as AppSettings;
      setSettings(data);
      setLicenseMessage("Lisans başarıyla doğrulandı!");
      setTimeout(() => setLicenseMessage(""), 3000);
    } catch (e) {
      setLicenseMessage("Bir hata oluştu.");
    }
  }

  async function savePersonas() {
    try {
      const response = await fetch("/api/settings/personas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personas: editPersonas })
      });
      const data = await response.json() as AppSettings;
      setSettings(data);
      setPersonasMessage("Karakterler başarıyla kaydedildi!");
      setTimeout(() => setPersonasMessage(""), 3000);
    } catch (e) {
      setPersonasMessage("Bir hata oluştu.");
    }
  }

  useEffect(() => {
    void refresh(activeAccountId);
    const timer = window.setInterval(() => void refresh(activeAccountId), 5000);
    return () => window.clearInterval(timer);
  }, [activeAccountId]);

  useEffect(() => {
    const nextSelected = conversations.find((conversation) => conversation.chatId === selectedChatId)?.chatId
      || conversations[0]?.chatId
      || "";
    if (nextSelected !== selectedChatId) {
      setSelectedChatId(nextSelected);
    }
  }, [conversations, selectedChatId]);

  useEffect(() => {
    void loadConversationMessages();
  }, [activeAccountId, selectedChatId]);

  useEffect(() => {
    const eventSource = new EventSource("/api/status/stream");

    const handleStatus = (event: MessageEvent<string>) => {
      try {
        const nextStatus = JSON.parse(event.data) as StatusResponse;
        setStatus(nextStatus);
      } catch {
        // Ignore malformed stream payloads and keep the last known snapshot.
      }
    };

    eventSource.addEventListener("status", handleStatus as EventListener);
    return () => eventSource.close();
  }, []);

  const activeAccount = status?.whatsapps.find((account) => account.id === activeAccountId);
  const selectedConversation = conversations.find((conversation) => conversation.chatId === selectedChatId);
  const selectedProviderHasStoredKey = settings.aiProvider?.providerId === providerId && settings.aiProvider.hasApiKey;

  if (settings && settings.licenseStatus && !settings.licenseStatus.valid) {
    return (
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh', textAlign: 'center' }}>
        <h1 style={{ marginBottom: '10px' }}>Lisans Süresi Doldu veya Geçersiz</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '30px' }}>{settings.licenseStatus.message}</p>
        <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
          <h2>Lisans Anahtarı Girin</h2>
          <input 
            type="text" 
            placeholder="WAPP-..." 
            value={licenseKeyInput} 
            onChange={e => setLicenseKeyInput(e.target.value)} 
            style={{ marginBottom: '16px' }}
          />
          <button style={{ width: '100%' }} onClick={() => void saveLicense()}>Doğrula ve Etkinleştir</button>
          {licenseMessage && <p className={licenseMessage.includes("başarı") ? "success-alert" : "error"} style={{ marginTop: '16px' }}>{licenseMessage}</p>}
        </div>
      </main>
    );
  }

  return (
    <main>
      <header>
        <div>
          <h1>WhatsApp Isletme AI</h1>
          <p>Tum WhatsApp hesaplarini, sirket bilgisini, AI ayarlarini ve konusmalari buradan yonetin.</p>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          {settings?.licenseStatus?.valid && (
            <div style={{ fontSize: '0.85rem', color: settings.licenseStatus.daysRemaining && settings.licenseStatus.daysRemaining <= 3 ? 'var(--danger)' : 'var(--text-secondary)' }}>
              Lisans Süresi: <strong>{settings.licenseStatus.daysRemaining} gün</strong> kaldı
            </div>
          )}
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === "light" ? "🌙 Koyu Tema" : "☀️ Acik Tema"}
          </button>
        </div>
      </header>

      <section className="card">
        <h2>WhatsApp Hesaplari</h2>
        <div className="tabs">
          {status?.whatsapps.map((account) => (
            <button
              className={account.id === activeAccountId ? "tab active" : "tab"}
              key={account.id}
              onClick={() => setActiveAccountId(account.id)}
            >
              {account.label}
            </button>
          ))}
        </div>
        <div className="add-account">
          <input
            value={newAccountLabel}
            onChange={(event) => setNewAccountLabel(event.target.value)}
            placeholder="Yeni WhatsApp hesap adi"
          />
          <button onClick={() => void addAccount()} disabled={!newAccountLabel.trim()}>
            Hesap ekle ve QR ac
          </button>
        </div>
        {activeAccount ? (
          <>
            <p><strong>Secili hesap:</strong> {activeAccount.label}</p>
            <p><strong>Baglanti:</strong> {activeAccount.connected ? "Bagli" : "Bagli degil"}</p>
            <p><strong>Detay:</strong> {activeAccount.detail}</p>
            <button onClick={() => void startAccount(activeAccount.id)}>QR / oturum baslat</button>
            {activeAccount.qr ? <img className="qr" src={activeAccount.qr} alt={`${activeAccount.label} WhatsApp QR`} /> : null}
          </>
        ) : <p>Henuz WhatsApp hesabi yok.</p>}
      </section>

      <section className="card">
        <h2>Siparişler ve Randevular</h2>
        {orders.length === 0 ? <p>Henüz alınmış bir sipariş veya randevu yok.</p> : (
          <div className="table-responsive">
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #ddd' }}>
                  <th>Tarih</th>
                  <th>Hesap & Chat</th>
                  <th>Detaylar</th>
                  <th>Durum</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => (
                  <tr key={order.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td>{new Date(order.createdAt).toLocaleString("tr-TR")}</td>
                    <td>{order.accountId} / {order.chatId}</td>
                    <td><pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{order.details}</pre></td>
                    <td>
                      <span className={`status-badge ${order.status}`}>
                        {order.status === 'pending' ? '⏳ Bekliyor' : order.status === 'completed' ? '✅ Tamamlandı' : '❌ İptal'}
                      </span>
                    </td>
                    <td>
                      <select value={order.status} onChange={e => void updateOrderStatus(order.id, e.target.value as Order["status"])}>
                        <option value="pending">Bekliyor</option>
                        <option value="completed">Tamamlandı</option>
                        <option value="cancelled">İptal</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Yapay Zeka Karakterleri (Personalar)</h2>
        <p>Yapay zekanın müşterilerle konuşurken bürüneceği karakterleri, unvanlarını ve tavırlarını (talimatlarını) buradan yönetebilirsiniz.</p>
        
        {editPersonas.map((persona, index) => (
          <div key={persona.id} style={{ border: '1px solid #ddd', padding: '10px', marginBottom: '10px', borderRadius: '5px' }}>
            <div className="settings-grid" style={{ marginBottom: '10px' }}>
              <label>Karakter Adı
                <input 
                  value={persona.name} 
                  onChange={(e) => {
                    const newPersonas = [...editPersonas];
                    newPersonas[index].name = e.target.value;
                    setEditPersonas(newPersonas);
                  }}
                />
              </label>
              <label>Unvanı (Örn: Satış Uzmanı)
                <input 
                  value={persona.role} 
                  onChange={(e) => {
                    const newPersonas = [...editPersonas];
                    newPersonas[index].role = e.target.value;
                    setEditPersonas(newPersonas);
                  }}
                />
              </label>
            </div>
            <label>Davranış Talimatı
              <textarea 
                value={persona.instruction} 
                rows={2}
                onChange={(e) => {
                  const newPersonas = [...editPersonas];
                  newPersonas[index].instruction = e.target.value;
                  setEditPersonas(newPersonas);
                }}
              />
            </label>
          </div>
        ))}
        
        <button onClick={() => void savePersonas()}>Karakterleri Kaydet</button>
        {personasMessage && <p className={personasMessage.includes("hata") ? "error" : "success-alert"}>{personasMessage}</p>}
      </section>

      <section className="card">
        <h2>AI Saglayicisi</h2>
        <p>
          <strong>Aktif saglayici:</strong>{" "}
          {status?.activeProvider ? status.activeProvider.label : "Henuz yapilandirilmadi"}
        </p>
        {!status?.activeProvider ? (
          <p className="warning">AI yanitlari baslamadan once gercek bir saglayici ve API anahtari girin.</p>
        ) : null}
        <div className="settings-grid">
          <label>
            Saglayici
            <select
              value={providerId}
              onChange={(event) => {
                const nextProviderId = event.target.value;
                setProviderId(nextProviderId);
                setModel("");
                setAvailableModels([]);
                setModelsError("");
                setSettingsMessage("");
              }}
            >
              {status?.providers.map((provider) => (
                <option value={provider.id} key={provider.id}>{provider.label}</option>
              ))}
            </select>
          </label>
          <label>
            Model
            <select value={model} onChange={(event) => setModel(event.target.value)} disabled={availableModels.length === 0}>
              <option value="">Model secin</option>
              {availableModels.map((availableModel) => (
                <option value={availableModel.id} key={availableModel.id}>{availableModel.label}</option>
              ))}
            </select>
          </label>
          <label>
            API anahtari
            <input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={selectedProviderHasStoredKey ? "Kayitli anahtari degistirmek icin yeni anahtar girin" : "API anahtarini girin"}
              type="password"
            />
          </label>
          <button className="secondary" onClick={() => void loadModels()} disabled={modelsLoading || (!apiKey && !selectedProviderHasStoredKey)}>
            {modelsLoading ? "Modeller aliniyor..." : "Modelleri getir"}
          </button>
          <button onClick={() => void saveAIProvider()} disabled={!providerId || !model || (!apiKey && !selectedProviderHasStoredKey)}>
            AI ayarlarini kaydet
          </button>
        </div>
        {modelsError ? <p className="error">{modelsError}</p> : null}
        {settingsMessage ? <p className="success-alert">{settingsMessage}</p> : null}
        <label>
          Yanit modu
          <select
            value={settings.responseMode}
            onChange={(event) => void changeResponseMode(event.target.value as AppSettings["responseMode"])}
          >
            <option value="safe_auto">Guvenliyse otomatik</option>
            <option value="always_auto">Her mesaja otomatik</option>
          </select>
        </label>
      </section>

      <section className="card">
        <h2>Sirket Bilgisi ve Belgeler</h2>
        <p>Buraya eklenen bilgiler kaydedilir, yeniden baslatmadan sonra korunur ve otomatik cevaplarda kaynak olarak kullanilir.</p>
        <label>
          Bilgi basligi
          <input
            value={knowledgeTitle}
            onChange={(event) => setKnowledgeTitle(event.target.value)}
            placeholder="Orn. Fiyat Listesi, Kargo Kurallari"
          />
        </label>
        <textarea
          value={knowledgeText}
          onChange={(event) => setKnowledgeText(event.target.value)}
          placeholder="Hizmetler, fiyat kurallari, iade, kargo, calisma saatleri..."
        />
        <div className="button-row">
          <button onClick={() => void saveKnowledge()} disabled={knowledgeSaving || !knowledgeTitle.trim() || !knowledgeText.trim()}>
            {knowledgeSaving ? "İşleniyor..." : knowledgeSourceId ? "Degisiklikleri kaydet" : "Yeni bilgi kaydet"}
          </button>
          <button className="secondary" onClick={clearKnowledgeForm} disabled={knowledgeSaving}>Yeni bilgi formu</button>
        </div>
        {knowledgeMessage ? <p className={knowledgeMessage.includes("hata") ? "error" : "success-alert"}>{knowledgeMessage}</p> : null}
        <hr />
        <label>
          PDF, DOCX, TXT veya MD belge yukle
          <input
            type="file"
            accept=".pdf,.docx,.txt,.md"
            onChange={(event) => void uploadDocument(event.target.files?.[0])}
            disabled={fileUploading}
          />
        </label>
        {fileMessage ? <p className={fileMessage.includes("hata") ? "error" : "success-alert"}>{fileMessage}</p> : null}
        <hr />
        <h3>Kayitli kaynaklar</h3>
        {knowledgeSources.length === 0 ? <p>Henuz sirket bilgisi veya belge eklenmedi.</p> : null}
        {knowledgeSources.map((source) => (
          <article className="knowledge-source" key={source.id}>
            <div>
              <strong>{source.title}</strong>
              <small>{source.type === "document" ? "Belge" : "Metin"} - {source.chunkCount} parca - {new Date(source.updatedAt).toLocaleString("tr-TR")}</small>
            </div>
            <div className="button-row">
              {source.type === "text" ? (
                <button className="secondary" onClick={() => editKnowledgeSource(source)}>Duzenle</button>
              ) : null}
              <button className="danger" onClick={() => void deleteKnowledgeSource(source.id)}>Sil</button>
            </div>
          </article>
        ))}
      </section>

      <section className="card">
        <h2>Yapay Zeka ve Operatör Dosyaları</h2>
        <p>Katalog, broşür, fiyat listesi vb. yükleyerek yapay zekanın müşterilere dosya olarak yollamasını veya sizin tek tıkla göndermenizi sağlayabilirsiniz.</p>
        <label>
          Dosya Açıklaması (AI'ın dosyayı tanıması için, örn: "2024 Yaz Kataloğu")
          <input value={aiFileDesc} onChange={(e) => setAiFileDesc(e.target.value)} placeholder="Dosya açıklaması..." />
        </label>
        <label>
          Dosya Seçin
          <input type="file" onChange={(e) => void uploadAIFile(e.target.files?.[0])} disabled={!aiFileDesc.trim()} />
        </label>
        {aiFileMessage && <p className={aiFileMessage.includes("hata") ? "error" : "success-alert"}>{aiFileMessage}</p>}
        <hr />
        <h3>Kayıtlı Dosyalar</h3>
        {(!status?.files || status.files.length === 0) ? <p>Kayıtlı dosya yok.</p> : null}
        {status?.files?.map(file => (
          <article className="knowledge-source" key={file.id}>
            <div>
              <strong>{file.filename}</strong>
              <small>{file.description} - {new Date(file.createdAt).toLocaleString("tr-TR")}</small>
            </div>
            <button className="danger" onClick={() => void deleteAIFile(file.id)}>Sil</button>
          </article>
        ))}
      </section>

      <section className="card">
        <h2>Hazır Cevaplar</h2>
        <p>Sizin tek tıkla gönderebileceğiniz ve yapay zekanın da cümleleri kurarken faydalanacağı hazır cevap şablonları.</p>
        <div className="settings-grid">
          <label>Başlık <input value={qrTitle} onChange={e => setQrTitle(e.target.value)} placeholder="Örn: Karşılama" /></label>
          <label>Metin <input value={qrText} onChange={e => setQrText(e.target.value)} placeholder="Örn: Merhaba, size nasıl yardımcı olabiliriz?" /></label>
        </div>
        <button onClick={() => void saveQuickReply()} disabled={!qrTitle.trim() || !qrText.trim()}>Kaydet</button>
        {qrMessage && <p className={qrMessage.includes("Hata") ? "error" : "success-alert"}>{qrMessage}</p>}
        <hr />
        <h3>Kayıtlı Cevaplar</h3>
        {(!status?.quickReplies || status.quickReplies.length === 0) ? <p>Kayıtlı hazır cevap yok.</p> : null}
        <div className="settings-grid">
          {status?.quickReplies?.map(qr => (
            <div className="knowledge-source" key={qr.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <strong>{qr.title}</strong>
              <small>{qr.text}</small>
              <button className="danger" style={{ marginTop: '10px' }} onClick={() => void deleteQuickReply(qr.id)}>Sil</button>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Konusmalar {activeAccount ? `- ${activeAccount.label}` : ""}</h2>
        {conversations.length === 0 ? <p>Henuz konusma yok.</p> : null}
        <div className="conversation-layout">
          <div className="conversation-list">
            {conversations.map((conversation) => (
              <button
                className={conversation.chatId === selectedChatId ? "conversation active" : "conversation"}
                key={`${conversation.accountId}:${conversation.chatId}`}
                onClick={() => setSelectedChatId(conversation.chatId)}
              >
                <strong>{conversation.chatName || conversation.chatId}</strong>
                <span>{conversation.status === 'ai_active' ? '🤖 AI Aktif' : conversation.status === 'operator_active' ? '👤 Ekipte' : conversation.status === 'ignored' ? '🔕 Yoksayıldı' : '⏳ Bekliyor'}</span>
                {conversation.handoffReason ? <small>{conversation.handoffReason}</small> : null}
              </button>
            ))}
          </div>
          <div className="conversation-detail">
            {selectedConversation ? (
              <>
                <div className="conversation-header">
                  <div>
                    <strong>{selectedConversation.chatName || selectedConversation.chatId}</strong>
                    <p>{selectedConversation.status === 'ai_active' ? '🤖 AI Yanıtlıyor' : selectedConversation.status === 'operator_active' ? '👤 Operatör Kontrolünde' : selectedConversation.status === 'ignored' ? '🔕 Yoksayıldı (AI Cevap Vermez)' : '⏳ Operatör Bekleniyor'}</p>
                    {selectedConversation.handoffReason ? <small>{selectedConversation.handoffReason}</small> : null}
                  </div>
                  <div className="button-row">
                    {selectedConversation.status === 'ignored' ? (
                      <button className="secondary" onClick={() => void resumeConversationAI(selectedConversation.accountId, selectedConversation.chatId)}>
                        Yoksaymayı Kaldır
                      </button>
                    ) : (
                      <>
                        <button onClick={() => void takeOverConversation(selectedConversation.accountId, selectedConversation.chatId)}>
                          Kontrolü ele al
                        </button>
                        <button className="secondary" onClick={() => void resumeConversationAI(selectedConversation.accountId, selectedConversation.chatId)}>
                          AI'a devret
                        </button>
                        <button className="danger" onClick={() => void ignoreConversation(selectedConversation.accountId, selectedConversation.chatId)}>
                          Yoksay (Sustur)
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {conversationActionMessage ? <p style={{ padding: '0 20px', color: 'var(--success)' }}>{conversationActionMessage}</p> : null}
                
                <div className="message-thread">
                  {conversationMessages.length === 0 ? <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '20px' }}>Bu konuşma için mesaj yok.</p> : null}
                  {conversationMessages.map((message) => (
                    <article className={message.direction === "incoming" ? "message incoming" : "message outgoing"} key={message.id}>
                      <div className="message-meta">
                        <strong>{message.author === "customer" ? (selectedConversation.chatName || message.chatId) : message.author === "ai" ? "🤖 AI (Bot)" : "👤 Siz"}</strong>
                        <small>{new Date(message.timestamp).toLocaleString("tr-TR", { hour: '2-digit', minute: '2-digit' })}</small>
                      </div>
                      <p>{message.text}</p>
                    </article>
                  ))}
                </div>
                
                <div className="reply-area">
                  <textarea
                    value={operatorReply}
                    onChange={(event) => setOperatorReply(event.target.value)}
                    placeholder="Operatör cevabını yaz..."
                  />
                  <div className="button-row" style={{ justifyContent: 'flex-end', marginBottom: 0 }}>
                    <button onClick={() => void sendOperatorReply(selectedConversation.accountId, selectedConversation.chatId)} disabled={!operatorReply.trim()}>
                      Gönder ve Kontrolü Al
                    </button>
                  </div>
                
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <p>Bir konuşma seçin.</p>
              </div>
            )}
          </div>
          
          {selectedConversation && (
            <div className="conversation-sidebar">
              <div className="tool-box">
                <h4>Müşteri Profili (Yapay Zeka Hafızası)</h4>
                <textarea 
                  style={{ width: '100%', minHeight: '80px', padding: '8px', boxSizing: 'border-box' }} 
                  placeholder="Müşteri hakkında notlar..." 
                  value={customerProfile?.notes || ""}
                  onChange={e => setCustomerProfile(prev => ({ ...prev, notes: e.target.value } as CustomerProfile))}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button className="secondary" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => void updateCustomerProfile(customerProfile?.notes || "")} disabled={profileSaving}>
                    {profileSaving ? "Kaydediliyor..." : "Notu Kaydet"}
                  </button>
                </div>
              </div>

              {status?.quickReplies && status.quickReplies.length > 0 && (
                <div className="tool-box">
                  <h4>Hazır Cevaplar</h4>
                  <div className="tool-tags">
                    {status.quickReplies.map(qr => (
                      <button key={qr.id} className="secondary" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => setOperatorReply(prev => (prev ? prev + "\n" + qr.text : qr.text))}>
                        {qr.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {status?.files && status.files.length > 0 && (
                <div className="tool-box">
                  <h4>Dosya Gönder (Kod Ekle)</h4>
                  <div className="tool-tags">
                    {status.files.map(f => (
                      <button key={f.id} className="secondary" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => setOperatorReply(prev => (prev ? prev + `\n[SEND_FILE:${f.id}]` : `[SEND_FILE:${f.id}]`))}>
                        {f.filename}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

createRoot(document.getElementById("root")!).render(<App />);
