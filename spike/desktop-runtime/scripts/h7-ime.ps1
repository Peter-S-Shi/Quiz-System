# H7(a): drive the REAL Microsoft Pinyin IME inside the packaged WebView by synthesizing keystrokes (SendKeys -> TSF).
# The harness page logs composition events and asserts only compositionend text is "committed".
param([string]$Exe, [int]$Phrases = 20, [string]$Tag = "_pinyin", [ValidateSet("zh","ja")][string]$Lang = "zh", [switch]$KeepImeMode, [string]$ResultDir = "work\h7")
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $PSScriptRoot; Set-Location $here
Add-Type -AssemblyName System.Windows.Forms
Add-Type -Namespace W -Name K -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
[DllImport("user32.dll")] public static extern IntPtr LoadKeyboardLayout(string id, uint f);
[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
[DllImport("user32.dll")] public static extern IntPtr GetKeyboardLayout(uint t);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
'@
New-Item -ItemType Directory -Force $ResultDir | Out-Null
Remove-Item "$ResultDir\done$Tag.json" -ErrorAction SilentlyContinue
$q = '"' + (Resolve-Path $ResultDir).Path + '"'
$p = Start-Process $Exe -ArgumentList @("--auto", "ime", "--ime-n", $Phrases, "--ime-timeout", 150, "--result-dir", $q, "--tag", $Tag) -PassThru
$h = [IntPtr]::Zero
for ($i = 0; $i -lt 40 -and $h -eq [IntPtr]::Zero; $i++) { Start-Sleep -Milliseconds 500; $p.Refresh(); $h = $p.MainWindowHandle }
if ($h -eq [IntPtr]::Zero) { throw "no main window" }
Start-Sleep -Seconds 2
[W.K]::ShowWindow($h, 9) | Out-Null; [W.K]::SetForegroundWindow($h) | Out-Null; Start-Sleep -Milliseconds 800
$hkl = [W.K]::LoadKeyboardLayout($(if ($Lang -eq "ja") { "00000411" } else { "00000804" }), 1)
[W.K]::PostMessage($h, 0x50, [IntPtr]::Zero, $hkl) | Out-Null
Start-Sleep -Seconds 1
if ($Lang -eq "ja" -and -not $KeepImeMode) { [W.K]::keybd_event(0x19, 0, 0, [UIntPtr]::Zero); [W.K]::keybd_event(0x19, 0, 2, [UIntPtr]::Zero); Start-Sleep -Milliseconds 500 }   # VK_KANJI: IME on (hiragana) - Japanese IME starts in direct-input mode
$fg = [W.K]::GetForegroundWindow(); $tid = 0; $t = [W.K]::GetWindowThreadProcessId($fg, [ref]$tid)
$layout = ([W.K]::GetKeyboardLayout($t)).ToInt64() -band 0xFFFF
$wordList = if ($Lang -eq "ja") { @("konnichiha", "arigatou", "nihongo", "gakkou", "sensei", "benkyou", "tabemono", "namae", "tomodachi", "kuruma", "densha", "tokei", "ongaku", "shashin", "sakana", "yasai", "kudamono", "hon", "tegami", "kaisha", "shigoto", "yasumi") } else { @("nihao", "shijie", "xuexi", "zhongwen", "yuyan", "pinyin", "shurufa", "wenzhang", "dazi", "lianxi", "jiyi", "duanluo", "changju", "cihui", "yufa", "fanyi", "cuowu", "zhengque", "baocun", "kaishi", "jieshu", "xiexie") }
$sent = 0
foreach ($ph in ($wordList | Select-Object -First $Phrases)) {
  # SAFETY: never type into some other application -- abort unless the foreground window belongs to our app process
  $fgPid = 0; [W.K]::GetWindowThreadProcessId([W.K]::GetForegroundWindow(), [ref]$fgPid) | Out-Null
  if ($fgPid -ne $p.Id) { [W.K]::SetForegroundWindow($h) | Out-Null; Start-Sleep -Milliseconds 500; [W.K]::GetWindowThreadProcessId([W.K]::GetForegroundWindow(), [ref]$fgPid) | Out-Null; if ($fgPid -ne $p.Id) { Write-Output "ABORT: app lost foreground"; break } }
  [System.Windows.Forms.SendKeys]::SendWait($ph); Start-Sleep -Milliseconds 250
  [System.Windows.Forms.SendKeys]::SendWait(" "); Start-Sleep -Milliseconds 300
  if ($Lang -eq "ja") { [System.Windows.Forms.SendKeys]::SendWait("{ENTER}"); Start-Sleep -Milliseconds 300 }   # Japanese: Space converts, Enter commits
  $sent++
}
$sw = [Diagnostics.Stopwatch]::StartNew()
while (-not (Test-Path "$ResultDir\done$Tag.json") -and $sw.Elapsed.TotalSeconds -lt 190) { Start-Sleep -Milliseconds 500 }
if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
[ordered]@{ activeLayoutLangId = ("{0:X4}" -f $layout); keystrokePhrasesSent = $sent; resultFile = "$ResultDir\ime$Tag.json" } | ConvertTo-Json
