# Launch smoke for the shipped executable (ADR 0001 H1 method, packaged-app half). Everything runs against an
# isolated LOCALAPPDATA so no real user data is touched; exits non-zero on the first failed check and writes
# a JSON report. Usage: smoke.ps1 -Exe <path to quiz-studio.exe> -Report <report.json>
param(
  [Parameter(Mandatory)][string]$Exe,
  [Parameter(Mandatory)][string]$Report,
  [string]$Work = (Join-Path ([IO.Path]::GetTempPath()) ("qs-smoke-" + [guid]::NewGuid().ToString("N").Substring(0, 8)))
)
$ErrorActionPreference = "Stop"
$identifier = "io.github.peter-s-shi.quiz-studio"
$checks = [ordered]@{}
function Check($name, [bool]$ok, $detail = "") { $script:checks[$name] = @{ ok = $ok; detail = "$detail" }; if (-not $ok) { Write-Host "FAIL: $name $detail" } else { Write-Host "ok:   $name $detail" } }

New-Item -ItemType Directory -Force $Work | Out-Null
$realLocal = $env:LOCALAPPDATA
$env:LOCALAPPDATA = $Work
$root = Join-Path $Work $identifier
$boot = Join-Path $root "logs\boot-status.json"

function WaitBoot([int]$sec = 60) {
  $deadline = (Get-Date).AddSeconds($sec)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $boot) { try { return Get-Content $boot -Raw | ConvertFrom-Json } catch {} }
    Start-Sleep -Milliseconds 400
  }
  return $null
}

try {
  # --identity (no GUI) reports the permanent identifier
  $id = & $Exe --identity | ConvertFrom-Json
  Check "identity.identifier" ($id.identifier -eq $identifier) $id.identifier

  # headless self-test (isolated temp root, same Store Port)
  $selfOut = Join-Path $Work "selftest.json"
  $sp = Start-Process $Exe -ArgumentList "--self-test", "`"$selfOut`"" -Wait -PassThru -WindowStyle Hidden   # GUI-subsystem exe: must be waited on explicitly
  Check "selftest.exit_code" ($sp.ExitCode -eq 0) ("exit " + $sp.ExitCode)
  $st = Get-Content $selfOut -Raw | ConvertFrom-Json
  Check "selftest" ($st.ok -eq $true) ("steps=" + $st.steps.Count)

  # 1. first launch
  $p1 = Start-Process $Exe -PassThru
  $b1 = WaitBoot
  Check "launch.ui_loaded" ($null -ne $b1 -and $b1.uiLoaded -eq $true) ""
  Check "launch.healthy" ($null -ne $b1 -and $b1.info.healthy -eq $true) ""
  Check "launch.first_count" ($null -ne $b1 -and $b1.info.launchCount -eq 1) ""
  # the pinned typing-compare/1 semantics, executed INSIDE the real WebView (Focused Practice milestone): literal expectations, host-independent
  Check "webview.pinned_comparison" ($null -ne $b1 -and $b1.info.selfCheck.ok -eq $true) ("cases=" + $b1.info.selfCheck.cases + " failed=" + ($b1.info.selfCheck.failed -join ","))
  Check "webview.engine_reported" ($null -ne $b1 -and "$($b1.info.selfCheck.host.userAgent)" -match "Edg/") ("" + $b1.info.selfCheck.host.userAgent)
  Check "data.db_in_localappdata" (Test-Path (Join-Path $root "data\quiz-studio.db")) $root

  # 2. single instance: a second launch must exit quickly and leave the first running
  $p2 = Start-Process $Exe -PassThru
  $exited = $p2.WaitForExit(15000)
  Check "single_instance.second_exits" $exited ""
  Check "single_instance.first_alive" (-not $p1.HasExited) ""

  # 3. network posture (per process, ADR 0001 A1): no listener, no non-loopback connection from the app process
  $pid1 = $p1.Id
  $tcp = @(Get-NetTCPConnection -OwningProcess $pid1 -ErrorAction SilentlyContinue)
  $listen = @($tcp | Where-Object { $_.State -eq "Listen" })
  $remote = @($tcp | Where-Object { $_.RemoteAddress -notin @("127.0.0.1", "::1", "0.0.0.0", "::") -and $_.State -ne "Listen" })
  Check "net.no_listener" ($listen.Count -eq 0) ("listeners=" + $listen.Count)
  Check "net.no_remote_connection" ($remote.Count -eq 0) ("remote=" + $remote.Count)
  $kids = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$pid1" | Select-Object -ExpandProperty Name)
  Check "process.no_python_or_node" (-not ($kids -match "python|node")) ($kids -join ",")

  # 4. abnormal exit: force-kill, relaunch, state survives (launch count is stored in the Rust-owned database)
  Stop-Process -Id $pid1 -Force
  Start-Sleep -Seconds 2
  Remove-Item $boot -Force
  $p3 = Start-Process $Exe -PassThru
  $b3 = WaitBoot
  Check "crash_recovery.relaunch_healthy" ($null -ne $b3 -and $b3.info.healthy -eq $true) ""
  Check "crash_recovery.state_survived" ($null -ne $b3 -and $b3.info.launchCount -eq 2) ("launchCount=" + $b3.info.launchCount)
  Stop-Process -Id $p3.Id -Force
} catch {
  Check "smoke.exception" $false $_.Exception.Message
} finally {
  Get-Process -Name "quiz-studio" -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq (Resolve-Path $Exe).Path } | Stop-Process -Force -ErrorAction SilentlyContinue
  $env:LOCALAPPDATA = $realLocal
}
$ok = -not ($checks.Values | Where-Object { -not $_.ok })
@{ ok = [bool]$ok; checks = $checks } | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 $Report
if (-not $ok) { exit 1 }
