# ===================================
# EventNote バックエンド常駐スクリプト
#   ログオン時に run-backend-hidden.vbs から画面なしで起動される。
#   node app.js を実行し、止まったら10秒後に起動し直す。
#   start.ps1 などで別のバックエンドがポートを使っている間は待機し、
#   それが終わったら引き継いで起動する。
#   ログ: %LOCALAPPDATA%\EventNote\backend.log
# ===================================

$root = Split-Path $PSScriptRoot -Parent
$backend = Join-Path $root "backend"
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

# .env からポート番号を読む（無ければ 3000）
$port = 3000
$envFile = Join-Path $backend ".env"
if (Test-Path $envFile) {
    $m = Select-String -Path $envFile -Pattern '^\s*PORT\s*=\s*(\d+)' | Select-Object -First 1
    if ($m) { $port = [int]$m.Matches[0].Groups[1].Value }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Log "node.exe not found in PATH. Exit."
    exit 1
}
$runNode = Join-Path $PSScriptRoot "run-node.cmd"

Write-Log "runner started (port $port)"
$waitLogged = $false
while ($true) {
    Invoke-LogRotate

    # 他のバックエンド（start.ps1 など）が動いている間は待つ
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
    # run-node.cmd が node app.js を実行し、出力（UTF-8）をそのままログへ追記する
    & $runNode
    Write-Log "backend stopped (exit code $LASTEXITCODE). Restarting in 10 seconds..."
    Start-Sleep -Seconds 10
}
