---
status: executed - Desktop Architecture Gate PASSED, GO WITH AMENDMENT (2026-10-02); H8 cancelled/reclassified by Human Gate (see §9)
companion-of: docs/adr/0001-desktop-runtime-and-application-data.md
gates: Desktop Architecture Gate
---

# ADR 0001 Appendix — Bounded Desktop Spike Contract

**Purpose.** Convert the high-risk assumptions of ADR 0001 into a small number of falsifiable experiments, with PASS/FAIL criteria agreed **before** any spike code is written, and define the evidence the **Desktop Architecture Gate** will accept. This contract does not authorize Desktop Foundation work or a V2 development branch.

## 1. Rules of the spike

1. **Disposable.** Work happens on a throwaway branch `spike/desktop-runtime` cut from `main`, under `spike/desktop-runtime/`. The spike branch is **never merged**. Anything worth keeping is re-implemented later on the V2 development branch through the normal protocol.
2. **No product scope.** Not built: V1 migration reader, Scheduling/Calendar/Typing tables, V2 UI, recommendations, signing, auto-update, macOS. UI is a bare test-harness page only.
3. **Synthetic data only.** No real user backups, no real media. Fixtures are generated (reuse `scripts/lib/history-performance-fixtures.mjs` for evidence-shaped data). Committed logs/reports contain **no** absolute local paths, usernames, or machine names (placeholders only).
4. **Time-box.** At most **three focused sessions**. If H1 or H2 is still failing at the end of session two, stop and report instead of widening the spike.
5. **One variable at a time.** Each hypothesis has its own harness and its own result row; failures are recorded, not hidden by retries. Flaky results must be reported with their rate.
6. **Pre-declared fallback.** If the Tauri path fails H1 or H7 (below), the *only* approved remedy is the limited **Electron re-run** in §5; no third runtime is evaluated inside this spike.

## 2. Test environments (and their limits)

| Env | Purpose | Limit to record |
|---|---|---|
| Dev machine, **fresh standard user profile** | clean install/uninstall, offline run, OneDrive-redirected paths | Windows 11 **Home**: no Windows Sandbox / Hyper-V, so the profile is not a pristine OS image |
| **GitHub-hosted `windows-latest` runner** | pristine-image install, reproducible MSVC build | no GUI/IME; cannot prove offline UX |
| Reference browser (Edge/Chrome) | baseline for H7 harness | not a product target |

Record in the report: OS build, WebView2 runtime version(s), `rustc -vV` (target must be `x86_64-pc-windows-msvc`), Node version, installer SHA-256.

## 3. Datasets

- **D-Evidence:** the 2,500-response tier (≈7.8 MiB serialized) and a 10,000-response stress tier from the existing fixture generator.
- **D-Media:** synthetic image/audio blobs totaling **≈300 MB** (mix of sizes, largest ≈50 MB) plus one duplicate-content pair; wrapped, for H4/H5, in a V1-shaped JSON backup with **base64 media** (≈400 MB file) to reproduce the V1 envelope's scaling.
- **D-Unicode:** ≥30 grapheme fixtures (ZWJ sequences, flags, combining marks, Hangul jamo, Indic conjuncts, CJK + Latin mixes) with expected grapheme counts.

## 4. Hypotheses, methods, and criteria

Each row: **A** assumption · **M** method · **PASS** · **FAIL / consequence**.

### H1 — Packaging, install, launch, offline
- **A:** A Tauri 2 build produced by a reproducible **MSVC/static-CRT** pipeline installs per-user without elevation, launches without Python or a user-visible localhost workflow, and the core runs offline.
- **M:** Build on the Windows runner and locally; install the NSIS package into a fresh standard profile; launch; inspect process tree and sockets (`Get-NetTCPConnection` by owning PID tree); run the harness with the network adapter disabled; capture traffic with `pktmon` filtered to the app process tree; uninstall; check leftovers; confirm installer identifier/AUMID.
- **PASS:** (1) Installer runs with no UAC prompt. (2) No TCP listener opened by the app or its children. (3) No Python, no dev server, no visible address/origin in the UI. (4) Core flows work with the network disabled. (5) No app-initiated outbound payload (WebView2 runtime's own housekeeping is documented, not counted). (6) Build is reproducible on the runner from a clean checkout. (7) Uninstall removes program files and **keeps** the data directory by default; the explicit "also delete my data" option removes it. (8) The installed app reports identifier **`io.github.peter-s-shi.quiz-studio`**. (9) On a profile **without** the WebView2 runtime, the **`downloadBootstrapper`** path installs it and the app then runs; `offlineInstaller` is **not** part of the default package and is not required to PASS.
- **FAIL / consequence:** elevation required, listener present, non-reproducible build, or data lost on uninstall ⇒ Tauri path **FAIL** → §5 Electron re-run.

### H2 — Store durability, Unit of Work, lossless fidelity, projection integrity
- **A:** Rust-owned SQLite (WAL, FK on) gives atomic multi-record Units of Work, survives forced termination, and round-trips native JSON payloads with **lossless structured-JSON fidelity** (unknown fields, values, nesting, array order); hard relationships are enforced below JS through **projections** (indexed columns / relationship rows) that stay consistent with the payload.
- **M:** (a) Insert D-Evidence through the Store Port (WebView → command → Rust). (b) Round-trip: compute a **canonical/deterministic hash** (stable key order, fixed number/string encoding) of every payload before/after and compare; include records with unknown fields, `extensions`, deep nesting, and order-sensitive arrays. (b2) **Payload/projection drift probe:** attempt Units of Work in which a payload and its projection disagree (e.g. payload says `responseId = A`, projection says `B`; relationship rows missing or extra; payload changed without its projection) — every one must be rejected as a whole; also mutate a projection out-of-band and confirm a consistency check detects it. (c) Crash loop: ≥**500** forced kills (`taskkill /F`) at random points during a loop of multi-record Units of Work with acked commits logged out-of-band. (d) FK probes (on the minimal throwaway tables the spike needs; **not** a proposed domain schema): orphan Teacher Review, orphan live remediation reference, orphan media reference must be rejected; dangling soft provenance must be accepted. (e) Measure `synchronous=FULL` commit latency and History list/derivation queries at 2,500 and 10,000 responses.
- **PASS:** canonical-hash equality 100% (including unknown fields, nesting, array order); drift probe: **100% of inconsistent Units of Work rejected atomically, 0 inconsistent rows ever committed**, and the consistency check flags 100% of out-of-band projection mutations; after every kill, `quick_check` is clean, **every acked Unit of Work is fully present, no partial Unit of Work exists**; FK probes behave as specified; finalize-style Unit of Work (one Learner Response of 20 items + 3 other rows) commits at **p95 ≤ 50 ms**; History list at 2,500 responses **≤150 ms p95 end-to-end including IPC** (budget inherited from `docs/m7-2-history-performance.md`).
- **FAIL / consequence:** any corruption or partial unit ⇒ **blocker** (investigate config; if unresolved, store choice NO-GO). Latency misses ⇒ record, adjust `synchronous`/batching, re-test once; still failing ⇒ CONDITIONAL with a stated mitigation.

### H3 — Atomic activation and rollback (the central migration/restore enabler)
- **A:** A staging DB file can be fully validated in isolation and applied to the live DB in **one transaction** (merge and replace modes); a crash at any point leaves the live DB wholly pre- or wholly post-activation; rollback via a pre-activation snapshot works through the same primitive.
- **M:** Build a staging DB (D-Evidence + metadata) and an `ATTACH`-based activation. Inject kill points at ≥**8** defined checkpoints (before snapshot, after snapshot, mid-copy, just before/after commit, after journal write, during rollback, during media GC) × 3 repeats × both modes. Verify via the operation journal on restart. Run at the 10,000-response size. Test a populated live DB (merge) and an empty one (replace). Explicitly test that WAL + `ATTACH` writes only to `main`.
- **PASS:** after every kill, DB state ∈ {exactly pre, exactly post}; journal resolves deterministically at next launch; rollback restores exact pre-state (payload-hash equal); activation at 10,000 responses completes in a documented time with **peak memory ≤ 512 MB** for the Rust process; no staging data visible to the app before commit.
- **FAIL / consequence:** any observable intermediate state ⇒ switch to the **generation-directory swap** fallback (ADR §6), re-run H3 once against it. If both fail ⇒ store/activation design **NO-GO**; Gate escalates.

### H4 — Media layout and scale
- **A:** Content-addressed immutable files + stable media IDs preserve identity and bytes, stream large data without holding it in the WebView heap, and work with the asset protocol under the packaged CSP.
- **M:** Ingest D-Media from the ≈400 MB base64-in-JSON backup by **streaming** decode+hash in Rust; map V1-style IDs (`img-…`, `aud-…`) to hashes; verify byte identity by re-hash; confirm dedupe; play audio (seek) and render images through the restricted asset protocol; crash during write must leave only complete files or discardable temps; test Unicode/long (>260) names and AV-scanner-delayed renames.
- **PASS:** 100% byte-identical; IDs preserved; temp-file crashes leave no corrupt final file; **peak Rust RSS ≤ 300 MB** while ingesting the ≈400 MB envelope; WebView heap never holds the whole envelope; audio seeks and images render under CSP; no raw path escapes the media scope.
- **FAIL / consequence:** memory/identity failure ⇒ redesign ingestion (e.g., chunked intake) before Gate; identity failure ⇒ **blocker**.

### H5 — Backup archive and restore
- **A:** A streamed archive (manifest + consistent online DB snapshot + referenced media) can be created while the app is writing, verified, and restored through the H3 primitive; corruption is detected and fails closed.
- **M:** Create archives from D-Evidence + D-Media while a writer loop runs; restore into a clean profile and into a populated one; mutate archives (flip one byte in DB/media/manifest; truncate; drop a media entry; wrong `storeSchemaVersion`).
- **PASS:** restored DB passes `quick_check` and equals the snapshot's logical content (canonical payload hashes); every mutation rejected **before** activation with a specific diagnostic; archive creation/restore memory stays bounded (**≤ 300 MB** Rust RSS); a restore that fails leaves the live data untouched.
- **FAIL / consequence:** any undetected corruption ⇒ **blocker** for the archive format; fix manifest/verification and re-run.

### H6 — Upgrade preservation and schema ownership
- **A:** A same-identifier installer upgrade preserves data; a forward-only store migration runs transactionally after an automatic snapshot; a newer-schema DB is refused by an older build.
- **M:** Build spike v1 → create data → install spike v2 whose migration adds a column and backfills; separately inject a failing migration; install v1 over a v2 DB (downgrade).
- **PASS:** upgrade keeps every record (payload-hash equal); failing migration auto-restores the snapshot and the app opens on the old schema with a clear message; downgrade is **refused with a diagnostic and no write**; no change to the data directory identity.
- **FAIL / consequence:** data loss or silent downgrade writes ⇒ **blocker**.

### H7 — WebView2 fitness for frozen UX requirements
- **A:** The evergreen WebView2 runtime meets Scope §12.7/§12.6/§13 well enough that the runtime need not be pinned.
- **M:** A harness page (no product UI) in the packaged app: (a) **IME**: Microsoft Pinyin (zh-CN) and Microsoft Japanese IME — scripted-assisted manual runs of ≥20 phrases each, logging `compositionstart/update/end` and asserting that only `compositionend` text is treated as committed; (b) **Unicode**: D-Unicode via `Intl.Segmenter` grapheme counts vs expected, and normalization behavior; (c) **long-text following**: a ≈20,000-character passage with a programmatically driven caret; verify the active line stays visible, no layout jump, no caret/focus loss; (d) **resize/fullscreen/DPI**: 200 resize + fullscreen toggles during an active session (100/150/200% DPI) with state intact; (e) compare (a)–(d) against the reference browser baseline, and re-run on a **second, older WebView2 runtime version** if obtainable (evergreen variance), otherwise document as a limitation.
- **PASS:** zero premature-commit events in IME runs; grapheme counts match all fixtures (or differ identically from the baseline with a documented ICU cause); active position always visible; **0** focus-loss events; session state intact after all resizes; results identical to the baseline browser on the same engine major.
- **FAIL / consequence:** IME or focus/caret defects attributable to WebView2/Tauri ⇒ Tauri **FAIL** for the product's Typing requirement → §5 Electron re-run (H7 + H1 + H4 only).

### H8 — Process model, native file flows, path hazards
> **AMENDED BY HUMAN GATE (2026-10-02): CANCELLED / RECLASSIFIED — no longer an independent Desktop Architecture Gate hypothesis. The original definition below is preserved unchanged as the historical record; see §9.**

- **A:** Single-instance + single-writer hold; native dialogs and drag-drop stream large files without blocking the UI; OneDrive-redirected and Unicode/long paths are safe.
- **M:** Launch twice (second must focus the first and must not open the DB); attempt a second raw DB open from another process; save/open a **1 GB** file via native dialogs and drag-drop with a frame-time probe in the WebView; save/open via OneDrive-redirected Desktop/Documents, CJK folder names, and a >260-char path (long-path-aware manifest); confirm the data root is **not** under any redirected/synced folder.
- **PASS:** second instance never opens the DB and activates the first window; main-thread stall **≤100 ms** during streaming (progress UI stays responsive); all path cases round-trip; data root is under `%LOCALAPPDATA%`.
- **FAIL / consequence:** UI stalls or data-root leakage ⇒ fix design (streaming, scoping) and re-run; not a runtime NO-GO unless caused by the runtime itself.

## 5. Fallback: limited Electron re-run (only on H1 or H7 FAIL)
Re-run **H1 (packaging/install/offline), H4 (media), H7 (WebView/Chromium fitness)** on Electron hosting the same Store Port (Node main process; SQLite via a native binding or the platform's embedded SQLite — selection itself is part of the re-run), and report the delta. No other hypotheses are repeated; if Electron also fails H1 or H7, the Gate escalates instead of evaluating a third runtime.

## 6. Evidence the Desktop Architecture Gate requires

The spike report (`spike/desktop-runtime/REPORT.md` on the disposable spike branch, promoted to `docs/adr/evidence/0001-desktop-spike-report.md`; plus raw logs/scripts on that branch, **synthetic data only, no absolute local paths**) must contain:
1. **Environment manifest** (§2) and installer/archive SHA-256s.
2. **Result table** — H1…H8: PASS / CONDITIONAL / FAIL, with raw logs, run counts, flake rates, and measured numbers against each threshold.
3. **Repro scripts** for the crash loops, fault injection, memory measurements, and datasets (generators, not data).
4. **Recordings/screens** for IME and long-text runs (synthetic text only).
5. **Open risks list** and any **ADR amendments** the evidence demands (each amendment must name the hypothesis that forced it).
6. **Recommendation** and the proposed contents of the first V2-branch commit (the "first real V2 repository modification" required by Scope §24).

## 7. Gate outcomes

| Outcome | Condition | Effect |
|---|---|---|
| **GO** | H1–H8 PASS (or CONDITIONAL with accepted mitigations); ADR 0001 → `accepted` | V2 development branch may be created; Desktop Foundation starts |
| **GO with amendment** | Passes require ADR text changes (e.g. generation-swap activation, different `synchronous` setting) | Amend ADR first, then GO |
| **FALLBACK** | H1 or H7 FAIL on Tauri, Electron re-run passes | ADR runtime section superseded; Store Port unchanged; then GO |
| **NO-GO** | H2/H3 unresolvable, or both runtimes fail H1/H7 | Return to architecture; no V2 branch |

## 8. Explicit non-goals
V1 migration logic, recommendation/scheduler/Calendar data models, Typing evidence tables, any production UI, code signing, auto-update, macOS, performance beyond the stated budgets, and any change to the existing V1 application, tests, or CI.

## 9. Governance amendment log

### Amendment 1 — H8 cancelled / reclassified by Human Gate (2026-10-02)
- **Decision:** H8 is **CANCELLED / RECLASSIFIED BY HUMAN GATE**. It is no longer an independent hypothesis of the Desktop Architecture Gate and does not block it. It is **not** recorded as PASS, and the §4 H8 text, the tests already run and their evidence stay in place as historical audit record.
- **Rationale:** the H8 properties that carry architecture-decision value — single-instance, single-writer/exclusive lock, large-file streaming without UI stalls, UI responsiveness, long-path support, and the `%LOCALAPPDATA%` data root — were verified (see `docs/adr/evidence/0001-desktop-spike-report.md`, H8 section). The remaining items (native **Open** dialog, OS **drag-and-drop**, **OneDrive-redirected Desktop/Documents** file flows) are packaged-app manual acceptance. They cannot change the Tauri + Rust durability boundary + SQLite architecture choice, so they are not Gate-blocking.
- **Deferred to Desktop Foundation Acceptance (not deleted, not waived):** (1) native Open dialog round-trip; (2) OS drag-and-drop of a >= 1 GiB file with the UI responsive; (3) Save/Open through OneDrive-redirected Desktop and Documents.
- **Effect on §7:** the GO condition "H1-H8 PASS (or CONDITIONAL with accepted mitigations)" is evaluated over H1-H7; H8 is excluded by this amendment.

### Amendment 2 — Desktop Architecture Gate outcome and H1 acceptance (2026-10-02)
- **Outcome:** **PASS - GO WITH AMENDMENT** (§7). H2-H7 PASS; **H1 CONDITIONAL, accepted by the Human Gate**; H8 excluded by Amendment 1. ADR 0001 is `accepted` with amendments A1-A8 folded in. Evidence: `docs/adr/evidence/0001-desktop-spike-report.md` (spike branch final HEAD `a79cea5c29d10f88c0a7f09c8a265a76dca17d23`).
- **H1 residual limitations accepted (§4 H1 criteria 4, 5, 9):** `downloadBootstrapper` on a runtime-less machine is deferred to Desktop Foundation / package acceptance; the adapter-disabled + `pktmon` run was not executed, and the dead-proxy run, CSP blocks and process-level socket evidence are accepted as sufficient for the Gate.
- **H7 carry-forward constraint:** Microsoft Pinyin and Microsoft Japanese IME passed. Sogou Pinyin (third-party) emits no composition events in the packaged app; future Typing must not rely on `compositionend` as the only committed-text path and must accept non-composing committed input / `insertText`. This does not reopen the runtime decision.

