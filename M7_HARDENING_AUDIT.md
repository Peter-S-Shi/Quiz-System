# Milestone 7 Hardening Audit & Contract Lock

## Verdict

**READY FOR M7 IMPLEMENTATION**, subject to Product Owner review of the M7.0 Draft PR.

The audit found one release-blocking data-protection defect, but it has a bounded, non-destructive repair path inside the frozen V1 scope. It does not invalidate the accepted Feature Complete declaration and does not require a Product Owner Hard Gate. M7.1 must not begin until this contract is approved.

## 1. Audited Baseline

| Item | Evidence |
| --- | --- |
| Remote | Private `Peter-S-Shi/Quiz-System` repository; default branch `main` |
| Audited commit | `d5c78b9ba58ab24659fc6fd637024cbe0186b0d0` (PR #19 merge) |
| Audit branch | `hardening/m7-audit-contract-lock` |
| Lifecycle | V1 Feature Complete declared; Feature Freeze active; M7 authorized |
| Product implementation | Plain HTML/CSS/ES modules, localStorage/IndexedDB, Python local runtime |
| Test baseline | `npm run check`: 270 passed, 0 failed, 0 skipped when `QUIZ_STUDIO_PYTHON` points to Python 3 |
| CI baseline | PR #19 and `main` CI completed successfully |

The first local run produced 262 passes and eight setup failures because Python was not on `PATH`; all eight were local-runtime integration tests. Re-running through the repository-supported `QUIZ_STUDIO_PYTHON` override produced the clean 270/270 result. No product assertion failed.

## 2. Scope Lock

M7 may repair reliability, data integrity, recovery, destructive-flow safety, existing-workflow UX, accessibility, responsive behavior, and release evidence. It may not add question types, practice branches, pagination, virtualization, cloud/accounts, in-app AI, desktop packaging, public Pages, or a formal GitHub Release.

The current three-batch structure remains appropriate:

- **M7.1 — UX & Interaction Hardening:** B1, B2, justified B3 replacements, high-content deletion safeguards, keyboard/focus checks.
- **M7.2 — Data, Recovery & Robustness:** H-01, C1, C2, B4 characterization and only evidence-driven low-risk optimization.
- **M7.3 — Release-Readiness Verification:** C3, C4, full regression, manual acceptance, privacy scan, and final documentation synchronization.

## 3. B1–B4 Reconciliation

### B1 — Learner Metacognitive Marking Toggle UX: Partially satisfied

Current implementation already provides direct inline whole-item controls and click-again-to-remove (`src/app.js`, `data-item-mark-kind`; `currentItemMark === kind ? null : kind`). Core tests cover set, replace, clear, persistence, and finalization. Do not reimplement those behaviors.

Remaining M7.1 work:

- give each active kind its semantic ink rather than one generic active blue;
- expose toggle state with `aria-pressed` (or an equivalent native semantic contract);
- preserve/restore useful focus after the full-panel rerender;
- add UI-level keyboard/touch verification for selection, toggle-off, persistence, and bilingual labels.

### B2 — Mobile / Touch Ergonomics: Mandatory hardening

The app has general 860 px layout collapse and flexible toolbars, but no targeted narrow-screen contract for Translation History or retry selection. The retry checklist uses an unstyled `.inline-check`; small controls can be 32 px high; seven History actions share one generic flex row; and checkbox/toggle changes rerender the panel, losing DOM focus. Rich correction selection and dynamically rendered controls also lack touch/keyboard acceptance evidence.

M7.1 must cover 320, 375, 768, and desktop widths with keyboard plus representative touch input. It may reflow/wrap existing controls and improve focus behavior, but must not create a mobile-only product mode.

### B3 — Native Browser Dialogs: 21 call sites audited

Decision criteria: custom text entry for consistent validation/focus; custom confirmation for destructive or progress-losing operations; native confirmation may remain for a short, non-destructive commit decision.

| Call site | Workflow | M7 disposition |
| --- | --- | --- |
| `src/app.js:1503` | Create category from Paper category select | Replace |
| `src/app.js:1563` | Final delete-category-with-papers confirmation | Replace |
| `src/app.js:2009` | Create category from Library | Replace |
| `src/app.js:2032` | Rename category | Replace |
| `src/app.js:2066` | Delete empty category | Replace |
| `src/app.js:2155` | Rename Paper | Replace |
| `src/app.js:2164` | Delete Paper | Replace |
| `src/app.js:3156` | Submit-at-end quiz commitment | Acceptable to retain for V1 |
| `src/app.js:3738` | Create Translation folder | Replace |
| `src/app.js:3747` | Rename Translation folder | Replace |
| `src/app.js:3755` | Delete Translation folder and documents | Replace |
| `src/app.js:4148` | Overwrite another active Translation session | Replace |
| `src/app.js:4157` | Discard active Translation session | Replace |
| `src/app.js:4828` | Insert correction text | Replace |
| `src/app.js:4844` | Replace correction text | Replace |
| `src/app.js:5070` | Delete Translation Document | Replace |
| `src/app.js:5577` | Overwrite active session when starting retry | Replace |
| `src/app.js:5595` | Start needs-work retry | Acceptable to retain for V1 |
| `src/app.js:5614` | Delete Learner Response and possible review cascade | Replace |
| `src/app.js:5634` | Delete Teacher Review with lineage warning | Replace |
| `src/app.js:5715` | Clear Paper history/evidence | Replace |

Result: 19 replace, two acceptable to retain, zero unresolved Product Owner decisions. Replacements must preserve the existing action semantics and use one bounded Study Desk dialog contract rather than 19 bespoke workflows.

### B4 — Translation History Performance: Characterization required

`buildHistoryIndex()` maps every Translation response, while each `buildHistoryEntry()` scans the complete review collection and response collection; `deriveNeedsWorkItemIds()` scans reviews again. This is approximately **O(R² + R×T)** before DOM rendering. Every History filter change rebuilds the full index and rerenders the full list. Current tests prove correctness only with small collections and provide no accumulated-history timing evidence.

M7.2 dataset contract:

- deterministic synthetic tiers of 100, 500, 1,000, and 2,500 Translation responses;
- 10 items per response, 0–2 reviews per response, representative annotations/item marks/corrections, and retry/remediation lineage;
- separately measure index derivation, filtering/sorting, detail derivation, and browser list rendering;
- record median and worst-of-five timings plus heap/serialized-data size on the reference machine;
- require correctness parity at every tier and no exception, lockup, or broken action at the largest tier;
- establish a user-visible latency budget from the characterization before optimizing.

Allowed optimization is limited to one-pass indexes/maps and reuse within a render. Pagination, virtualization, and new History navigation remain deferred.

## 4. C1–C4 Verification Contracts

### C1 — Legacy migration safety

Historical Git evidence identifies these meaningful states:

1. **M1 single Paper** (`a6f432a`): `quiz-studio-paper-v1`, no library, no durable session/history.
2. **M2–M3 library** (`27d1a7c`): `quiz-studio-library-v1`, active Paper, Objective active session, bounded Objective history, theme/language, and possible simultaneous legacy Paper key.
3. **M4–M5 modular baseline** (`88702af`): the same browser keys with normalized Paper/question contracts and schema versioning.
4. **Additive M6 states:** absent learner/review/Translation keys, early unannotated Translation responses, pre-category libraries, and active sessions lacking later optional fields such as `feedbackMode`, annotations, or item marks.

No committed real user storage is allowed. M7.2 must build synthetic fixtures from those historical commits and test: legacy-only migration, library precedence over legacy, mixed-key states, missing optional keys, malformed JSON, unsupported shapes, idempotent second load, and backup/export immediately after migration. Raw source data must not be deleted or overwritten until validation succeeds and a recoverable backup/quarantine path exists.

### C2 — Genuine browser process restart recovery

Automated coverage can continue to validate serialization and normalization. Manual closure must use a clean synthetic browser profile and test full browser close, forced process termination, and reopen for:

- Objective Quiz in `instant` and `submitAtEnd` modes, including current index and unanswered/answered state;
- Translation Practice with multiple answers, current index, revealed-reference state, span annotation, whole-item mark, and normal/retry/remediation provenance;
- cancellation versus recovery, completed-session cleanup, and isolation between Objective and Translation keys.

Evidence must record browser/version, restart method, expected key/state, observed recovery, and PASS/FAIL. Refresh-only evidence cannot close C2.

### C3 — Authentic external reviewer round trip

Use a synthetic Translation Learner Response only:

1. export a real review-request file from Quiz Studio;
2. give it unchanged to an external human reviewer or a real AI session;
3. receive a newly authored Teacher Review with canonical IDs and rich corrections;
4. import through preview/confirm and verify schema rejection paths separately;
5. verify the original Learner Response is byte-for-byte unchanged, the review persists/reopens, History shows the correct review, and response/review lineage resolves;
6. export the stored review and compare canonical content with the returned artifact;
7. record external reviewer type, procedure, synthetic fixture IDs, and redacted evidence without storing real prompts/session identifiers in the repository.

Synthetic pre-authored fixtures do not close C3.

### C4 — Clean clone / environment verification

Smallest meaningful M7.3 matrix:

| Environment | Required checks |
| --- | --- |
| Clean Windows 11 | Fresh clone, `npm ci`, `npm run check`, `start-local.bat`, canonical `localhost:8000`, fresh browser profile |
| Clean current macOS | Fresh clone, `npm ci`, `npm run check`, `python -u scripts/dev-server.py`, canonical origin, fresh browser profile |
| GitHub Actions Ubuntu | Existing Node 22/Python 3.12 CI, full 270-test suite |

For both clean machines, verify no machine-specific path assumptions, first launch, synthetic import/export, runtime health, and shutdown/restart. This is source/runtime validation, not desktop packaging.

## 5. Naming Consistency

**PASS.** User-facing UI and release-facing documentation use **Quiz Studio**. `Quiz System/` appears only as a technical directory illustration; the `Quiz-System` repository slug and `quiz-studio-*` identifiers are allowed. No rename or identifier churn is warranted.

## 6. Governance Corrections

M7.0 synchronizes clear contradictions without rewriting history:

- README and Release Notes no longer describe active M6 feature development or missing Translation workflows.
- ROADMAP records Review V3, declared Feature Complete, active Feature Freeze, current M7.0, and internal RC validation.
- mandatory B1 work is removed from deferred scope; only multiple simultaneous whole-item marks remain deferred.
- public Pages, the final tag, and a formal GitHub Release are removed from mandatory M8/V1 work and remain separately deferred.
- Project Status records PR #19 baseline and the current M7.0 branch/review gate.
- the Manual QA baseline records that comprehensive M6 acceptance passed while preserving its modules for M7 regression.

## 7. Classified Findings

| ID | Class | Severity | Finding | Target / closure |
| --- | --- | --- | --- | --- |
| H-01 | H | Release blocker | Malformed/unsupported `quiz-studio-library-v1` data can collapse through `loadJson()` and be immediately overwritten by a generated default library during bootstrap. | M7.2: fail safely, preserve raw data, add synthetic corruption/migration regression tests. |
| M-01 | M | High | B1 is behaviorally partial: semantic active inks, pressed semantics, focus continuity, and UI evidence remain. | M7.1 |
| M-02 | M | High | B2 narrow/touch layouts and keyboard focus are not sufficiently designed or verified for History, retry selection, marking, and rich correction. | M7.1 |
| M-03 | M | High | B3 has 19 native-dialog call sites that should be replaced under one bounded dialog contract. | M7.1 |
| M-04 | M | Medium | B4 has quadratic derivation risk and no accumulated-history characterization. | M7.2 |
| M-05 | M | High | Whole-question and Translation-item deletion are immediate and have neither confirmation nor undo, unlike other high-content destructive workflows. | M7.1: add bounded safeguards; retain lightweight deletion for options, pairs, annotations, and unsaved corrections. |
| V-01 | V | High | C1 historical storage migration lacks representative end-to-end fixtures and non-destructive failure evidence. | M7.2 |
| V-02 | V | High | C2 refresh recovery is tested; genuine browser process restart recovery is not. | M7.2 manual gate |
| V-03 | V | High | C3 has synthetic transport fixtures but no authentic external reviewer round trip. | M7.3 human gate |
| V-04 | V | High | C4 lacks clean Windows and macOS clone/run evidence. | M7.3 environment gate |
| D-01 | D | Medium | README, Release Notes, and Manual QA baseline described a superseded M6 lifecycle state. | Resolved in M7.0 |
| D-02 | D | High | ROADMAP deferred mandatory B1 work and incorrectly required Pages/formal Release in frozen V1 M8. | Resolved in M7.0 |
| D-03 | D | Medium | Project Status repository baseline/branch/PR facts stopped before PR #19 merge. | Resolved in M7.0 |
| A-01 | A | Accepted | Review request task strings are fixed per locale. | Retain |
| A-02 | A | Accepted | Learner Response deletion cascades its Teacher Reviews to preserve integrity. | Retain with clear confirmation |
| A-03 | A | Accepted | Browser storage quotas constrain cumulative local evidence. | Retain and document |
| A-04 | A | Accepted | A Paper has one primary category; tags provide secondary organization. | Retain |
| F-01 | F | Deferred | AI-assisted question/document generation. | Future version |
| F-02 | F | Deferred | Desktop packaging. | Future version |
| F-03 | F | Deferred | Cloud sync and accounts. | Future version |
| F-04 | F | Deferred | In-app teacher administration and collaboration. | Future version |
| F-05 | F | Deferred | Subjective grading automation. | Future version |
| F-06 | F | Deferred | Public Pages and formal GitHub Release. | Separate authorization |
| F-07 | F | Deferred | Per-paper audio restrictions/replay policies. | Future version |
| F-08 | F | Deferred | History pagination, virtualization, and graph navigation. | Future version |

Counts: **H 1 / M 5 / V 4 / D 3 / A 4 / F 8**.

## 8. Human Verification Requirements

- M7.1: bilingual keyboard/touch acceptance at representative widths; dialog focus trap, cancel, validation, destructive copy, and focus return; marking toggle and rich correction authoring.
- M7.2: C1 migration recovery evidence and C2 actual process restart evidence; browser History characterization with accumulated synthetic records.
- M7.3: authentic C3 external round trip, C4 clean-machine matrix, complete manual QA journey, PWA/offline/cache-upgrade checks, and final privacy review.

Automated tests may support but cannot substitute for the explicit human/environment portions of C2–C4.

## 9. Backlog Decision

`HARDENING_BACKLOG.md` is **not warranted**. The actionable set is bounded and fully mapped above: one H, five M, four V, and three already-resolved D findings. This report and `PROJECT_STATUS.md` are sufficient execution records; a second tracker would add ceremony without improving control.

## 10. Hard Gates

No Product Owner Hard Gate is currently triggered.

Stop and escalate during implementation if H-01 cannot be repaired without destructive migration, if referential integrity evidence fails, if a B3 replacement requires new product semantics, if performance can only be made acceptable through deferred pagination/virtualization, or if clean-environment verification requires expanding into desktop packaging or public delivery.

## 11. M7.0 Exit Decision

- Repository health signal: reliable after declaring the supported Python executable; 270/270 pass.
- Feature Complete declaration: not materially contradicted.
- Frozen scope: intact; no feature or architecture implementation entered M7.0.
- Product Owner decision required now: approve or reject this M7 contract and batch mapping.
- Next action after approval: begin **M7.1 — UX & Interaction Hardening** on a separate implementation branch.

**M7.0 verdict: READY FOR M7 IMPLEMENTATION.**
