# ===================================
# Start backend and frontend servers
# ===================================

$root = $PSScriptRoot
$backendPath = Join-Path $root "backend"
$frontendPath = Join-Path $root "frontend"
$backendPort = 3000
$frontendPort = 8080
$mainPid = $PID   # このメインターミナルのプロセスID（子ウィンドウが生存確認に使う）

$appName = Split-Path $root -Leaf
Write-Host "Starting $appName..." -ForegroundColor Cyan

if (-not (Test-Path $backendPath)) {
    Write-Host "ERROR: backend folder not found at $backendPath" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $frontendPath)) {
    Write-Host "ERROR: frontend folder not found at $frontendPath" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path (Join-Path $backendPath "node_modules"))) {
    Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
    Push-Location $backendPath
    npm install
    Pop-Location
}

if (-not (Test-Path (Join-Path $frontendPath "node_modules"))) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    Push-Location $frontendPath
    npm install
    Pop-Location
}

# 各サーバーの設定。Flag は「再起動して / 終了して」の合図に使う一時ファイル。
$script:servers = @{
    backend  = @{
        Path = $backendPath
        Port = $backendPort
        Cmd  = "node app.js"
        Flag = (Join-Path $env:TEMP "$appName.$mainPid.backend.request")
        Proc = $null
    }
    frontend = @{
        Path = $frontendPath
        Port = $frontendPort
        Cmd  = "npm run dev"
        Flag = (Join-Path $env:TEMP "$appName.$mainPid.frontend.request")
        Proc = $null
    }
}

# Helper: check if a port is already in use
function Test-PortInUse {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return [bool]$conn
}

# Helper: ポートを使っているプロセスを子プロセスごと止める（Ctrl+C相当）
function Stop-ByPort {
    param([int]$Port)
    $owners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $owners) {
        taskkill /PID $procId /T /F 2>$null | Out-Null
    }
}

# Helper: ウィンドウ側へ合図を送る。
function Send-Request {
    param($Server, [string]$Request)
    $tmp = "$($Server.Flag).tmp"
    Set-Content -Path $tmp -Value $Request -NoNewline -Encoding ASCII
    Move-Item -Path $tmp -Destination $Server.Flag -Force
}

# Helper: サーバー用のターミナルを開く
function New-ServerWindow {
    param([string]$Name)
    $s = $script:servers[$Name]

    # 古いウィンドウが残っていれば閉じる
    if ($s.Proc -and -not $s.Proc.HasExited) {
        taskkill /PID $s.Proc.Id /T /F 2>$null | Out-Null
    }
    Remove-Item $s.Flag -Force -ErrorAction SilentlyContinue

    # ウィンドウ内で動かすループ:
    #   サーバー実行 -> 止まったら合図を待つ
    #   restart なら同じウィンドウで再実行、quit ならこのウィンドウを閉じる
    #   Ctrl+C を押すとループごと止まり、通常のプロンプトに戻る
    $command = @"
`$Host.UI.RawUI.WindowTitle = '$Name'
Set-Location '$($s.Path)'
while (`$true) {
    $($s.Cmd)
    Write-Host '--- $Name stopped. Waiting for a request from the main terminal (Ctrl+C to leave) ---' -ForegroundColor Yellow
    while (-not (Test-Path '$($s.Flag)') -and (Get-Process -Id $mainPid -ErrorAction SilentlyContinue)) { Start-Sleep -Milliseconds 500 }
    if (-not (Test-Path '$($s.Flag)')) { Write-Host '--- main terminal closed ---' -ForegroundColor Yellow; break }
    `$req = (Get-Content '$($s.Flag)' -Raw).Trim()
    Remove-Item '$($s.Flag)' -Force
    if (`$req -eq 'quit') { exit }
    Write-Host '--- restarting $Name ---' -ForegroundColor Cyan
}
"@
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
    $s.Proc = Start-Process powershell -PassThru -ArgumentList "-NoExit", "-EncodedCommand", $encoded
}

# Helper: サーバーだけ再起動
function Restart-Server {
    param([string]$Name)
    $s = $script:servers[$Name]

    if ($s.Proc -and -not $s.Proc.HasExited) {
        Send-Request -Server $s -Request "restart"
        Stop-ByPort -Port $s.Port

        # ウィンドウ側が合図を受け取る（ファイルを消す）のを最大6秒待つ
        $waited = 0
        while ((Test-Path $s.Flag) -and $waited -lt 12) {
            Start-Sleep -Milliseconds 500
            $waited++
        }

        if (-not (Test-Path $s.Flag)) {
            Write-Host "$Name restarted in its own terminal." -ForegroundColor Green
            return
        }

        # 受け取られなかった場合
        Write-Host "$Name terminal did not respond. Opening a new one..." -ForegroundColor Yellow
    }
    New-ServerWindow -Name $Name
}

# Helper: サーバーを止める
function Close-ServerWindows {
    $names = @("backend", "frontend")

    foreach ($name in $names) {
        $s = $script:servers[$name]
        if ($s.Proc -and -not $s.Proc.HasExited) {
            Send-Request -Server $s -Request "quit"
        }
    }
    Stop-ByPort -Port $backendPort
    Stop-ByPort -Port $frontendPort

    # 各ウィンドウが自分で終了するのを最大5秒待つ
    $waited = 0
    while ($waited -lt 10) {
        $alive = @($names | Where-Object { $script:servers[$_].Proc -and -not $script:servers[$_].Proc.HasExited })
        if ($alive.Count -eq 0) { break }
        Start-Sleep -Milliseconds 500
        $waited++
    }

    # 強制的に閉じる
    foreach ($name in $names) {
        $s = $script:servers[$name]
        if ($s.Proc -and -not $s.Proc.HasExited) {
            taskkill /PID $s.Proc.Id /T /F 2>$null | Out-Null
        }
        Remove-Item $s.Flag, "$($s.Flag).tmp" -Force -ErrorAction SilentlyContinue
    }
}

# Helper: 初回起動
function Start-Servers {
    param([bool]$OpenBrowser = $true)

    Stop-ByPort -Port $backendPort
    Stop-ByPort -Port $frontendPort
    Start-Sleep -Seconds 1

    Write-Host "Starting backend server..." -ForegroundColor Green
    New-ServerWindow -Name "backend"
    Start-Sleep -Seconds 2

    Write-Host "Starting frontend server on port $frontendPort..." -ForegroundColor Green
    New-ServerWindow -Name "frontend"

    Write-Host "Waiting for frontend to start..." -ForegroundColor Yellow
    $maxWaitSeconds = 30
    $elapsed = 0
    while ($elapsed -lt $maxWaitSeconds -and -not (Test-PortInUse -Port $frontendPort)) {
        Start-Sleep -Seconds 1
        $elapsed++
    }

    if (Test-PortInUse -Port $frontendPort) {
        $frontendUrl = "http://localhost:$frontendPort"
        Write-Host "Frontend started at $frontendUrl" -ForegroundColor Green
        if ($OpenBrowser) {
            Start-Process $frontendUrl
        }
    } else {
        Write-Host "Could not detect frontend. Please check the frontend terminal window." -ForegroundColor Yellow
    }

    Write-Host "$appName Backend:  http://localhost:$backendPort" -ForegroundColor Cyan
    Write-Host "$appName Frontend: http://localhost:$frontendPort" -ForegroundColor Cyan
}

# --- 初回起動 ---
Start-Servers -OpenBrowser $true

# --- キー入力待ち ---
$hint = "[r] Restart   [c] Close"
Write-Host ""
Write-Host $hint -ForegroundColor Magenta

while ($true) {
    if ([Console]::KeyAvailable) {
        $key = [Console]::ReadKey($true).KeyChar.ToString().ToLower()

        if ($key -eq "r") {
            Write-Host "Restarting servers..." -ForegroundColor Cyan
            Restart-Server -Name "backend"
            Restart-Server -Name "frontend"
            Write-Host $hint -ForegroundColor Magenta
        }
        elseif ($key -eq "c") {
            Write-Host "Closing all windows..." -ForegroundColor Cyan
            Close-ServerWindows
            [Environment]::Exit(0)   # このメインのウィンドウも閉じる
        }
    }
    Start-Sleep -Milliseconds 200
}