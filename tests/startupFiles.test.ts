import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("one-click startup files", () => {
  it("provides a Windows batch launcher that delegates to the PowerShell startup script", () => {
    const launcher = fs.readFileSync("Baslat.bat", "utf8");

    expect(launcher).toContain("scripts\\start-panel.ps1");
    expect(launcher).toContain("ExecutionPolicy Bypass");
  });

  it("startup script installs dependencies, builds, starts the server, and opens the panel", () => {
    const script = fs.readFileSync("scripts/start-panel.ps1", "utf8");

    expect(script).toContain("npm install");
    expect(script).toContain("npm run build");
    expect(script).toContain("Get-CimInstance Win32_Process");
    expect(script).toContain('$tokenRoot = Join-Path $ProjectRoot "tokens"');
    expect(script).toContain("lockfile");
    expect(script).toContain("Stop-Process");
    expect(script).toContain("dist/src/server.js");
    expect(script).toContain("Start-Process $panelUrl");
    expect(script).toContain("START_WHATSAPP");
  });
});
