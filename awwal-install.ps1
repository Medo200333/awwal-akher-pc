# Install Awwal Akher on Pc
$ErrorActionPreference = "Stop"
$Dest = "C:\awwal-akher"
$Repo = "https://github.com/Medo200333/awwal-akher-pc.git"

Write-Host ""
Write-Host "Installing Awwal Akher on Pc"
Write-Host ""

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "Node.js is missing. Need version 22 or newer."
  Start-Process "https://nodejs.org/en/download"
  exit 1
}
Write-Host ("Node.js: " + (& node -p "process.versions.node"))

$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
  Write-Host "Git is missing. Install it from https://git-scm.com/download/win then run this again."
  Start-Process "https://git-scm.com/download/win"
  exit 1
}

$env:GIT_TERMINAL_PROMPT = "0"

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

$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutName = -join @(
  [char]0x0627, [char]0x0648, [char]0x0644, [char]0x0020,
  [char]0x0648, [char]0x0627, [char]0x062E, [char]0x0631
)
$shortcut = Join-Path $desktop ($shortcutName + ".lnk")
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($shortcut)
$link.TargetPath = "cmd.exe"
$link.Arguments = '/k "cd /d C:\awwal-akher && npm run dev"'
$link.WorkingDirectory = $Dest
$link.WindowStyle = 1
$link.Description = "Awwal Akher"
$link.Save()

Write-Host ""
Write-Host "Done. Shortcut is on the desktop."
Write-Host "Open: http://127.0.0.1:8080"
