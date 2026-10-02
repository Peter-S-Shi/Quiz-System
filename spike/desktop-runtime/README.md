# Bounded Desktop Spike — `spike/desktop-runtime` (DISPOSABLE, NEVER MERGED)

Executes `docs/adr/0001-appendix-desktop-spike-contract.md` (H1–H8) against ADR 0001.
This is **evidence code**, not product code and **not** a V2 development branch. Nothing here is
re-used verbatim; anything worth keeping is re-implemented later on the V2 branch.

Synthetic data only. No real user data. Evidence contains no usernames, machine names or absolute paths
(placeholders such as `<WORK>` / `%LOCALAPPDATA%` are used).

## Layout
| Path | What |
|---|---|
| `core/` | `spike-core` (Rust): canonical hash, Store Port (SQLite WAL/FK, Unit of Work, projection check), activation primitive, media store + streaming ingest, backup archive, fault injection. `spikectl` = CLI harness for H2–H6. |
| `app/` | Tauri 2 shell + bare test-harness page (`app/ui`), commands call `spike-core`. |
| `scripts/` | dataset generators (`gen-evidence.mjs` reuses `scripts/lib/history-performance-fixtures.mjs`), build env, run scripts. |
| `evidence/` | raw results (JSON/text) committed as proof. |
| `REPORT.md` | result table and recommendation for the Desktop Architecture Gate. |

## Reproduce (Windows, MSVC Build Tools + Rust MSVC toolchain + Node)
```powershell
. .\scripts\env.ps1                    # MSVC env (fixes Git link.exe shadowing), static CRT
cargo build --release -p spike-core   # spikectl
node scripts/gen-evidence.mjs 2500  work/ev2500.ndjson  work/ev2500.hashes.ndjson
node scripts/gen-evidence.mjs 10000 work/ev10000.ndjson work/ev10000.hashes.ndjson
node scripts/gen-fidelity.mjs work/fid.ndjson work/fid.hashes.ndjson
.\scripts\run-core-evidence.ps1        # H2 / H3 / H4 / H5 headless runs  -> evidence/
cd app/src-tauri; cargo tauri build --bundles nsis    # installer for H1/H6/H7/H8
```
`work/` and `target/` are git-ignored.
