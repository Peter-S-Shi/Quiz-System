# H1 (4)(5) -- RUN IN AN *ELEVATED* PowerShell (Product Owner step). Needs the installed spike app.
# 1) pktmon capture of the app run, with a per-process socket sample for attribution;
# 2) the same scenarios with ALL network adapters disabled (re-enabled in `finally`).
# Output: evidence\h1-elevated-*.json  (no usernames/paths are written; review before committing)
param([string]$ResultDir = "work\h1-elevated")
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $PSScriptRoot; Set-Location $here
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw "Run this from an elevated PowerShell." }
$exe = Join-Path $env:LOCALAPPDATA "Quiz Studio Spike\quiz-studio-spike.exe"
$extra = @("--ndjson", "$here\work\ev2500.ndjson", "--envelope", "$here\work\media-envelope.json")
New-Item -ItemType Directory -Force $ResultDir, evidence | Out-Null

# ---- (1) packet capture while the app runs
pktmon stop 2>$null | Out-Null; pktmon reset 2>$null | Out-Null
pktmon filter remove 2>$null | Out-Null
pktmon start --capture --pkt-size 0 --file-name "$ResultDir\capture.etl" | Out-Null
$run1 = & "$here\scripts\run-app.ps1" -Exe $exe -Auto "h1,h2,h4,h7unicode" -Tag _pktmon -ResultDir $ResultDir -TimeoutSec 300 -Extra $extra | ConvertFrom-Json
pktmon stop | Out-Null
pktmon etl2txt "$ResultDir\capture.etl" -o "$ResultDir\capture.txt" | Out-Null
$remote = Select-String -Path "$ResultDir\capture.txt" -Pattern '\d+\.\d+\.\d+\.\d+\.\d+ >' -ErrorAction SilentlyContinue |
  ForEach-Object { if ($_.Line -match '(\d+\.\d+\.\d+\.\d+)\.(\d+) > (\d+\.\d+\.\d+\.\d+)\.(\d+)') { "$($Matches[3]):$($Matches[4])" } } |
  Where-Object { $_ -notmatch '^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)' } | Group-Object | Sort-Object Count -Descending | Select-Object -First 20 Name, Count
[ordered]@{ run = $run1; remoteDestinationsInCapture = $remote } | ConvertTo-Json -Depth 5 | Set-Content evidence\h1-elevated-pktmon.json

# ---- (2) all adapters disabled
$adapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" }
try {
  $adapters | Disable-NetAdapter -Confirm:$false
  Start-Sleep -Seconds 5
  $online = Test-Connection 1.1.1.1 -Count 1 -Quiet -ErrorAction SilentlyContinue
  $run2 = & "$here\scripts\run-app.ps1" -Exe $exe -Auto "h1,h2,h4,h7unicode,h7long" -Tag _offline -ResultDir $ResultDir -TimeoutSec 300 -Extra $extra | ConvertFrom-Json
} finally {
  $adapters | Enable-NetAdapter -Confirm:$false
}
$scen = foreach ($n in "h1", "h2", "h4", "h7unicode", "h7long") { $f = "$ResultDir\${n}_offline.json"; [ordered]@{ scenario = $n; produced = (Test-Path $f); hasError = if (Test-Path $f) { (Get-Content $f -Raw) -match '"error"' } else { $true } } }
[ordered]@{ networkReachableDuringRun = $online; run = $run2; scenarios = $scen } | ConvertTo-Json -Depth 5 | Set-Content evidence\h1-elevated-offline.json
"done -- adapters re-enabled; see evidence\h1-elevated-*.json"
