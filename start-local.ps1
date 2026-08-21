# Quiz Studio Local Development Launcher
param(
    [switch]$NoBrowser,
    [switch]$VerifyAndExit
)

$ErrorActionPreference = "Stop"

$repoDir = $PSScriptRoot
Set-Location -Path $repoDir

Write-Host "Starting Quiz Studio local development server..." -ForegroundColor Cyan
Write-Host "Repository directory: $repoDir" -ForegroundColor Gray

# Detect Node.js, which is also used by the repository validation commands.
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "Error: Node.js was not found on PATH." -ForegroundColor Red
    Write-Host "Install Node.js or add it to PATH to use start-local.ps1." -ForegroundColor Yellow
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
    Write-Host "Error: Port $port is already in use by another process." -ForegroundColor Red
    Write-Host "Please stop the process on port $port before running start-local.ps1." -ForegroundColor Yellow
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
