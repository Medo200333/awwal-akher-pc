# Publish Awwal Akher on Tailscale Funnel, and keep it running after SSH closes.
$ErrorActionPreference = "Stop"
Set-Location C:\awwal-akher
$env:GIT_TERMINAL_PROMPT = "0"
$log = "C:\Users\Public\awwal-dev.log"
$runner = "C:\Users\Public\awwal-run.cmd"

Write-Host "Pulling the latest copy..."
& git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

function Test-AppPort {
  return [bool](Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue)
}

$busy = @(Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue)
if ($busy.Count -gt 0) {
  Write-Host "Stopping the old app."
  $busy | ForEach-Object {
    if ($_.OwningProcess -gt 0) {
      Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  }
  for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    if (-not (Test-AppPort)) { break }
  }
}

Set-Content -LiteralPath $runner -Encoding ASCII -Value @"
@echo off
cd /d C:\awwal-akher
npm run dev >> C:\Users\Public\awwal-dev.log 2>&1
"@

if (Test-Path $log) { Remove-Item $log -Force }
Write-Host "Starting the app outside the SSH session..."
& schtasks /Create /TN "AwwalAkherDev" /TR $runner /SC ONCE /ST 00:00 /F /RL LIMITED | Out-Null
& schtasks /Run /TN "AwwalAkherDev" | Out-Null

$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 2
  if (Test-AppPort) {
    $ready = $true
    break
  }
  if ((Test-Path $log) -and (Select-String -Path $log -Pattern "error|Error|EADDRINUSE|ENOENT" -Quiet)) {
    break
  }
}

if (-not $ready) {
  Write-Host "The app did not start on port 8080."
  if (Test-Path $log) {
    Write-Host "----- log -----"
    Get-Content $log -Tail 40
  } else {
    Write-Host "No log file. The scheduled task did not start."
  }
  exit 1
}

try {
  $local = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:8080/" -TimeoutSec 15
  Write-Host "Local check: $($local.StatusCode)"
} catch {
  Write-Host "Local check failed: $($_.Exception.Message)"
  if (Test-Path $log) {
    Write-Host "----- log -----"
    Get-Content $log -Tail 40
  }
  exit 1
}

Write-Host "App is listening on port 8080."
$ts = "C:\Program Files\Tailscale\tailscale.exe"
if (-not (Test-Path -LiteralPath $ts)) {
  Write-Host "Tailscale is not installed in Program Files."
  exit 1
}

Write-Host "Publishing on Tailscale Funnel..."
& $ts funnel --bg 8080
if ($LASTEXITCODE -ne 0) {
  Write-Host "Funnel is not enabled. Publishing inside the Tailscale network only."
  & $ts serve --bg 8080
  & $ts serve status
  exit 0
}
& $ts funnel status
