# H8: native Save/Open dialogs driven through UI Automation (no foreground needed), across path hazards.
# Cases: plain work dir, OneDrive-redirected Desktop (if redirected), Documents, CJK folder. 16 MiB synthetic files, deleted afterwards.
param([string]$Exe = (Join-Path $env:LOCALAPPDATA "Quiz Studio Spike\quiz-studio-spike.exe"), [string]$ResultDir = "work\h8")
$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $PSScriptRoot; Set-Location $here
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
New-Item -ItemType Directory -Force $ResultDir | Out-Null
$desktop = [Environment]::GetFolderPath("Desktop"); $docs = [Environment]::GetFolderPath("MyDocuments")
$cjk = Join-Path $here "work\h8-cases\$([char]0x6D4B)$([char]0x8BD5)-$([char]0x30D5)$([char]0x30A9)$([char]0x30EB)$([char]0x30C0)"
$cases = @(
  @{ name = "plain"; dir = Join-Path $here "work\h8-cases\plain" },
  @{ name = "desktop"; dir = $desktop },
  @{ name = "documents"; dir = $docs },
  @{ name = "cjk"; dir = $cjk }
)
foreach ($c in $cases) { New-Item -ItemType Directory -Force $c.dir | Out-Null; $c.file = Join-Path $c.dir "spike-h8-$($c.name).bin" }
$meta = foreach ($c in $cases) { [ordered]@{ case = $c.name; underOneDrive = ($c.dir -match "OneDrive"); isCjk = ($c.dir -match "[^\x00-\x7F]") } }

Remove-Item "$ResultDir\done_h8.json" -ErrorAction SilentlyContinue
$q = '"' + (Resolve-Path $ResultDir).Path + '"'
$p = Start-Process $Exe -ArgumentList @("--auto", "h8dialogs", "--h8-count", $cases.Count, "--big-mib", 16, "--result-dir", $q, "--tag", "_h8") -PassThru
Add-Type @'
using System; using System.Text; using System.Runtime.InteropServices;
public class EW2 { public delegate bool CB(IntPtr h, IntPtr l); [DllImport("user32.dll")] static extern bool EnumWindows(CB cb, IntPtr l); [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p); [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
 public static IntPtr Find(uint pid, string title){ IntPtr found=IntPtr.Zero; EnumWindows((h,l)=>{ uint p; GetWindowThreadProcessId(h,out p); if(p==pid){ var t=new StringBuilder(256); GetWindowText(h,t,256); if(t.ToString().StartsWith(title)){ found=h; return false; } } return true; }, IntPtr.Zero); return found; } }
'@
function FindDialog($title) {
  for ($i = 0; $i -lt 120; $i++) {
    $h = [EW2]::Find($p.Id, $title)
    if ($h -ne [IntPtr]::Zero) { return [Windows.Automation.AutomationElement]::FromHandle($h) }
    Start-Sleep -Milliseconds 250
  }
  return $null
}
function Drive($title, $path) {
  $w = FindDialog $title
  if (-not $w) { return "dialog '$title' not found" }
  Start-Sleep -Milliseconds 700
  $edit = $w.FindAll([Windows.Automation.TreeScope]::Descendants, (New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::AutomationIdProperty, "1001"))) | Select-Object -First 1
  if (-not $edit) { return "file name edit not found" }
  $vp = $edit.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern); $vp.SetValue($path)
  Start-Sleep -Milliseconds 300
  $btn = $w.FindAll([Windows.Automation.TreeScope]::Descendants, (New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::AutomationIdProperty, "1"))) | Select-Object -First 1
  if (-not $btn) { return "default button not found" }
  $btn.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()
  return "ok"
}
$log = @()
foreach ($i in 0..($cases.Count - 1)) {
  $log += "save $($cases[$i].name): " + (Drive "spike save $i" $cases[$i].file)
  $log += "open $($cases[$i].name): " + (Drive "spike open $i" $cases[$i].file)
}
$sw = [Diagnostics.Stopwatch]::StartNew()
while (-not (Test-Path "$ResultDir\done_h8.json") -and $sw.Elapsed.TotalSeconds -lt 90) { Start-Sleep -Milliseconds 500 }
$res = if (Test-Path "$ResultDir\h8dialogs_h8.json") { Get-Content "$ResultDir\h8dialogs_h8.json" -Raw | ConvertFrom-Json } else { $null }
if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
$present = foreach ($c in $cases) { [ordered]@{ case = $c.name; srcExists = (Test-Path $c.file); copyExists = (Test-Path "$($c.file).copy") } }
foreach ($c in $cases) { foreach ($f in @($c.file, "$($c.file).copy")) { if (Test-Path -LiteralPath $f) { [IO.File]::Delete($f) } } }
$out = [ordered]@{ driver = $log; paths = $meta; filesPresentBeforeCleanup = $present; app = $res }
$out | ConvertTo-Json -Depth 6 | Set-Content evidence\h8-dialogs.json
$out | ConvertTo-Json -Depth 6
