# H1 local: per-user install (no elevation), launch from the INSTALLED copy, uninstall keep-data / delete-data.
param([string]$Installer, [string]$Step = "all", [string]$Out = "evidence")
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $PSScriptRoot; Set-Location $here
if (-not $Installer) { $Installer = (Get-ChildItem target\release\bundle\nsis\*.exe | Select-Object -First 1).FullName }
$id = "io.github.peter-s-shi.quiz-studio"
$dataDir = Join-Path $env:LOCALAPPDATA $id
$instDir = Join-Path $env:LOCALAPPDATA "Quiz Studio Spike"
$unKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Quiz Studio Spike"
$res = [ordered]@{}
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$res.runnerIsElevated = $isAdmin
$res.installerSha256 = (Get-FileHash $Installer -Algorithm SHA256).Hash.ToLower()
$res.installerBytes = (Get-Item $Installer).Length

function Dump($name) { $res | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $Out $name) }

if ($Step -in "all", "install") {
  $res.preexistingInstall = (Test-Path $instDir); $res.preexistingData = (Test-Path $dataDir)
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $p = Start-Process $Installer -ArgumentList "/S" -PassThru -Wait
  $res.installExitCode = $p.ExitCode; $res.installSeconds = [math]::Round($sw.Elapsed.TotalSeconds, 1)
  $res.installDirExists = Test-Path $instDir
  $res.installedExe = Test-Path (Join-Path $instDir "quiz-studio-spike.exe")
  $res.uninstallKeyInHKCU = Test-Path $unKey
  $res.uninstallKeyInHKLM = Test-Path "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Quiz Studio Spike"
  $res.programFilesTouched = (Test-Path "$env:ProgramFiles\Quiz Studio Spike")
  $res.installedFileCount = (Get-ChildItem $instDir -Recurse -File).Count
}
if ($Step -in "all", "launch") {
  $exe = Join-Path $instDir "quiz-studio-spike.exe"
  $run = & "$here\scripts\run-app.ps1" -Exe $exe -Auto h1 -Tag _installed -ResultDir work\h1-installed -TimeoutSec 90 | ConvertFrom-Json
  $res.launch = $run
  $res.h1Result = Get-Content work\h1-installed\h1_installed.json -Raw | ConvertFrom-Json
  $res.dataDirCreated = Test-Path $dataDir
  $res.dbExists = Test-Path (Join-Path $dataDir "data\quiz-studio.db")
  $res.webviewProfileInsideDataDir = Test-Path (Join-Path $dataDir "EBWebView")
}
if ($Step -in "all", "uninstall-keep") {
  $un = Join-Path $instDir "uninstall.exe"
  $p = Start-Process $un -ArgumentList "/S" -PassThru -Wait
  Start-Sleep -Seconds 2
  $res.uninstallKeepExit = $p.ExitCode
  $res.afterKeep_installDirRemoved = -not (Test-Path (Join-Path $instDir "quiz-studio-spike.exe"))
  $res.afterKeep_dataKept = (Test-Path (Join-Path $dataDir "data\quiz-studio.db"))
  $res.afterKeep_uninstallKeyRemoved = -not (Test-Path $unKey)
}
if ($Step -in "all", "uninstall-delete") {
  # fresh install + launch so data exists, then drive the real uninstaller UI: tick "Delete the application data", click Uninstall
  Start-Process $Installer -ArgumentList "/S" -Wait
  & "$here\scripts\run-app.ps1" -Exe (Join-Path $instDir "quiz-studio-spike.exe") -Auto h1 -Tag _del -ResultDir work\h1-installed -TimeoutSec 90 | Out-Null
  $res.beforeDelete_dataExists = Test-Path (Join-Path $dataDir "data\quiz-studio.db")
  Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
  Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h,uint m,IntPtr w,IntPtr l);'
  Start-Process (Join-Path $instDir "uninstall.exe") | Out-Null
  $w = $null
  for ($i = 0; $i -lt 40 -and -not $w; $i++) {
    Start-Sleep -Milliseconds 500
    $w = [Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Children, [Windows.Automation.Condition]::TrueCondition) | Where-Object { $_.Current.Name -like "*Quiz Studio Spike Uninstall*" } | Select-Object -First 1
  }
  $res.uninstallDialogFound = [bool]$w
  if ($w) {
    $d = $w.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition)
    $cb = $d | Where-Object { $_.Current.Name -eq "Delete the application data" }
    $ub = $d | Where-Object { $_.Current.Name -eq "Uninstall" -and $_.Current.ClassName -eq "Button" }
    $res.deleteCheckboxFound = [bool]$cb
    [W.U]::SendMessage([IntPtr]$cb.Current.NativeWindowHandle, 0xF5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    Start-Sleep -Seconds 1
    [W.U]::SendMessage([IntPtr]$ub.Current.NativeWindowHandle, 0xF5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    Start-Sleep -Seconds 6
  }
  $res.afterDelete_installDirRemoved = -not (Test-Path (Join-Path $instDir "quiz-studio-spike.exe"))
  $res.afterDelete_dataRemoved = -not (Test-Path (Join-Path $dataDir "data"))
  $res.afterDelete_dataDirGone = -not (Test-Path $dataDir)
}
Dump "h1-install-$Step.json"
$res | ConvertTo-Json -Depth 6
