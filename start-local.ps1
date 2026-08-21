# Quiz Studio Local Development Launcher
param(
    [switch]$NoBrowser,
    [switch]$VerifyAndExit
)

$ErrorActionPreference = "Stop"

$repoDir = $PSScriptRoot
Set-Location -Path $repoDir

Write-Host "Starting Quiz Studio local development server... / 正在启动 Quiz Studio 本地开发服务器……" -ForegroundColor Cyan
Write-Host "Repository directory / 仓库目录: $repoDir" -ForegroundColor Gray

# Detect Node.js, which is also used by the repository validation commands.
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "Error: Node.js was not found on PATH. / 错误：PATH 中未找到 Node.js。" -ForegroundColor Red
    Write-Host "Install Node.js or add it to PATH to use start-local.ps1. / 请安装 Node.js 或将其加入 PATH。" -ForegroundColor Yellow
    exit 1
}

# Check if port 8000 is occupied
$port = 8000
$portOccupied = $false
try {
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    $asyncResult = $tcpClient.BeginConnect("127.0.0.1", $port, $null, $null)
    $portOccupied = $asyncResult.AsyncWaitHandle.WaitOne(400, $false)
    if ($portOccupied) {
        $tcpClient.EndConnect($asyncResult)
    }
    $tcpClient.Close()
} catch {
    $portOccupied = $false
}

if ($portOccupied) {
    Write-Host "Error: Port $port is already in use. / 错误：端口 $port 已被占用。" -ForegroundColor Red
    Write-Host "Stop that process before running start-local.ps1. / 请先停止占用该端口的进程。" -ForegroundColor Yellow
    exit 1
}

$url = "http://localhost:$port"

# Run the server in the foreground so Ctrl+C or closing this window stops it.
$serverScript = Join-Path $repoDir "scripts\local-server.mjs"
$serverArgs = @($serverScript, "$port", "--parent-pid", "$PID")
if (-not $NoBrowser) {
    $serverArgs += "--open"
}
if ($VerifyAndExit) {
    $serverArgs += "--verify-and-exit"
}
& $nodeCmd.Source @serverArgs
exit $LASTEXITCODE
