# Packaged-app acceptance (ADR 0001 H1/H6 method): silent per-user install, launch smoke on the INSTALLED
# executable, optional same-identifier upgrade, silent uninstall that keeps user data by default (A3).
#
#   package-test.ps1 -Installer <setup.exe> -Report <report.json> [-UpgradeInstaller <newer setup.exe>] [-RealData]
#
# Without -RealData the app runs against an isolated LOCALAPPDATA (safe on a developer machine). With
# -RealData (CI, clean runner) the app uses the real %LOCALAPPDATA%, which lets us prove the data directory
# survives uninstall and upgrade.
param(
  [Parameter(Mandatory)][string]$Installer,
  [Parameter(Mandatory)][string]$Report,
  [string]$UpgradeInstaller = "",
  [switch]$RealData,
  [string]$Work = (Join-Path ([IO.Path]::GetTempPath()) ("qs-pkg-" + [guid]::NewGuid().ToString("N").Substring(0, 8)))
)
$ErrorActionPreference = "Stop"
$identifier = "io.github.peter-s-shi.quiz-studio"
$checks = [ordered]@{}
function Check($name, [bool]$ok, $detail = "") { $script:checks[$name] = @{ ok = $ok; detail = "$detail" }; Write-Host ($(if ($ok) { "ok:   " } else { "FAIL: " }) + "$name $detail") }
New-Item -ItemType Directory -Force $Work | Out-Null
$installDir = Join-Path $Work "install"
$realLocal = $env:LOCALAPPDATA
$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Quiz Studio"
$hklmKey = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Quiz Studio"

function Install($setup, $label) {
  $p = Start-Process $setup -ArgumentList "/S", "/D=$installDir" -PassThru -Wait
  Check "$label.exit_code" ($p.ExitCode -eq 0) ("exit " + $p.ExitCode)
  Check "$label.exe_present" (Test-Path (Join-Path $installDir "quiz-studio.exe")) $installDir
}
function Launch-Report([string]$localAppData, [int]$expectCount) {
  $env:LOCALAPPDATA = $localAppData
  $boot = Join-Path $localAppData "$identifier\logs\boot-status.json"
  Remove-Item $boot -Force -ErrorAction SilentlyContinue
  $p = Start-Process (Join-Path $installDir "quiz-studio.exe") -PassThru
  $deadline = (Get-Date).AddSeconds(60); $b = $null
  while ((Get-Date) -lt $deadline -and -not $b) { if (Test-Path $boot) { try { $b = Get-Content $boot -Raw | ConvertFrom-Json } catch {} }; Start-Sleep -Milliseconds 400 }
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  $env:LOCALAPPDATA = $realLocal
  return $b
}

try {
  # 1. install (per-user, silent, no elevation)
  Install $Installer "install"
  Check "install.per_user_registry" (Test-Path $uninstallKey) $uninstallKey
  Check "install.no_machine_wide_registry" (-not (Test-Path $hklmKey)) ""
  $exe = Join-Path $installDir "quiz-studio.exe"

  # 2. installed-exe smoke (identity, self-test, launch, single instance, network posture, crash recovery)
  $smokeReport = Join-Path $Work "smoke.json"
  $smokeArgs = @{ Exe = $exe; Report = $smokeReport; Work = (Join-Path $Work "smoke") }
  & (Join-Path $PSScriptRoot "smoke.ps1") @smokeArgs | Out-Host
  $smoke = Get-Content $smokeReport -Raw | ConvertFrom-Json
  Check "installed.smoke" ($smoke.ok -eq $true) ""

  # 3. data location: where does the real app write when not isolated?
  $dataLocal = if ($RealData) { $realLocal } else { Join-Path $Work "userdata" }
  New-Item -ItemType Directory -Force $dataLocal | Out-Null
  $b = Launch-Report $dataLocal 1
  Check "data.first_launch" ($null -ne $b -and $b.info.launchCount -eq 1) ""
  $dataDir = Join-Path $dataLocal $identifier
  Check "data.created_under_localappdata" (Test-Path (Join-Path $dataDir "data\quiz-studio.db")) $dataDir

  # 4. upgrade over the same identifier preserves data
  if ($UpgradeInstaller) {
    Install $UpgradeInstaller "upgrade"
    $b2 = Launch-Report $dataLocal 2
    Check "upgrade.data_preserved" ($null -ne $b2 -and $b2.info.launchCount -eq 2) ("launchCount=" + $b2.info.launchCount)
    Check "upgrade.healthy" ($null -ne $b2 -and $b2.info.healthy -eq $true) ""
  }

  # 5. silent uninstall removes the program but KEEPS user data (A3: delete-data is an interactive checkbox only)
  $un = Join-Path $installDir "uninstall.exe"
  Check "uninstall.present" (Test-Path $un) ""
  $up = Start-Process $un -ArgumentList "/S" -PassThru -Wait
  Start-Sleep -Seconds 3
  Check "uninstall.exit_code" ($up.ExitCode -eq 0) ("exit " + $up.ExitCode)
  Check "uninstall.program_removed" (-not (Test-Path $exe)) ""
  Check "uninstall.registry_removed" (-not (Test-Path $uninstallKey)) ""
  Check "uninstall.user_data_kept" (Test-Path (Join-Path $dataDir "data\quiz-studio.db")) $dataDir
} catch {
  Check "package.exception" $false $_.Exception.Message
} finally {
  $env:LOCALAPPDATA = $realLocal
  Get-Process -Name "quiz-studio" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  # best-effort cleanup if uninstall did not run
  $un = Join-Path $installDir "uninstall.exe"
  if (Test-Path $un) { Start-Process $un -ArgumentList "/S" -Wait -ErrorAction SilentlyContinue }
}
$ok = -not ($checks.Values | Where-Object { -not $_.ok })
@{ ok = [bool]$ok; realData = [bool]$RealData; checks = $checks } | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 $Report
if (-not $ok) { exit 1 }
