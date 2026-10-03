# Builds the CURRENT working-tree code (incremental; near-instant when nothing changed) and opens Quiz Studio.
# Usage: open-latest.ps1 [-Scratch]   -Scratch uses a throwaway data folder instead of your real app data.
param([switch]$Scratch)
$ErrorActionPreference = "Stop"
$desktop = Join-Path (Split-Path -Parent $PSScriptRoot) "desktop"
Set-Location $desktop
. (Join-Path $desktop "scripts\env.ps1")

Write-Host "Building latest code (first build can take several minutes)..."
cargo build -p qs-desktop --features custom-protocol --release
if ($LASTEXITCODE -ne 0) { throw "Build failed (exit $LASTEXITCODE)" }

$exe = Join-Path $desktop "target\release\quiz-studio.exe"
if (-not (Test-Path $exe)) { throw "quiz-studio.exe not found after build" }

if ($Scratch) {
  $env:LOCALAPPDATA = Join-Path $env:TEMP "quiz-studio-scratch"
  New-Item -ItemType Directory -Force $env:LOCALAPPDATA | Out-Null
  Write-Host "Scratch data folder: $env:LOCALAPPDATA"
}
Write-Host "Opening Quiz Studio..."
Start-Process -FilePath $exe
