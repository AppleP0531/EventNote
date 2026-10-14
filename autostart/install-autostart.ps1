# ===================================
# EventNote の自動起動を登録する
#   Windows のスタートアップフォルダにショートカットを作り、
#   ログオン時に EventNote（画面＋バックエンド）を画面なしで起動する。
#   → いつでも http://localhost:8080 で使え、通知も取りこぼさない。
#   デスクトップに「EventNote」のショートカットも作る。登録後すぐに起動する。
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

# デスクトップに画面を開くショートカット
$url = "http://localhost:8080"
$desktopLink = Join-Path ([Environment]::GetFolderPath("Desktop")) "EventNote.url"
Set-Content -Path $desktopLink -Value "[InternetShortcut]`r`nURL=$url`r`n" -Encoding ASCII
Write-Host "デスクトップに「EventNote」のショートカットを作りました。" -ForegroundColor Green

# いますぐ起動（すでに動いていれば何もしない）
Start-Process (Join-Path $env:WINDIR "System32\wscript.exe") -ArgumentList "`"$vbs`""
Write-Host "EventNote をバックグラウンドで起動しています（初回は数十秒〜数分かかります）..." -ForegroundColor Cyan

# 起動を待ってブラウザで開く（最大3分）
$ready = $false
for ($i = 0; $i -lt 90; $i++) {
    if (Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue) { $ready = $true; break }
    Start-Sleep -Seconds 2
}
if ($ready) {
    Write-Host "起動しました: $url" -ForegroundColor Green
    Start-Process $url
} else {
    Write-Host "まだ起動していません。しばらくしてから $url を開いてください。" -ForegroundColor Yellow
    Write-Host "開けない場合は open-log.bat でログを確認してください。" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "ログ: $(Join-Path $env:LOCALAPPDATA 'EventNote\backend.log')" -ForegroundColor Cyan
Write-Host "※ start.ps1（開発用）を起動するとそちらが優先され、閉じると自動起動側に戻ります。" -ForegroundColor Yellow
