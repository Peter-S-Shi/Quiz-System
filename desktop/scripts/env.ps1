# Dot-source me: puts the MSVC toolchain first on PATH (Git's link.exe shadows MSVC's otherwise; ADR 0001 A2)
# and sets the ADR 0001 A2 release flags for the app binary.
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vs = $null
if (Test-Path $vswhere) {
  $vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
}
if (-not $vs) { throw "MSVC Build Tools (VC.Tools.x86.x64) not found" }
$vcvars = Join-Path $vs "VC\Auxiliary\Build\vcvars64.bat"
cmd /c "`"$vcvars`" >nul && set" | ForEach-Object {
  if ($_ -match '^([^=]+)=(.*)$') { Set-Item -Path "env:$($Matches[1])" -Value $Matches[2] }
}
$env:CARGO_TERM_COLOR = "never"
$ws = Split-Path -Parent $PSScriptRoot
Remove-Item Env:RUSTFLAGS -ErrorAction SilentlyContinue
# Unit-separator-joined flags survive spaces in the workspace path.
$env:CARGO_ENCODED_RUSTFLAGS = @("-Ctarget-feature=+crt-static", "-Clink-arg=/Brepro", "--remap-path-prefix=$ws=/w") -join [char]0x1f
$env:QS_WORKSPACE = $ws
