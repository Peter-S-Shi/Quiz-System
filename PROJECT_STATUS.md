# Project Status

## Current Phase

Feature Development - Scope Reopened

## Current Milestone

Milestone 6.6: External Teacher Round Trip - implementation complete / M6-wide acceptance deferred

## Acceptance Policy (Changed)

The user has intentionally deferred individual formal user acceptance for M6.2 through M6.7. Implementation review, regression testing, CI, and scope review still apply to each sub-milestone, but one comprehensive M6 acceptance will happen after M6.7 is complete. M6.0 and M6.1 were already individually accepted before this policy change and remain historically accepted; that is not being revised retroactively. Do not read "implementation complete / M6-wide acceptance deferred" as equivalent to accepted.

## Current Release Scope

The current-version scope includes the Milestone 1-5 baseline and the approved Milestone 6 line. Translation Practice remains M6's primary new learner workflow. M6.0 Open Teaching Interchange and M6.1 Translation Domain and Persistence Foundation are accepted. M6.2 Translation Library and Material Import/Export, M6.3 Translation Practice and Session Recovery, M6.4 Learner Answer Marking and Annotation Foundation, M6.5 Rich Correction / Revision Workspace, and M6.6 External Teacher Round Trip are implementation complete with M6-wide acceptance deferred. M6.6 completes the first real end-to-end Open Teaching Interchange round trip without any in-app AI API: export a self-contained review-request from a finalized Translation Learner Response, import a returned canonical Teacher Review with validation/preview/confirm, and export a remediation-request that an external party can use to produce a new Translation Document with cross-validated provenance, importable and practiceable like any other material. M6 remains local-first and does not require embedded AI APIs, paid inference, or network access.

## Feature Complete Status

Previous candidate review reached; current scope reopened and no longer feature complete.

Milestone 1 is complete as the foundation baseline. Milestones 2-5 have first implementations landed, but full acceptance is pending. The Feature Complete Candidate review reached under that earlier boundary remains historical evidence. M6.0 and M6.1 are accepted. M6.2, M6.3, M6.4, M6.5, and M6.6 are implementation complete with M6-wide acceptance deferred; M6.7 remains unimplemented. A new whole-product Feature Complete Review is required after all Milestone 6 work is implemented and the deferred M6-wide acceptance is complete.

## Feature Freeze Status

Not entered.

Feature Freeze can begin only after Milestone 6 is implemented and the deferred M6-wide acceptance is complete, the reopened scope passes a new Feature Complete Review, Deferred Features are separated from the current version, and the user explicitly accepts the expanded product boundary.

## Open Release Blockers

- Full project-wide manual acceptance has not been completed.
- The comprehensive M6-wide acceptance covering M6.0-M6.7 has not happened yet; M6.2, M6.3, M6.4, M6.5, and M6.6 are implementation complete but not individually accepted by design.
- The External Teacher Round Trip now exists, but History/Retry/Portability (M6.7) has not started.
- Data migration, backup round-trip, active-session recovery, and destructive workflows have not yet received formal end-to-end verification.
- Public Pages deployment remains deferred while the repository is private.
- A release candidate and final clean-environment verification do not yet exist.

## Hardening Progress

Not started.

Product Hardening is Milestone 7 and will begin only after all Milestone 6 work passes review and Feature Freeze is explicitly entered.

## Verification Status

- 178 automated core/interchange/translation/import/session/annotation/corrections/review/transport tests pass. M6.6 closure coverage proves that raw external Teacher Reviews cannot hide unsupported top-level/item/correction fields, protected replacement evidence, malformed reviewer metadata, or missing canonical fields behind normalization; dedicated remediation import rejects missing/wrong-purpose provenance and malformed raw author metadata while accepting complete locally resolved lineage; review/remediation request runtime validators and public schemas reject unsupported package/output versions and empty tasks; and both app-localized remediation export instructions name the required provenance timestamp/actor metadata. All earlier M6.0-M6.6 coverage remains green.
- CI workflow exists; it passed on the `milestone/6.6-external-teacher-round-trip` branch.
- A local browser smoke test exercised the complete M6.6 round trip live: practice and finalize a Translation response; export a review request from the completion screen and confirm it embeds the correct `learnerResponse`/`requestedOutput`; construct an external Teacher Review referencing that response and import it via the finalized-responses row, confirming the preview shows the correct target response, reviewer, review ID, "new review" status, item/correction/remediation-recommendation counts; **Cancel** and confirm no `teacherReviews` were persisted; re-import and **Confirm**, confirming the review persists; open the Correction Workspace (auto-opened since exactly one review existed) and confirm the imported correction renders; export the review JSON and a remediation request from inside the workspace and confirm their contents; construct and import a remediation Translation Document with provenance pointing at the response/review, confirming the preview resolves and displays the real source response/review titles and the document persists into the chosen folder with provenance intact; start and finish practice on the remediation document, confirming the active session carries `materialProvenance` and the finalized response carries full lineage (`sourceResponseId`/`sourceReviewId`/`sourceMaterialId`/`author`); confirm the original response and its `provenance` remain byte-for-byte unchanged; import a second review for the original response and confirm the multi-review picker appears, that opening a specific review shows its own corrections/judgment, and that the in-workspace switcher moves between reviews correctly; attempt to import an orphan-`responseId` review and confirm it is rejected with a clear error and a disabled Confirm button; and confirm the English locale renders the same flow correctly — no console errors at any point.
- The browser harness confirmed export download triggers (correct filename and event) but did not capture the programmatic download's on-disk content in earlier milestones; for M6.6 the smoke test instead intercepted the `Blob` constructor to inspect exported review-request/remediation-request/review-JSON content directly, which is a stronger check than filename-only verification but still not identical to opening a real downloaded file from disk.
- The browser harness cannot drive native `window.prompt()`/`window.confirm()` dialogs, nor real OS file picker dialogs; M6.6's file-based Teacher Review and remediation-document imports were smoke-tested by constructing an in-memory `File`/`DataTransfer` and dispatching a `change` event on the file input, which exercises the exact same `FileReader` code path a real file selection would but does not exercise the native picker UI itself. This is a known automation-harness limitation, not a product defect.
- Manual acceptance for the full v1 journey is not complete.
- Clean clone verification has not been performed.
- GitHub Pages deployment is manual-only and deferred.
- M6.0 and M6.1 are accepted. M6.2, M6.3, M6.4, M6.5, and M6.6 have automated and smoke-test coverage; formal acceptance for all five is intentionally deferred to the comprehensive M6-wide review after M6.7.

## Known Risks

- GitHub Pages cannot currently be treated as available because the repository remains private and Pages deployment is deferred.
- Browser `file://` opening is not supported for the ES module app; users must use a local static server or `start-local.bat`.
- The project has a larger feature surface than its current manual QA evidence.
- Finalized Learner Responses use browser local storage without silent history truncation; large long-term evidence collections may eventually encounter browser storage limits.
- The external Teacher Review and remediation round trip now exists, but it is entirely manual (export a file, hand it to an external party, import the file they return); there is no in-app AI integration, and none is planned for M6.6 or M6.7.
- The current UI does not offer a way to browse a completed Translation Document's Learner Response history beyond the immediate post-completion screen, a minimal finalized-responses list on the document editor, and a minimal multi-review picker inside the Correction Workspace; detailed history/retry/lineage-dashboard views are explicitly scoped to M6.7.
- If a Translation Document (including a remediation one) is deleted while its Learner Response evidence exists, that evidence remains valid (it carries its own material snapshot and, for remediation evidence, its own copy of the source provenance) but is no longer reachable through a document editor; this matches the existing Objective Quiz behavior where deleting a paper does not delete its Learner Responses.
- Deferring acceptance to the end of M6 means integration issues across M6.2-M6.7 may surface later than they would under per-milestone acceptance; regression tests and CI are relied on more heavily in the interim.
- Whether the learner revealed a hidden reference translation is tracked only in the active session, not carried into finalized evidence; this remains true for remediation-material practice as well.
- A response may now legitimately accumulate an unbounded number of Teacher Reviews over time (from repeated external round trips); there is no review-history cap by design (matching the existing no-cap policy for Learner Responses), but there is also no way yet to remove a review, which is left to M6.7's history/retry scope.
- The review-request/remediation-request "task" instruction text embedded in exported packages is a fixed, non-configurable string per locale; it is not user-editable and assumes the external reviewer/agent can follow a plain-text natural-language instruction, which is a reasonable but unverified assumption for some non-LLM external tools.

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
- Rich correction authoring (style/insert/replace/delete/comment selection and the color picker) on touch/mobile viewports.
- Manual inspection of a real browser's native `window.prompt()` dialogs for Insert/Replace/Comment text entry.
- A real end-to-end round trip using an actual external human reviewer or a real AI assistant/LLM session (not a synthetic fixture) to produce a Teacher Review or remediation Translation Document from an exported request file.
- Native OS file-picker behavior for the new Teacher Review and remediation-document file inputs (the automated smoke test dispatched a synthetic `File`/`change` event rather than driving a real picker dialog).
- Very large review-request/remediation-request export files (many items, many corrections) have not been tested for practical file size or the target external tool's context/input limits.

## Deferred Features

- AI-assisted question generation.
- Desktop application packaging.
- Cloud sync and user accounts.
- Sharing, collaboration, and in-app teacher account/administration workflows.
- Subjective question grading.
- Public GitHub Pages deployment and final GitHub Release.

## Next Engineering Objective

M6.6 is implementation complete and pushed for independent review. M6.7 History, Retry, Portability, and Whole-Product Integration is next in the approved sub-milestone sequence, but must not begin without a new, explicit user prompt starting it. Do not begin Product Hardening or Feature Freeze work before the comprehensive M6-wide acceptance (covering M6.0-M6.7) is complete.

## Repository State

- Default branch: `main`
- Remote: `origin`
- Verified baseline before M6.6: `27ecff8 Record M6.5 closure merge into main in PROJECT_STATUS.md` (`main`)
- Current documentation revision: the commit containing this status file; use Git history for its immutable identifier
- Synchronization target: validated M6.6 feature work on `milestone/6.6-external-teacher-round-trip`, open as PR #5 against `main` and not to be merged without explicit instruction
- Private repository status: assumed private based on current project policy and deferred Pages decision
- Pull request status: PR #5 is open for independent review; it must not be merged until the user explicitly instructs it
