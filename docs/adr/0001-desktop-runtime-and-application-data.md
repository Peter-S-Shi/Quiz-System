---
status: ACCEPTED (Desktop Architecture Gate PASSED - GO WITH AMENDMENT, 2026-10-02)
decision-date: 2026-10-01
accepted: 2026-10-02
amended: 2026-10-01 (Human Gate: GO WITH AMENDMENT); 2026-10-02 (Desktop Architecture Gate: amendments A1-A8 absorbed)
gates: Desktop Foundation (V2)
depends-on: V2_PRODUCT_SCOPE_FREEZE.md (Revision 1), docs/V2_MIGRATION_READINESS_INVENTORY.md
companion: docs/adr/0001-appendix-desktop-spike-contract.md
evidence: docs/adr/evidence/0001-desktop-spike-report.md
---

# ADR 0001 — Desktop Runtime & Application Data Architecture

**Status:** **ACCEPTED.** The bounded spike defined in the companion contract was executed on a disposable branch and the **Desktop Architecture Gate passed - GO WITH AMENDMENT** (Product Owner, 2026-10-02). Evidence: [`evidence/0001-desktop-spike-report.md`](evidence/0001-desktop-spike-report.md) (spike branch final HEAD `a79cea5c29d10f88c0a7f09c8a265a76dca17d23`; the branch is never merged). The amendments the evidence forced (A1-A8) are folded into sections 5-10 and listed in section 14. The Electron fallback was **not** triggered. Acceptance of this ADR does **not** create a V2 development branch or start Desktop Foundation by itself; those are the next, separately-started steps (Scope Freeze section 24).

## 1. Decision summary

| Area | Decision (accepted) | Spike result |
|---|---|---|
| Runtime | **Tauri 2 on Windows (WebView2)**, web-technology UI; **Electron was the pre-declared fallback and was not triggered** | H1 accepted with residual limitations; H7 PASS |
| Where logic lives | **Rust owns the durability boundary; JS/TS owns domain semantics.** WebView never touches SQL or the file system directly | H2 PASS |
| Structured store | **One SQLite database** (WAL), single-writer owned by the Rust process | H2, H3 PASS |
| Record fidelity | Native evidence-bearing records stored as a **lossless structured-JSON payload** in typed tables, with extracted index columns / relationship rows; payload and projections are written in the **same Unit of Work** | H2 PASS |
| Media | **Immutable, content-addressed files** on disk (**byte-for-byte**); stable media IDs map to content hashes in the DB | H4 PASS |
| Atomicity | **Unit of Work = one SQLite transaction**; media written *before* the commit point; no multi-call transactions | H2, H3 PASS |
| Activation | **One activation primitive** (staging DB → validated → single-transaction activation → rollback snapshot) shared by V1 migration, backup restore, and schema upgrade | H3, H5, H6 PASS |
| Schema ownership | Rust owns **store schema** (`user_version`, forward-only, auto-snapshot, downgrade-refusing); JS domain owns **document-contract versions** inside payloads | H6 PASS |
| Backup boundary | **V2 archive** (manifest + consistent DB snapshot + referenced media), streamed; V1 JSON backup is **import-only** legacy | H5 PASS |
| Packaging | **Per-user NSIS installer**, no elevation, permanent app identifier **`io.github.peter-s-shi.quiz-studio`**, WebView2 **Evergreen + `downloadBootstrapper`**, data under `%LOCALAPPDATA%`, user data **kept on uninstall by default** with an explicit delete option | H1 accepted with residual limitations |

## 2. Context and constraints

### 2.1 Requirements this ADR derives from (frozen)
Scope Freeze §5.1: formal installer, stable identity/icon/version, independent launch, **no Python, no user-facing localhost, no browser-origin dependency for canonical data**, offline core, per-user app-data, durable structured data and media, native file flows, import/export, complete backup/restore, abnormal-exit resilience, session recovery, upgrade preservation, normal uninstall. §5.2: V1 migration is a release gate (isolated staging, atomic activation). §5.3: technology is **not** product scope. §12.7: IME/grapheme correctness. §13: Focused Practice (reduced chrome, fullscreen/resize safe). §23: Desktop and Migration release gates.

### 2.2 Facts established from the repository and machine (evidence, not assumption)
- **V1 domain core is pure ES-module JavaScript** (`src/core/*.js`, ~4k lines, no build step, 292 passing Node tests: `npm test`). V1 persistence is browser `localStorage` + IndexedDB, bound to origin `http://localhost:8000` (`docs/DEVELOPER_GUIDE.md`, `scripts/dev-server.py`).
- V1 backup coupling that V2 must not inherit: non-atomic restore, media as base64 inside one JSON, no checksum (Inventory §5, R-01, R-04, U-2).
- The V2 UI prototype (`docs/design-inputs/Design model/quiz-studio-v2-ui-prototype.html`) is **HTML/CSS/JS**, loads fonts from a CDN (**incompatible with offline core**; fonts must be bundled), and includes persisted sidebar width and a Focused Practice overlay. **UI architecture source (resolved at the Human Gate):** the approved UI architecture is the prototype plus its inspiration report, frozen by `docs/V2_UI_ARCHITECTURE_FREEZE.md`. This ADR uses only what they imply for the runtime (web-technology UI, views, resizable panes, focus overlay, bundled fonts).
- Reference performance fixtures exist: 2,500-response History tier (7.78 MiB serialized), budgets <100 ms derivation / <150 ms list (`docs/m7-2-history-performance.md`, `scripts/lib/history-performance-fixtures.mjs`).
- The maintainer has shipped prior Windows desktop projects on **Tauri 2 + WebView2** (per-user NSIS installer, `%LOCALAPPDATA%` data, SQLite via `rusqlite` bundled in one, IndexedDB-in-WebView in another). Relevant lessons: (a) data held in WebView storage is **bound to the WebView profile/origin**, which Quiz Studio's scope explicitly forbids for canonical data; (b) the authoritative Windows build was **MSVC target with static CRT**; (c) the default NSIS uninstall leaves data in place.
- This machine: Node 24.18, Rust 1.98 with **host `x86_64-pc-windows-gnu`** (not MSVC), WebView2 Runtime 154 installed, `link.exe` on PATH resolves to Git's (a known shadowing hazard). The user's Desktop folder is **OneDrive-redirected** (a realistic file-dialog/path hazard). CI today is `ubuntu-latest` only (`.github/workflows/ci.yml`); a Windows packaged build needs Windows CI later.

### 2.3 What this ADR must not do
It must not select the database *because of* the V1 Migration Readiness Inventory. Migration is only a **feasibility check** (§9): the chosen architecture must make the approved Human Gate decisions D-1…D-15 implementable. The Migration ADR remains separate and not started.

## 3. Candidates considered

### 3.1 Runtime
| | A. **Tauri 2 + WebView2** | B. **Electron** | C. Browser/PWA-in-shell (status quo style) | D. Neutralino / .NET-WebView2 host |
|---|---|---|---|---|
| Meets §5.1 (no localhost, no Python, offline, installer) | Yes | Yes | **No** — origin-bound data, localhost | Yes (D) but thin ecosystem / new toolchain |
| Reuse of V1 JS core and Node tests | Yes (UI side) | **Best** (JS in main + renderer) | Yes | Yes / partial |
| IME & Unicode determinism (§12.7) | Evergreen WebView2 (Chromium) — **version varies per machine** | **Pinned Chromium** | n/a | Same as A |
| Footprint / attack surface | Small installer, narrow command surface | Large (bundled Chromium + Node) | — | Small |
| Single language for data layer | **No** (Rust + JS) | Yes | Yes | No |
| Maintainer-validated toolchain | **Yes** (prior Tauri 2 Windows projects) | No | n/a | No |
| Matches Scope §5.3 "current candidate direction" | **Yes** | Alternative | — | — |

**Recommendation: A (Tauri 2), with B (Electron) as an explicit, pre-agreed fallback.** Rationale: A satisfies every §5.1 item, is the only candidate with validated local experience, keeps the installer small, and its narrow Rust command surface is the natural place for the durability boundary. B is the strongest alternative (one language, pinned engine) and is **not rejected on merit** — it is the contingency if the spike shows WebView2 cannot meet the IME/Unicode/focus requirements (H7) or the MSVC/packaging pipeline is not reproducible (H1). To keep that contingency real, the **Store Port (§5.2) is runtime-neutral**: the same contract can be hosted by a Node main process.
C is rejected: it is exactly the browser-origin dependency §5.1 prohibits. D adds a toolchain with no offsetting benefit over A.

### 3.2 Structured store
| | **A. SQLite (single file, WAL)** | B. JSON files + journal/atomic rename | C. Embedded KV (e.g. LMDB/redb) | D. WebView IndexedDB |
|---|---|---|---|---|
| ACID multi-record Unit of Work | Yes | Hand-rolled | Yes | Per-origin, browser-bound |
| Query needs (History, Due/Overdue, Calendar ranges, Typing attempts) | Native SQL + indexes | Full scans / hand indexes | Hand indexes | Limited |
| Consistent online snapshot for backup/rollback | `VACUUM INTO` / backup API | Copy + locking | Engine-specific | Not controllable |
| Hard integrity (FK) enforceable below JS | Yes | No | No | No |
| Violates §5.1 browser-origin rule | No | No | No | **Yes** |

**Recommendation: SQLite**, via Rust (`rusqlite`, bundled build to avoid a system-SQLite dependency). It is the only candidate that gives atomic multi-record commits, indexed queries for the frozen Scheduling/Calendar/History needs, a controllable consistent snapshot, and database-level foreign keys. B is viable only for tiny data and would re-implement a database. D is excluded by scope.

This choice is justified by **runtime/data-ownership requirements** (§5.1) and the frozen Scheduling/Calendar surfaces — not by migration. A different engine would have to provide the same four properties (ACID Unit of Work, consistent snapshot, indexed range queries, below-JS referential integrity) to be acceptable.

## 4. Process and ownership model

```text
WebView (UI + domain semantics, JS/TS)
   │  typed commands only (Store Port)
   ▼
Rust core  ── sole owner of: SQLite connection, media files, activation, backup, recovery, schema
   │
   ├─ %LOCALAPPDATA%\<app-id>\data\quiz-studio.db  (+ -wal/-shm)
   ├─ …\data\media\<hh>\<sha256>                    (immutable)
   ├─ …\staging\<operation-id>\                      (isolated; disposable)
   ├─ …\snapshots\                                   (pre-activation / pre-upgrade)
   ├─ …\recovery-artifacts\                          (raw/opaque artifacts, byte-for-byte)
   └─ …\logs\
```

- **No SQL and no raw file-system capability in the WebView.** The WebView holds no canonical state; it calls named commands. (Capabilities are scoped to the minimum; the packaged CSP forbids outbound network.)
- **Single instance + single writer.** A second launch focuses the first; the DB additionally takes an exclusive process lock. All writes go through one Rust-owned connection.
- **Domain semantics stay in JS/TS** (schemas, validators, recommendation/scheduler logic, OTI contracts), so V1's tested pure modules can be reused where they still fit, and the Node test suite remains the primary domain test vehicle. Rust enforces only **structural** invariants (identity, uniqueness, foreign keys, immutability triggers where specified).
- **Heavy streaming work** (decoding and hashing large media, building/reading archives) runs in Rust to avoid holding hundreds of MB in the WebView heap; whether this is *necessary* is a spike question (H4/H5), not a presumption.

## 5. Application data design

### 5.1 Data root and identity
- **Location:** `%LOCALAPPDATA%\<app-id>\` (non-roaming; avoids syncing a large DB). SQLite must be opened through the **verbatim `\\?\` path form** whenever the path exceeds `MAX_PATH`, because SQLite cannot open such a plain path (A7). Never inside OneDrive-redirected folders; never relative to the install directory.
- **Application identifier** (reverse-DNS) and Windows AppUserModelID are chosen once and treated as **permanent** after first release; changing them later requires an explicit migration decision (the WebView profile path and installer upgrade identity depend on them). **Decided (Human Gate): `io.github.peter-s-shi.quiz-studio`, permanent.**
- **Uninstall (decided; A3):** remove program files; **keep user data by default**, and provide an **explicit, opt-in "also delete my data" option**. The delete option exists as an **interactive uninstaller checkbox only**; a silent uninstall always keeps data (a CLI delete flag, if ever wanted, is a separate product decision). (Chosen to protect learning evidence per Scope §4.1 and §5.1 "normal uninstall behavior".)

### 5.2 Store Port (runtime-neutral contract)
A deliberately small command surface, not an ORM:
- `read(collection, query)` — indexed reads/projections.
- `commit(unitOfWork)` — **one transaction** containing inserts/updates/deletes across collections, plus declared preconditions (e.g. "record X must not exist", "version = N").
- `activation.*`, `backup.*`, `recovery.*`, `schema.info` — lifecycle commands (§6, §7).
Rules: no multi-call transactions; **a payload and its projections (§5.3) are always written in the same Unit of Work, and the Store Port rejects a Unit of Work whose projections disagree with its payload**; database constraints for hard relationships are **`DEFERRABLE INITIALLY DEFERRED`** so statement order inside a Unit of Work is irrelevant, projections are validated in Rust against an extractor, and a **`check_consistency`** pass (recompute projections, compare) runs at startup/diagnostics (A5); every learner-visible action (e.g. *finalize a practice session* = Learner Response + scheduling updates + clearing the recovery session) is **one** Unit of Work. This directly removes the V1 sequential-`saveJson` pattern (Inventory R-01).

### 5.3 Record representation
- Each **native evidence-bearing record** (library papers/questions, Learner Responses, Teacher Reviews, Translation documents/folders, Typing Attempts, schedules, settings) is stored as a **lossless structured-JSON `payload`** plus a small set of **extracted projections** (indexed columns and, where a relationship is many-valued, **relationship rows**).
- **Fidelity contract (amended).** "Lossless structured JSON fidelity" means: every field, **including unknown fields and `extensions`**, every value, every nesting level, and **array order** survives a round-trip; object-key order is not significant; numbers must not lose precision representable in the source - **numbers outside the JS safe-integer range must be carried as strings in payloads**, because JS loses precision before the Rust side sees them (Rust-side storage is lossless) (A4). It is verified with a **canonical/deterministic hash** (stable key ordering, fixed number/string encoding) computed before and after storage. It is **not** a byte-for-byte guarantee on the JSON text (the store may re-serialize). **Byte-for-byte is required only for raw/opaque artifacts**: media files and preserved foreign artifacts such as the V1 recovery blob (D-4).
- This satisfies Scope §4.3 (**no universal `EvidenceRecord`**; records stay native) and keeps unknown fields intact (Inventory §6.4, D-1, D-15), without forcing a fully normalized schema now.
- **Hard relationships** (Teacher Review→Learner Response, live remediation document→source response/review, document→folder, media reference→media object — Inventory I-1, I-7, I-9, I-11) are enforced by database foreign keys. **Implementation boundary:** any relationship that lives inside a payload and needs database-level enforcement **must be projected** into an indexed column or a relationship row that the FK constrains; an FK cannot reference JSON content. The payload remains the lossless truth, the projection is what the database enforces, and the **Store Port guarantees in one Unit of Work that they agree** (a mismatch is a rejected commit, not a repaired one). **Soft relationships** (provenance that may dangle, history→response — I-8, I-12, I-13) intentionally have **no** FK and **no** enforced projection, so historical evidence can outlive its source, as in V1.
- Engine-derived data (recommendations, priorities) is **not** stored as canonical; scheduling facts are stored separately from evidence (Scope §4.4–§4.5).
- **Which relationships exist as projections, and the full domain table schemas** (including Scheduling/Calendar and Typing) are **out of scope** here; they belong to the domain/Migration/Scheduler ADRs. This ADR fixes only the *rule* above.

### 5.4 Media/file layout
- Media bytes live as **immutable files named by SHA-256**; `media_object(id, contentHash, mimeType, name, size, …)` maps a **stable media ID** (V1 `img-…`/`aud-…` IDs preserved) to content. Files are written to a temp name, fsynced, then atomically renamed **with a bounded retry** for transient sharing violations (e.g. antivirus scanners holding the temp file) (A6); once present they are never modified. GC removes only temp files and zero-reference files.
- Consequence for atomicity: **adding media is always safe and idempotent**, so it happens *before* the DB commit; the DB commit is the sole visibility point. Orphan files after a crash are harmless garbage collected later (only files with zero DB references, after a safety delay).
- Served to the WebView through a **restricted asset protocol** (read-only, scoped to the media directory) so images/audio stream and seek without base64 copies.
- Hash is computed on the decoded bytes (V1 backups carry no hashes — Decision D-2), enabling byte-identity verification (Inventory M-10).

### 5.5 Transactions, durability, recovery
- SQLite `journal_mode=WAL`, `foreign_keys=ON`; `synchronous=FULL` for commits of canonical evidence (final value chosen from spike data H2; never lower than NORMAL).
- **Active-session recovery** is stored in a separate `recovery_session` table, updated per answer in small transactions; it is **recovery-only** (not canonical evidence, excluded from backups), matching V1's classification (Inventory S5/S6).
- **Startup integrity:** `PRAGMA quick_check` + schema/identity check; on failure, offer restore from the newest verified snapshot — never silently reset.
- **Abnormal exit:** committed Units of Work are durable; an interrupted activation or upgrade is resolved deterministically at next launch from an on-disk **operation journal** (complete-forward or roll back; never a half state).

## 6. Activation primitive (isolated staging → atomic activation → rollback)

One mechanism serves three callers, so it is built and verified once:

| Caller | Staging source | Semantics |
|---|---|---|
| V1 migration (future ADR) | Migration builds a **staging DB + media** from a V1 backup | merge or replace, per the Migration ADR |
| Backup restore | Staging DB restored from a V2 archive | replace |
| Schema upgrade | Copy of live DB migrated forward | replace |

Contract:
1. **Isolated staging.** A separate DB file (**`journal_mode=DELETE`**, so a read-only `ATTACH` needs no `-shm`; A7) and media-intake area under `staging\<operation-id>\`; the live DB is never read-write touched. Failure here is deleted wholesale.
2. **Full validation** of the staging set (structure, FK/integrity, media presence + hashes, counts) with an explicit blocking-vs-reportable classification (the Migration ADR defines the migration-specific rules; D-3/D-11/D-12).
3. **Pre-activation snapshot** of the live DB (`VACUUM INTO`) retained for a bounded time/generations — the rollback source.
4. **Commit point = one SQLite transaction on the live connection** that `ATTACH`es the staging DB read-only and applies it (merge by explicit upserts, or replace by delete-then-insert), then records the operation in the journal. Media for referenced objects is already in the content-addressed store. A crash before commit ⇒ no visible change; after commit ⇒ fully applied.
5. **Rollback** = apply the pre-activation snapshot through the *same* primitive (replace mode). A user-visible window (e.g. until next successful launch + N days) is configurable.
Note: SQLite documents that in WAL mode a transaction touching *multiple attached databases* is atomic per database but not as a set. Here only **one** database (main) is written; staging is read-only — so the property holds, but the spike proved it (H3). **Fallback if H3 fails** (not needed - H3 passed 48/48): generation-directory swap guarded by the operation journal.
Preserved raw/opaque artifacts that must not become canonical (e.g. the V1 library-recovery blob, Decision D-4) live in `recovery-artifacts\` as **byte-for-byte files with recorded hashes**, outside the canonical tables, surfaced by the preview.

## 7. Schema and version ownership
Two distinct layers, owned separately:
1. **Store schema** — owned by the Rust core: SQLite `application_id` (file identity) and `user_version`, plus a `meta` table (store schema version, created-by/last-opened-by app version, operation journal). Numbered, **forward-only** migrations, each in a transaction, always preceded by an automatic snapshot (the activation primitive in "schema upgrade" mode). **The app refuses to open a DB with a newer store schema than it understands** and says why (downgrade protection).
2. **Document-contract versions** — owned by the JS/TS domain and the public schemas in `schemas/`: each Learner Response/Teacher Review/Translation document keeps its own `schemaVersion` inside its payload (V1 has no version ladder — Inventory R-13; this layer is where V2 begins one). OTI contracts remain public and AI-independent (Scope §15).
**Failed upgrade (accepted behavior; Product Owner, Desktop Foundation Human Gate).** If a store-schema upgrade fails, the migration transaction is rolled back and the store is verified unchanged (a physical hash comparison; the pre-upgrade snapshot is restored if it is not). The new build then **refuses to run on the old schema** (`UPGRADE_FAILED`, no data lost) - it does not open degraded, because new code must never run against a schema its catalog does not describe. The user's recourse is the previous build, which still opens the unchanged store.
Neither layer may rewrite canonical payloads silently; any transformation must be an explicit, journaled migration with a loss report (Scope §5.2 "no silent discard").

## 8. Backup boundary and native file flows
- **V2 backup = one archive** containing: manifest (`formatVersion`, `storeSchemaVersion`, `appVersion`, counts, per-file SHA-256), a **consistent DB snapshot** taken online (`VACUUM INTO`/backup API, safe while the app is running), and every **referenced** media object. **Streamed** to/from disk (fixes V1's base64-in-one-JSON scaling, Inventory U-2) and **fails closed** on any mismatch (fixes R-04). The container is a **zip** with a `manifest.json` carrying per-file SHA-256, and restore **verifies everything before** invoking the activation primitive, refusing with specific codes (corrupt/missing/unlisted entry, hash mismatch, newer schema, wrong format) (A8). Restore uses the activation primitive.
- **In backup:** canonical records, media, user-authored schedules and settings. **Out of backup:** recovery sessions, caches, logs, window geometry, snapshots, unreferenced media.
- **V1 JSON backup is import-only**, consumed by the future Migration milestone; the V2 app never *writes* the V1 format.
- **Native flows:** OS open/save dialogs and drag-and-drop handled in the Rust core with streaming I/O (no broad file-system capability in the WebView). Portable OTI exports (single JSON documents) stay as they are.
- **Automatic safety snapshots** (before activation/upgrade) are separate from user backups and are not a substitute for them.

## 9. Feasibility check against the Migration Readiness decisions
Not a selection input; a "can it be done here" table.
| Decision | How the architecture makes it implementable |
|---|---|
| D-1 lossless-first reader / D-15 V2-only fields absent | Lossless structured-JSON `payload`; V2-only data lives in its own tables/columns that are simply empty for migrated rows |
| D-2 v1.0.0 backups as-is | Reader is independent of the store; hashes computed at intake |
| D-3 missing media fails closed with diagnostics | Validation stage before the commit point (§6.2); staging is disposable |
| D-4 S3 recovery blob byte-for-byte, reported, not activated | `recovery-artifacts\` as a raw/opaque artifact with hash; excluded from canonical tables |
| D-5 / D-6 / D-7 canonical vs legacy facts, no inference | Legacy S7 facts can be stored as separate, labeled records; absence is representable (NULL/absent payload fields) |
| D-8 / D-9 | Unreferenced media never enters staging; no profile scraping — intake is file-only |
| D-10 missing timestamps stay absent; import time separate | Operational metadata lives in the **operation journal**, not in record timestamps |
| D-11 duplicate ids | Identity uniqueness is DB-enforced; ambiguity surfaces as a blocking validation error at staging, not a silent remap. Cross-paper duplicate question ids are legal because question identity is scoped to its paper |
| D-12 isolated staging → validation → all-or-nothing → rollback-safe | §6 |
| D-13 UTF-16 offsets labeled | Offset encoding is a payload field; store is agnostic |
| D-14 schema detection | Lives in the reader, not the store |

## 10. Packaging implications
- **Installer:** per-user NSIS (no elevation); installer/app upgrade with a stable identifier must preserve `%LOCALAPPDATA%` data (verified in H6).
- **WebView2 runtime (decided):** **Evergreen runtime with the `downloadBootstrapper` install mode** (small installer; the bootstrapper needs network *at install time only, and only on machines lacking the runtime*; Windows 11 normally has it). The **`offlineInstaller` is not a default package**; it may be produced later as a separate, explicitly-labeled variant. Offline *core operation after install* holds either way (H1). **"No app-initiated outbound" is judged per process (A1):** the evergreen WebView2 runtime makes its own HTTPS connections, so acceptance is *CSP blocks content egress + the app process opens no non-loopback socket + no listener*, not "zero packets in the process tree".
- **Toolchain (A2):** release build flags `-C target-feature=+crt-static -C link-arg=/Brepro --remap-path-prefix=<workspace>=/w`; **reproducibility is claimed for the app binary only** (the NSIS installer embeds build time and is not bit-reproducible). Authoritative build **MSVC target, static CRT** on Windows CI (a `windows-latest` job is a new CI requirement); local GNU-host Rust is not the release toolchain. Avoid Git's `link.exe` shadowing.
- **Offline fonts and assets:** all fonts (including CJK serif subsets) and assets bundled; no CDN. Packaged CSP forbids network.
- **Out of scope for this ADR:** code signing, auto-update (network + trust decisions), installer branding, macOS (deferred). No updater is required for Scope §5.1; manual installer upgrade is the baseline.

## 11. Consequences
**Gains:** one durability boundary; atomic Units of Work; one verified activation primitive reused three times; hard integrity enforced below JS; streaming backups with integrity; runtime-neutral Store Port.
**Costs/risks:** two languages (Rust persistence + JS domain); WebView2 engine version varies by machine (IME/Unicode risk; H7 passed for Microsoft Pinyin and Microsoft Japanese IME, but see the Typing constraint in section 14); MSVC/Windows CI pipeline must be built; payload+projection design means **drift between payload and projections must be tested** (H2 drift probe).
**Reversibility:** runtime choice is *moderately* reversible because the Store Port is runtime-neutral; the SQLite-vs-other and payload/projection design choices are the least reversible and are the focus of H2/H3.

## 12. Not decided here (explicitly deferred)
Table schemas for Scheduling/Calendar/Typing; recommendation algorithm; migration intake format and detection rules; UI framework; code signing and release trust; auto-update; macOS; default theme values.

## 13. Human Gate record — GO WITH AMENDMENT (historical: spike authorization, 2026-10-01)

**Outcome:** approved to run the **bounded spike** in the companion contract; the Desktop Architecture Gate is still pending.

**Amendments applied**
1. Canonical-record fidelity restated as **lossless structured-JSON fidelity** verified by a canonical/deterministic hash (§5.3); **byte-for-byte** applies only to media and raw/opaque artifacts (S3 recovery artifact). H2 updated accordingly.
2. **Hard-relationship boundary clarified:** DB-enforced relationships inside payloads must be projected to indexed columns/relationship rows constrained by FKs; the Store Port keeps payload and projections consistent within one Unit of Work (§5.2, §5.3). H2 gains a **payload/projection drift probe**. Full domain table schemas remain undesigned.

**Decisions taken**
| # | Decision |
|---|---|
| 1 | Permanent application identifier: **`io.github.peter-s-shi.quiz-studio`** |
| 2 | WebView2 baseline: **Evergreen + `downloadBootstrapper`**; `offlineInstaller` is **not** the default package |
| 3 | Uninstall **keeps user data by default** and offers an **explicit delete-data option** |
| 4 | **Electron remains the only pre-declared fallback**, and only on **H1/H7 runtime failure** |
| 5 | Gate outcomes unchanged: **GO / GO with amendment / FALLBACK / NO-GO** |
| 6 | UI architecture is frozen by `docs/V2_UI_ARCHITECTURE_FREEZE.md`; this closes the earlier "approved UI Architecture not found" gap noted in §2.2 |

**Still open:** none for the spike. Code signing, auto-update, and the domain table schemas remain deferred (§12).

## 14. Desktop Architecture Gate record - ACCEPTED (GO WITH AMENDMENT, 2026-10-02)

**Outcome:** the Product Owner judged the Desktop Architecture Gate **PASS - GO WITH AMENDMENT**. The accepted architecture is unchanged in kind: **Tauri 2 + WebView2**, **Rust durability boundary**, **SQLite**, **lossless JSON payload + projections**, **content-addressed media**, **unified staging/activation/rollback**, **V2 archive**, and the packaging identity of sections 5.1 and 10. **Electron fallback not triggered; generation-swap fallback not needed.** Evidence: [`evidence/0001-desktop-spike-report.md`](evidence/0001-desktop-spike-report.md).

**Final hypothesis status:** H2-H7 **PASS**; H1 **CONDITIONAL, accepted** (below); H8 **CANCELLED / RECLASSIFIED BY HUMAN GATE** (contract section 9; original definition and results retained as history; not PASS).

**Key measured numbers (synthetic data; thresholds unchanged):** 500/500 forced kills clean; canonical-hash fidelity 4,999/4,999 + 60/60 fixtures (JS-Rust-DB); payload/projection drift 12/12, out-of-band 11/11, FK probes 10/10; commit p95 about 5-6 ms; packaged-app History list p95 39 ms (2,500 rows); activation 48/48 kill runs in {pre, post}, peak <= 16 MiB; 400 MiB media envelope 140/140 byte-identical, peak 136 MiB (CLI) / <= 214 MiB (in-app); backup 11/11 named mutations + 300/300 bit flips rejected before activation; upgrade, failed migration and downgrade handled as specified; WebView2 Unicode 34/34, long-text 0 invisible / 0 jumps / 0 focus loss, 200 resize/fullscreen cycles x 3 scales 0 breaks, IME (Microsoft Pinyin, Microsoft Japanese IME) 3/3 runs each identical to the Edge baseline.

**Amendments forced by evidence (A1-A8), absorbed above**
| # | Amendment | Where | Forced by |
|---|---|---|---|
| A1 | "No app-initiated outbound" measured per process; the WebView2 runtime's own HTTPS traffic is not the app's | section 10 | H1 |
| A2 | Release flags `+crt-static`, `/Brepro`, `--remap-path-prefix`; reproducibility claimed for the app binary only | section 10 | H1 |
| A3 | Delete-data on uninstall is an interactive checkbox only; silent uninstall keeps data | section 5.1 | H1 |
| A4 | Numbers beyond the JS safe-integer range carried as strings in payloads | section 5.3 | H2 |
| A5 | Deferrable FKs; Rust-validated projections; `check_consistency` at startup/diagnostics | section 5.2 | H2 |
| A6 | Media publish: temp, fsync, atomic rename **with retry** | section 5.4 | H4 |
| A7 | Verbatim `\\?\` path for SQLite when > `MAX_PATH`; staging DBs `journal_mode=DELETE` | sections 5.1, 6 | H3, H4 |
| A8 | Archive = zip + per-file SHA-256 manifest; verify-all-before-activate; specific refusal codes | section 8 | H5 |

**H1 acceptance (Human Gate).** H1 is accepted as CONDITIONAL with residual limitations: (1) `downloadBootstrapper` on a machine **without** the WebView2 Runtime was not measured (installer script inspected only) - **deferred to Desktop Foundation / package acceptance**; (2) the adapter-disabled + `pktmon` run was **not executed** - the dead-proxy run, the CSP blocks and the process-level socket evidence are judged sufficient, so it does not block the Gate.

**Deferred to Desktop Foundation / packaged acceptance (kept open, not waived):** the H1 runtime-less bootstrapper check above; native **Open** dialog round-trip; OS **drag-and-drop** of a >= 1 GiB file with a responsive UI; Save/Open through **OneDrive-redirected Desktop/Documents**.

**Typing implementation acceptance constraint (H7 / Sogou Pinyin).** Microsoft Pinyin and Microsoft Japanese IME passed H7. The third-party **Sogou Pinyin** IME emitted **no composition events** in the packaged app (text inserted whole as non-composing `insertText`, content correct). Therefore future Typing must **not** treat `compositionend` as the only committed-text path and must also accept non-composing committed input / `insertText`. This is an implementation acceptance constraint, **not** a reason to reopen the Desktop Runtime architecture.

**Not authorized by this record:** a V2 development branch, Desktop Foundation work, or any V2 production code - those start as the next step after this ADR's merge. The `spike/desktop-runtime` branch remains disposable and is never merged.

## 15. Desktop Foundation implementation record (implementation clarifications accepted at the Desktop Foundation Human Gate)

The formal implementation lives on the long-lived `v2` branch (`desktop/`); the milestone record and evidence map are in [`docs/V2_DESKTOP_FOUNDATION.md`](../V2_DESKTOP_FOUNDATION.md). Nothing below changes a decision in sections 1-14; these are clarifications the implementation had to make. They were reviewed and **accepted by the Product Owner at the Desktop Foundation Human Gate** (item 2 is now normative text in section 7):

1. **Catalog-driven store (section 5.2/5.3).** The store is parameterized by a *catalog* (forward-only migrations + declarative collection descriptions: typed projection columns, many-valued relationship rows, identity pointer, canonical vs recovery-only). No domain table is hard-coded; the foundation catalog contains only `media_object`, `setting` and `recovery_session`.
2. **Failed schema upgrade (section 7; spike H6).** The spike let the app open on the old schema after a failed migration. The implementation instead refuses to open (`UPGRADE_FAILED`, store verified unchanged, snapshot restored if not) because running new code against an old schema contradicts the catalog contract. Accepted; promoted to section 7.
3. **Canonical numbers (A4).** Number formatting follows ECMAScript `Number::toString` including its round-half-even tie rule; the JS<->Rust vectors exposed a divergence in Rust's shortest-digit formatter on exact decimal ties, now corrected in `desktop/core/store/src/canon.rs`.
4. **Native flows and the raw-path boundary (sections 4 and 8).** Dialogs, drag-and-drop and streaming ingest run in Rust. No absolute or local filesystem path crosses into the WebView: its IPC is an allowlist of path-free Store Port commands (`media.gc`, `media.ingest_file` and `backup.*` are not callable from the WebView), `schema.info`/`media.locate` and native results carry no path, system-generated results are path-free by construction (never post-processed), canonical/domain content - including user text that merely looks like a path - round-trips losslessly, and only the system-generated diagnostic (`error.message` of a failure envelope) is sanitized of internal paths. Media GC is a Rust-owned maintenance call with a fixed safety delay. The first Desktop Foundation build violated this (absolute `dataRoot` and media path returned to JS, a WebView-controlled GC delay); the Human Gate repaired it with regression tests (`qs-port/tests/webview_contract.rs`, `ui/tests`). The asset protocol was removed from the shell; safe opaque media serving (section 5.4) is deferred to the first milestone that needs to display media.
5. **Fault injection (spike H2/H3).** The kill hook is a compile-time feature enabled only by the test scenario crate; CI asserts the shipped binary has none.
