# V2 Desktop Foundation — Milestone Record

**Branch:** `v2` (long-lived V2 development line, cut from `main@8eb6608`)
**Status:** implementation complete, awaiting the Human Gate (see "Gate readiness" below)
**Authority:** `V2_PRODUCT_SCOPE_FREEZE.md` Revision 1 (§5.1, §24), ADR 0001 (ACCEPTED, amendments A1–A8), `docs/V2_UI_ARCHITECTURE_FREEZE.md`, `docs/adr/evidence/0001-desktop-spike-report.md`.
**Code:** [`desktop/`](../desktop/README.md). V1 production code, tests and CI are untouched.

## 1. Objective

Establish the formal, sustainable desktop foundation that every later V2 milestone builds on: a Tauri 2 + WebView2 shell, a Rust-owned durability boundary over one SQLite store, Unit of Work with payload/projection integrity, content-addressed media, one staging/activation/rollback primitive, the V2 archive, a stable application identity, and Windows build/package CI.

## 2. Scope and non-goals

| In scope | Explicitly **not** in scope (unchanged, not started) |
|---|---|
| Tauri 2 shell, single instance, strict CSP, allowlisted IPC | V1 migration reader/implementation (Migration ADR not started) |
| Store (catalog-driven), Unit of Work, projections, schema ownership | Scheduler / Recommendation / Calendar tables or logic |
| Media store, activation/rollback/recovery, V2 archive | Objective / Translation / Typing domain integration |
| Application identity, version, data root, NSIS per-user package | Product views (the shell proves the foundation only) |
| Windows CI, packaged-app acceptance, fault/crash suites | Code signing, auto-update, macOS, final app icon |

Domain table schemas remain undecided by design (ADR 0001 §12). The foundation therefore ships only structural collections (`media_object`, `setting`, `recovery_session`); domain collections arrive as later catalog migrations.

## 3. Architecture as built

```text
WebView (offline shell, JS)                       desktop/ui/web
   │  ONE command `port` (allowlisted) + native_* commands (no paths in JS)
   ▼
Tauri shell  (qs-desktop)                         desktop/app/src-tauri
   │  single instance · CSP · asset protocol scoped to data/media · native dialogs / drag-drop in Rust
   ▼
qs-port   runtime-neutral Store Port (JSON in / envelope out), health gate, snapshots, offline recovery, self-test
   ├─ qs-archive     zip + per-file SHA-256 manifest · verify-all-before-activate · specific refusal codes
   ├─ qs-activation  staging · validate · snapshot · ATTACH single-txn commit · rollback · journal recovery
   ├─ qs-media       immutable content-addressed files · streaming ingest · gc
   └─ qs-store       catalog · canonical JSON · Unit of Work · projections · consistency · schema ownership
        └─ qs-platform   error codes · data-root layout · fsync/atomic publish/retry · lock · long paths · fault hook
```

`qs-testkit` (synthetic catalogs/data) and `qs-scenarios` (child-process fault scenarios) are test-only and never shipped.

### Decisions made while building (all inside ADR 0001; none reopens it)

1. **Catalog-driven store.** A catalog = forward-only migrations + a declarative description of each *collection* (typed projection columns, many-valued relationship rows, identity pointer, canonical vs recovery-only). The Store Port enforces the payload/projection contract for whatever catalog it is given, so no domain table is hard-coded and later ADRs only add catalog entries. Two adapters exercise the seam: the foundation catalog (shipped) and a synthetic evidence catalog (tests).
2. **Revisions.** Every collection row carries a store-managed `rev`; Units of Work may declare `absent` / `exists` / `rev = N` preconditions (the ADR's optimistic-concurrency example).
3. **Schema upgrade** runs the whole migration chain in **one transaction** after an automatic snapshot, verifies the catalog against the resulting schema before committing, and on any failure proves the store unchanged by a physical hash (restoring the snapshot file otherwise). The app refuses to run degraded on a failed upgrade rather than opening an old schema with new code.
4. **JS owns projections, Rust verifies.** `schema.info` publishes the declarative collection specs; `ui/web/src/projection.js` builds projections from them and Rust recomputes and rejects mismatches. Shared fixtures keep the two implementations identical.
5. **Canonical JSON** is specified once and implemented twice (Rust, JS) with shared vectors. The cross-language run found a genuine ECMAScript tie-rounding divergence (`153924.33520507812`); it is fixed and now permanently covered (40,012-vector run clean).
6. **Rust-owned native flows.** Open/Save dialogs, drag-and-drop and streaming ingest run in Rust; the WebView never receives a raw path and has no file-system, shell or dialog capability. Path-carrying Store Port commands (`media.ingest_file`, `backup.*`) are not in the WebView allowlist.
7. **Fault injection is a compile-time feature** (`qs-platform/fault-injection`), enabled only by the test scenario crate. CI asserts the shipped binary contains no hook.
8. **Health gate.** If startup `quick_check` or `check_consistency` fails, writes are refused and nothing is auto-repaired; a corrupt database that cannot open yields a recovery screen that restores a chosen snapshot while preserving the damaged file byte-for-byte.

### ADR 0001 amendments A1–A8 — where each is enforced

| # | Enforced in | Verified by |
|---|---|---|
| A1 per-process network posture | strict CSP (`connect-src` ipc only), no listener | `smoke.ps1` (no listener, no non-loopback connection from the app process) |
| A2 MSVC + static CRT, `/Brepro`, path remap | `rust-toolchain.toml`, `.cargo/config.toml`, `scripts/env.ps1` | CI builds the app binary twice and compares SHA-256 |
| A3 delete-data only via interactive checkbox | Tauri NSIS uninstaller (checkbox default off) | `package-test.ps1`: silent uninstall keeps data (CI, real `%LOCALAPPDATA%`) |
| A4 big integers as strings | `canon.rs` / `canonical.js` (JS refuses unsafe integers) | `canonical.spec.mjs`, `fidelity_vectors.rs` |
| A5 deferrable FKs, Rust-validated projections, `check_consistency` | `verify_catalog` lint, `uow.rs`, `consistency.rs` | `store_contract.rs` (drift probe, out-of-band probe, FK probes) |
| A6 temp → fsync → atomic rename with retry | `qs-platform::fsx`, `qs-media` | media unit tests, kill-mid-write scenario |
| A7 verbatim `\\?\` path, staging `journal_mode=DELETE` | `fsx::sqlite_path`, `activation::normalize_staging` | long-path store test |
| A8 zip + manifest, verify-all-before-activate, refusal codes | `qs-archive` | 14 named mutations + bit-flip loop + not-a-zip/truncation |

## 4. Acceptance evidence

Thresholds are the ADR/contract thresholds, unchanged. "CI" figures are from the `Desktop (V2)` workflow; "local" figures are from the development machine.

| Exit condition | Evidence |
|---|---|
| Shell builds, installs, launches independently | `cargo tauri build --bundles nsis` (3 MiB per-user installer); `package-test.ps1`: silent install (no machine-wide registry), installed-exe smoke, upgrade over the same identifier, silent uninstall |
| Canonical data off browser-origin storage | `boundary.spec.mjs` (no `localStorage`/`sessionStorage`/`indexedDB`/cookies in shipped UI); launch count and sidebar width round-trip through the Rust store and survive a force-kill (`smoke.ps1`) |
| Store/media/activation/archive foundations | 18 store + 9 activation + 11 archive + 7 port + 7 media + 3 platform tests, 15 JS tests |
| H2-class crash safety | `h2_crash_loop`: **500 forced kills**, ~12,100 acked Units of Work, 0 violations (quick_check clean, every acked UoW present, none partial) |
| H3-class activation faults | `h3_activation_faults`: 6 checkpoints × 2 modes × 3 repeats + kill during rollback — every kill leaves exactly pre or exactly post; recovery deterministic and idempotent; rollback restores exact pre-state |
| H4/H5-class media & archive | kill-mid-write / kill-mid-gc safe; 400 MiB ingest, archive create, restore: child peak working set **5–8 MiB** (limit 300); restored media byte-identical; 14 named archive mutations rejected before activation with specific codes; bit-flip loop never yields undetected data corruption |
| Fidelity JS ↔ Rust ↔ DB | 40,012 vectors (local), CI runs 5,000: 0 mismatches |
| Windows CI green | [Desktop (V2) run](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37012332165) on `windows-latest` (rustc 1.99, MSVC, static CRT): fmt, clippy `-D warnings`, JS + Rust suites at the ADR thresholds, app binary reproducible (identical SHA-256 across two builds), no fault hook in the shipped binary, NSIS install → installed-exe smoke → upgrade (data preserved) → silent uninstall (data kept) with real `%LOCALAPPDATA%` — all green on the first run |
| V1 production line unmodified | no file outside `desktop/`, `docs/`, status files, `.gitignore` and the new workflow changed; V1 `ci.yml` untouched |
| No Migration implementation | none present; Migration ADR not started |

## 5. Residuals handed over from the Architecture Gate

| Item | Status | Detail |
|---|---|---|
| Native **Open** dialog flow | **Implemented, automated round-trip not run** → acceptance debt D1 | `native_pick_media` / `native_backup_pick` use the OS dialog from Rust; manual steps in `manual-qa/v2-desktop-foundation.md` |
| OS **drag-and-drop** ≥ 1 GiB with responsive UI | **Implemented; headless streaming proven at 400 MiB; OS drag of ≥ 1 GiB not run** → debt D2 | drop handler streams on a worker thread with progress events |
| Save/Open through **OneDrive-redirected Desktop/Documents** | **Not run** → debt D3 | the data root is `%LOCALAPPDATA%` (never redirected); only user-chosen file locations are affected |
| **Runtime-less WebView2** `downloadBootstrapper` | **Static evidence only** → debt D4 | CI asserts the installer is built in `downloadBootstrapper` mode and the NSIS section is guarded by the runtime registry probe; a machine without the Evergreen runtime is not available (Windows 11 Home, no Sandbox/VM; runners ship the runtime) |

Other open items (not blocking the foundation): final app icon (a neutral placeholder ships; the Design Lane candidate is untracked), bundled CJK fonts (the shell uses system fonts and references no network resource), code signing, auto-update, standard-user profile install test (cannot create a standard user without admin; per-user install is evidenced by the absence of machine-wide registry writes and a no-elevation install on a CI runner and on the dev machine).

## 6. How to run

See [`desktop/README.md`](../desktop/README.md): environment script, test suites with the ADR-threshold environment variables, the installer build and the package acceptance script.

## 7. Gate readiness

The milestone's exit conditions are met except where listed as acceptance debt D1–D4, which the Product Owner may accept, schedule, or run manually. Nothing in V1 Migration, Scheduler, Calendar or the domain integrations has been started. The next milestone (V1 Migration ADR) is **not** started and needs separate authorization.
