# Quiz Studio Local Development Launcher
$ErrorActionPreference = "Stop"

$repoDir = $PSScriptRoot
Set-Location -Path $repoDir

Write-Host "Starting Quiz Studio local development server..." -ForegroundColor Cyan
Write-Host "Repository directory: $repoDir" -ForegroundColor Gray

# Detect Python
$pythonCmd = $null
if (Get-Command py -ErrorAction SilentlyContinue) {
    $pythonCmd = "py"
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
}

if (-not $pythonCmd) {
    Write-Host "Error: Python was not found on PATH." -ForegroundColor Red
    Write-Host "Please install Python or add it to PATH to use start-local.ps1." -ForegroundColor Yellow
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

# Start Python HTTP server bound to 127.0.0.1 on port 8000
$serverProcess = Start-Process -FilePath $pythonCmd -ArgumentList "-m", "http.server", "$port", "--bind", "127.0.0.1" -WorkingDirectory $repoDir -WindowStyle Hidden -PassThru

Start-Sleep -Milliseconds 800

# Open browser to canonical origin
Start-Process $url

Write-Host "Quiz Studio is running at $url" -ForegroundColor Green
Write-Host "Local development mode: Service Worker caching is disabled on localhost." -ForegroundColor Gray
Write-Host "Press Ctrl+C or close this window to stop the server." -ForegroundColor Gray

try {
    $serverProcess.WaitForExit()
} finally {
    if (-not $serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
    }
}
