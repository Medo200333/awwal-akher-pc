# Install Awwal Akher on a second Windows PC, then keep it on Tailscale Funnel.
$ErrorActionPreference = "Stop"
$Dest = "C:\awwal-akher"
$Repo = "https://github.com/Medo200333/awwal-akher-pc.git"
$env:GIT_TERMINAL_PROMPT = "0"

Write-Host ""
Write-Host "Installing Awwal Akher on this PC"
Write-Host ""

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "Node.js is missing. Install version 22 or newer, then run this again."
  Write-Host "https://nodejs.org/en/download"
  exit 1
}
Write-Host ("Node.js: " + (& node -p "process.versions.node"))

$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
  Write-Host "Git is missing. Install it, then run this again."
  Write-Host "https://git-scm.com/download/win"
  exit 1
}

if (Test-Path (Join-Path $Dest ".git")) {
  Write-Host "Project exists. Pulling the latest copy."
  Set-Location $Dest
  & git remote set-url origin $Repo
  & git pull --ff-only origin main
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} elseif (Test-Path $Dest) {
  Write-Host "Old folder found. Cloning a fresh copy."
  Remove-Item -LiteralPath $Dest -Recurse -Force
  & git clone $Repo $Dest
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Set-Location $Dest
} else {
  Write-Host "Cloning the project to $Dest"
  & git clone $Repo $Dest
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Set-Location $Dest
}

Write-Host "Installing packages..."
& npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

function Test-AppPort {
  return [bool](Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue)
}

$busy = @(Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue)
if ($busy.Count -gt 0) {
  Write-Host "Stopping the old app."
  schtasks /End /TN "AwwalAkherDev" 2>$null | Out-Null
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

$log = "C:\Users\Public\awwal-dev.log"
$runner = "C:\Users\Public\awwal-run.cmd"
Set-Content -LiteralPath $runner -Encoding ASCII -Value @"
@echo off
cd /d C:\awwal-akher
:again
echo ---- start %DATE% %TIME% ---- >> C:\Users\Public\awwal-dev.log
call npm run dev >> C:\Users\Public\awwal-dev.log 2>&1
echo ---- exit %ERRORLEVEL% %DATE% %TIME% ---- >> C:\Users\Public\awwal-dev.log
ping -n 4 127.0.0.1 >nul
goto again
"@

if (Test-Path $log) { Remove-Item $log -Force }
Write-Host "Starting the app outside the SSH session..."
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c C:\Users\Public\awwal-run.cmd"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1)
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName "AwwalAkherDev" -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName "AwwalAkherDev"

$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 2
  if (Test-AppPort) { $ready = $true; break }
}
if (-not $ready) {
  Write-Host "The app did not start on port 8080."
  if (Test-Path $log) { Get-Content $log -Tail 40 }
  exit 1
}

try {
  $local = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:8080/" -TimeoutSec 20
  Write-Host "Local check: $($local.StatusCode)"
} catch {
  Write-Host "Local check failed: $($_.Exception.Message)"
  if (Test-Path $log) { Get-Content $log -Tail 40 }
  exit 1
}

$ts = "C:\Program Files\Tailscale\tailscale.exe"
if (-not (Test-Path -LiteralPath $ts)) {
  Write-Host "Installed. Open on this PC: http://127.0.0.1:8080"
  Write-Host "Tailscale was not found, so it is not published on the internet yet."
  exit 0
}

Write-Host "Publishing on Tailscale Funnel..."
& $ts funnel --https=443 off 2>$null | Out-Null
Start-Sleep -Seconds 1
& $ts funnel --bg 8080
& $ts funnel status
Write-Host "Done."
