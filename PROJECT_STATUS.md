# Project Status

## Current Phase

V1 Finalized / Maintenance Hold + V2 on branch `v2`: Desktop Foundation **ACCEPTED**; ADR 0002 **ACCEPTED**; **V1 Migration milestone ACCEPTED**; **ADR 0003 (Learning Orchestration / Scheduling / Recommendation / Calendar) ACCEPTED — GO WITH AMENDMENT**; **Learning Orchestration + Calendar milestone: implementation complete, awaiting Human Gate**

## Active Milestone

V1: None (maintenance hold). V2: the **V1 → V2 Migration milestone is ACCEPTED** (Human Gate PASS; record: [`docs/V2_MIGRATION.md`](docs/V2_MIGRATION.md)) on the long-lived `v2` development branch (not merged; no PR to `main`). Desktop Foundation is ACCEPTED ([`docs/V2_DESKTOP_FOUNDATION.md`](docs/V2_DESKTOP_FOUNDATION.md)) and ADR 0002 is ACCEPTED. The architecture decision **[ADR 0003](docs/adr/0003-learning-orchestration-scheduling-recommendation-calendar.md)** is **ACCEPTED — GO WITH AMENDMENT** (documentation only). The **Learning Orchestration + Calendar milestone is implemented** on `v2` and **awaits the Human Gate**; milestone record and evidence map: [`docs/V2_ORCHESTRATION.md`](docs/V2_ORCHESTRATION.md). Task-Domain Integration, Answer Explanation, Focused Practice and the final UI integration are **not started**.

## Most Recent Completed Milestone

Milestone 8 — Release Candidate 1 Validation: COMPLETE / ACCEPTED (Candidate `v1.0.0-rc.1` at `f33bafcfe42ac8dd521466026c343102dc18897a` formally accepted by Product Owner)

The Product Owner has formally accepted Whole-Product Feature Complete Review V3 (PASS), accepted 0 Category A Feature Complete blockers, declared Quiz Studio V1 as Feature Complete, and authorized entering Feature Freeze.

### Pre-Freeze V1 Scope Closure Milestone Summary (Historical Baseline)

- **Batch A (Practice Feedback Modes & Special Practice IA)**: Instant Feedback and Submit at End feedback modes with explicit submit confirmation, zero pre-submit answer/score leakage, and dedicated Tool Launcher surface (Human Gate A = **PASS**).
- **Batch B (Library Organization & Progressive Navigation)**: Collection-style Categories (`All Papers`, `Uncategorized`, user categories), empty category persistence, category-scoped search, progressive 3-level sidebar navigation (Category → Paper → Question), and polished safe deletion modal (Human Gate B = **PASS**).
- **Batch C (Objective Question Media — Image & Audio)**: Image & Audio attachments across all 5 Objective Question types (`single`, `multiple`, `blank`, `truefalse`, `matching`), native Blob persistence in IndexedDB (`quiz-studio-media-db`), modal Image Viewer dialog (`#imageViewerDialog`) with zoom controls, in-question audio player, self-contained single-paper portability (v2), media-aware backup/restore with strict referential integrity validation, conservative reference-aware cleanup, and audio-dependent QA sample package (Human Gate C = **PASS**).
- **Whole-Product Feature Complete Review V3**: Comprehensive read-only lifecycle gate review across all 10 V1 scope areas, cross-milestone integration, and 270 automated tests, with 0 Category A blockers and unanimous PASS verdict (merged into `main` at `22d9aee`).

## Pre-Freeze UI Productization Milestone Summary (Historical Baseline)

- **Design System Foundation**: Created `DESIGN.md` establishing the Layered Paper Study Desk design tokens, typography, spacing, natural semantic inks, and zero-dependency synthesized audio engine.
- **Application Shell & Tool Launcher**: Added dedicated Tool Launcher home surface, topbar sound toggle button, resizable sidebars, and persistent UI preferences (theme, sound effects, motion preference, sidebar width).
- **Core Learning Surfaces**: Rebuilt Objective Quiz and Translation Practice into continuous laid paper sheets resting on the study desk, with organic page-turn transitions, pencil stroke sounds, and granular per-pair matching feedback with inline correction hints.
- **Teacher Marking Desk**: Rebuilt Correction Workspace into a continuous paper manuscript with pen marking tray, live projection, and tactile rubber stamp feedback with stamp thud audio.
- **Offline & Verification Closure**: Complete Service Worker ESM precache closure covering all runtime modules and schemas.
- **Human Acceptance Gates**: Human Acceptance Gate for UI Productization (PASS), Batch A Human Gate A (PASS), Batch B Human Gate B (PASS), Batch C Human Gate C (PASS), Review V3 (PASS), and focused M7.1 Product Owner Human Acceptance (PASS).

## Acceptance Policy (Historical Record)

Formal user acceptance for M6.2 through M6.7 was deferred to a unified M6 comprehensive acceptance once M6.7 implementation concluded. That comprehensive human acceptance (Journeys 01–10) was executed and passed (PASS). M6.0 and M6.1 were previously accepted individually. Batch A Human Gate A (Journeys 01–06), Batch B Human Gate B (Journeys 01–07), and Batch C Human Gate C (Journeys 01–07) were formally evaluated and passed (PASS). Whole-Product Feature Complete Review V3 was formally evaluated, accepted as PASS, and merged into `main`.

M7.0 was accepted through PR #20. M7.1 implementation and Product Owner Human Acceptance are complete and merged through PR #21. H-01 is resolved, C1 and B4 are complete, and the Product Owner completed the C2 genuine browser-process-restart Human Gate with PASS and no issues found. M7.2 is complete, Product Owner accepted, and merged through PR #22. M7.3 is complete and merged through PR #23 with all gates (C3, C4, final Human Gate) PASS; Product Hardening is complete.

## Current Release Scope

The current-version scope includes the Milestone 1–5 baseline, the approved Milestone 6 line, the Pre-Freeze UI Productization design system, and the Pre-Freeze V1 Scope Closure workstreams (Batch A, Batch B, Batch C). Translation Practice is housed within Special Practice. All operations remain local-first without requiring external network access or paid AI inference.

## Feature Complete Status

**DECLARED — V1 Feature Complete**

Basis for declaration:
- Whole-Product Feature Complete Review V3 = **PASS** (merged at `22d9aee`).
- Category A Feature Complete blockers = **0**.
- Pre-Freeze Scope Closure Batches A, B, and C are complete and human-accepted.
- **270 automated unit/integration tests passing** at the accepted baseline.
- Core local-first, offline, and schema contracts are intact and verified.

## Feature Freeze Status

**ACTIVE**

The Product Owner has explicitly authorized entry into **Feature Freeze**.

The V1 product scope is frozen:
- No ordinary new features, new question types, new practice branches, or functional scope expansions may enter V1 under Feature Freeze.
- If any future maintenance reveals a defect requiring material V1 scope expansion, it must be treated as a **Product Owner Hard Gate** rather than expanding scope autonomously.

## Frozen-Scope Policy

Permitted activities under Feature Freeze and maintenance hold are limited to:
- Defect correction and reliability hardening;
- Data-integrity protection and defensive error handling;
- UX refinement of existing capabilities (specifically including the mandatory learner metacognitive marking toggle UX polish);
- Touch / mobile ergonomics and responsive layout adjustments;
- Accessibility improvements and keyboard navigation polish;
- Performance characterization and low-risk defensive optimization under realistically accumulated records;
- Legacy data migration safety verification across real multi-version storage;
- Browser process restart active-session recovery verification;
- Clean-environment clone and execution verification;
- Documentation and governance synchronization.

Explicitly prohibited during Feature Freeze (V2 / Deferred Scope):
- New question types or new Special Practice branches;
- Translation History pagination, virtualization, or new navigation features;
- Per-paper audio playback policies, seek lockouts, or replay limits;
- AI question or document generation;
- Cloud synchronization, user accounts, or in-app teacher administration;
- Desktop application packaging;
- Public GitHub Pages deployment and formal GitHub Release.

## Open Release Blockers

- None. Milestone 7 Product Hardening and Milestone 8 Release Candidate Validation are both complete and accepted (PASS). All automated, runtime, and Product Owner human gates have passed with 0 release-blocking defects.

## Hardening Progress

**M7.0 complete; M7.1 complete and accepted; M7.2 complete and Product Owner accepted; M7.3 complete, Product Owner accepted, and merged.**

Milestone 7 is complete under active Feature Freeze. M7.2 and PR #22 were merged at `e3d6a693c29d6be93848ffb652743f8919e17216`; H-01 is **RESOLVED**, C1/B4 are complete, and C2 Human Acceptance is PASS. M7.3 is complete and merged via PR #23 at `6e175df53a6abb7ea75d9415ff6640801cddbb0b`. Its required clean Windows 11 and Ubuntu C4 rows pass, while macOS is explicitly DEFERRED / NOT VERIFIED under the revised contract. Preparing the genuine C3 handoff exposed and fixed one bounded defect where review-request export silently dropped `learnerItemMarks`; the public export seam now preserves the entire Learner Response. C3 and the consolidated final Human Gate are PASS, so M7.3 and Product Hardening are complete. Milestone 8 Release Candidate Validation is complete and accepted.

### Milestone 7 Product Hardening Scope (Mandatory V1)
- **Learner Metacognitive Marking Toggle UX**: Interaction refinement for translation practice (active-color toggle buttons, click-again-to-remove, and streamlined non-popup inline toggle interaction).
- **Mobile/Touch Ergonomics & Native Dialog Polish**: Responsive layout adjustments for history checklists, multi-button rows, and bespoke modal replacements for remaining `window.prompt()` / `window.confirm()` calls.
- **Translation History Performance Characterization**: Performance profiling and regression testing under realistically accumulated evidence.
- **Whole-Product Verification**: Resolution of Review V3 verification gaps C1–C4 (legacy migration safety, browser process restart recovery, authentic external reviewer round trip, clean multi-OS clone verification).

## Verification Status

- **292 automated unit/integration tests pass** (290 through accepted M7.2 plus M7.3 review-request fidelity and reproducible seed/request regressions). Existing Question Registry, grading, schema, category, media, backup, marking, correction, review, deletion-policy, runtime, and Service Worker contracts remain green.
- **Pre-Freeze V1 Scope Closure (Batch A)**: Practice feedback modes and Special Practice information architecture verified (Human Gate A = **PASS**).
- **Pre-Freeze V1 Scope Closure (Batch B)**: Library collection-style categories, empty persistence, scoped search, rename propagation, paper reassignment, progressive single-level navigation, and safe deletion modal verified (Human Gate B = **PASS**).
- **Pre-Freeze V1 Scope Closure (Batch C)**: Objective Question Media (Image & Audio across all 5 types, native Blob IndexedDB store, Image Viewer modal, in-question player, portability referential integrity, backup/restore, evidence preservation, and conservative reference-aware cleanup) verified (Human Gate C = **PASS**).
- **Whole-Product Feature Complete Review V3**: Complete product review verified with 0 Category A blockers (Review V3 = **PASS**).
- **M7.1 Product Owner Human Acceptance**: Focused marking, dialog, deletion, responsive/narrow-screen, bilingual, category-deletion, and Correction Workspace verification completed with no issues (Human Gate = **PASS**).
- **M7.2 H-01 / C1**: malformed or unsupported canonical data stays byte-for-byte recoverable; recovery-write failure blocks later canonical persistence; precedence, interrupted upgrades, idempotence, backup/export, and M1–M6 representative compatibility pass.
- **M7.2 B4**: the 2,500-response index improved from 173.47 / 181.46 ms to 6.05 / 6.39 ms median/worst on the recorded reference run, using only one-pass in-memory maps; correctness parity passes at every tier.
- **M7.2 C2**: Objective `instant`/`submitAtEnd` and Translation normal/retry/remediation automated recovery contracts pass; genuine browser-process close/reopen and forced-termination/reopen were accepted by the Product Owner in Google Chrome 151.0.7922.173 (Official Build) (64-bit). Human Gate = **PASS**.
- **M7.3 C3**: a privacy-safe seed backup restores the exact finalized synthetic response in a disposable profile; the committed request was then exported through the real Quiz Studio History UI and retains answers, span annotations, and whole-item marks. Independent external authorship plus Product Owner preview/confirm/persistence/reopen/re-export/rejection verification = **PASS**.
- **M7.3 C4**: clean Windows 11 clone, `npm ci`, 290/290 baseline tests, canonical runtime health/restart, fresh Chrome 151 profile, and real synthetic paper import/export pass; exact-baseline Ubuntu CI passes; macOS is **DEFERRED / NOT VERIFIED**. Overall C4 = **PASS**.
- **Milestone 8 RC1 Validation**: 292/292 automated tests pass on exact candidate tag `v1.0.0-rc.1` (`f33bafcfe42ac8dd521466026c343102dc18897a`); representative accumulated full backup/restore round-trip passes; clean Windows launch, browser matrix smoke, native file dialogs, hosted HTTPS PWA, and known limitations accepted by Product Owner (Milestone 8 = **PASS — ACCEPTED**).

## Agreed Question Media Policy (Batch C Scope Definition)

- **V1 In-Scope (Pre-Freeze Batch C)**: All five Objective Quiz question types (`single`, `multiple`, `blank`, `truefalse`, `matching`) may optionally contain image and/or audio simultaneously; images support enlarged/zoom viewing; audio renders as an in-question playback bar.
- **V2 Deferred Scope**: Per-paper audio playback restrictions (e.g., seeking/scrubbing controls, maximum replay count permissions, and strict exam-lockout policies).

## Known Risks

- Canonical Quiz Library recovery is intentionally storage-level and has no new migration-management UI; preserved raw canonical data remains available under the dedicated recovery key for diagnosis/recovery.
- GitHub Pages deployment is deferred and not active; repository visibility is independent of Pages deployment.
- Browser `file://` opening is not supported for the ES module app; users must use a local static server or `start-local.bat`.
- Finalized Learner Responses use browser local storage without silent history truncation; large long-term evidence collections may eventually encounter browser storage limits. Translation History inherits this: it has no entry cap by design.
- The external Teacher Review and remediation round trip is entirely manual (export a file, hand it to an external party, import the file they return); there is no in-app AI integration, and none is planned.
- Whether the learner revealed a hidden reference translation is tracked only in the active session, not carried into finalized evidence; this remains true for retry and remediation-material practice as well.
- Deleting a Learner Response cascade-deletes its Teacher Reviews; there is no separate way to keep the reviews while removing only the response. This was a deliberate M6.7 design choice (a review's `responseId` link must always resolve), not an oversight, but a user who wants to keep review content after deleting a response must export the review first.
- The review-request/remediation-request "task" instruction text embedded in exported packages is a fixed, non-configurable string per locale; it is not user-editable and assumes the external reviewer/agent can follow a plain-text natural-language instruction, which is a reasonable but unverified assumption for some non-LLM external tools.

## Unknown Or Unverified

### Completed RC Verification (Milestone 8)
- Representative accumulated full-backup export and import round trip under realistic usage state (**PASS**).
- Native OS file-picker behavior for Teacher Review import and remediation Translation Document import (**PASS**).
- Cross-browser smoke and clean Windows runtime health/restart (**PASS**).
- Hosted HTTPS PWA lifecycle (**PASS**).

### Acceptable Documented Limitation
- Very large review-request / remediation-request practical file sizes under browser local storage limits.

### Deferred
- macOS clean clone/run behavior remains **DEFERRED / NOT VERIFIED**.

## Deferred Features

- AI-assisted question generation.
- Desktop application packaging.
- Cloud sync and user accounts.
- Sharing, collaboration, and in-app teacher account/administration workflows.
- Subjective question grading.
- Public GitHub Pages deployment and final GitHub Release.
- Translation History pagination, virtualization, and advanced history graph visualization (V2 deferred).
- Per-paper audio playback policies, seeking/scrubbing restrictions, and replay limits (V2 deferred).

## Next Engineering Objective

**V1 release line: Maintenance Hold (No Active V1 Engineering Milestone)**

Quiz Studio V1 is finalized at version `1.0.0`. The accepted Release Candidate `v1.0.0-rc.1` (commit `f33bafcfe42ac8dd521466026c343102dc18897a`) remains the immutable verification baseline with zero post-candidate runtime modifications. No V1 engineering milestone is currently scheduled. V1 follow-ups such as GitHub Pages deployment or a formal GitHub Release remain separately deferred and begin only upon explicit Product Owner authorization.

Quiz Studio V2 has **passed the Desktop Architecture Gate**; the formal V2 development branch `v2` exists and **Desktop Foundation is ACCEPTED**. The V1 release line above is unchanged and remains the immutable `v1.0.0` baseline; V2 work does not modify it.

V2 progress (see the linked documents for authority; nothing here changes them):

- **Product Scope Freeze Revision 1: complete** — [`V2_PRODUCT_SCOPE_FREEZE.md`](V2_PRODUCT_SCOPE_FREEZE.md).
- **UI Architecture Freeze: complete** — [`docs/V2_UI_ARCHITECTURE_FREEZE.md`](docs/V2_UI_ARCHITECTURE_FREEZE.md) (Human Design Gate passed; approved design inputs tracked under `docs/design-inputs/`).
- **V1 Migration Readiness Inventory: complete** — passed its Human Gate and is merged into `main` ([`docs/V2_MIGRATION_READINESS_INVENTORY.md`](docs/V2_MIGRATION_READINESS_INVENTORY.md)).
- **Desktop Runtime & Application Data ADR 0001: ACCEPTED** — [`docs/adr/0001-desktop-runtime-and-application-data.md`](docs/adr/0001-desktop-runtime-and-application-data.md) (Tauri 2 + WebView2, Rust durability boundary, SQLite, lossless JSON payload + projections, content-addressed media, unified staging/activation/rollback, V2 archive). Amendments A1–A8 forced by the spike are absorbed; the Electron fallback was not triggered.
- **Bounded desktop spike: complete.** Executed on the disposable `spike/desktop-runtime` branch (final HEAD `a79cea5c29d10f88c0a7f09c8a265a76dca17d23`, never merged); the long-term evidence is [`docs/adr/evidence/0001-desktop-spike-report.md`](docs/adr/evidence/0001-desktop-spike-report.md) with the amended [spike contract](docs/adr/0001-appendix-desktop-spike-contract.md).
- **Desktop Architecture Gate: PASSED — GO WITH AMENDMENT** (Product Owner). H2–H7 PASS; H1 CONDITIONAL and accepted with residual limitations (runtime-less `downloadBootstrapper` check and the adapter-disable/`pktmon` run deferred); H8 CANCELLED / RECLASSIFIED BY HUMAN GATE (its remaining native Open dialog, OS drag-and-drop and OneDrive-redirected Desktop/Documents checks are deferred to Desktop Foundation / packaged acceptance).
- **Typing constraint carried forward:** the third-party Sogou Pinyin IME emits no composition events in the packaged app; future Typing must not rely on `compositionend` as the only committed-text path and must accept non-composing committed input / `insertText`. This does not reopen the desktop architecture.
- **Desktop Foundation: ACCEPTED (Human Gate PASS, 2026-10-02).** Implemented on `v2`: Tauri 2 + WebView2 shell (single instance, strict CSP, allowlisted IPC, Rust-owned native dialogs/drag-and-drop), catalog-driven SQLite store with Unit of Work and payload/projection integrity, content-addressed media, one staging/activation/rollback primitive with journal recovery, V2 archive, stable identity/version/data root, per-user NSIS package. Code under [`desktop/`](desktop/README.md); the disposable spike code was not copied.
- **Validation (Windows CI, `windows-latest`, MSVC + static CRT — [run](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37012332165), all steps green):** fmt + clippy `-D warnings`; 15 JS tests; Rust suites at the ADR thresholds — 500 forced-kill crash loop (0 violations), activation kill-point matrix 6 checkpoints × 2 modes × 3 repeats + kill during rollback (always exactly pre or post), 400 MiB streaming ingest/archive/restore (child peak well under the 300 MiB limit), 14 named archive mutations + 300 bit flips rejected before activation, 5,000 JS↔Rust↔DB fidelity vectors (0 mismatches); app binary reproducible (identical SHA-256 across two builds); shipped binary carries no fault-injection hook; installer built in `downloadBootstrapper` mode; installed-exe smoke (identity, self-test, launch, single instance, no listener / no remote connection from the app process, force-kill recovery); same-identifier upgrade preserves data; silent uninstall keeps user data.
- **Acceptance debt (non-blocking packaged/manual debt; open, not PASS, not removed):** D1 native Open dialog automated round-trip, D2 OS drag-and-drop ≥ 1 GiB, D3 OneDrive-redirected Desktop/Documents, D4 runtime-less WebView2 `downloadBootstrapper` (static evidence only) — manual steps in [`manual-qa/v2-desktop-foundation.md`](manual-qa/v2-desktop-foundation.md). Also open: final app icon (neutral placeholder ships), bundled CJK fonts (shell uses system fonts, no network resource), code signing and auto-update (out of scope).
- **V1 Migration ADR 0002: ACCEPTED - GO WITH AMENDMENT** (Human Gate, 2026-10-02) - [`docs/adr/0002-v1-to-v2-migration-architecture.md`](docs/adr/0002-v1-to-v2-migration-architecture.md). Documentation only; no migrator or test code exists. Decisions: H-1 block lone UTF-16 surrogates (no U+FFFD); H-2 additive-only `Merge(KeepExisting)` (no Replace/overwrite); H-3 `migration_origin.offsetEncoding` is the authoritative UTF-16 label for migrated records, with **no** global default (native V2 offset-bearing records must declare encoding explicitly; no origin and no encoding is invalid); H-4 recovery artifacts are preserved in V2 archives (archive `formatVersion` evolves, older formats stay readable); H-5 targeted inverse-UoW undo (snapshot restore is disaster-only); H-6 the twin/twin-divergent reconciliation table may only be narrowed on V1 baseline code evidence. Amendments: media is a special mapping (C-4), `recovery_artifact` is not canonical domain data, the P1 staging copy is the TOCTOU boundary.
- **Learning Orchestration + Calendar milestone: implementation complete on `v2`, awaiting Human Gate.** Store schema 2 → 3 (`context` catalog role; `schedule`, `schedule_exception`, `schedule_fulfillment`, `schedule_suggestion`, `session_selection` with database-level single-active / single-pending / one-fulfillment constraints, hard FKs, `sched-*` fault checkpoints) and the pure JS/TS domain (`ScheduleStore`, occurrence projection, Calendar/Today, planner v1, Evidence Readers, score-free deterministic Recommender, selection provenance, `completeSession` seam). ADR 0003 section 17 is automated: ownership and race tests against the real Rust store, recurrence/property tests, zero-write Due/Overdue, atomic fulfillment with evidence, Evidence immutability, unknown-is-not-negative on a real migrated store, byte-identical recommendations, schema closure, archive round trip, 2 → 3 upgrade, and the `sched-*` fault matrix with random kills. Record, evidence map and the implementation clarifications for review: [`docs/V2_ORCHESTRATION.md`](docs/V2_ORCHESTRATION.md). No product UI by design; M1-M7 and D1-D4 remain open, non-blocking. Windows Desktop CI: **green**, [run 37059517115](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37059517115).
- **ADR 0003 — Learning Orchestration / Scheduling / Recommendation / Calendar Architecture: ACCEPTED — GO WITH AMENDMENT** (Human Gate, amendments in ADR §22: Create never overwrites an occupied slot; any differing date is a conflict, no minimum difference; suggestions bound to a schedule revision and superseded by learner changes; occurrence identity is only `(scheduleId, originalDate)`) ([`docs/adr/0003-learning-orchestration-scheduling-recommendation-calendar.md`](docs/adr/0003-learning-orchestration-scheduling-recommendation-calendar.md)). Documentation only: ownership model and single-active-schedule invariant, engine/user conflict as a stored suggestion with an atomic either-or decision, date-level recurrence with anchors/exceptions/move-this-vs-future, derived Due/Overdue and fulfillment, derived explainable Recommendation with a closed reason registry and unknown-is-not-negative-evidence, and an automated verification contract for the later implementation milestone. Implemented by the Learning Orchestration + Calendar milestone (above).
- **V1 Migration milestone: ACCEPTED (Human Gate PASS).** Implemented on `v2` (see the record for scope and evidence). `qs-migrate-v1` (lossless reader, detection precedence, verbatim-carry mapping with `migration_origin` provenance, history twin/divergent/legacy-only classification, media + recovery artifact, staging/preview/confirmation, additive activation with a commit guard, idempotence, undo, independent conservation verifier) plus the ADR 0002 section 15 foundation extensions and a minimal native/WebView flow. ADR 0002 section 16 is automated: detection table, 40+5 blocking fixtures covering every blocking code, 15-class mutation-kill suite, V1 differential + JS canonical oracles, repeat/undo/race tests, kill matrix + random kills + undo kill, 400 MiB memory envelope (10.3 MiB peak locally). Record, evidence map and the implementation clarifications for review: [`docs/V2_MIGRATION.md`](docs/V2_MIGRATION.md). **Human Gate HOLD close-out implemented** (ADR 0002 section 21: artifact supplied after the fact for an already-migrated source is preserved without re-migrating; deletion ownership separated from the historical `disposition`; conservation contract names direct-verbatim / structural / media mappings); awaiting re-review. Windows Desktop CI for the close-out: **green**, [run 37039302072](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37039302072) (the pre-HOLD implementation was green: [run 37034644764](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37034644764)). Open: manual packaged checks M1-M7 ([`manual-qa/v2-migration.md`](manual-qa/v2-migration.md)) and D1-D4, non-blocking.
- **Not started (unchanged):** Objective / Translation / Typing domain integration, Answer Explanation, Focused Practice, product views / final UI integration.

**Human Gate HOLD / repair:** the Human Gate found that raw filesystem paths crossed into the WebView (absolute data root, absolute media path, WebView-callable `media.gc`). Repaired in scope: path-free responses, `media.gc` removed from the WebView allowlist (Rust-owned fixed-policy GC only), `verifyBackup(path)` removed, asset protocol/preview removed, regression tests added (`core/port/tests/webview_contract.rs`, `desktop/ui/tests`); ADR 0001 section 7 now states the failed-upgrade refusal as accepted behavior and section 15 is marked accepted. D1-D4 remain open acceptance debt.

**Follow-up fix (fidelity):** the first repair's blanket path scrub rewrote user-authored path-like text in `store.read` payloads. The WebView boundary is now a structured contract: system results are path-free by construction, canonical/user content is never rewritten, and only the failure diagnostic (`error.message`) is sanitized (spaced Windows, UNC/verbatim and Unix paths); regression tests prove both lossless round-trip and no leak.

**Next action: Human Gate review of the Learning Orchestration + Calendar milestone.** Task-Domain Integration (Objective / Translation / Typing), Answer Explanation, Focused Practice and the final UI integration are not started and need their own authorization. The `spike/desktop-runtime` branch stays disposable and is never merged.

Deferred boundaries preserved: macOS environment remains **DEFERRED / NOT VERIFIED**.

## Repository State

- Default branch: `main`
- Remote: `origin`
- Repository lifecycle state: V1 Finalized / Maintenance Hold + V2 (branch `v2`): Desktop Foundation ACCEPTED, ADR 0002 ACCEPTED, V1 Migration milestone ACCEPTED, ADR 0003 ACCEPTED, Learning Orchestration + Calendar milestone implementation complete (awaiting Human Gate)
- V2 development branch: `v2` (from `main@8eb6608`; pushed; long-lived; no open PR to `main`)
- Final release version: `1.0.0`
- Accepted candidate tag: `v1.0.0-rc.1` (points to immutable commit `f33bafcfe42ac8dd521466026c343102dc18897a`)
- Commit and merge tracking: Use Git history for `main` commit identity and PR merge history
- Current documentation revision: the commit containing this status file; use Git history for its immutable identifier
- Publication status: Refer to GitHub Releases page for published release distribution status
