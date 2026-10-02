# Bounded Desktop Spike — REPORT

Branch `spike/desktop-runtime` (disposable, never merged). Contract: `docs/adr/0001-appendix-desktop-spike-contract.md`.
**Thresholds are the contract's pre-declared ones; none were changed.** Synthetic data only. Raw results: `evidence/`.
Scope note: the contract §1 confines the spike to `spike/desktop-runtime/`; the **only** file outside it is the disposable
workflow `.github/workflows/spike-desktop-runtime.yml` (triggered only by pushes to this branch), needed for the contract's
"pristine `windows-latest` runner" environment (§2) and the "reproducible on the runner" criterion (H1-6).

## Verdict

**Recommendation: GO WITH AMENDMENT — provisional.** On everything the environment could test autonomously, no hypothesis failed,
no corruption/partial-unit/identity failure occurred, and neither the Tauri→Electron fallback (H1/H7) nor an architecture NO-GO was triggered.
Remaining items need the Product Owner or an environment this machine lacks (a runtime-less WebView2 machine, OS drag-drop/OneDrive dialogs; the elevated network-isolation run was waived — see §4), so **H1 and
H8 are CONDITIONAL; H7 is PASS (with the Sogou caveat in §5)**, and the Gate should not finalize until those are executed. ADR amendments forced by evidence are in §3.

| H | Hypothesis | Result | Headline evidence |
|---|---|---|---|
| H1 | Packaging / install / launch / offline | **CONDITIONAL** | per-user install without elevation, no listener, identifier correct, uninstall keep/delete both verified; app exe bit-reproducible with `/Brepro`; adapter-disabled run, `pktmon`, no-runtime bootstrapper path **not** executable here |
| H2 | Store durability / UoW / fidelity / projections | **PASS** | 500/500 forced kills clean; 100 % hash fidelity (4,999 + 60 JS↔Rust cross-checked); drift 12/12, OOB 11/11, FK 10/10; commit p95 ≤ 6 ms |
| H3 | Atomic activation + rollback | **PASS** | 48/48 kill runs ∈ {pre, post}; rollback exact; peak 12 MiB; no intermediate state visible to a concurrent reader (≈370 k polls) |
| H4 | Media layout / scale | **PASS** | 140/140 byte-identical vs source; 136 MiB peak (CLI) / ≤ 214 MiB (in-app); render + audio seek under CSP; out-of-scope asset 403 |
| H5 | Backup archive / restore | **PASS** | 11/11 named mutations + 300/300 random bit flips rejected before activation; ≤ 12 MiB; failed restore leaves live untouched |
| H6 | Upgrade / schema ownership | **PASS** | upgrade payload-hash equal; failing migration rolled back; downgrade refused with no write |
| H7 | WebView2 fitness | **PASS** | Unicode 34/34, long-text 0 invisible / 0 jumps / 0 focus loss, 200 resize+fullscreen cycles × 3 scale factors 0 breaks, identical to Edge 154 baseline; **Microsoft Pinyin: 3/3 runs, 20/20 compositionstart/end, 0 premature commits, identical to Edge; Microsoft Japanese IME: 3/3 runs, 20/20, identical to Edge; Sogou Pinyin (third-party) emits no composition events in the packaged app (risk, §5)** |
| H8 | Process model / native flows / paths | **CONDITIONAL** | single-instance + exclusive lock verified; 1 GiB streamed copy max frame gap 4.7 ms; long path round-trip; Save-dialog (plain, CJK) automated; Open dialog / drag-drop / OneDrive dialogs not completed |

## 1. Environment manifest (contract §2)

| | Dev machine | GitHub `windows-latest` runner |
|---|---|---|
| OS | Windows 11 **Home** 10.0.26200 (no Sandbox/Hyper-V; **no fresh standard user** possible without admin — existing profile used, data dir wiped between runs) | Windows Server image 10.0.26100, runner is admin |
| WebView2 runtime | 154.0.4258.48 | **153.0.4234.48** (the "older runtime", H7-e) |
| rustc | 1.98.1, host/target `x86_64-pc-windows-msvc`, static CRT, MSVC 14.44 | same (`rustc -vV` in `evidence/ci-run*/environment.json`) |
| Node | 24.18.0 | 22.x |
| Local installer SHA-256 (0.1.0, schema 1) | `9e46409f…c09f20` (variant builds: 0.2.0 `466f0ef4…`, 0.3.0 failmig `4107f375…`) | run 1 `feeb83bd…`, run 2 `4409aea9…` / `8833b318…` (see H1-6) |
| Backup archive SHA-256 (H5 full) | `36848b49…` | — |

Reference browser baseline (H7): Edge 154.0.4258.48 — same Chromium major as the local WebView2.

## 2. Results by hypothesis

### H1 — Packaging, install, launch, offline — CONDITIONAL
| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Installer, no UAC | **PASS** — ran non-elevated, exit 0, `HKCU` uninstall key, nothing in `%ProgramFiles%`/`HKLM` (also on elevated CI runner: per-user paths) | `h1-install-all.json` |
| 2 | No TCP listener | **PASS** — 0 listeners across 3 long samplings (80 + 27 + 224 samples @100 ms); only UDP endpoints owned by `msedgewebview2` network service | `h2-app-sockets-*.json`, `ci-run1/sockets_ci.json` |
| 3 | No Python/dev server/visible origin | **PASS** — process tree = `quiz-studio-spike.exe` + `msedgewebview2.exe`; UI shows no address; WebView origin is the internal `http://tauri.localhost` virtual host (no socket) | sockets files |
| 4 | Core flows with network disabled | **CONDITIONAL** — *equivalent* run with all web traffic sent to a dead proxy: h1, h2 (2,500), h4, h7-unicode all succeed, fidelity 4,999/4,999. True adapter-disable needs elevation → §4 | `h1-blackhole-proxy-*.json`; `scripts/h1-elevated.ps1` |
| 5 | No app-initiated outbound payload | **CONDITIONAL** — in-page `fetch`/WebSocket/`<img>` to external hosts all blocked by CSP (4/4 violations). `quiz-studio-spike.exe` itself never opened a non-loopback socket (per-process sampling). The **WebView2 runtime** (`msedgewebview2` browser/network-service) does hold HTTPS connections to Microsoft endpoints on every run (also on the runner) — documented runtime housekeeping per contract, but payload-level proof needs `pktmon` (elevated) | `h1-installed-app-run.json`, sockets files |
| 6 | Reproducible build on runner | **CONDITIONAL → mostly PASS** — clean checkout builds on `windows-latest` twice. Default flags: app exe **not** bit-identical. With `-C link-arg=/Brepro --remap-path-prefix`: **app exe bit-identical across two clean builds** (`bc36b813…`); the NSIS **installer is not** bit-identical (embeds build time) | `ci-run1/build*.json`, `ci-run2/build*.json` |
| 7 | Uninstall keeps data; explicit option deletes | **PASS** — silent `/S` uninstall: program removed, `quiz-studio.db` kept. Interactive uninstaller driven by UI Automation with "Delete the application data" ticked: data dir fully removed. (Silent uninstall has **no** delete flag — delete is checkbox-only.) | `h1-install-all.json`, `h1-install-uninstall-delete.json` |
| 8 | Installed app reports identifier | **PASS** — `io.github.peter-s-shi.quiz-studio`; data root `%LOCALAPPDATA%/<id>`; WebView2 profile created inside it | all `h1*` files |
| 9 | `downloadBootstrapper` on a runtime-less profile | **CONDITIONAL** — generated installer script contains `INSTALLWEBVIEW2MODE "downloadBootstrapper"`, runtime check in HKLM/HKCU, bootstrapper download from the Microsoft fwlink, `/silent`; offline installer not produced. A machine **without** the runtime was not available (runtime present on both environments) | NSIS script inspection (this report) |

### H2 — Store durability, Unit of Work, fidelity, projections — PASS
| Check | Threshold | Measured |
|---|---|---|
| (a) Insert D-Evidence via WebView→command→Rust | — | 2,500 UoW commits through IPC; resulting `stateHash` **identical** to the Rust-side ingest (`97c11736…`) ⇒ JS-supplied projections ≡ Rust-derived |
| (b) Canonical-hash round trip | 100 % | evidence tier 4,999/4,999, awkward fixtures 60/60 (unknown fields, `extensions`, depth-60 trees, order-sensitive arrays, astral keys, control chars) — **cross-implementation** JS hash == Rust hash == DB hash. Rust-only: `12345678901234567890`, `0.10000000000000000555` preserved (stored bytes identical to input) |
| (b2) Drift probe | 100 % rejected atomically, 0 inconsistent rows | **12/12** rejected, state hash unchanged after each, DB consistent afterwards; **11/11** out-of-band projection mutations flagged by the consistency check |
| (c) Crash loop | ≥ 500 kills; quick_check clean; every acked UoW present; no partial | **500 kills (every run had ≥1 commit; 124 acked UoW/run median), 0 failures**, 62,754 acked / 63,161 committed UoW (407 committed-but-unacked, all complete), final `quick_check` ok, consistency 0. Runner re-run: 150 kills, 0 failures |
| (d) FK probes | per spec | **10/10**: orphan review, orphan remediation ref, orphan media ref, delete-parent-with-child rejected; dangling soft provenance accepted; child-before-parent in one UoW accepted (deferred FK) |
| (e) Latency | finalize UoW p95 ≤ 50 ms | `synchronous=FULL`: p95 **4.95 ms** (2.5k DB) / **5.92 ms** (10k DB); in-app incl. IPC p95 4.3–9.3 ms |
| History list | ≤ 150 ms p95 incl. IPC @ 2,500 | **39.2 ms p95** in the packaged app (full 2,500-row list); 10,000-row stress 71.1 ms in-app / 125 ms Rust-only; page-of-50 4.6 ms |

Limitations: kills are process terminations (`taskkill /F`), not power loss; OS-level durability of `synchronous=FULL` is assumed from SQLite, not proven here.

### H3 — Atomic activation and rollback — PASS
- 8 checkpoints × 3 repeats × {merge (populated, 5,000 live), replace (empty)} = **48 runs, 48 killed by the injected fault, 0 violations**: 24 `pre`, 24 `post`, 0 other; every run: `quick_check` ok, consistency 0, journal resolved deterministically at next launch (`not committed` / `committed`).
- Pre-commit kills (before-snapshot, after-snapshot, mid-copy, before-commit) → exactly pre; after-commit / journal-done / during-rollback / during-media-gc → exactly post; the interrupted rollback, re-run through the same primitive, restored **exact pre-state** 6/6.
- Staging: 10,000 responses + 9,999 reviews. Commit 346–524 ms; **peak working set ≤ 15.9 MiB** (limit 512). Staging file SHA-256 unchanged by activation (writes only to `main`); a concurrent reader (≈162 k / 205 k polls) saw **only** the pre or post snapshot, never a mixture.
- Needed: staging DBs must be `journal_mode=DELETE` (read-only `ATTACH` of a WAL-mode file needs `-shm`). The generation-swap fallback was **not** needed.

### H4 — Media layout and scale — PASS
- ≈400 MiB V1-shaped base64 envelope (140 assets, 314 MiB raw, largest 50 MiB, CJK/emoji/long names, one duplicate pair): **140/140 byte-identical to the generator's source hashes, IDs preserved, duplicate deduped (139 distinct files)**.
- Peak RSS: **136 MiB** (CLI) / **203–214 MiB** inside the packaged app (limit 300). WebView JS heap after ingest ≈ 1–61 MiB (envelope never enters the WebView).
- WebView: image renders, 60 s WAV loads and **seeks** (45 s, then 10 s) via the asset protocol under the packaged CSP; asset URL for a file outside the media scope and a `..` traversal both return **403**.
- Faults: 5/5 kills mid-write leave **no corrupt final file** (only a discardable temp, removed by GC); a 400 ms exclusive handle on the temp file (AV-scanner stand-in) is survived by a rename-retry (**fix made during the spike** — first version had none).
- **Finding:** SQLite cannot open a plain path > MAX_PATH (344-char root) — media I/O via Rust `std` works (423-char media path), SQLite works with the verbatim `\\?\` form. The fixed data root is short, but Store open now canonicalizes long roots.

### H5 — Backup archive and restore — PASS
- Zip container: `manifest.json` (format/schema/app version, counts, per-file SHA-256, logical state hash) + online `VACUUM INTO` snapshot + referenced media (139 files), **created in 0.54 s, 340 MiB, while a writer loop was committing**; peak 10.5 MiB.
- Restore into clean and populated profiles (replace; merge into populated): `manifestStateHashMatches` true; restored DB `quick_check` ok, consistency 0; peak ≤ 12.4 MiB (limit 300).
- Rejection **before activation**, with a specific diagnostic and live data untouched: flipped bytes in DB entry / media entry (`ARCHIVE_ENTRY_CORRUPT`), truncation (`ARCHIVE_UNREADABLE`), dropped media entry (`ARCHIVE_ENTRY_MISSING`), newer schema (`ARCHIVE_NEWER_SCHEMA`), wrong format, altered manifest hash (`ARCHIVE_HASH_MISMATCH`), unlisted entry; **11/11**. A flip in the zip directory tail was either rejected or restored identical content (criterion "reject or identical"). **300/300 random single-bit flips rejected; 0 undetected corruption.**
- Note: the first run of the "tail flip" case was initially judged only as "must reject"; the criterion was refined to also accept a flip that provably yields identical logical content — no threshold changed.

### H6 — Upgrade preservation and schema ownership — PASS
Real NSIS installers of three builds (0.1.0 schema 1; 0.2.0 schema 2 with `ADD COLUMN` + backfill; 0.3.0 schema 2 with an injected failing migration), same identifier:
- **Upgrade:** installer leaves the DB untouched; first launch migrates v1→v2 after an automatic snapshot; payload SHA-256 equal (4,999 records), `summary_len` backfilled (0 NULL), same data directory.
- **Failing migration:** partial effect inside the transaction, then failure → rolled back, state hash verified equal to pre-upgrade, app runs on schema 1 with a clear notice; payload hash equal, `user_version` unchanged, no partial column.
- **Downgrade:** 0.1.0 over a schema-2 DB → `REFUSED: store schema v2 is newer…; no write performed`; DB SHA-256 and mtime unchanged. (A pre-existing `-wal/-shm` from the earlier killed run is present but untouched.)

### H7 — WebView2 fitness — PASS (both contract IMEs match the Edge baseline; Sogou compatibility caveat)
- (b) **Unicode:** 34 fixtures (ZWJ, flags, keycap, tag sequence, Hangul jamo, Devanagari conjuncts incl. Unicode 15.1 GB9c, Thai, Arabic/Hebrew marks, CJK astral…): **34/34** in the packaged app (also on runtime 153 on the runner) and in Edge 154. NFC/NFD lengths recorded.
- (c) **Long text:** 20,000-character passage, 20,000 programmatic caret steps: active position not visible **0**, layout jumps **0** (max scroll step 30 px = 1 line), input blur events **0**; identical to the Edge baseline (0 / 0, max 30 px). At 100/150/200 % (emulated) 0/0/0.
- (d) **Resize/fullscreen:** 200 cycles (160 resizes + 40 fullscreen toggles) at 3 scale factors: **0 state breaks, 0 errors, 0 focus loss**; Edge baseline same. *Limitation:* DPI is emulated with `--force-device-scale-factor` (WebView2 args), not by changing the OS display scale.
- (e) Second runtime version: 153 (runner) vs 154 (local) — Unicode + app flows identical; resize/long-text were not run on the runner.
- (a) **IME.** Method: 20 synthetic phrases per run, hands-off keystroke injection into the packaged app's textarea, log of `compositionstart/update/end` and `input`; same keystrokes into the same page in Edge 154 as control.
  - **Microsoft Pinyin (the contract's IME; activated via TSF for the session, user's IME restored afterwards): packaged app, 3 runs - 20 starts / 137 updates / 20 ends each, 0 premature-commit events, 0 order violations, committed text equals the textarea value, 0 blur events. Edge control: 20 / 136 / 20.** Criterion met; behaviour matches the baseline. Evidence: `evidence/h7-ime-mspinyin-app-run{1,2,3}.json`, `evidence/h7-ime-mspinyin-edge-control.json`. (Textarea length 41 in the app vs 40 in Edge: one-character difference in the final converted text, not investigated; it does not affect the composition-event criteria.)
  - **Sogou Pinyin (the Product Owner's own third-party IME, tested first by mistake):** Edge control composes normally (20/134/20) but the **packaged app emitted 0 composition events in 3/3 runs** (text inserted whole as non-composing `insertText`; final text correct). Because Microsoft Pinyin behaves correctly in the same app and engine, this is attributed to Sogou's text-service behaviour in the windowed WebView2 host, not to a WebView2/Tauri defect. It is nevertheless a **real product risk**: the owner's daily IME will not produce composition events in the packaged app, which matters for the Typing feature (anything that relies on `compositionend` to mean 'committed'). Evidence: `evidence/h7-ime-sogou-app-run3.json` (run 3 of 3; runs 1-2 gave the same zero counts, files overwritten), `evidence/h7-ime-sogou-edge-control.json`.
  - **Microsoft Japanese IME (hiragana, Space converts, Enter commits; IME switched on with VK_KANJI because it starts in direct-input mode — a first attempt without it typed raw Latin and is not valid evidence): packaged app, 3 runs - 20 starts / 170 updates / 20 ends each, 0 premature commits, 0 order violations, committed text equals the textarea value (45 chars), 0 blur events. Edge control: 20 / 170 / 20, 45 chars.** Identical. Evidence: `evidence/h7-ime-ja-app-run{1,2,3}.json`, `evidence/h7-ime-ja-edge-control.json`.
  - Scripts: `scripts/h7-set-tip.ps1`, `scripts/h7-ime.ps1`, `scripts/h7-ime-edge.mjs`, `scripts/h7-ime-sendkeys.ps1`. The Electron re-run is **not** triggered by this evidence.

### H8 — Process model, native file flows, path hazards — CONDITIONAL
- **Single instance:** second launch exited in **39 ms** (code 0), first instance stayed alive; a raw store open from another process while the app runs → `LOCKED` (exclusive lock file); opens normally after exit.
- **Streaming:** 1 GiB file generated and copied by Rust off the UI thread with progress events; SHA-256 identical; WebView frame-gap probe **max 4.7 ms** (limit 100 ms; caveat: probe measured rAF gaps in an automated, possibly unfocused window).
- **Paths:** 333-char destination path round-trips (Rust `std`); data root is under `%LOCALAPPDATA%`, not under OneDrive (`dataRootInsideOneDrive:false`). Native **Save** dialog, driven through Win32/UIA, wrote the file for the plain and CJK-folder cases. The **Open** dialog automation and the OneDrive-redirected Desktop/Documents cases were not completed (dialog automation proved fragile; no harness defect found); **drag-and-drop** cannot be automated here. → §4.
- Process tree and permissions: capability set is `core:default` + dialog open/save only (no fs/shell plugin).

## 3. ADR amendments forced by evidence
| # | Amendment | Forced by |
|---|---|---|
| A1 | §10/H1 wording: "no app-initiated outbound" is measured **per process**; the evergreen WebView2 runtime makes its own HTTPS connections, so the acceptance test is *CSP blocks content egress + app process has none + (elevated) packet capture shows no app payload*, not "zero packets in the tree" | H1-5 |
| A2 | §10 toolchain: release build uses `-C target-feature=+crt-static -C link-arg=/Brepro --remap-path-prefix`; reproducibility is claimed for the **app binary**; the NSIS installer is not bit-reproducible | H1-6 |
| A3 | §5.1: uninstall "delete data" exists only as an interactive checkbox (silent uninstall always keeps data); a CLI delete flag, if wanted, is a product decision | H1-7 |
| A4 | §5.3: numbers outside the JS safe-integer range must be carried as strings in payloads (JS loses precision before Rust sees them; Rust-side is lossless) | H2-b |
| A5 | §5.2: Store Port DB constraints are `DEFERRABLE INITIALLY DEFERRED` so a UoW's order is irrelevant; projections are validated by Rust against an extractor, and a periodic `check_consistency` is part of startup/diagnostics | H2-b2/d |
| A6 | §5.4: media publish uses temp → fsync → atomic rename **with retry** for transient sharing violations; GC only removes temps/unreferenced files | H4 |
| A7 | §5.1/§6: SQLite must be opened through the verbatim `\\?\` form for paths > MAX_PATH; staging DBs are `journal_mode=DELETE` | H4, H3 |
| A8 | §8: archive = zip container, per-file SHA-256 manifest, restore verifies everything before the activation primitive; add `format/schema` refusal codes | H5 |

None of these changes the runtime, store, activation or backup decisions; the Electron fallback and the generation-swap fallback were not exercised.

## 4. Product Owner / elevated actions still required (the only reason H1/H8 are CONDITIONAL)
1. **IME (H7-a): DONE** - Microsoft Pinyin and Microsoft Japanese IME both pass (3/3 each). Open decision only: whether third-party IMEs such as Sogou Pinyin must be supported for Typing (§5).
2. **Elevated PowerShell (H1-4/5): WAIVED by the Product Owner, not executed.** `scripts/h1-elevated.ps1` (pktmon + adapters disabled) failed three times on environment issues (pktmon stderr, wrong account's `%LOCALAPPDATA%`, exe path) and was judged unnecessary: the per-process socket sampling (app process: 0 listeners, 0 outbound) and the dead-proxy run already cover the same claim, so the result is *weaker corroboration*, not a different verdict. Residual gap: no packet-level capture and no true adapter-disabled run.
3. **Clean profile without WebView2 (H1-9):** run the installer on a machine/VM lacking the runtime (Windows Sandbox/VM) and confirm the bootstrapper download then launch.
4. **Drag-and-drop + OneDrive-redirected dialogs (H8):** drop a ≥ 1 GiB file on the harness window, and Save/Open once via Desktop/Documents.
5. Optionally a **fresh standard user** account install (not creatable here without admin).

## 5. Open risks
- IME (R-1): Microsoft Pinyin and Microsoft Japanese IME measured and match Edge. **Sogou Pinyin (third-party) produces no composition events in the packaged app** - Typing requirements must be validated against third-party IMEs before relying on `compositionend`. Tests injected keystrokes (SendKeys), not a human typing. The §5 Electron re-run is not triggered.
- WebView2 evergreen variance beyond 153/154; resize/long-text on the older runtime not run.
- OneDrive sync of large user-chosen export targets (not the data root) — out of the data root by design.
- SQLite `synchronous=FULL` power-loss durability relies on hardware honoring flush.
- Single global lock file + single connection: any future background worker must go through the Rust owner (design note, not a failure).
- Installer not reproducible; code signing / SmartScreen unaddressed (non-goal here).

## 6. Proposed first V2-branch commit (Scope §24)
`v2` branch from `main`, then one commit containing only: Cargo workspace skeleton (`core/store`, `core/activation`, `core/media`, `core/archive` re-implemented cleanly from the spike's contracts, **not** copied wholesale), Tauri 2 shell with the A1–A8 amendments applied, a `windows-latest` CI job (build with the A2 flags, install silently, smoke), `docs/adr/0001` status → `accepted` with amendments, and the H2/H3/H5 fault-injection scripts promoted to a test suite. No V1 migration, no domain tables, no product UI in that commit.

## 7. Repro
`README.md`; datasets are generated (`scripts/gen-*.mjs`, `spikectl gen-media`); headless H2–H5: `scripts/run-core-evidence.ps1`; H6: `scripts/build-variants.ps1` then `scripts/h6-upgrade.ps1`; H1: `scripts/h1-install.ps1`; app scenarios: `scripts/run-app.ps1`; baseline: `scripts/baseline-browser.mjs`; CI: `.github/workflows/spike-desktop-runtime.yml`.
