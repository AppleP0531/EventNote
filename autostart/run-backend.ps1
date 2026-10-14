# ===================================
# EventNote 常駐スクリプト
#   ログオン時に run-backend-hidden.vbs から画面なしで起動される。
#   画面をビルドしてから、バックエンドを http://localhost:8080 で起動する
#   （画面と API を同じポートで配信。start.ps1 なしで使える）。
#   止まったら10秒後に起動し直す。
#   start.ps1（開発用）が 8080 を使っている間は待機し、閉じたら引き継ぐ。
#   ログ: %LOCALAPPDATA%\EventNote\backend.log
# ===================================

$logDir = Join-Path $env:LOCALAPPDATA "EventNote"
$log = Join-Path $logDir "backend.log"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-Log([string]$msg) {
    $line = "[{0}] [runner] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    [IO.File]::AppendAllText($log, $line + [Environment]::NewLine, (New-Object Text.UTF8Encoding $false))
}

# 5MB を超えたらログを入れ替える
function Invoke-LogRotate {
    if ((Test-Path $log) -and (Get-Item $log).Length -gt 5MB) {
        Move-Item $log "$log.old" -Force
    }
}

# 二重起動を防ぐ
$mutex = New-Object System.Threading.Mutex($false, "Local\EventNoteBackendRunner")
if (-not $mutex.WaitOne(0)) { exit 0 }

# 画面と API を配信するポート（run-node.cmd の PORT と合わせる）
$port = 8080

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Log "node.exe not found in PATH. Exit."
    exit 1
}
$runNode = Join-Path $PSScriptRoot "run-node.cmd"

Write-Log "runner started (port $port)"
$waitLogged = $false
while ($true) {
    Invoke-LogRotate

    # start.ps1（開発用）などが 8080 を使っている間は待つ
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        if (-not $waitLogged) {
            Write-Log "port $port is in use by another process. Waiting..."
            $waitLogged = $true
        }
        Start-Sleep -Seconds 15
        continue
    }
    $waitLogged = $false

    Write-Log "starting backend"
    # run-node.cmd が画面をビルドしてから node app.js を実行し、出力をログへ追記する
    & $runNode
    Write-Log "backend stopped (exit code $LASTEXITCODE). Restarting in 10 seconds..."
    Start-Sleep -Seconds 10
}
