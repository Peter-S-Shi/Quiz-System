# Launch the (installed or built) app with scripted scenarios; wait for the done marker; sample sockets of the process tree.
param(
  [Parameter(Mandatory)][string]$Exe,
  [Parameter(Mandatory)][string]$Auto,
  [string[]]$Extra = @(),
  [string]$Tag = "",
  [string]$ResultDir = "work\app-results",
  [int]$TimeoutSec = 300,
  [string]$DataRoot = "",
  [string]$WebviewArgs = ""
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $ResultDir | Out-Null
Remove-Item "$ResultDir\done$Tag.json" -ErrorAction SilentlyContinue
if ($DataRoot) { $env:QS_SPIKE_DATA_ROOT = $DataRoot } else { Remove-Item env:QS_SPIKE_DATA_ROOT -ErrorAction SilentlyContinue }
if ($WebviewArgs) { $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $WebviewArgs } else { Remove-Item env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue }
$q = { param($s) if ($s -match "\s") { "`"$s`"" } else { $s } }
$args2 = (@("--auto", $Auto, "--result-dir", (Resolve-Path $ResultDir).Path, "--tag", $(if ($Tag) { $Tag } else { "" })) + $Extra | Where-Object { $_ -ne "" } | ForEach-Object { & $q $_ })
$p = Start-Process $Exe -ArgumentList $args2 -PassThru
$sw = [Diagnostics.Stopwatch]::StartNew()
$listeners = @{}; $remote = @{}; $names = @{}; $samples = 0
function TreePids($root) {
  $all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name
  $set = @{ $root = $true }; $changed = $true
  while ($changed) { $changed = $false; foreach ($a in $all) { if ($set.ContainsKey([int]$a.ParentProcessId) -and -not $set.ContainsKey([int]$a.ProcessId)) { $set[[int]$a.ProcessId] = $true; $changed = $true } } }
  foreach ($a in $all) { if ($set.ContainsKey([int]$a.ProcessId)) { $names[$a.Name] = $true } }
  return $set.Keys
}
while (-not (Test-Path "$ResultDir\done$Tag.json") -and $sw.Elapsed.TotalSeconds -lt $TimeoutSec -and -not $p.HasExited) {
  $pids = TreePids $p.Id; $samples++
  $owner = @{}
  foreach ($cp in (Get-CimInstance Win32_Process | Where-Object { $pids -contains [int]$_.ProcessId })) {
    $ty = if ($cp.CommandLine -match '--type=([a-z\-]+)') { $Matches[1] } else { "browser/main" }
    $nsvc = if ($cp.CommandLine -match 'network\.mojom\.NetworkService') { "+network-service" } else { "" }
    $owner[[int]$cp.ProcessId] = "$($cp.Name):$ty$nsvc"
  }
  foreach ($c in (Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $pids -contains $_.OwningProcess })) {
    $o = $owner[[int]$c.OwningProcess]
    if ($c.State -eq "Listen") { $listeners["tcp-listen $o $($c.LocalAddress):$($c.LocalPort)"] = $true }
    elseif ($c.RemoteAddress -notin @("127.0.0.1", "::1", "0.0.0.0", "::")) { $remote["$o -> $($c.RemoteAddress):$($c.RemotePort) $($c.State)"] = $true }
  }
  foreach ($u in (Get-NetUDPEndpoint -ErrorAction SilentlyContinue | Where-Object { $pids -contains $_.OwningProcess })) { $listeners["udp $($owner[[int]$u.OwningProcess]) $($u.LocalAddress)"] = $true }
  Start-Sleep -Milliseconds 100
}
$finished = Test-Path "$ResultDir\done$Tag.json"
Start-Sleep -Milliseconds 500
foreach ($id in (TreePids $p.Id)) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
$summary = [ordered]@{ finished = $finished; seconds = [math]::Round($sw.Elapsed.TotalSeconds, 1); socketSamples = $samples; tcpOrUdpListeners = @($listeners.Keys); nonLoopbackRemotes = @($remote.Keys); processNamesInTree = @($names.Keys | Sort-Object) }
$summary | ConvertTo-Json | Set-Content "$ResultDir\sockets$Tag.json"
$summary | ConvertTo-Json
