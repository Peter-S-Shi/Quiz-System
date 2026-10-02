# Dot-source me: sets up an MSVC (static CRT) build environment for the spike.
# Fixes the Git `link.exe` shadowing problem by putting the MSVC toolchain first on PATH.
$vcvars = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if (-not (Test-Path $vcvars)) { throw "MSVC Build Tools not found" }
cmd /c "`"$vcvars`" >nul && set" | ForEach-Object {
  if ($_ -match '^([^=]+)=(.*)$') { Set-Item -Path "env:$($Matches[1])" -Value $Matches[2] }
}
$env:RUSTFLAGS = "-C target-feature=+crt-static"
$env:CARGO_TERM_COLOR = "never"
$root = Split-Path -Parent $PSScriptRoot
$env:SPIKE_ROOT = $root
