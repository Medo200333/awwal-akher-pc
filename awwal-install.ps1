# تثبيت أول وآخر على جهاز Pc
$ErrorActionPreference = "Stop"
$Dest = "C:\awwal-akher"
$Repo = "https://github.com/Medo200333/awwal-akher-pc.git"

Write-Host ""
Write-Host "تثبيت أول وآخر على Pc"
Write-Host ""

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "Node.js مش موجود. لازم إصدار 22 أو أحدث."
  Start-Process "https://nodejs.org/en/download"
  exit 1
}
Write-Host ("Node.js: " + (& node -p "process.versions.node"))

$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
  Write-Host "Git مش موجود. نزّله من https://git-scm.com/download/win وبعدين شغّل السكربت تاني."
  Start-Process "https://git-scm.com/download/win"
  exit 1
}

$env:GIT_TERMINAL_PROMPT = "0"

if (Test-Path (Join-Path $Dest ".git")) {
  Write-Host "المشروع موجود. بجيب آخر نسخة من النسخة العامة."
  Set-Location $Dest
  & git remote set-url origin $Repo
  & git pull --ff-only origin main
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} elseif (Test-Path $Dest) {
  Write-Host "المجلد موجود من محاولة قديمة. بنسخ المشروع من جديد."
  Remove-Item -LiteralPath $Dest -Recurse -Force
  & git clone $Repo $Dest
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Set-Location $Dest
} else {
  Write-Host "بنسخ المشروع إلى $Dest"
  & git clone $Repo $Dest
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Set-Location $Dest
}

Write-Host "بتنزّل مكتبات التثبيت..."
& npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$desktop = [Environment]::GetFolderPath("Desktop")
$shortcut = Join-Path $desktop "اول واخر.lnk"
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($shortcut)
$link.TargetPath = "cmd.exe"
$link.Arguments = '/k "cd /d C:\awwal-akher && npm run dev"'
$link.WorkingDirectory = $Dest
$link.WindowStyle = 1
$link.Description = "اول واخر"
$link.Save()

Write-Host ""
Write-Host "التثبيت خلص. الاختصار اول واخر على سطح المكتب."
Write-Host "التشغيل: http://127.0.0.1:8080"
