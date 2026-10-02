# Test helper: delete ONLY the spike app's own data dir (data\ subfolder, or everything with -All).
param([switch]$All)
$id = "io.github.peter-s-shi.quiz-studio"
$base = Join-Path $env:LOCALAPPDATA $id
$target = if ($All) { $base } else { Join-Path $base "data" }
if ((Split-Path $base -Leaf) -ne $id) { throw "refusing: unexpected path" }
if (Test-Path -LiteralPath $target) { [IO.Directory]::Delete($target, $true) }
"cleaned $(if ($All) { 'all app data' } else { 'data subfolder' })"
