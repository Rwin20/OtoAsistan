$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $projectRoot

function Invoke-Step($Title, $Command) {
  Write-Host ""
  Write-Host "== $Title =="
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Title failed with exit code $LASTEXITCODE"
  }
}

function Stop-ExistingAppProcesses {
  param([string]$ProjectRoot)

  $tokenRoot = Join-Path $ProjectRoot "tokens"
  $serverScript = Join-Path $ProjectRoot "dist\src\server.js"

  Get-CimInstance Win32_Process |
    Where-Object {
      $cmd = $_.CommandLine
      $cmd -and (
        $cmd -like "*$serverScript*" -or
        $cmd -like "*$tokenRoot*"
      )
    } |
    ForEach-Object {
      try {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
      } catch {
      }
    }

  if (Test-Path $tokenRoot) {
    Get-ChildItem -Path $tokenRoot -Recurse -Filter lockfile -File -ErrorAction SilentlyContinue |
      Remove-Item -Force -ErrorAction SilentlyContinue
  }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is not installed or not available in PATH."
}

Stop-ExistingAppProcesses -ProjectRoot $projectRoot

if (-not (Test-Path "node_modules")) {
  Invoke-Step "Installing dependencies" { npm install }
}

Invoke-Step "Building application" { npm run build }

$port = if ($env:PORT) { $env:PORT } else { "3000" }
$env:PORT = $port
$env:START_WHATSAPP = "true"
$panelUrl = "http://127.0.0.1:$port"

Write-Host ""
Write-Host "Starting WhatsApp AI panel at $panelUrl"

$opener = Start-Job -ScriptBlock {
  param($panelUrl)
  $deadline = (Get-Date).AddSeconds(30)
  do {
    Start-Sleep -Milliseconds 500
    try {
      Invoke-WebRequest -UseBasicParsing -Uri "$panelUrl/api/status" -TimeoutSec 2 | Out-Null
      Start-Process $panelUrl
      return
    } catch {
    }
  } while ((Get-Date) -lt $deadline)
} -ArgumentList $panelUrl

Write-Host ""
Write-Host "Panel will open automatically. Keep this window open while using the application."
Write-Host "Press Ctrl+C or close this window to stop the local server."

node dist/src/server.js

Receive-Job $opener -ErrorAction SilentlyContinue | Out-Null
Remove-Job $opener -Force -ErrorAction SilentlyContinue
