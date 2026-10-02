# Build the H6 installer variants into separate target dirs: v2 (schema 2, 0.2.0) and failmig (schema 2 + failing migration, 0.3.0).
$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $PSScriptRoot; Set-Location $here
. "$here\scripts\env.ps1"
New-Item -ItemType Directory -Force "$here\work\installers" | Out-Null
$base = Get-ChildItem "$here\target\release\bundle\nsis\*.exe" | Select-Object -First 1
Copy-Item $base.FullName "$here\work\installers\qs_0.1.0_schema1.exe" -Force
$variants = @(
  @{ name = "v2"; version = "0.2.0"; features = "v2"; target = "target-v2"; out = "qs_0.2.0_schema2.exe" },
  @{ name = "failmig"; version = "0.3.0"; features = "v2,fail_migration"; target = "target-failmig"; out = "qs_0.3.0_failmig.exe" }
)
foreach ($v in $variants) {
  $env:CARGO_TARGET_DIR = "$here\$($v.target)"
  Push-Location "$here\app\src-tauri"
  $cfg = "$here\work\cfg-$($v.name).json"
  Set-Content -Path $cfg -Value ('{"version":"' + $v.version + '"}') -Encoding ascii
  cargo tauri build --bundles nsis --features $v.features --config $cfg 2>&1 | Select-Object -Last 3
  Pop-Location
  $exe = Get-ChildItem "$here\$($v.target)\release\bundle\nsis\*.exe" | Select-Object -First 1
  Copy-Item $exe.FullName "$here\work\installers\$($v.out)" -Force
  "built $($v.out) $((Get-FileHash $exe.FullName -Algorithm SHA256).Hash.ToLower())"
}
Remove-Item env:CARGO_TARGET_DIR
