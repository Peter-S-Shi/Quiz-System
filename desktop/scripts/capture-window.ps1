# Capture a window of a process BY HANDLE with PrintWindow (never reads screen pixels, so it cannot
# capture an unrelated window). Evidence goes to -OutFile (keep it outside the repository).
param([Parameter(Mandatory)][int]$ProcessId, [Parameter(Mandatory)][string]$OutFile, [int]$TimeoutSec = 30)
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class QsWin {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
"@
$deadline = (Get-Date).AddSeconds($TimeoutSec)
$h = [IntPtr]::Zero
while ((Get-Date) -lt $deadline) {
  $p = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $p) { throw "process $ProcessId exited" }
  $p.Refresh()
  if ($p.MainWindowHandle -ne [IntPtr]::Zero) { $h = $p.MainWindowHandle; break }
  Start-Sleep -Milliseconds 300
}
if ($h -eq [IntPtr]::Zero) { throw "no main window within $TimeoutSec s" }
Start-Sleep -Milliseconds 1500   # let the web view paint
$r = New-Object QsWin+RECT; [void][QsWin]::GetWindowRect($h, [ref]$r)
$w = $r.R - $r.L; $ht = $r.B - $r.T
$bmp = New-Object System.Drawing.Bitmap $w, $ht
$g = [System.Drawing.Graphics]::FromImage($bmp); $hdc = $g.GetHdc()
[void][QsWin]::PrintWindow($h, $hdc, 2); $g.ReleaseHdc($hdc); $g.Dispose()
$bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
"captured ${w}x${ht} -> $OutFile"
