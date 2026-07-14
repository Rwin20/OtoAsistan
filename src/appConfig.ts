import path from "node:path";
import os from "node:os";

export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  databasePath: string;
}

export function loadConfig(): AppConfig {
  const dataDir = process.env.APP_DATA_DIR ?? path.join(os.homedir(), "AppData", "Roaming", "whatsappisletme");
  return {
    host: "127.0.0.1",
    port: Number(process.env.PORT ?? 3000),
    dataDir,
    databasePath: process.env.DATABASE_PATH ?? path.join(dataDir, "app.sqlite")
  };
}
