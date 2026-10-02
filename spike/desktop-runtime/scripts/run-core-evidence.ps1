# Headless evidence runs for H2-H5 (drives spikectl). Output: evidence/*.json. Synthetic data only.
param([string]$Step = "all")
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $PSScriptRoot
Set-Location $here
$x = Join-Path $here "target\release\spikectl.exe"
New-Item -ItemType Directory -Force work, evidence | Out-Null

function Step($name) { return ($Step -eq "all" -or $Step -eq $name) }

if (Step "h2") {
  Remove-Item work\h2 -Recurse -Force -ErrorAction SilentlyContinue
  # fidelity on evidence-shaped data + awkward fixtures, with JS cross-implementation hashes
  & $x ingest-ndjson --root work/h2/a --file work/ev2500.ndjson | Set-Content evidence/h2-ingest-2500.json
  & $x fidelity --root work/h2/a --file work/ev2500.ndjson --js work/ev2500.hashes.ndjson | Set-Content evidence/h2-fidelity-evidence.json
  & $x ingest-ndjson --root work/h2/f --file work/fid.ndjson | Set-Content evidence/h2-ingest-fidelity-fixtures.json
  & $x fidelity --root work/h2/f --file work/fid.ndjson --js work/fid.hashes.ndjson | Set-Content evidence/h2-fidelity-fixtures.json
  & $x fidelity-bignum --root work/h2/f | Set-Content evidence/h2-fidelity-bignum.json
  & $x h2-probes --root work/h2/p | Set-Content evidence/h2-probes.json
  # latency on pristine tiers (history first, then commit latency which adds rows)
  & $x ingest-ndjson --root work/h2/b --file work/ev10000.ndjson | Set-Content evidence/h2-ingest-10000.json
  $h = @{}
  $h.history2500_full = (& $x bench-history --root work/h2/a --limit 100000 --iters 200 | ConvertFrom-Json)
  $h.history2500_page50 = (& $x bench-history --root work/h2/a --limit 50 | ConvertFrom-Json)
  $h.history10000_full = (& $x bench-history --root work/h2/b --limit 100000 --iters 100 | ConvertFrom-Json)
  $h.history10000_page50 = (& $x bench-history --root work/h2/b --limit 50 | ConvertFrom-Json)
  $h.commit_on_2500 = (& $x bench-commit --root work/h2/a --n 2000 | ConvertFrom-Json)
  $h.commit_on_10000 = (& $x bench-commit --root work/h2/b --n 2000 | ConvertFrom-Json)
  $h | ConvertTo-Json -Depth 5 | Set-Content evidence/h2-latency.json
}
if (Step "h2crash") {
  Remove-Item work\h2crash -Recurse -Force -ErrorAction SilentlyContinue
  & $x crash-loop --root work/h2crash --target-midloop 500 --min-ms 50 --max-ms 400 --seed 20261001 --log evidence/h2-crashloop.jsonl | Set-Content evidence/h2-crashloop-summary.json
}
if (Step "h3") {
  & $x h3-matrix --work work/h3 --ndjson work/ev10000.ndjson --live-n 5000 --repeats 3 | Set-Content evidence/h3-matrix.json
}
if (Step "h4") {
  Remove-Item work\h4 -Recurse -Force -ErrorAction SilentlyContinue
  if (-not (Test-Path work/media-envelope.json)) { & $x gen-media --out work/media-envelope.json | Set-Content evidence/h4-generator.json }
  & $x ingest-media --root work/h4/live --envelope work/media-envelope.json | Set-Content evidence/h4-ingest.json
  & $x media-verify --root work/h4/live | Set-Content evidence/h4-verify.json
}
if (Step "h5") {
  Remove-Item work\h5 -Recurse -Force -ErrorAction SilentlyContinue
  $live = "work/h5/live"
  & $x ingest-ndjson --root $live --file work/ev2500.ndjson | Out-Null
  & $x ingest-media --root $live --envelope work/media-envelope.json | Out-Null
  & $x link-media --root $live | Out-Null
  # create the archive while a writer loop is running
  $w = Start-Process -FilePath $x -ArgumentList @("writer-loop", "--root", $live) -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 1
  & $x archive-create --root $live --out work/h5/backup.zip | Set-Content evidence/h5-create.json
  Stop-Process -Id $w.Id -Force
  # restore into a clean profile (replace) and into a populated one (replace + merge)
  & $x archive-restore --root work/h5/clean --archive work/h5/backup.zip --mode replace --op r1 | Set-Content evidence/h5-restore-clean.json
  & $x ingest-ndjson --root work/h5/pop --file work/fid.ndjson | Out-Null
  & $x archive-restore --root work/h5/pop --archive work/h5/backup.zip --mode replace --op r2 | Set-Content evidence/h5-restore-populated-replace.json
  & $x ingest-ndjson --root work/h5/pop2 --file work/fid.ndjson | Out-Null
  & $x archive-restore --root work/h5/pop2 --archive work/h5/backup.zip --mode merge --op r3 | Set-Content evidence/h5-restore-populated-merge.json
  & $x verify --root work/h5/clean | Set-Content evidence/h5-restore-clean-verify.json
  # mutation matrix: named mutations on the full-size archive; random single-bit flips on a small archive
  & $x h5-mutations --work work/h5/mut-big --archive work/h5/backup.zip --fuzz 0 | Set-Content evidence/h5-mutations-full.json
  & $x gen-media --out work/media-small.json --scale 3 | Out-Null
  & $x ingest-ndjson --root work/h5/small --file work/ev2500.ndjson | Out-Null
  & $x ingest-media --root work/h5/small --envelope work/media-small.json | Out-Null
  & $x link-media --root work/h5/small | Out-Null
  & $x archive-create --root work/h5/small --out work/h5/small.zip | Out-Null
  & $x h5-mutations --work work/h5/mut-small --archive work/h5/small.zip --fuzz 300 | Set-Content evidence/h5-mutations-fuzz.json
}
