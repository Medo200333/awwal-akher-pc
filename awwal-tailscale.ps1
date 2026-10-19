# Publish Awwal Akher on Tailscale Funnel
$ErrorActionPreference = "Stop"
Set-Location C:\awwal-akher
$env:GIT_TERMINAL_PROMPT = "0"

Write-Host "Pulling the latest copy..."
& git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$busy = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  Write-Host "Restarting the app so the new address is allowed."
  $busy | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
}

Write-Host "Starting the app..."
Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d C:\awwal-akher && npm run dev" -WorkingDirectory "C:\awwal-akher" -WindowStyle Minimized

$ready = $false
for ($i = 0; $i -lt 45; $i++) {
  Start-Sleep -Seconds 2
  if (Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue) {
    $ready = $true
    break
  }
}
if (-not $ready) {
  Write-Host "The app did not start on port 8080."
  exit 1
}

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
