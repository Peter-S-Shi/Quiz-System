# Project Status

## Current Phase

Pre-Freeze V1 Scope Closure

## Current Milestone

Pre-Freeze V1 Scope Closure · Batch A: Practice Feedback Modes & Special Practice Information Architecture — complete and verified; Human Gate A = PASS

This workstream delivers the first of two pre-freeze scope closure packages:
1. **Objective Quiz Practice Feedback Modes**: Adds Instant Feedback (`instant`, default) vs. Submit at End (`submitAtEnd`) modes in practice setup, preserving full refresh recovery, supporting all 5 objective question types, and enforcing explicit user confirmation and cancel safety upon final paper submission.
2. **Special Practice Information Architecture**: Reorganizes product hierarchy so that Translation is housed under the top-level `Special Practice` container, preserving all existing Translation workflows.
3. **Human Gate A**: Successfully evaluated and passed (PASS).

It precedes Batch B (Question Media: image/audio) and the subsequent Whole-Product Feature Complete Review V3.

## Pre-Freeze UI Productization Milestone Summary (Historical Baseline)

- **Design System Foundation**: Created `DESIGN.md` establishing the Layered Paper Study Desk design tokens, typography, spacing, natural semantic inks, and zero-dependency synthesized audio engine.
- **Application Shell & Tool Launcher**: Added dedicated Tool Launcher home surface, topbar sound toggle button, resizable sidebars, and persistent UI preferences (theme, sound effects, motion preference, sidebar width).
- **Core Learning Surfaces**: Rebuilt Objective Quiz and Translation Practice into continuous laid paper sheets resting on the study desk, with organic page-turn transitions, pencil stroke sounds, and granular per-pair matching feedback with inline correction hints.
- **Teacher Marking Desk**: Rebuilt Correction Workspace into a continuous paper manuscript with pen marking tray, live projection, and tactile rubber stamp feedback with stamp thud audio.
- **Offline & Verification Closure**: 239 total tests (238 passed, 1 skipped platform-specific Windows launcher test on Linux CI, 0 failed), including UI preferences persistence, lightweight preferences dialog, and complete Service Worker ESM precache closure.
- **Human Acceptance Gate**: Final Human Acceptance Gate has been executed and passed (PASS).

## Acceptance Policy (Historical Record)

Formal user acceptance for M6.2 through M6.7 was deferred to a unified M6 comprehensive acceptance once M6.7 implementation concluded. That comprehensive human acceptance (Journeys 01–10) has now been executed and passed (PASS). M6.0 and M6.1 were previously accepted individually.

## Current Release Scope

The current-version scope includes the Milestone 1-5 baseline, the approved Milestone 6 line, the Pre-Freeze UI Productization design system, and the Pre-Freeze V1 Scope Closure workstream (Batch A: Feedback Modes & Special Practice IA; Batch B: Question Media). Translation Practice is housed within Special Practice. All operations remain local-first without requiring external network access or paid AI inference.

## Feature Complete Status

Temporarily deferred.

The repository is completing Pre-Freeze V1 Scope Closure (Batch A & Batch B). Feature Complete declaration will be performed via Whole-Product Feature Complete Review V3 upon closure of both batches.

## Feature Freeze Status

Not entered (inactive).

Feature Freeze will begin only after Pre-Freeze V1 Scope Closure batches pass human acceptance gates, Whole-Product Review V3 is formally accepted, and the user explicitly authorizes entering Feature Freeze.

## Open Release Blockers

- Full project-wide manual acceptance across all milestones (M1–M5 baseline + whole product) has not been completed.
- Legacy single-paper migration across representative old localStorage states and full browser-close/restart active-session recovery have not received dedicated verification.
- Public Pages deployment remains deferred while the repository is private.
- A release candidate and final clean-environment verification do not yet exist.

## Hardening Progress

Not started.

Product Hardening is Milestone 7 and will begin only after Pre-Freeze V1 Scope Closure (Batch A & Batch B) passes human acceptance gates, Whole-Product Feature Complete Review V3 is accepted, and Feature Freeze is explicitly entered.

### Milestone 7 Product Hardening Scope (Mandatory V1)
- **Learner Metacognitive Marking Toggle UX**: Interaction refinement for translation practice (active-color toggle buttons, click-again-to-remove, and streamlined non-popup inline toggle interaction) is classified as a mandatory V1 Milestone 7 Product Hardening item (not deferred).
- **Mobile/Touch Ergonomics & Native Dialog Polish**: Responsive layout adjustments for history checklists, multi-button rows, and confirmation workflows on touch viewports.
- **Whole-Product Verification**: Legacy migration safety tests and clean clone environment checks.

## Verification Status

- 244 automated unit/integration tests pass (Question Registry, grading calculations, JSON schema validation, active session serialization & recovery normalization for both instant and submitAtEnd feedback modes, submit confirmation and cancellation isolation, metacognitive markings, rich corrections, review transport, deletion policies, UI preferences, synthesized audio engine, Python server dual-stack runtime, and Service Worker policy). Coverage includes full suite validation across both Windows and Linux CI.
- **Pre-Freeze V1 Scope Closure (Batch A)**: Practice feedback modes (Instant Feedback vs. Submit at End with explicit submit confirmations) and Special Practice information architecture (`Special Practice -> Translation`) implemented and verified with new tests in `tests/practice-modes.test.js`.
- **Human Gate A Guide**: Verification journeys A, B, and C documented in `manual-qa/human-gate-a.md` and `manual-qa/human-gate-a.zh-CN.md` are evaluated and passed (**PASS**).

## Agreed Question Media Policy (Batch B Scope Definition)

- **V1 In-Scope (Pre-Freeze Batch B)**: All five Objective Quiz question types (`single`, `multiple`, `blank`, `truefalse`, `matching`) may optionally contain image and/or audio simultaneously; images support enlarged/zoom viewing; audio renders as an in-question playback bar.
- **V2 Deferred Scope**: Per-paper audio playback restrictions (e.g., seeking/scrubbing controls, maximum replay count permissions, and strict exam-lockout policies).

## Known Risks

- GitHub Pages cannot currently be treated as available because the repository remains private and Pages deployment is deferred.
- Browser `file://` opening is not supported for the ES module app; users must use a local static server or `start-local.bat`.
- Finalized Learner Responses use browser local storage without silent history truncation; large long-term evidence collections may eventually encounter browser storage limits. Translation History inherits this: it has no entry cap by design.
- The external Teacher Review and remediation round trip is entirely manual (export a file, hand it to an external party, import the file they return); there is no in-app AI integration, and none is planned.
- Whether the learner revealed a hidden reference translation is tracked only in the active session, not carried into finalized evidence; this remains true for retry and remediation-material practice as well.
- Deleting a Learner Response cascade-deletes its Teacher Reviews; there is no separate way to keep the reviews while removing only the response. This was a deliberate M6.7 design choice (a review's `responseId` link must always resolve), not an oversight, but a user who wants to keep review content after deleting a response must export the review first.
- Translation History, retry item-selection, and deletion confirmations have not been manually verified on touch/mobile viewports, where the item-selection checklist and multi-button action rows may need layout attention during M7 hardening.
- The review-request/remediation-request "task" instruction text embedded in exported packages is a fixed, non-configurable string per locale; it is not user-editable and assumes the external reviewer/agent can follow a plain-text natural-language instruction, which is a reasonable but unverified assumption for some non-LLM external tools.

## Unknown Or Unverified

- Full backup export and import round trip with large-scale long-term history accumulation.
- Legacy single-paper migration behavior across representative old localStorage states.
- Translation Practice session recovery across a genuine browser restart (refresh-based recovery was verified; full browser-close/reopen was not separately tested), including a retry session.
- Destructive workflows such as paper delete and history clear outside of Translation Document / Review deletion.
- PWA install, offline behavior, and cache upgrade behavior across major browsers.
- Accessibility and responsive behavior across representative devices, including the new Translation History browser and retry item-selection checklist.
- Clean-environment clone and run process.
- Learner annotation marking, review, removal, History browsing, and retry item-selection on touch/mobile viewports, where text-selection and multi-checkbox ergonomics differ from desktop pointer/keyboard interaction.
- In-scope rich correction authoring (style/insert/replace/delete and the color picker) on touch/mobile viewports.
- Manual inspection of a real browser's native `window.prompt()`/`window.confirm()` dialogs for Insert/Replace text entry and for retry/deletion confirmations.
- A real end-to-end round trip using an actual external human reviewer or a real AI assistant/LLM session (not a synthetic fixture) to produce a Teacher Review or remediation Translation Document from an exported request file.
- Native OS file-picker behavior for the Teacher Review and remediation-document file inputs (the automated smoke test dispatched a synthetic `File`/`change` event rather than driving a real picker dialog).
- Very large review-request/remediation-request export files (many items, many corrections) have not been tested for practical file size or the target external tool's context/input limits.
- Translation History performance with a very large number of accumulated responses/reviews (no pagination is implemented; the list renders every filtered entry at once).

## Deferred Features

- AI-assisted question generation.
- Desktop application packaging.
- Cloud sync and user accounts.
- Sharing, collaboration, and in-app teacher account/administration workflows.
- Subjective question grading.
- Public GitHub Pages deployment and final GitHub Release.
- Advanced history analytics/search, graph-style lineage visualization, and a History pagination/virtualization layer (deferred to a future version if History size becomes a practical problem).
- Per-paper audio playback policies, seeking/scrubbing restrictions, and replay limits (V2 deferred).

## Next Engineering Objective

1. **Pre-Freeze Scope Closure · Batch B**: Implement Objective Question Media (optional image and/or audio across all 5 question types, image zoom viewing, in-question audio player bar).
2. **Whole-Product Feature Complete Review V3**: Conduct comprehensive whole-product review and recommend entering Feature Freeze.
3. **Milestone 7 Product Hardening**: Enter Feature Freeze and execute product hardening items (including metacognitive marking toggle UX polish).

## Repository State

- Default branch: `main`
- Remote: `origin`
- Verified baseline before M6.7: `61cd16f Record M6.6 merge into main` (`main`)
- M6.7 merge commit: `d6a5327 M6.7: History, Retry, Portability, and Whole-Product Integration (#6)` (`main`) — squash of the main implementation, the PR/CI status update, and the deletion-integrity closure patch
- Current documentation revision: the commit containing this status file; use Git history for its immutable identifier
- Local Runtime Recovery baseline: exact remote `main` commit `eb5b70b7e820b1bd0183b2f864ebb892c5e70b47`; PR #11 merged as `6b38c40`, and the BAT CRLF follow-up PR #12 merged as `6643a1b`
- Private repository status: assumed private based on current project policy and deferred Pages decision
- Pull request status: PR #15 (`feature/pre-freeze-scope-batch-a`) implements Batch A (Practice Feedback Modes & Special Practice IA), passes Human Gate A (PASS) and CI, and merges into `main`. Historical PR #14 (`ui/layered-paper-productization`) remains merged on `main`.
