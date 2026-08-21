# Project Status

## Current Phase

Feature Development - Scope Reopened

## Current Milestone

Milestone 6.7: History, Retry, Portability, and Whole-Product Integration - complete (M6 comprehensive human acceptance Journeys 01–10: PASS; UX hardening batch complete)

M6.7 is the last feature-development sub-milestone of M6. M6 feature-development implementation and comprehensive human acceptance are complete.

## Acceptance Policy (Historical Record)

Formal user acceptance for M6.2 through M6.7 was deferred to a unified M6 comprehensive acceptance once M6.7 implementation concluded. That comprehensive human acceptance (Journeys 01–10) has now been executed and passed (PASS). M6.0 and M6.1 were previously accepted individually.

## M6 Comprehensive Acceptance and Hardening Closure

- **M6 comprehensive acceptance Journeys 01–10**: PASS.
- Span Comment creation remains removed from the current product scope.
- **Small UX Hardening Closure Batch**:
  1. Item-level metacognitive marking: added first-class whole-item Unknown / Uncertain / Should know states, additive, persisted through session recovery and into finalized evidence, and reflected in needs-work derivation.
  2. Practice navigation boundary states: previous/next question navigation controls now carry disabled styling and boundary guards at first/last items.
  3. Backup restore immediate Translation Library refresh: in-memory `translationLibrary` and active document selection now update immediately upon backup restore without requiring an F5 browser reload.

## Current Release Scope

The current-version scope includes the Milestone 1-5 baseline and the approved Milestone 6 line. Translation Practice remains M6's primary new learner workflow. M6.0 Open Teaching Interchange, M6.1 Translation Domain and Persistence Foundation, and M6.2–M6.7 are verified with comprehensive manual acceptance Journeys 01–10 complete (PASS). M6.7 turns the completed Translation/Open Teaching feature set into a durable product: Translation History browsing across every finalized response (independent of whether the source document still exists), explicit retry (entire response / selected items / needs-work items) that always produces new independent evidence, backward/forward lineage navigation, and explicit, warned deletion for Translation Documents, Learner Responses, and Teacher Reviews. M6 remains local-first and does not require embedded AI APIs, paid inference, or network access.

## Feature Complete Status

Previous candidate review reached; current scope reopened and no longer feature complete.

Milestone 1 is complete as the foundation baseline. Milestones 2-5 have first implementations landed, but full acceptance is pending. The Feature Complete Candidate review reached under that earlier boundary remains historical evidence. M6 comprehensive acceptance Journeys 01–10 are complete (PASS) under the reduced comment scope and hardening batch. The next lifecycle gate is the whole-product Feature Complete Review before entering Feature Freeze.

## Feature Freeze Status

Not entered.

Feature Freeze can begin only after the reopened scope passes a new whole-product Feature Complete Review, Deferred Features are separated from the current version, and the user explicitly authorizes entering Feature Freeze.

## Open Release Blockers

- Full project-wide manual acceptance across all milestones (M1–M5 baseline + whole product) has not been completed.
- Legacy single-paper migration across representative old localStorage states and full browser-close/restart active-session recovery have not received dedicated verification.
- Public Pages deployment remains deferred while the repository is private.
- A release candidate and final clean-environment verification do not yet exist.

## Hardening Progress

Not started.

Product Hardening is Milestone 7 and will begin only after all Milestone 6 work passes review and Feature Freeze is explicitly entered.

## Verification Status

- 219 automated core/interchange/translation/import/session/annotation/corrections/review/transport/history/retry/deletion/sw-closure tests pass. Covers item-level metacognitive marking, schema/runtime validation, needs-work derivation, navigation boundaries, and backup state refresh. Historical `comment` and `strikethrough` validation remains green; all earlier M6.0-M6.7 coverage continues to pass.
- **Deletion-integrity closure patch**: a post-approval review found that `analyzeLearnerResponseDeletion()`/`analyzeTeacherReviewDeletion()` ignored live remediation Translation Documents, so deleting a Learner Response or Teacher Review could leave a still-live remediation document in the Translation Library with unresolvable provenance — inconsistent with `parseLibraryBackup()`, which correctly requires a live remediation document's provenance to resolve on every restore. Fixed by distinguishing a finalized response's own (safely-unresolvable) historical provenance from a *live* remediation document's canonical claim: both analysis functions now accept `translationDocuments` and report `dependentRemediationDocumentIds`/`hasBlockingDependents`, and the delete flows in `app.js` refuse the deletion outright (a toast warning, no confirmation dialog) while such a live dependency exists, rather than cascading through it. Remediation documents are never auto-deleted as a side effect. Added 7 tests, including a regression guard proving the pre-patch sequence would have produced an unrestorable backup, and a full backup round trip proving a permitted deletion (remediation document removed first) still restores cleanly.
- **Local launcher port conflict and verification fix (M6 acceptance-support)**: Fixed `start-local.bat` to dynamically locate a free TCP port starting from `8000`, verify that the server has successfully started listening and is serving the correct app content (checking for 'Quiz Studio' in response body) by writing and running a temporary Python HTTP client script (polling up to 5 attempts, using a safe non-interactive ping delay), and only then launch the browser with the correct URL. Also upgraded `sw.js` to Network-First (v4) with immediate active takeover (`skipWaiting`/`claim`), auto-navigation upgrade on legacy cache removal, and complete precaching of all 19 ESM modules in the app dependency closure. Verified in free-port, occupied-port, repeated-launch, incorrect-server-rejection, offline ESM closure, and M6 UI scenarios.
- CI workflow exists; it passed on the `milestone/6.7-history-retry-integration` branch (PR #6), including after the deletion-integrity closure patch.
- A local browser smoke test exercised the complete M6.7 journey live using seeded fixtures (a response with two reviews carrying conflicting judgments): browsed and filtered Translation History by origin/status/sort; opened a history detail view and confirmed item-level evidence, learner marks, and both linked reviews were reachable; ran a real **Retry needs-work items** action and confirmed the new session contained only the flagged item with `materialProvenance.purpose: "retry"`, then finished it and confirmed the finalized response carried retry provenance (`sourceResponseId`/`sourceMaterialId`) while the original response was untouched; ran **Retry selected items** with one item unchecked and confirmed only the selected item carried over; followed lineage forward from the original response to the retry response and back; deleted a Teacher Review referenced by a retry response's `sourceReviewId` and confirmed the lineage view then showed it as unavailable rather than crashing; deleted a Translation Document with a dependent finalized response and confirmed the confirmation named the dependent count and the response remained fully browsable/retriable from History afterward; and triggered the response-deletion cascade confirmation, which correctly named the dependent review/derived-record counts before deleting the response together with its reviews while leaving the derived retry response in place. English-locale parity was spot-checked on the same flows.
- During this smoke test, found and fixed one real bug (not caught by unit tests, since it lives in `app.js` UI glue rather than a core module): `deleteLearnerResponseConfirm()` originally wrote the updated Learner Response collection before reading `loadTeacherReviews()` again, and `loadTeacherReviews()` re-validates every review against the *current* response collection on every call — so it saw the just-orphaned reviews and threw. Fixed by snapshotting both collections up front. Re-verified after the fix with a clean isolated reproduction.
- **Service worker cache upgrade**: Originally, the service worker used a cache-first strategy which required manual cache clearing to pick up new deployments or changes. This is resolved: `sw.js` was upgraded to Network-First (v4) with immediate takeover triggers (`skipWaiting`/`claim`), ensuring updates are fetched immediately on reload when the server is running.
- The browser harness cannot drive native `window.confirm()`/`window.prompt()` dialogs; deletion and retry confirmations were smoke-tested by monkey-patching `window.confirm` to capture the exact message text and to accept/decline programmatically, which exercises the real confirmation logic and message content but not the native dialog UI itself. This is a known automation-harness limitation carried over from earlier milestones, not a product defect.
- Comprehensive M6 human acceptance Journeys 01–10 have been completed (PASS) under the reduced comment scope and hardening batch. Full v1 project-wide manual acceptance across all milestones remains open.
- Clean clone verification has not been performed.
- GitHub Pages deployment is manual-only and deferred.
- M6.0–M6.7 are implementation complete and verified through comprehensive human acceptance.

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

## Next Engineering Objective

M6.0–M6.7 feature implementation, comprehensive human acceptance (Journeys 01–10: PASS), and UX hardening closure are complete. The next lifecycle gate is the whole-product Feature Complete Review before entering Feature Freeze. Product Hardening (M7) and Feature Freeze have not started.

## Repository State

- Default branch: `main`
- Remote: `origin`
- Verified baseline before M6.7: `61cd16f Record M6.6 merge into main` (`main`)
- M6.7 merge commit: `d6a5327 M6.7: History, Retry, Portability, and Whole-Product Integration (#6)` (`main`) — squash of the main implementation, the PR/CI status update, and the deletion-integrity closure patch
- Current documentation revision: the commit containing this status file; use Git history for its immutable identifier
- Recovery baseline: exact remote `main` commit `242f2291df1b2ca2fcaa094308f8581a5579df57`; current work is on `recovery/m6-comment-scope-rollback`
- Private repository status: assumed private based on current project policy and deferred Pages decision
- Pull request status: historical Draft PR #8 and `recovery/m6-acceptance-closure` are preserved as backup and must not be merged. No merge is authorized for the fresh recovery branch.
