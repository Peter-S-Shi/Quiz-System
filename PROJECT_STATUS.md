# Project Status

## Current Phase

Feature Development - Scope Reopened

## Current Milestone

Milestone 6.3: Translation Practice and Session Recovery - implementation complete / M6-wide acceptance deferred

## Acceptance Policy (Changed)

The user has intentionally deferred individual formal user acceptance for M6.2 through M6.7. Implementation review, regression testing, CI, and scope review still apply to each sub-milestone, but one comprehensive M6 acceptance will happen after M6.7 is complete. M6.0 and M6.1 were already individually accepted before this policy change and remain historically accepted; that is not being revised retroactively. Do not read "implementation complete / M6-wide acceptance deferred" as equivalent to accepted.

## Current Release Scope

The current-version scope includes the Milestone 1-5 baseline and the approved Milestone 6 line. Translation Practice remains M6's primary new learner workflow. M6.0 Open Teaching Interchange and M6.1 Translation Domain and Persistence Foundation are accepted. M6.2 Translation Library and Material Import/Export and M6.3 Translation Practice and Session Recovery are implementation complete with M6-wide acceptance deferred. M6.3 adds the first productive-recall Translation Practice workflow: starting practice from a document, writing translations with source text visible and reference translation hidden by default, navigating between items, recovering an interrupted session, and finalizing into a protected non-objective Learner Response. M6 remains local-first and does not require embedded AI APIs, paid inference, or network access.

## Feature Complete Status

Previous candidate review reached; current scope reopened and no longer feature complete.

Milestone 1 is complete as the foundation baseline. Milestones 2-5 have first implementations landed, but full acceptance is pending. The Feature Complete Candidate review reached under that earlier boundary remains historical evidence. M6.0 and M6.1 are accepted. M6.2 and M6.3 are implementation complete with M6-wide acceptance deferred; M6.4-M6.7 remain unimplemented. A new whole-product Feature Complete Review is required after all Milestone 6 work is implemented and the deferred M6-wide acceptance is complete.

## Feature Freeze Status

Not entered.

Feature Freeze can begin only after Milestone 6 is implemented and the deferred M6-wide acceptance is complete, the reopened scope passes a new Feature Complete Review, Deferred Features are separated from the current version, and the user explicitly accepts the expanded product boundary.

## Open Release Blockers

- Full project-wide manual acceptance has not been completed.
- The comprehensive M6-wide acceptance covering M6.0-M6.7 has not happened yet; M6.2 and M6.3 are implementation complete but not individually accepted by design.
- Translation Practice sessions now exist, but Learner Answer Marking (M6.4), Rich Correction (M6.5), External Teacher Round Trip (M6.6), and History/Retry/Portability (M6.7) have not started.
- Data migration, backup round-trip, active-session recovery, and destructive workflows have not yet received formal end-to-end verification.
- Public Pages deployment remains deferred while the repository is private.
- A release candidate and final clean-environment verification do not yet exist.

## Hardening Progress

Not started.

Product Hardening is Milestone 7 and will begin only after all Milestone 6 work passes review and Feature Freeze is explicitly entered.

## Verification Status

- Forty-four automated core/interchange/translation/import/session tests pass, including stable Translation persistence, ordering, source-only and reference material, orphan prevention, explicit cascade deletion, non-objective Learner Response compatibility, finalized evidence protection, backup compatibility, public example validation, batch-import parsing, malformed-row rejection, JSON import folder reassignment, duplicate-ID collision handling, export/import round-trip against the public schema, Translation session snapshot stability against later document edits, answer persistence and navigation, malformed-session rejection, non-objective finalization, and isolated active-session storage keys.
- CI workflow exists.
- A local browser smoke test exercised the full M6.3 practice journey: start practice, answer and navigate items, reveal/hide an optional reference translation, refresh and resume with exact answers/position/reveal state restored, finish into a completed review screen with no fake score, confirm the active session is cleared only after evidence saves successfully, export the response, reload and confirm evidence persists, repeat practice producing a distinct response ID without altering the first, and run an Objective Quiz session concurrently with an unfinished Translation session to confirm neither corrupts the other. A discovered bug (selecting a different document while the M6.3 completion screen was showing did not switch away from it) was found and fixed during this smoke test. An earlier smoke test covered the full M6.2 Translation Library journey with no console errors.
- The browser harness confirmed export download triggers (correct filename and event) but did not capture the programmatic download's on-disk content, so manual inspection of downloaded files remains part of the deferred M6-wide acceptance.
- Manual acceptance for the full v1 journey is not complete.
- Clean clone verification has not been performed.
- GitHub Pages deployment is manual-only and deferred.
- M6.0 and M6.1 are accepted. M6.2 and M6.3 have automated and smoke-test coverage; formal acceptance for both is intentionally deferred to the comprehensive M6-wide review after M6.7.

## Known Risks

- GitHub Pages cannot currently be treated as available because the repository remains private and Pages deployment is deferred.
- Browser `file://` opening is not supported for the ES module app; users must use a local static server or `start-local.bat`.
- The project has a larger feature surface than its current manual QA evidence.
- Finalized Learner Responses use browser local storage without silent history truncation; large long-term evidence collections may eventually encounter browser storage limits.
- Translation Practice sessions now exist, but learner span markings, rich correction, and external Teacher Review round trips remain undesigned UX boundaries for later M6 sub-milestones.
- The current UI does not offer a way to browse a completed Translation Document's Learner Response history beyond the immediate post-completion screen; detailed history/retry views are explicitly scoped to M6.7.
- If a Translation Document is deleted while its Learner Response evidence exists, that evidence remains valid (it carries its own material snapshot) but is no longer reachable through a document editor; this matches the existing Objective Quiz behavior where deleting a paper does not delete its Learner Responses.
- Deferring acceptance to the end of M6 means integration issues across M6.2-M6.7 may surface later than they would under per-milestone acceptance; regression tests and CI are relied on more heavily in the interim.

## Unknown Or Unverified

- Full backup export and import round trip with realistic local data.
- Legacy single-paper migration behavior across representative old localStorage states.
- Active-session recovery across refresh and browser restart.
- Destructive workflows such as paper delete, history clear, and backup import overwrite scenarios.
- PWA install, offline behavior, and cache upgrade behavior across major browsers.
- Accessibility and responsive behavior across representative devices.
- Clean-environment clone and run process.
- Manual inspection of downloaded Learner Response JSON and a real browser backup/restore round trip containing learner evidence.
- Manual browser backup/restore round trip containing Translation Folder, Document, and Item data.
- Manual inspection of a downloaded Translation Document JSON file's on-disk content in a real browser (the automated smoke test verified the download trigger and filename, not on-disk bytes).
- Translation Practice session recovery across a genuine browser restart (refresh-based recovery was verified; full browser-close/reopen was not separately tested).
- Manual inspection of a downloaded Translation Learner Response JSON file's on-disk content in a real browser.

## Deferred Features

- AI-assisted question generation.
- Desktop application packaging.
- Cloud sync and user accounts.
- Sharing, collaboration, and in-app teacher account/administration workflows.
- Subjective question grading.
- Public GitHub Pages deployment and final GitHub Release.

## Next Engineering Objective

M6.4 Learner Answer Marking and Annotation Foundation is next in the approved sub-milestone sequence, but must not begin without a new prompt. Do not begin Product Hardening or Feature Freeze work before the comprehensive M6-wide acceptance (covering M6.0-M6.7) is complete.

## Repository State

- Default branch: `main`
- Remote: `origin`
- Verified baseline before M6.3: `2774d58 Build M6.2 Translation Library and material import/export` (squash-merged; includes the CI dependency-install fix)
- Current documentation revision: the commit containing this status file; use Git history for its immutable identifier
- Synchronization target: validated M6.3 feature work on `milestone/6.3-translation-practice`, to be opened as a pull request against `main` and not merged without explicit instruction
- Private repository status: assumed private based on current project policy and deferred Pages decision
- Pull request status: a pull request is being opened for `milestone/6.3-translation-practice` for independent review; it must not be merged until the user explicitly instructs it
