# Packaged-app acceptance for the EXACT candidate installer (ADR 0001 H1/H6 method, extended for the RC).
#
#   package-test.ps1 -Installer <exact candidate setup.exe> -ExpectedVersion <x.y.z-rc.n> -Report <report.json>
#                    [-UpgradeSource <pre-candidate setup.exe>] [-IconFile <icon.ico>] [-DataJourneys] [-RealData]
#
# Phase A (clean install of the exact candidate): per-user silent install, identity (the installed exe reports the
#   expected version; installer metadata agrees), the final icon is embedded in the exe, uninstall entry and Start-menu
#   shortcut, installed-exe smoke (launch, single instance, network posture, crash recovery), first launch creates the
#   data folder, silent uninstall removes the program but KEEPS user data (A3: delete-data is an interactive checkbox).
# Phase B (only with -UpgradeSource): a PRE-candidate V2 build is installed and launched on a seeded synthetic data root;
#   the exact candidate is installed over it; the data root survives and the app is healthy. With -DataJourneys the
#   representative backup / restore / V1-migration journeys then run against that upgraded data root
#   (desktop/scripts/rc-data-journeys.mjs: exact-head Rust crates, not the GUI path).
#
# Without -RealData phase A runs against an isolated LOCALAPPDATA (safe on a developer machine). With -RealData (CI, clean
# runner) phase A uses the real %LOCALAPPDATA%. Phase B always uses an isolated folder.
param(
  [Parameter(Mandatory)][string]$Installer,
  [Parameter(Mandatory)][string]$ExpectedVersion,
  [Parameter(Mandatory)][string]$Report,
  [string]$UpgradeSource = "",
  [string]$IconFile = "",
  [switch]$DataJourneys,
  [switch]$RealData,
  [string]$Work = (Join-Path ([IO.Path]::GetTempPath()) ("qs-pkg-" + [guid]::NewGuid().ToString("N").Substring(0, 8)))
)
$ErrorActionPreference = "Stop"
$Installer = (Resolve-Path $Installer).Path
if ($UpgradeSource) { $UpgradeSource = (Resolve-Path $UpgradeSource).Path }
if ($IconFile) { $IconFile = (Resolve-Path $IconFile).Path }
$identifier = "io.github.peter-s-shi.quiz-studio"
$checks = [ordered]@{}
function Check($name, [bool]$ok, $detail = "") { $script:checks[$name] = @{ ok = $ok; detail = "$detail" }; Write-Host ($(if ($ok) { "ok:   " } else { "FAIL: " }) + "$name $detail") }
New-Item -ItemType Directory -Force $Work | Out-Null
$installDir = Join-Path $Work "install"
$realLocal = $env:LOCALAPPDATA
$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Quiz Studio"
$hklmKey = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Quiz Studio"
$desktopDir = Split-Path -Parent $PSScriptRoot

function Install($setup, $label) {
  $p = Start-Process $setup -ArgumentList "/S", "/D=$installDir" -PassThru -Wait
  Check "$label.exit_code" ($p.ExitCode -eq 0) ("exit " + $p.ExitCode)
  Check "$label.exe_present" (Test-Path (Join-Path $installDir "quiz-studio.exe")) $installDir
}
function Installed-Version() {
  $j = & (Join-Path $installDir "quiz-studio.exe") --identity | ConvertFrom-Json
  return $j
}
function Launch-Report([string]$localAppData) {
  $env:LOCALAPPDATA = $localAppData
  $boot = Join-Path $localAppData "$identifier\logs\boot-status.json"
  Remove-Item $boot -Force -ErrorAction SilentlyContinue
  $p = Start-Process (Join-Path $installDir "quiz-studio.exe") -PassThru
  $deadline = (Get-Date).AddSeconds(60); $b = $null
  while ((Get-Date) -lt $deadline -and -not $b) { if (Test-Path $boot) { try { $b = Get-Content $boot -Raw | ConvertFrom-Json } catch {} }; Start-Sleep -Milliseconds 400 }
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  $p.WaitForExit(15000) | Out-Null
  $env:LOCALAPPDATA = $realLocal
  return $b
}
function Silent-Uninstall([string]$label, [string]$dataDir) {
  $exe = Join-Path $installDir "quiz-studio.exe"
  $un = Join-Path $installDir "uninstall.exe"
  Check "$label.present" (Test-Path $un) ""
  $up = Start-Process $un -ArgumentList "/S" -PassThru -Wait
  Start-Sleep -Seconds 3
  Check "$label.exit_code" ($up.ExitCode -eq 0) ("exit " + $up.ExitCode)
  Check "$label.program_removed" (-not (Test-Path $exe)) ""
  Check "$label.registry_removed" (-not (Test-Path $uninstallKey)) ""
  Check "$label.user_data_kept" (Test-Path (Join-Path $dataDir "data\quiz-studio.db")) $dataDir
}
# the largest PNG-compressed entry of the final .ico must appear verbatim in the executable's icon resources
function Icon-Embedded([string]$ico, [string]$exe) {
  $ib = [IO.File]::ReadAllBytes($ico); $n = [BitConverter]::ToUInt16($ib, 4); $best = $null
  for ($i = 0; $i -lt $n; $i++) { $o = 6 + 16 * $i; $sz = [BitConverter]::ToUInt32($ib, $o + 8); $off = [BitConverter]::ToUInt32($ib, $o + 12); if (-not $best -or $sz -gt $best.sz) { $best = @{ sz = $sz; off = $off } } }
  $entry = New-Object byte[] $best.sz; [Array]::Copy($ib, $best.off, $entry, 0, $best.sz)
  $latin = [Text.Encoding]::GetEncoding(28591)
  return $latin.GetString([IO.File]::ReadAllBytes($exe)).IndexOf($latin.GetString($entry), [StringComparison]::Ordinal) -ge 0
}

try {
  # ================= Phase A: clean install of the exact candidate =================
  Install $Installer "install"
  Check "install.per_user_registry" (Test-Path $uninstallKey) $uninstallKey
  Check "install.no_machine_wide_registry" (-not (Test-Path $hklmKey)) ""
  $exe = Join-Path $installDir "quiz-studio.exe"

  # identity: installed exe, file metadata and the uninstall entry all agree with the candidate version
  $id = Installed-Version
  Check "identity.exe_reports_version" ($id.version -eq $ExpectedVersion) ("exe reports " + $id.version + ", expected $ExpectedVersion")
  Check "identity.identifier" ($id.identifier -eq $identifier) $id.identifier
  # the Tauri bundler stamps the bundle type into the shipped exe, so it is not byte-identical to target/release/quiz-studio.exe: record the SHIPPED exe's hash
  Check "identity.installed_exe_sha256_recorded" $true ((Get-FileHash $exe -Algorithm SHA256).Hash)
  $fv = (Get-Item $exe).VersionInfo
  Check "identity.file_product_version" ($fv.ProductVersion -eq $ExpectedVersion) ("ProductVersion " + $fv.ProductVersion)
  $ue = Get-ItemProperty $uninstallKey -ErrorAction SilentlyContinue
  Check "identity.uninstall_entry_version" ($null -ne $ue -and $ue.DisplayVersion -eq $ExpectedVersion) ("DisplayVersion " + $ue.DisplayVersion)

  # icon: in the executable, in the uninstall entry, on the Start-menu shortcut
  if ($IconFile) { Check "icon.final_icon_embedded_in_exe" (Icon-Embedded $IconFile $exe) $IconFile }
  $di = if ($ue -and $ue.DisplayIcon) { ($ue.DisplayIcon -replace '^"|"$|,\d+$', '') } else { "" }
  Check "icon.uninstall_entry_has_icon" ($di -ne "" -and (Test-Path $di)) $di
  $lnk = Get-ChildItem (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs") -Recurse -Filter "*.lnk" -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "Quiz Studio*" } | Select-Object -First 1
  if ($lnk) {
    $sh = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk.FullName)
    Check "icon.start_menu_shortcut" ($sh.TargetPath -eq $exe) ("target ok; icon " + ($sh.IconLocation -replace [regex]::Escape($Work), "<work>"))
  } else { Check "icon.start_menu_shortcut" $false "no Quiz Studio shortcut under the user's Start menu" }

  # installed-exe smoke (launch, single instance, network posture, crash recovery)
  $smokeReport = Join-Path $Work "smoke.json"
  & (Join-Path $PSScriptRoot "smoke.ps1") -Exe $exe -Report $smokeReport -Work (Join-Path $Work "smoke") | Out-Host
  $smoke = Get-Content $smokeReport -Raw | ConvertFrom-Json
  Check "installed.smoke" ($smoke.ok -eq $true) ""

  # data location: where does the real app write when not isolated?
  $dataLocal = if ($RealData) { $realLocal } else { Join-Path $Work "userdata" }
  New-Item -ItemType Directory -Force $dataLocal | Out-Null
  $b = Launch-Report $dataLocal
  Check "data.first_launch" ($null -ne $b -and $b.info.launchCount -eq 1) ""
  $dataDir = Join-Path $dataLocal $identifier
  Check "data.created_under_localappdata" (Test-Path (Join-Path $dataDir "data\quiz-studio.db")) $dataDir
  Silent-Uninstall "uninstall" $dataDir

  # ================= Phase B: upgrade from a pre-candidate build =================
  if ($UpgradeSource) {
    $dataB = Join-Path $Work "upgrade-data"
    New-Item -ItemType Directory -Force $dataB | Out-Null
    $rootB = Join-Path $dataB $identifier
    $snapshot = Join-Path $Work "pre-upgrade-snapshot.json"
    if ($DataJourneys) {
      & node (Join-Path $desktopDir "ui\selftest\seed-data-root.mjs") $dataB | Out-Host
      Check "upgrade.seeded_synthetic_data" ($LASTEXITCODE -eq 0) ""
      & node (Join-Path $PSScriptRoot "rc-data-journeys.mjs") snapshot $rootB $snapshot | Out-Host
      Check "upgrade.snapshot_taken" ($LASTEXITCODE -eq 0) ""
    }
    Install $UpgradeSource "upgrade_source"
    $srcId = Installed-Version
    Check "upgrade_source.is_an_older_build" ($srcId.version -ne $ExpectedVersion) ("pre-candidate build reports " + $srcId.version)
    $b0 = Launch-Report $dataB
    Check "upgrade_source.healthy" ($null -ne $b0 -and $b0.info.healthy -eq $true) ""
    $count0 = if ($b0) { [int]$b0.info.launchCount } else { -1 }
    Install $Installer "upgrade"
    $upId = Installed-Version
    Check "upgrade.exe_reports_candidate_version" ($upId.version -eq $ExpectedVersion) ("exe reports " + $upId.version)
    $ue2 = Get-ItemProperty $uninstallKey -ErrorAction SilentlyContinue
    Check "upgrade.uninstall_entry_version" ($null -ne $ue2 -and $ue2.DisplayVersion -eq $ExpectedVersion) ("DisplayVersion " + $ue2.DisplayVersion)
    $b2 = Launch-Report $dataB
    Check "upgrade.data_preserved" ($null -ne $b2 -and $count0 -ge 1 -and $b2.info.launchCount -eq ($count0 + 1)) ("launchCount $count0 -> " + $b2.info.launchCount)
    Check "upgrade.healthy" ($null -ne $b2 -and $b2.info.healthy -eq $true) ""
    if ($DataJourneys) {
      $jr = Join-Path $Work "data-journeys.json"
      & node (Join-Path $PSScriptRoot "rc-data-journeys.mjs") journeys $rootB $snapshot $jr | Out-Host
      Check "journeys.all_passed" ($LASTEXITCODE -eq 0) "backup / restore / V1 migration / blocked source on the upgraded RC data root"
      if (Test-Path $jr) { Copy-Item $jr (Join-Path (Split-Path -Parent $Report) "data-journeys.json") -Force }
    }
    Silent-Uninstall "upgrade_uninstall" $rootB
  }
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
@{ ok = [bool]$ok; expectedVersion = $ExpectedVersion; realData = [bool]$RealData; checks = $checks } | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 $Report
if (-not $ok) { exit 1 }
