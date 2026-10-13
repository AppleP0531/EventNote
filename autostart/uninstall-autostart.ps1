# ===================================
# EventNote バックエンドの自動起動を解除し、常駐中のバックエンドを止める
# ===================================

$startup = [Environment]::GetFolderPath("Startup")
$lnk = Join-Path $startup "EventNote Backend.lnk"

if (Test-Path $lnk) {
    Remove-Item $lnk -Force
    Write-Host "自動起動を解除しました。" -ForegroundColor Green
} else {
    Write-Host "自動起動は登録されていません。" -ForegroundColor Yellow
}

# 常駐スクリプト（run-backend.ps1）とその子プロセス（node）を止める
$runners = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
    Where-Object { $_.CommandLine -like "*run-backend.ps1*" }
foreach ($p in $runners) {
    taskkill /PID $p.ProcessId /T /F 2>$null | Out-Null
}
if ($runners) {
    Write-Host "常駐中のバックエンドを停止しました。" -ForegroundColor Green
}
