const { createHmac } = require("node:crypto");
const readline = require("readline");

const LICENSE_SECRET = "whatsapp-isletme-secret-key-2026";

function generateLicense(type, daysToLive) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + daysToLive);
  
  const payload = {
    type,
    expiresAt: expiresAt.toISOString(),
  };
  
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", LICENSE_SECRET).update(data).digest("base64url");
  
  return `WAPP-${data}.${signature}`;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("========================================");
console.log("   LİSANS (API ANAHTARI) ÜRETİCİSİ");
console.log("========================================");
console.log("1. 14 Günlük Deneme Sürümü");
console.log("2. 1 Aylık Lisans (30 gün)");
console.log("3. 3 Aylık Lisans (90 gün)");
console.log("4. 1 Yıllık Lisans (365 gün)");
console.log("========================================");

rl.question("Lütfen bir seçenek girin (1-4): ", (answer) => {
  let type = "";
  let days = 0;

  switch (answer.trim()) {
    case "1":
      type = "trial_14";
      days = 14;
      break;
    case "2":
      type = "month_1";
      days = 30;
      break;
    case "3":
      type = "month_3";
      days = 90;
      break;
    case "4":
      type = "year_1";
      days = 365;
      break;
    default:
      console.log("Geçersiz seçim! Program sonlandırılıyor.");
      rl.close();
      return;
  }

  const key = generateLicense(type, days);
  console.log("\n========================================");
  console.log("BAŞARIYLA ÜRETİLDİ!");
  console.log("Aşağıdaki anahtarı müşterinize iletebilirsiniz:");
  console.log("\n" + key + "\n");
  console.log("Süre: " + days + " gün");
  console.log("========================================");
  
  rl.close();
});
