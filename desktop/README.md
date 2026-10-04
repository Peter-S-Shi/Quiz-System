# Quiz Studio V2 — desktop (Tauri 2 + WebView2)

Formal V2 Desktop Foundation (ADR 0001, `docs/V2_DESKTOP_FOUNDATION.md`). V1 (the repository root) is untouched and keeps its own `npm test` / CI.

```text
core/platform    error codes, data-root layout, durable file ops, process lock, memory probes, fault hook
core/store       catalog-driven SQLite store, canonical JSON, Unit of Work, projections, schema ownership
core/media       immutable content-addressed media
core/activation  staging, validation, atomic activation, rollback, journal recovery
core/archive     V2 backup archive (zip + SHA-256 manifest)
core/orchestration  Learning Orchestration persistence (store schema 3, ADR 0003)
core/task_domains   Task-Domain Integration persistence (store schema 4: typing_text, typing_attempt, ADR 0004)
core/port        runtime-neutral Store Port, health gate, offline recovery, self-test
core/testkit     (test only) synthetic catalogs and data
core/scenarios   (test only) child-process fault/crash scenarios
app/src-tauri    the Tauri shell (binary `quiz-studio`)
ui/web           the offline shell UI (shipped);  ui/tests  JS tests (not shipped)
scripts          environment, vector generator, smoke and package acceptance, window capture
```

## Prerequisites (Windows)

Rust MSVC toolchain (pinned by `rust-toolchain.toml`), Visual Studio Build Tools with the C++ workload, Node 22+, and for packaging the Tauri CLI (`cargo install tauri-cli --version 2.12.1 --locked`, or `npm i -g @tauri-apps/cli@2.12.1`). Git's `link.exe` shadows MSVC's, so always start with the environment script:

```powershell
. .\scripts\env.ps1     # MSVC on PATH first; ADR 0001 A2 flags (static CRT, /Brepro, path remap)
```

## Test

```powershell
node --test "ui/tests/*.spec.mjs"                         # JS: canonical JSON, projections, Store Port client, storage/offline boundary
cargo fmt --all -- --check; cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --exclude qs-desktop               # fast local defaults
```

The fault/crash suites scale to the ADR thresholds with environment variables (CI sets these):

| Variable | Local default | ADR / CI value | Suite |
|---|---|---|---|
| `QS_KILLS` | 40 | 500 | forced-kill crash loop (H2) |
| `QS_H3_REPEATS` | 1 | 3 | activation kill-point matrix (H3) |
| `QS_HEAVY_MIB` | 160 | 400 | streaming ingest / archive / restore memory envelope (H4/H5) |
| `QS_BITFLIPS` | 120 | 300 | archive bit-flip loop (H5) |
| `QS_VECTORS` | checked-in 172 | 5,000+ | JS ↔ Rust ↔ DB fidelity vectors (`node scripts/gen-canonical-vectors.mjs <n> <out> [seed]`) |

`QS_UPDATE_FIXTURES=1 cargo test -p qs-store --test projection_cases` regenerates the shared projection fixture.

## Build, run, package

```powershell
cd app/src-tauri
cargo tauri build --bundles nsis          # per-user NSIS installer under target/release/bundle/nsis
cargo build -p qs-desktop --features custom-protocol   # plain exe for quick local runs
```

Never run a development build against your real data folder if you also have the disposable spike app installed: both use the permanent identifier `io.github.peter-s-shi.quiz-studio`. For local runs set `LOCALAPPDATA` to a scratch folder for the process (the app derives its data root from it), as `scripts/smoke.ps1` does:

```powershell
./scripts/smoke.ps1 -Exe target/release/quiz-studio.exe -Report smoke.json          # isolated launch smoke
./scripts/package-test.ps1 -Installer <setup.exe> -ExpectedVersion <v> -Report pkg.json [-UpgradeSource <older.exe>] [-IconFile <icon.ico>] [-DataJourneys] [-RealData]   # exact-candidate package acceptance
quiz-studio.exe --self-test report.json    # headless end-to-end proof on an isolated temp root
quiz-studio.exe --identity                 # prints the permanent identifier and version
```

`-RealData` (used on CI runners) lets the package test prove user data survives uninstall and upgrade; do not use it on a machine that holds data you care about.

## Data layout

`%LOCALAPPDATA%\io.github.peter-s-shi.quiz-studio\` — `data\quiz-studio.db` (+wal/shm), `data\media\<hh>\<sha256>`, `staging\`, `snapshots\`, `journal\`, `recovery-artifacts\`, `logs\`. Uninstall keeps it unless the interactive uninstaller checkbox is ticked.

## V1 migration

`core/migrate_v1` (`qs-migrate-v1`) implements ADR 0002; see [`docs/V2_MIGRATION.md`](../docs/V2_MIGRATION.md). Fixtures: `node scripts/gen-v1-fixtures.mjs` (generated with V1's own producer). Suites: `cargo test -p qs-migrate-v1` and `cargo test -p qs-scenarios --test migration_faults` (`QS_H3_REPEATS`, `QS_MIG_KILLS`, `QS_HEAVY_MIB`).

## Learning Orchestration

`core/orchestration` (`qs-orchestration`, store schema 3) and the pure JS/TS domain in `ui/web/src/orchestration` implement ADR 0003; see [`docs/V2_ORCHESTRATION.md`](../docs/V2_ORCHESTRATION.md). Suites: `cargo test -p qs-orchestration`, `node --test "ui/tests/*.spec.mjs"` (pure) and `node --test "ui/tests/integration/*.spec.mjs"` (the JS domain against the real Rust store through `qs-scenario port-serve`; `QS_ORCH_KILLS`, `QS_ORCH_SEQUENCES`).

`ui/web/src/{objective,translation,practice}` and `ui/selftest` implement Objective Answer Explanation + Focused Practice ([`docs/V2_PRACTICE.md`](../docs/V2_PRACTICE.md)); suites: the same `node --test` globs plus `node ui/selftest/practice-selftest.mjs` and `node ui/selftest/app-selftest.mjs` (headless Edge).

## Product UI

`ui/web/src/{ui,product,exchange,media}` is the final product UI ([`docs/V2_PRODUCT_UI.md`](../docs/V2_PRODUCT_UI.md)): `ui/` the shell and the seven views (+ Library editors, import flows, preferences, dictionary), `product/` the DOM-free services over the Store Port (library, learning, history, reviews, exchange), `exchange/` the ports of the V1 interchange rules, `media/` the media pipeline client. Sample data without touching real data: `node ui/selftest/seed-data-root.mjs <empty-folder>` then run the app with `LOCALAPPDATA` set to that folder. Look at every view: `node ui/selftest/shots.mjs <out> [en|zh-CN] [light|dark]`. Browser self-tests (headless Edge over the real Rust store): `node ui/selftest/product-selftest.mjs`; inside the real packaged exe (real WebView2, CSP, IPC): `node ui/selftest/packaged-product-check.mjs target/release/quiz-studio.exe`.

`core/task_domains` (`qs-task-domains`, store schema 4) and the pure JS domain in `ui/web/src/task-domains` implement ADR 0004 (Objective / Translation / Typing finalization, the Typing evidence and the project-controlled `typing-compare/1`); see [`docs/V2_TASK_DOMAINS.md`](../docs/V2_TASK_DOMAINS.md). Suites: `cargo test -p qs-task-domains`, the same two `node --test` globs; `node ui/tools/gen-unicode-data.mjs` regenerates the pinned Unicode tables (inputs under `ui/tools/ucd-cache/`, not committed).
