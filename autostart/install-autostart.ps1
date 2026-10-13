# ===================================
# EventNote バックエンドの自動起動を登録する
#   Windows のスタートアップフォルダにショートカットを作り、
#   ログオン時にバックエンドを画面なしで起動する（通知を取りこぼさないため）。
#   登録後、すぐにバックエンドも起動する。
# ===================================

$vbs = Join-Path $PSScriptRoot "run-backend-hidden.vbs"
$startup = [Environment]::GetFolderPath("Startup")
$lnk = Join-Path $startup "EventNote Backend.lnk"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "node が見つかりません。Node.js をインストールしてから実行してください。" -ForegroundColor Red
    exit 1
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnk)
$shortcut.TargetPath = Join-Path $env:WINDIR "System32\wscript.exe"
$shortcut.Arguments = "`"$vbs`""
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.Description = "EventNote backend (Web Push notifications)"
$shortcut.Save()
Write-Host "自動起動を登録しました: $lnk" -ForegroundColor Green

# いますぐ起動（すでに動いていれば何もしない）
Start-Process (Join-Path $env:WINDIR "System32\wscript.exe") -ArgumentList "`"$vbs`""
Write-Host "バックエンドをバックグラウンドで起動しました。" -ForegroundColor Green
Write-Host "ログ: $(Join-Path $env:LOCALAPPDATA 'EventNote\backend.log')" -ForegroundColor Cyan
Write-Host ""
Write-Host "※ start.ps1 で起動したときは start.ps1 側のバックエンドが優先され、" -ForegroundColor Yellow
Write-Host "   start.ps1 を閉じると自動起動のバックエンドが引き継ぎます。" -ForegroundColor Yellow
