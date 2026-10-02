# H6: same-identifier installer upgrade, failing migration, downgrade refusal. Needs work\installers\ from build-variants.ps1.
$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $PSScriptRoot; Set-Location $here
$inst = "$here\work\installers"
$id = "io.github.peter-s-shi.quiz-studio"
$dataRoot = Join-Path $env:LOCALAPPDATA $id
$exe = Join-Path $env:LOCALAPPDATA "Quiz Studio Spike\quiz-studio-spike.exe"
$res = [ordered]@{}
function Install($name) { $p = Start-Process "$inst\$name" -ArgumentList "/S" -PassThru -Wait; return $p.ExitCode }
function ExeVer() { (Get-Item $exe).VersionInfo.ProductVersion }
function Sum() { python "$here\scripts\dbsum.py" $dataRoot | ConvertFrom-Json }
function RunApp($tag) {
  $r = & "$here\scripts\run-app.ps1" -Exe $exe -Auto "h1" -Tag $tag -ResultDir work\h6 -TimeoutSec 60 | ConvertFrom-Json
  $j = Get-Content "work\h6\h1$tag.json" -Raw | ConvertFrom-Json
  return [ordered]@{ finished = $r.finished; appVersion = (ExeVer); storeSchemaVersion = $j.info.storeSchemaVersion; notice = $j.info.notice; startupError = $j.info.startupError; identifier = $j.info.identifier }
}
Get-Process quiz-studio-spike -ErrorAction SilentlyContinue | Stop-Process -Force

# ---- A: upgrade preserves data; migration adds column + backfills
& "$here\scripts\clean-appdata.ps1" -All | Out-Null
$res.A_install_v1 = Install "qs_0.1.0_schema1.exe"
$null = & "$here\scripts\run-app.ps1" -Exe $exe -Auto "h2" -Tag _seed -ResultDir work\h6 -TimeoutSec 200 -Extra @("--ndjson", "$here\work\ev2500.ndjson")
$res.A_before = Sum
$res.A_before_appVersion = ExeVer
$res.A_install_v2 = Install "qs_0.2.0_schema2.exe"
$res.A_afterInstall_dbFileUntouchedByInstaller = ((Sum).payloadSha256 -eq $res.A_before.payloadSha256)
$res.A_firstLaunch_v2 = RunApp "_a2"
$res.A_after = Sum
$res.A_payloadHashEqual = ($res.A_after.payloadSha256 -eq $res.A_before.payloadSha256)
$res.A_recordsEqual = ($res.A_after.records -eq $res.A_before.records)
$res.A_dataDirSamePath = (Test-Path (Join-Path $dataRoot "data\quiz-studio.db"))
$res.A_snapshotCreated = (Test-Path (Join-Path $dataRoot "snapshots\pre-upgrade-v1.db"))

# ---- C: downgrade (v1 build over a schema-2 DB) must be refused with no write
$before = Sum
$dbp = Join-Path $dataRoot "data\quiz-studio.db"
$sha0 = (Get-FileHash $dbp -Algorithm SHA256).Hash
$mt0 = (Get-Item $dbp).LastWriteTimeUtc.Ticks
$res.C_install_v1_over_v2 = Install "qs_0.1.0_schema1.exe"
$res.C_launch_v1 = RunApp "_c1"
$res.C_dbSha256Unchanged = ((Get-FileHash $dbp -Algorithm SHA256).Hash -eq $sha0)
$res.C_dbMtimeUnchanged = ((Get-Item $dbp).LastWriteTimeUtc.Ticks -eq $mt0)
$res.C_walFilesCreated = ((Test-Path "$dbp-wal") -or (Test-Path "$dbp-shm"))
$res.C_userVersionStill = (Sum).userVersion

# ---- B: failing migration auto-restores
& "$here\scripts\clean-appdata.ps1" -All | Out-Null
$res.B_install_v1 = Install "qs_0.1.0_schema1.exe"
$null = & "$here\scripts\run-app.ps1" -Exe $exe -Auto "h2" -Tag _seedb -ResultDir work\h6 -TimeoutSec 200 -Extra @("--ndjson", "$here\work\ev2500.ndjson")
$res.B_before = Sum
$res.B_install_failmig = Install "qs_0.3.0_failmig.exe"
$res.B_launch_failmig = RunApp "_b3"
$res.B_after = Sum
$res.B_payloadHashEqual = ($res.B_after.payloadSha256 -eq $res.B_before.payloadSha256)
$res.B_userVersionStillOld = ($res.B_after.userVersion -eq $res.B_before.userVersion)
$res.B_noPartialBackfill = (-not $res.B_after.hasSummaryLenColumn)
$res.B_quickCheck = $res.B_after.quickCheck

New-Item -ItemType Directory -Force evidence | Out-Null
$res | ConvertTo-Json -Depth 6 | Set-Content evidence\h6-upgrade.json
$res | ConvertTo-Json -Depth 6
