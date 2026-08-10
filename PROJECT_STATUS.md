# Project Status

## Current Phase

Feature Development - Scope Reopened

## Current Milestone

Milestone 6.5: Rich Correction / Revision Workspace - closure complete / M6-wide acceptance deferred

## Acceptance Policy (Changed)

The user has intentionally deferred individual formal user acceptance for M6.2 through M6.7. Implementation review, regression testing, CI, and scope review still apply to each sub-milestone, but one comprehensive M6 acceptance will happen after M6.7 is complete. M6.0 and M6.1 were already individually accepted before this policy change and remain historically accepted; that is not being revised retroactively. Do not read "implementation complete / M6-wide acceptance deferred" as equivalent to accepted.

## Current Release Scope

The current-version scope includes the Milestone 1-5 baseline and the approved Milestone 6 line. Translation Practice remains M6's primary new learner workflow. M6.0 Open Teaching Interchange and M6.1 Translation Domain and Persistence Foundation are accepted. M6.2 Translation Library and Material Import/Export, M6.3 Translation Practice and Session Recovery, M6.4 Learner Answer Marking and Annotation Foundation, and M6.5 Rich Correction / Revision Workspace are implementation complete with M6-wide acceptance deferred. M6.4 adds learner-controlled metacognitive marking (`unknown` / `uncertain` / `should_know`) on spans of the learner's own Translation Practice answers, preserved as structured evidence in the finalized Learner Response. M6.5 adds a Correction Workspace where a reviewer can inspect a finalized Translation Learner Response's immutable original answer and add structured rich correction evidence (styles, insert/replace/delete, comments) in a separate, additive Teacher Review layer. M6 remains local-first and does not require embedded AI APIs, paid inference, or network access.

## Feature Complete Status

Previous candidate review reached; current scope reopened and no longer feature complete.

Milestone 1 is complete as the foundation baseline. Milestones 2-5 have first implementations landed, but full acceptance is pending. The Feature Complete Candidate review reached under that earlier boundary remains historical evidence. M6.0 and M6.1 are accepted. M6.2, M6.3, M6.4, and M6.5 are implementation complete with M6-wide acceptance deferred; M6.6-M6.7 remain unimplemented. A new whole-product Feature Complete Review is required after all Milestone 6 work is implemented and the deferred M6-wide acceptance is complete.

## Feature Freeze Status

Not entered.

Feature Freeze can begin only after Milestone 6 is implemented and the deferred M6-wide acceptance is complete, the reopened scope passes a new Feature Complete Review, Deferred Features are separated from the current version, and the user explicitly accepts the expanded product boundary.

## Open Release Blockers

- Full project-wide manual acceptance has not been completed.
- The comprehensive M6-wide acceptance covering M6.0-M6.7 has not happened yet; M6.2, M6.3, M6.4, and M6.5 are implementation complete but not individually accepted by design.
- Rich Correction now exists, but External Teacher Round Trip (M6.6) and History/Retry/Portability (M6.7) have not started.
- Data migration, backup round-trip, active-session recovery, and destructive workflows have not yet received formal end-to-end verification.
- Public Pages deployment remains deferred while the repository is private.
- A release candidate and final clean-environment verification do not yet exist.

## Hardening Progress

Not started.

Product Hardening is Milestone 7 and will begin only after all Milestone 6 work passes review and Feature Freeze is explicitly entered.

## Verification Status

- 124 automated core/interchange/translation/import/session/annotation/corrections/review tests pass, including stable Translation persistence, ordering, source-only and reference material, orphan prevention, explicit cascade deletion, non-objective Learner Response compatibility, finalized evidence protection, backup compatibility, public example validation, batch-import parsing, malformed-row rejection, JSON import folder reassignment, duplicate-ID collision handling, export/import round-trip against the public schema, Translation session snapshot stability against later document edits, a regression test that a `documentId`-based practice start (rather than a stale captured document reference) picks up an edit made after the last render, answer persistence and navigation, malformed-session rejection, non-objective finalization, isolated active-session storage keys, all three annotation kinds, multiword spans, zero-length/invalid-range/unknown-kind rejection, anchored-text matching, exact-span replace and overlap rejection, answer-edit invalidation, annotation survival through session serialization/recovery, safe rejection of individually malformed persisted annotations, finalized `learnerAnnotations` schema/backward-compatibility, deterministic overlap resolution for persisted annotations recovered from storage, runtime cross-validation of finalized `learnerAnnotations` anchors (text match, in-range, no per-item overlap) against the corresponding learner answer, every rich-correction style/operation type, orthogonal-style overlap, content-changing-operation conflict rejection, anchor mismatch/out-of-range/duplicate-ID rejection for corrections, HTML-like reviewer text remaining plain safe data, Teacher Review persistence/reload/reopen, no silent review-ID reassignment, Teacher Review backup/restore round-trip and legacy/malformed-data handling, orphan Teacher Review rejection when Learner Response context is supplied (and context-free structural-only validation when it is not), `validateCorrection()`/`validateTeacherReview()`/public-schema agreement on operation-specific correction semantics (insert/replace/delete/style/comment field and range requirements), reviewer-selected color persisting on insert/replace corrections through save/reload, and a multi-response regression test that `upsertTeacherReview()` given a full `learnerResponses` collection validates each existing/new review against its own response (not the response currently being saved), preserves both reviews, still rejects reassignment and orphan `responseId`s, and survives backup/restore for reviews spanning multiple Learner Responses.
- CI workflow exists; it passed on the final `milestone/6.5-rich-correction` commit and again on `main` after the PR #4 merge (`5421ef4`).
- A local browser smoke test exercised the M6.5 Correction Workspace journey: open the workspace from the practice-completion screen and from a Translation Document's finalized-responses list, confirm the original answer and source item render correctly, apply overlapping bold and underline to the same span, apply a replace with reviewer-colored inserted text, confirm the preview renders it correctly, attempt a conflicting delete on an overlapping span and confirm it is rejected with a toast, remove a correction, add an item comment/suggested revision/judgment, save, reload the page, reopen the same review from the finalized-responses list and confirm every correction/comment/revision/judgment and the untouched original answer are intact, confirm HTML-like reviewer text renders as escaped plain text (no injected `<img>`/script tags), and confirm the English locale renders correctly — no new console errors. Earlier smoke tests covered the full M6.4 marking journey, the M6.3 practice/recovery journey, and the M6.2 Translation Library journey.
- Two closure-scoped bugs found during M6.5 smoke testing were fixed and each independently verified live in the browser (not just by automated test): (1) the stale-`doc`-snapshot practice-start bug (pre-existing since M6.2) — verified by editing a Translation Item's source text without triggering a re-render, clicking Start Practice, and confirming the finalized session captured the edited text, not the stale one; (2) the multi-response Teacher Review save bug (introduced by M6.5's own referential-integrity check) — verified by completing two separate Translation Practice sessions to produce two finalized Learner Responses, saving a Teacher Review for the first, then the second, confirming via `localStorage` inspection that both reviews persisted independently with correct content, and confirming each reopens correctly from its own finalized-responses entry.
- The browser harness confirmed export download triggers (correct filename and event) but did not capture the programmatic download's on-disk content, so manual inspection of downloaded files remains part of the deferred M6-wide acceptance.
- The browser harness cannot drive native `window.prompt()`/`window.confirm()` dialogs directly; M6.5's Insert/Replace/Comment text entry (and earlier folder/rename/discard confirmations) were smoke-tested by scripting the page's `window.prompt`/`window.confirm` rather than real native dialogs. This is a known automation-harness limitation, not a product defect, since a real browser's native dialogs are synchronous and never throw.
- Manual acceptance for the full v1 journey is not complete.
- Clean clone verification has not been performed.
- GitHub Pages deployment is manual-only and deferred.
- M6.0 and M6.1 are accepted. M6.2, M6.3, M6.4, and M6.5 have automated and smoke-test coverage; formal acceptance for all four is intentionally deferred to the comprehensive M6-wide review after M6.7.

## Known Risks

- GitHub Pages cannot currently be treated as available because the repository remains private and Pages deployment is deferred.
- Browser `file://` opening is not supported for the ES module app; users must use a local static server or `start-local.bat`.
- The project has a larger feature surface than its current manual QA evidence.
- Finalized Learner Responses use browser local storage without silent history truncation; large long-term evidence collections may eventually encounter browser storage limits.
- Learner answer marking and rich correction now exist, but external Teacher Review round trips (export/import, external AI/human review) remain undesigned UX boundaries for M6.6.
- The current UI does not offer a way to browse a completed Translation Document's Learner Response history beyond the immediate post-completion screen and a minimal finalized-responses list on the document editor added for M6.5 correction-authoring access; detailed history/retry views are explicitly scoped to M6.7.
- A pre-existing UI behavior since M6.2 (found during M6.5 smoke testing, fixed separately as follow-up work, not part of M6.5's own scope): `startTranslationPractice()` used to close over the `doc` object captured at the last full render, so editing a Translation Item's text and immediately clicking **Start practice** without an intervening re-render could snapshot the pre-edit text into the new session. Fixed by having it take a `documentId` and re-look up the document from the live `translationLibrary` at click time.
- A bug introduced by M6.5's own new referential-integrity check (found and fixed as part of M6.5 closure, not a pre-existing issue): `saveCorrectionReview()` called `upsertTeacherReview()` with a single-response `{ learnerResponse }` context, which caused the *entire* existing Teacher Review collection to be revalidated against that one response while saving — so saving a review for one Learner Response could reject an already-persisted review belonging to a different Learner Response, making it impossible to review more than one response. Fixed by passing the full `{ learnerResponses }` collection so each review resolves its own `responseId` independently; the underlying `upsertTeacherReview()`/`resolveResponseContext()` logic already supported this mode (used by `loadTeacherReviews()` and backup restore) and did not need to change.
- If a Translation Document is deleted while its Learner Response evidence (including any learner annotations) exists, that evidence remains valid (it carries its own material snapshot) but is no longer reachable through a document editor; this matches the existing Objective Quiz behavior where deleting a paper does not delete its Learner Responses.
- Deferring acceptance to the end of M6 means integration issues across M6.2-M6.7 may surface later than they would under per-milestone acceptance; regression tests and CI are relied on more heavily in the interim.
- Whether the learner revealed a hidden reference translation is tracked only in the active session, not carried into finalized evidence; if a later M6.x needs that signal for correction/review, it will require a deliberate additive design decision rather than being available for free.

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
- Learner annotation marking, review, and removal on touch/mobile viewports, where text-selection ergonomics differ from desktop pointer/keyboard selection.
- Rich correction authoring (style/insert/replace/delete/comment selection and the color picker) on touch/mobile viewports, where text-selection ergonomics differ from desktop pointer/keyboard selection.
- Manual inspection of a real browser's native `window.prompt()` dialogs for Insert/Replace/Comment text entry (the automated smoke test scripted `window.prompt` directly, since the browser automation harness cannot drive native modal dialogs).

## Deferred Features

- AI-assisted question generation.
- Desktop application packaging.
- Cloud sync and user accounts.
- Sharing, collaboration, and in-app teacher account/administration workflows.
- Subjective question grading.
- Public GitHub Pages deployment and final GitHub Release.

## Next Engineering Objective

M6.5 closure is complete and merged into `main`. M6.6 External Teacher Round Trip is next in the approved sub-milestone sequence, but must not begin without a new, explicit user prompt starting it; work is currently paused waiting for that prompt. Do not begin Product Hardening or Feature Freeze work before the comprehensive M6-wide acceptance (covering M6.0-M6.7) is complete.

## Repository State

- Default branch: `main`
- Remote: `origin`
- Verified baseline before M6.5: `90adb8c M6.4: Learner Answer Marking and Annotation Foundation (#3)` (squash-merged, main)
- Current baseline: `5421ef4 M6.5: Rich Correction / Revision Workspace (#4)` (squash-merged, main) — includes the Correction Workspace itself, the M6.5 closure patch (Teacher Review to Learner Response referential integrity, aligned correction semantics across `validateCorrection()`/`validateTeacherReview()`/the public schema, reviewer-selected color wired into insert/replace corrections), and the two closure-scoped bug fixes (the stale-`doc`-snapshot practice-start fix and the multi-response Teacher Review persistence fix)
- Current documentation revision: the commit containing this status file; use Git history for its immutable identifier
- Synchronization target: none open; `main` is up to date with `origin/main` at `5421ef4` and the local working tree is clean
- Private repository status: assumed private based on current project policy and deferred Pages decision
- Pull request status: pull request #4 for `milestone/6.5-rich-correction` was squash-merged into `main` per explicit user instruction; the source branch was left in place (not deleted) and is now fully contained in `main`
