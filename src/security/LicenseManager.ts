import { createHmac } from "node:crypto";

const LICENSE_SECRET = "whatsapp-isletme-secret-key-2026"; // Hardcoded secret for signing and verifying

export interface LicensePayload {
  type: "trial_14" | "month_1" | "month_3" | "year_1";
  expiresAt: string; // ISO String
}

export interface LicenseStatus {
  valid: boolean;
  expired: boolean;
  expiresAt?: string;
  daysRemaining?: number;
  message: string;
}

export class LicenseManager {
  static generateLicense(type: LicensePayload["type"], daysToLive: number): string {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + daysToLive);
    
    const payload: LicensePayload = {
      type,
      expiresAt: expiresAt.toISOString(),
    };
    
    const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", LICENSE_SECRET).update(data).digest("base64url");
    
    return `WAPP-${data}.${signature}`;
  }

  static verifyLicense(key?: string): LicenseStatus {
    if (!key || !key.startsWith("WAPP-")) {
      return { valid: false, expired: false, message: "Geçersiz veya eksik lisans anahtarı." };
    }

    const parts = key.replace("WAPP-", "").split(".");
    if (parts.length !== 2) {
      return { valid: false, expired: false, message: "Lisans formatı bozuk." };
    }

    const [data, signature] = parts;
    const expectedSignature = createHmac("sha256", LICENSE_SECRET).update(data).digest("base64url");

    if (signature !== expectedSignature) {
      return { valid: false, expired: false, message: "Lisans doğrulaması başarısız oldu (Kurcalanmış)." };
    }

    try {
      const payloadString = Buffer.from(data, "base64url").toString("utf-8");
      const payload = JSON.parse(payloadString) as LicensePayload;
      const expiry = new Date(payload.expiresAt);
      const now = new Date();
      
      const diffTime = expiry.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (now > expiry) {
        return { valid: false, expired: true, expiresAt: payload.expiresAt, daysRemaining: 0, message: "Lisans süreniz dolmuştur." };
      }

      return {
        valid: true,
        expired: false,
        expiresAt: payload.expiresAt,
        daysRemaining: diffDays,
        message: "Lisans geçerli."
      };
    } catch (e) {
      return { valid: false, expired: false, message: "Lisans çözümlenemedi." };
    }
  }
}
