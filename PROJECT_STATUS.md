# Project Status

## Current Phase

Feature Development - Scope Reopened

## Current Milestone

Milestone 6.7: History, Retry, Portability, and Whole-Product Integration - implementation complete / M6-wide acceptance deferred

M6.7 is the last feature-development sub-milestone of M6. M6 feature-development implementation is now complete.

## Acceptance Policy (Changed)

The user has intentionally deferred individual formal user acceptance for M6.2 through M6.7. Implementation review, regression testing, CI, and scope review still apply to each sub-milestone, but one comprehensive M6 acceptance will happen now that M6.7 is complete. M6.0 and M6.1 were already individually accepted before this policy change and remain historically accepted; that is not being revised retroactively. Do not read "implementation complete / M6-wide acceptance deferred" as equivalent to accepted.

## Current Release Scope

The current-version scope includes the Milestone 1-5 baseline and the approved Milestone 6 line. Translation Practice remains M6's primary new learner workflow. M6.0 Open Teaching Interchange and M6.1 Translation Domain and Persistence Foundation are accepted. M6.2 Translation Library and Material Import/Export, M6.3 Translation Practice and Session Recovery, M6.4 Learner Answer Marking and Annotation Foundation, M6.5 Rich Correction / Revision Workspace, M6.6 External Teacher Round Trip, and M6.7 History, Retry, Portability, and Whole-Product Integration are implementation complete with M6-wide acceptance deferred. M6.7 turns the completed Translation/Open Teaching feature set into a durable product: Translation History browsing across every finalized response (independent of whether the source document still exists), explicit retry (entire response / selected items / needs-work items) that always produces new independent evidence, backward/forward lineage navigation, and explicit, warned deletion for Translation Documents, Learner Responses, and Teacher Reviews. M6 remains local-first and does not require embedded AI APIs, paid inference, or network access.

## Feature Complete Status

Previous candidate review reached; current scope reopened and no longer feature complete.

Milestone 1 is complete as the foundation baseline. Milestones 2-5 have first implementations landed, but full acceptance is pending. The Feature Complete Candidate review reached under that earlier boundary remains historical evidence. M6.0 and M6.1 are accepted. M6.2 through M6.7 are implementation complete with M6-wide acceptance deferred; M6 feature-development implementation is complete. A new whole-product Feature Complete Review is required after the deferred M6-wide acceptance is complete.

## Feature Freeze Status

Not entered.

Feature Freeze can begin only after the deferred M6-wide acceptance is complete, the reopened scope passes a new Feature Complete Review, Deferred Features are separated from the current version, and the user explicitly accepts the expanded product boundary.

## Open Release Blockers

- Full project-wide manual acceptance has not been completed.
- The comprehensive M6-wide acceptance covering M6.0-M6.7 has not happened yet; M6.2 through M6.7 are implementation complete but not individually accepted by design.
- M6 feature-development implementation is complete; no further M6.x sub-milestones remain, but the comprehensive M6-wide acceptance itself is a release blocker until performed.
- Data migration, backup round-trip, active-session recovery, and destructive workflows have not yet received formal end-to-end verification.
- Public Pages deployment remains deferred while the repository is private.
- A release candidate and final clean-environment verification do not yet exist.

## Hardening Progress

Not started.

Product Hardening is Milestone 7 and will begin only after all Milestone 6 work passes review and Feature Freeze is explicitly entered.

## Verification Status

- 213 automated core/interchange/translation/import/session/annotation/corrections/review/transport/history/retry/deletion tests pass (178 -> 206 for the main M6.7 implementation, 206 -> 213 for the deletion-integrity closure patch below). New coverage proves: Translation History entries and status derive correctly from Learner Response/Teacher Review data alone and remain correct after the live document is deleted; the needs-work rule fires for every learner-annotation kind and every review judgment/correction signal and stays deterministic regardless of review order; retry-entire/selected/needs-work always build from the historical snapshot (never the live document), work after the source document is deleted, never mutate the original response, and carry retry provenance distinct from remediation provenance; lineage resolution walks both directions and safely represents a deleted ancestor response or review as unavailable; and every deletion-dependency case (document/response/review, with and without dependents) is covered. All earlier M6.0-M6.6 coverage remains green.
- **Deletion-integrity closure patch**: a post-approval review found that `analyzeLearnerResponseDeletion()`/`analyzeTeacherReviewDeletion()` ignored live remediation Translation Documents, so deleting a Learner Response or Teacher Review could leave a still-live remediation document in the Translation Library with unresolvable provenance — inconsistent with `parseLibraryBackup()`, which correctly requires a live remediation document's provenance to resolve on every restore. Fixed by distinguishing a finalized response's own (safely-unresolvable) historical provenance from a *live* remediation document's canonical claim: both analysis functions now accept `translationDocuments` and report `dependentRemediationDocumentIds`/`hasBlockingDependents`, and the delete flows in `app.js` refuse the deletion outright (a toast warning, no confirmation dialog) while such a live dependency exists, rather than cascading through it. Remediation documents are never auto-deleted as a side effect. Added 7 tests, including a regression guard proving the pre-patch sequence would have produced an unrestorable backup, and a full backup round trip proving a permitted deletion (remediation document removed first) still restores cleanly.
- **Local launcher port conflict and verification fix (M6 acceptance-support)**: Fixed `start-local.bat` to dynamically locate a free TCP port starting from `8000`, verify that the server has successfully started listening and is serving the correct app content (checking for 'Quiz Studio' in response body) by writing and running a temporary Python HTTP client script (polling up to 5 attempts, using a safe non-interactive ping delay), and only then launch the browser with the correct URL. Also upgraded the caching strategy in `sw.js` to Network-First (v4) with immediate active takeover (`skipWaiting`/`claim`) to prevent stale Service Worker caches from showing the wrong UI version. Verified in free-port, occupied-port, repeated-launch, incorrect-server-rejection, and M6 UI scenarios.
- CI workflow exists; it passed on the `milestone/6.7-history-retry-integration` branch (PR #6), including after the deletion-integrity closure patch.
- A local browser smoke test exercised the complete M6.7 journey live using seeded fixtures (a response with two reviews carrying conflicting judgments): browsed and filtered Translation History by origin/status/sort; opened a history detail view and confirmed item-level evidence, learner marks, and both linked reviews were reachable; ran a real **Retry needs-work items** action and confirmed the new session contained only the flagged item with `materialProvenance.purpose: "retry"`, then finished it and confirmed the finalized response carried retry provenance (`sourceResponseId`/`sourceMaterialId`) while the original response was untouched; ran **Retry selected items** with one item unchecked and confirmed only the selected item carried over; followed lineage forward from the original response to the retry response and back; deleted a Teacher Review referenced by a retry response's `sourceReviewId` and confirmed the lineage view then showed it as unavailable rather than crashing; deleted a Translation Document with a dependent finalized response and confirmed the confirmation named the dependent count and the response remained fully browsable/retriable from History afterward; and triggered the response-deletion cascade confirmation, which correctly named the dependent review/derived-record counts before deleting the response together with its reviews while leaving the derived retry response in place. English-locale parity was spot-checked on the same flows.
- During this smoke test, found and fixed one real bug (not caught by unit tests, since it lives in `app.js` UI glue rather than a core module): `deleteLearnerResponseConfirm()` originally wrote the updated Learner Response collection before reading `loadTeacherReviews()` again, and `loadTeacherReviews()` re-validates every review against the *current* response collection on every call — so it saw the just-orphaned reviews and threw. Fixed by snapshotting both collections up front. Re-verified after the fix with a clean isolated reproduction.
- **Service worker cache upgrade**: Originally, the service worker used a cache-first strategy which required manual cache clearing to pick up new deployments or changes. This is resolved: `sw.js` was upgraded to Network-First (v4) with immediate takeover triggers (`skipWaiting`/`claim`), ensuring updates are fetched immediately on reload when the server is running.
- The browser harness cannot drive native `window.confirm()`/`window.prompt()` dialogs; deletion and retry confirmations were smoke-tested by monkey-patching `window.confirm` to capture the exact message text and to accept/decline programmatically, which exercises the real confirmation logic and message content but not the native dialog UI itself. This is a known automation-harness limitation carried over from earlier milestones, not a product defect.
- Manual acceptance for the full v1 journey is not complete.
- Clean clone verification has not been performed.
- GitHub Pages deployment is manual-only and deferred.
- M6.0 and M6.1 are accepted. M6.2 through M6.7 have automated and smoke-test coverage; formal acceptance for all six is intentionally deferred to the comprehensive M6-wide review, which is now unblocked since M6.7 is complete.

## Known Risks

- GitHub Pages cannot currently be treated as available because the repository remains private and Pages deployment is deferred.
- Browser `file://` opening is not supported for the ES module app; users must use a local static server or `start-local.bat`.
- The project has a larger feature surface than its current manual QA evidence.
- Finalized Learner Responses use browser local storage without silent history truncation; large long-term evidence collections may eventually encounter browser storage limits. Translation History inherits this: it has no entry cap by design.
- The external Teacher Review and remediation round trip is entirely manual (export a file, hand it to an external party, import the file they return); there is no in-app AI integration, and none is planned.
- Deferring acceptance to the end of M6 means integration issues across M6.2-M6.7 may surface later than they would under per-milestone acceptance; regression tests and CI were relied on more heavily in the interim, and the comprehensive M6-wide acceptance is now the point where that trade-off gets tested.
- Whether the learner revealed a hidden reference translation is tracked only in the active session, not carried into finalized evidence; this remains true for retry and remediation-material practice as well.
- Deleting a Learner Response cascade-deletes its Teacher Reviews; there is no separate way to keep the reviews while removing only the response. This was a deliberate M6.7 design choice (a review's `responseId` link must always resolve), not an oversight, but a user who wants to keep review content after deleting a response must export the review first.
- Translation History, retry item-selection, and deletion confirmations have not been manually verified on touch/mobile viewports, where the item-selection checklist and multi-button action rows may need layout attention during M7 hardening.
- The review-request/remediation-request "task" instruction text embedded in exported packages is a fixed, non-configurable string per locale; it is not user-editable and assumes the external reviewer/agent can follow a plain-text natural-language instruction, which is a reasonable but unverified assumption for some non-LLM external tools.

## Unknown Or Unverified

- Full backup export and import round trip with realistic local data, including History/retry/remediation lineage at scale.
- Legacy single-paper migration behavior across representative old localStorage states.
- Active-session recovery across refresh and browser restart.
- Destructive workflows such as paper delete, history clear, and backup import overwrite scenarios.
- PWA install, offline behavior, and cache upgrade behavior across major browsers.
- Accessibility and responsive behavior across representative devices, including the new Translation History browser and retry item-selection checklist.
- Clean-environment clone and run process.
- Manual inspection of downloaded Learner Response JSON and a real browser backup/restore round trip containing learner evidence.
- Manual browser backup/restore round trip containing Translation Folder, Document, and Item data, and containing History/retry/remediation lineage.
- Manual inspection of a downloaded Translation Document JSON file's on-disk content in a real browser (the automated smoke test verified the download trigger and filename, not on-disk bytes).
- Translation Practice session recovery across a genuine browser restart (refresh-based recovery was verified; full browser-close/reopen was not separately tested), including a retry session.
- Manual inspection of a downloaded Translation Learner Response JSON file's on-disk content in a real browser.
- Learner annotation marking, review, removal, History browsing, and retry item-selection on touch/mobile viewports, where text-selection and multi-checkbox ergonomics differ from desktop pointer/keyboard interaction.
- Rich correction authoring (style/insert/replace/delete/comment selection and the color picker) on touch/mobile viewports.
- Manual inspection of a real browser's native `window.prompt()`/`window.confirm()` dialogs for Insert/Replace/Comment text entry and for retry/deletion confirmations.
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

## Next Engineering Objective

M6.7 (including the deletion-integrity closure patch) is implementation complete and merged into `main` through PR #6, completing M6 feature-development implementation. The comprehensive M6-wide acceptance (covering M6.0-M6.7) is the next step and requires the user's own review; it has not been performed. Do not begin Product Hardening (M7) or Feature Freeze work before that acceptance is complete.

## Repository State

- Default branch: `main`
- Remote: `origin`
- Verified baseline before M6.7: `61cd16f Record M6.6 merge into main` (`main`)
- M6.7 merge commit: `d6a5327 M6.7: History, Retry, Portability, and Whole-Product Integration (#6)` (`main`) — squash of the main implementation, the PR/CI status update, and the deletion-integrity closure patch
- Current documentation revision: the commit containing this status file; use Git history for its immutable identifier
- Synchronization status: M6.7 is merged into `main`; this status-only follow-up records the completed merge
- Private repository status: assumed private based on current project policy and deferred Pages decision
- Pull request status: PR #6 was squash-merged; a local-launcher bugfix branch `bugfix/local-launcher-port-conflict` is prepared for M6 acceptance review.
