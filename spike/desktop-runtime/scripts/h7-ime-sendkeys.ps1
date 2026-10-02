# Helper for h7-ime-edge.mjs: foreground the browser process window, select Pinyin layout, send keystrokes with the same safety guard.
param([int]$ProcessId, [int]$Phrases = 20, [ValidateSet("zh","ja")][string]$Lang = "zh", [switch]$KeepImeMode)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -Namespace W -Name K -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
[DllImport("user32.dll")] public static extern IntPtr LoadKeyboardLayout(string id, uint f);
[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
'@
$p = Get-Process -Id $ProcessId
$h = [IntPtr]::Zero
for ($i = 0; $i -lt 40 -and $h -eq [IntPtr]::Zero; $i++) { Start-Sleep -Milliseconds 500; $p.Refresh(); $h = $p.MainWindowHandle }
if ($h -eq [IntPtr]::Zero) { Write-Output "no main window"; exit 0 }
[W.K]::ShowWindow($h, 9) | Out-Null; [W.K]::SetForegroundWindow($h) | Out-Null; Start-Sleep -Milliseconds 800
$hkl = [W.K]::LoadKeyboardLayout($(if ($Lang -eq "ja") { "00000411" } else { "00000804" }), 1)
[W.K]::PostMessage($h, 0x50, [IntPtr]::Zero, $hkl) | Out-Null
Start-Sleep -Seconds 1
if ($Lang -eq "ja" -and -not $KeepImeMode) { [W.K]::keybd_event(0x19, 0, 0, [UIntPtr]::Zero); [W.K]::keybd_event(0x19, 0, 2, [UIntPtr]::Zero); Start-Sleep -Milliseconds 500 }   # VK_KANJI: IME on (hiragana) - Japanese IME starts in direct-input mode
$wordList = if ($Lang -eq "ja") { @("konnichiha", "arigatou", "nihongo", "gakkou", "sensei", "benkyou", "tabemono", "namae", "tomodachi", "kuruma", "densha", "tokei", "ongaku", "shashin", "sakana", "yasai", "kudamono", "hon", "tegami", "kaisha", "shigoto", "yasumi") } else { @("nihao", "shijie", "xuexi", "zhongwen", "yuyan", "pinyin", "shurufa", "wenzhang", "dazi", "lianxi", "jiyi", "duanluo", "changju", "cihui", "yufa", "fanyi", "cuowu", "zhengque", "baocun", "kaishi", "jieshu", "xiexie") }
$sent = 0; $abort = $false
foreach ($ph in ($wordList | Select-Object -First $Phrases)) {
  $fgPid = 0; [W.K]::GetWindowThreadProcessId([W.K]::GetForegroundWindow(), [ref]$fgPid) | Out-Null
  if ($fgPid -ne $p.Id) { [W.K]::SetForegroundWindow($h) | Out-Null; Start-Sleep -Milliseconds 500; [W.K]::GetWindowThreadProcessId([W.K]::GetForegroundWindow(), [ref]$fgPid) | Out-Null; if ($fgPid -ne $p.Id) { $abort = $true; break } }
  [System.Windows.Forms.SendKeys]::SendWait($ph); Start-Sleep -Milliseconds 250
  [System.Windows.Forms.SendKeys]::SendWait(" "); Start-Sleep -Milliseconds 300
  if ($Lang -eq "ja") { [System.Windows.Forms.SendKeys]::SendWait("{ENTER}"); Start-Sleep -Milliseconds 300 }   # Japanese: Space converts, Enter commits
  $sent++
}
Write-Output "sent=$sent aborted=$abort"
