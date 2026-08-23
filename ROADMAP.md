# Quiz Studio Roadmap

This roadmap records the product lifecycle for Quiz Studio. It preserves the historical Milestone 1-5 structure while separating implementation status from acceptance, hardening, and release readiness.

## Milestone 1: Foundation Prototype

Status: Complete as foundation baseline

Milestone 1 established the local-first quiz authoring and practice prototype.

Scope completed:

- Editable quiz papers with title, description, and questions.
- Objective question support for single choice, multiple choice, fill-in-the-blank, true/false, and one-to-one matching.
- Shuffled answer options for quiz sessions.
- Correct and wrong answer feedback.
- Light and dark themes.
- Chinese and English interface support.
- Local browser storage.
- JSON import and export.
- English and Chinese project documentation.
- Private GitHub synchronization workflow.

## Milestone 2: Practice Flow Enhancements

Status: Complete as historical development baseline (subsequently unified into comprehensive M6/Pre-Freeze/M7 verification)

Milestone 2 improved the learner's practice loop so each quiz attempt could be recoverable, reviewable, repeatable, and easier to filter.

Implemented scope:

- Save in-progress quiz attempts and recover them after refresh.
- Check for unanswered questions before answer submission.
- Improve the result overview and answer comparison experience.
- Record answer history and scores.
- Allow wrong questions to be practiced separately.
- Support random question selection.
- Support filtering by question type.
- Keep new user-facing interface text available in Chinese and English.

Acceptance status (historical record):

- Individual M2 manual acceptance was deferred at this stage and subsequently unified into comprehensive M6, Pre-Freeze, and M7/M8 verification.

## Milestone 3: Local Quiz Library

Status: Complete as historical development baseline (subsequently verified in M6/Pre-Freeze/M7/M8)

Milestone 3 moved Quiz Studio from a single-paper workflow to a local quiz library so users can manage many quiz papers on the same device.

Implemented scope:

- Manage multiple quiz papers.
- Create, duplicate, rename, and delete quiz papers.
- Organize quiz papers with categories, tags, and search.
- Track recently opened papers and last updated times.
- Provide safer import, export, and full local backup workflows.
- Migrate older single-paper local data into the quiz library.

Acceptance status (historical record):

- Manual validation of destructive workflows, backup round trips, import safety, and legacy data migration was deferred at this stage and subsequently completed in M6, M7, and M8 verification.

## Milestone 4: Quiz Core and Open Data Format

Status: Complete as historical development baseline

Milestone 4 turned the prototype's internal logic into a more durable foundation by separating reusable quiz behavior from the interface.

Implemented scope:

- Split the former single-file app structure into smaller modules.
- Create independent question models, validators, and grading logic.
- Establish a unified Question Type Registry.
- Add `schemaVersion` and data migration support.
- Decouple storage logic from UI rendering.
- Add unit tests, formatting checks, and basic CI.
- Publish JSON Schema files and synthetic example quiz files.

Acceptance status (historical record):

- Core tests were established at this stage; comprehensive schema, migration, storage, and grading regression suites were expanded and accepted in later milestones (292 automated tests green).

## Milestone 5: Public Release Preparation Foundation

Status: Complete as historical development baseline

Milestone 5 prepared the foundation for a future public release without declaring the current version release ready.

Implemented scope:

- Improve responsive design and accessibility foundation.
- Support offline-capable Progressive Web App behavior.
- Prepare GitHub Pages deployment workflow.
- Expand README, user guide, developer guide, and safety documentation.
- Add license, contributing guidelines, changelog, and release notes.
- Provide synthetic sample quizzes and safety guidance.
- Add a Windows local launcher.

Acceptance status (historical record):

- GitHub Pages deployment was deferred while the repository was private; current repository visibility is independent of Pages deployment.
- Full manual QA, Product Hardening (M7), and Release Candidate validation (M8) were subsequently completed and accepted.

## Feature Complete Review

Status: Whole-Product Feature Complete Review V3 accepted (PASS); V1 Feature Complete declared

The previously reviewed Milestone 1-5 candidate scope included:

- Existing five objective question types.
- Local multi-paper quiz library.
- Paper creation, duplication, renaming, deletion, categories, tags, and search.
- Practice progress saving and refresh recovery.
- Unanswered-question checks.
- Result comparison, answer history, and wrong-question retry.
- Random question selection and question-type filtering.
- JSON import and export.
- Full library backup and import.
- Schema versioning and legacy data migration.
- Chinese and English interface.
- Local-first data boundaries.
- Windows local launch path.
- PWA, CI, documentation, and future Pages release foundation.

Current interpretation:

- The earlier Milestone 1–5 candidate review remains historical evidence only.
- Milestone 6, Pre-Freeze UI Productization, and scope-closure Batches A–C were subsequently implemented and accepted.
- Whole-Product Feature Complete Review V3 passed with zero Category A blockers.
- V1 Feature Complete was declared and Feature Freeze was activated.
- Milestone 7 Product Hardening (M7.0–M7.3) and Milestone 8 Release Candidate Validation subsequently completed, and candidate `v1.0.0-rc.1` was formally accepted.

## Feature Freeze Gate

Status: **ACTIVE** following Product Owner authorization and PR #19 merge (`d5c78b9`).

The gate required:

- Milestone 6 Translation Practice is implemented and accepted against its approved scope.
- The reopened current-version scope receives a new Feature Complete Review.
- No required core feature remains missing.
- Deferred Features are clearly separated from the v1 release scope.
- The user explicitly accepts the current v1 product boundary.

Freeze rules:

- Allowed: fixes for crashes, incorrect results, data integrity, migration, privacy, security, core workflow defects, and severe UX problems.
- Not allowed by default: new question types, embedded AI, cloud sync, accounts, collaboration, in-app teacher administration, desktop packaging, or other non-essential expansion.
- New features should default to the next version.
- If Freeze must be lifted, the reason must be recorded in `ROADMAP.md` and `PROJECT_STATUS.md`.

## Milestone 6: Translation Practice

Status: Complete and accepted (comprehensive M6-wide acceptance passed; Review V3 passed; Feature Freeze active)

Acceptance policy note: individual formal user acceptance for M6.2 through M6.7 was deferred to one comprehensive M6-wide acceptance after M6.7 concluded. That comprehensive acceptance has been executed and passed; M6.0–M6.7 are all complete and accepted.

Goal: add a dedicated, local-first workspace for document-oriented written translation practice without assuming that a reference translation is the only correct answer.

Architecture positioning:

- Translation Practice is Milestone 6's primary new learner workflow.
- M6.0 Open Teaching Interchange is a cross-cutting product/platform foundation, not a separate parallel learning product.
- The foundation serves existing Objective Quiz workflows and will support Translation Practice as its first complete rich-response consumer.
- The external-teacher loop is `External Authoring -> External Review -> External Remediation`, using portable structured data without requiring an embedded AI API.

Approved sub-milestone sequence:

1. M6.0 Open Teaching Interchange Foundation.
2. M6.1 Translation Domain and Persistence Foundation.
3. M6.2 Translation Library and Material Import / Export.
4. M6.3 Translation Practice and Session Recovery.
5. M6.4 Learner Answer Marking and Annotation Foundation.
6. M6.5 Rich Correction / Revision Workspace.
7. M6.6 External Teacher Round Trip.
8. M6.7 History, Retry, Portability, and Whole-Product Integration.

M6.0 state:

- Accepted.
- Objective Quiz now produces independent finalized Learner Response records and supports portable response export.
- Versioned Learner Response and Teacher Review contracts, validation boundaries, synthetic examples, provenance, and backup coverage are implemented.
- Teacher Review import/rendering, rich correction semantics, and all Translation UI remain later M6 work.

M6.1 state:

- Accepted.
- Translation Folder, Document, and ordered Item domain models and core operations are implemented independently from the Question Type Registry and DOM.
- Versioned Translation Document schema, synthetic example, local persistence boundary, and complete-backup coverage are implemented.
- Generic Learner Response supports future written Translation answers without fabricated objective grading while retaining Objective Quiz requirements.

M6.2 state:

- Implementation complete; M6-wide acceptance deferred (not individually accepted; see the acceptance policy note above).
- Adds the user-facing Translation Library workspace: folder and document management, ordered item editing with reordering, and document move between folders.
- Adds source-only batch import, bilingual tab-separated batch import, and portable Translation Document JSON import, each through an Input -> Parse -> Validate -> Preview -> Confirm -> Persist pipeline.
- External Translation Document JSON can be assigned to a user-selected local folder without requiring the external author to know local folder IDs; duplicate document IDs are rejected unless the user explicitly imports as a new copy with remapped IDs.
- Adds Translation Document JSON export using the canonical public contract.

M6.3 state:

- Implementation complete; M6-wide acceptance deferred (not individually accepted; see the acceptance policy note above).
- Adds the first Translation Practice workflow: start practice from a document, source text visible, learner writes an independent translation, optional reference translation hidden by default with a learner-controlled reveal, navigation between items, and an intentional finish action.
- Adds a dedicated Translation Session model (`src/core/translation-session.js`) that snapshots the document's items at session start, so later document edits do not rewrite what the learner is practicing or has already practiced.
- Adds Translation active-session recovery through an isolated storage key, independent from the Objective Quiz active session, so the two cannot corrupt each other; malformed session data is safely rejected rather than crashing recovery.
- Finalizing a session creates a non-objective Learner Response via `createTranslationLearnerResponse()` (no fabricated `correct`, `correctCount`, or `percent`); the active session is cleared only after the response has been saved successfully.
- Repeated practice on the same document creates a new session and a new Learner Response ID without overwriting prior evidence.

M6.4 state:

- Implementation complete; M6-wide acceptance deferred (not individually accepted; see the acceptance policy note above).
- Adds learner-controlled metacognitive marking of spans of the learner's own answer text as `unknown`, `uncertain`, or `should_know`, in a new `src/core/translation-annotations.js` module — these are learner signals, never automatic grading judgments, vocabulary records, or remediation tasks.
- Annotations anchor to character ranges validated against the live answer text; marking the exact same span again replaces its category, and a span overlapping a different existing mark is rejected until the conflicting mark is removed or adjusted.
- Editing an answer automatically drops any of that item's annotations whose anchored text no longer matches, so a mark can never silently point at the wrong text.
- Annotations persist by stable Translation Item ID inside the M6.3 Translation Session (`session.annotations`), survive navigation, refresh, and normal recovery, and are safely dropped individually (without failing session recovery) if malformed.
- Finalization copies annotations into an additive, optional `learnerAnnotations` array on the Learner Response; the public schema was extended minimally and backward-compatibly, and responses without annotations are unchanged from their M6.3 shape.
- Rich correction, suggested/inserted correction text, external Teacher Review import, remediation generation, and Vocabulary App integration remain M6.5+ work.

M6.5 state:

- Implementation complete; M6-wide acceptance deferred (not individually accepted; see the acceptance policy note above).
- Adds a Correction / Revision Workspace opened from a finalized Translation Learner Response, so a reviewer (the learner or a human teacher) can inspect the immutable original answer and M6.4 learner marks (both read-only) and add structured rich correction evidence.
- Adds `src/core/corrections.js`: a DOM-independent rich correction model with a single `correction` concept covering presentation styles (bold, italic, underline, strikethrough, highlight, bracket, text color), content-changing operations (insert, replace, delete), and span/whole-item comments, each anchored to a character range validated against the original answer text.
- Presentation styles may legitimately overlap each other and any content-changing operation (for example, a replaced span may also be bold); content-changing operations may never overlap each other, and an overlapping add is rejected with a clear error rather than silently applied.
- Extends the existing M6.0 Teacher Review contract additively: `itemReviews[].corrections` is a new optional array; existing simple Teacher Reviews (judgment/comment/tags/suggestedRevision only) remain valid and unchanged. `suggestedRevision` is preserved and can coexist with rich correction on the same item.
- Extends `schemas/teacher-review.schema.json` additively with an optional `corrections` array and a `correction` definition; cross-field anchor and conflict validation (anchored text must match the learner's answer, ranges must be in bounds, content-changing operations must not conflict) remains a runtime responsibility in `validateTeacherReview()`, since static JSON Schema cannot express it.
- Adds a new, independent Teacher Review storage collection (`quiz-studio-teacher-reviews-v1`, via `src/core/review-records.js`) keyed by stable review ID with a stable `responseId` relationship; a review's `responseId` can never be silently reassigned to a different response, and reviews are not nested inside Learner Response evidence.
- Full-library backup/restore now includes Teacher Reviews; legacy backups without them remain valid, and malformed review data fails safely before any state is applied.
- All reviewer/inserted text is rendered as escaped plain data (never raw HTML), and text color is restricted to a small validated palette to prevent CSS injection.
- Rich correction never mutates the original learner answer, M6.4 annotations, material snapshots, or session metadata; creating, editing, or saving a review has no effect on the underlying finalized Learner Response.
- External Teacher Review import/export round-trip, automatic/AI correction, semantic grading, and remediation generation remain M6.6+ work.

M6.6 state:

- Implementation complete; M6-wide acceptance deferred (not individually accepted; see the acceptance policy note above).
- Completes the first real end-to-end Open Teaching Interchange round trip using Translation Practice, entirely without an in-app AI API: author material -> practice -> finalized Learner Response -> export a self-contained review request -> an external human/AI/agent reviews it -> import the returned canonical Teacher Review -> validate -> preview -> confirm -> persist -> inspect the imported rich corrections -> export a remediation request -> an external human/AI/agent produces a remediation Translation Document -> import it -> practice it normally.
- The canonical records (Learner Response, Teacher Review, Translation Document) remain the single source of truth. Adds `src/core/review-transport.js`: two versioned, provider-independent transport/request envelopes (`quiz-studio.review-request`, `quiz-studio.remediation-request`) that embed faithful portable copies of the canonical objects rather than a competing evidence format; these are export/transport artifacts and are never persisted as canonical learning records.
- Adds an explicit external-interchange version gate (independent from and stricter than the generic, forward-tolerant runtime validators) for Teacher Review import, both request envelopes, and remediation Translation Document import, so an unsupported future schema version is rejected rather than silently accepted.
- The Teacher Review import pipeline (parse -> structural validation -> public-schema-equivalent checks -> resolve target Learner Response -> runtime cross-validation against the protected evidence -> preview -> confirm -> persist) reuses the existing M6.5 validators; nothing is persisted before the user confirms, and a cancelled or malformed import leaves all existing Teacher Reviews and Learner Responses unchanged. Rejects malformed JSON, wrong `documentType`, unsupported schema version, missing/empty review ID, orphan `responseId`, unknown item IDs, anchored-text mismatches, conflicting corrections, invalid operation/style/color values, and an attempt to silently reassign an existing review ID to a different response.
- A response may legitimately receive more than one Teacher Review. Re-importing identical content is treated as a safe no-op; re-importing the same review ID with changed content for the same response is classified as an explicit update requiring confirmation; the same review ID targeting a different response is rejected outright. A minimal review picker lets the user see every review available for a response (reviewer, review ID) and open a specific one deterministically, without building the M6.7 history browser.
- Adds a straightforward Teacher Review JSON export (preserving stable IDs and rich correction structure) and a remediation-request export that bundles the Learner Response and a selected Teacher Review for an external remediation author.
- A remediation Translation Document reuses the existing M6.2 Translation Document contract and persistence/collision pipeline; it is distinguished by an additive `provenance` block (`purpose: "remediation"`, `sourceResponseId`, `sourceReviewId`, `sourceMaterialId`, `createdAt`, `author`) that M6.0 already generically supported. The dedicated remediation-import boundary requires that canonical claim and metadata, then cross-validates that `sourceResponseId`/`sourceReviewId` resolve to real local records and that the review belongs to that response before persistence. Ordinary M6.2 Translation Document import remains tolerant of non-remediation material; local-folder rebinding and the existing collision/copy-as-new-ID policy are unaffected and never discard provenance.
- A Translation Practice session started from remediation material captures that provenance, and finalizing carries it into the new Learner Response's `provenance` field, so the resulting evidence remains traceable to the source response, source review, and remediation material even if the live remediation document is later deleted.
- All externally supplied JSON is treated as untrusted: rendered through the existing escaped-text correction renderer, never as raw HTML, with no embedded script/markup execution.
- Deliberately does not add any in-app AI API, model selector, API key field, or automatic review/remediation generation; the user manually hands exported JSON to an external human/AI/agent and manually imports the result. Also does not build the M6.7 full history browser, analytics, retry system, or lineage dashboard.

M6.7 state:

- Implementation complete; M6-wide acceptance deferred (not individually accepted; see the acceptance policy note above). M6.7 is the last feature-development sub-milestone of M6.
- Adds Translation History: a durable, filterable browse view over every finalized Translation Learner Response, derived entirely from the existing Learner Response and Teacher Review collections (`src/core/translation-history.js`) rather than a second mutable database. History remains fully usable after the originating live Translation Document is deleted, since a response's own `material.snapshot` already carries everything the index needs.
- A history detail view exposes the full durable evidence for one response: source item snapshots, original learner answers, learner annotations, session timestamps, provenance, every linked Teacher Review (open a specific one, or delete one that is no longer needed), and a lineage section showing where the response came from and what was retried or remediated from it.
- Adds explicit retry actions (`src/core/translation-retry.js`): retry the entire response, retry selected items, or retry only items flagged by a deterministic, documented needs-work rule (a learner annotation, a Teacher Review judgment of incorrect/partial/needs-review, or an attached correction — unioned across every review for the response so the result never depends on review order). Every retry starts a brand-new Translation Practice session built from the historical response snapshot (never the live document) and produces a new, independent Learner Response; it never reopens or overwrites the response it was retried from.
- Retry reuses the M6.6 provenance/session machinery rather than duplicating it: the retry material carries `provenance: { purpose: "retry", sourceResponseId, sourceReviewId?, sourceMaterialId, createdAt }`, and the same session/finalization path that already threads remediation provenance into a finalized response does the same for retry, with no changes to `translation-session.js` or `interchange.js`. Retry and remediation provenance stay distinct by `purpose` and are never conflated.
- Adds explicit deletion safety (`src/core/deletion-policy.js`), reporting dependents before any irreversible action: deleting a Translation Document never deletes Learner Responses; deleting a Learner Response requires an explicit cascade confirmation that also deletes its Teacher Reviews (a protected link that must always resolve) while leaving any retry/remediation responses derived from it in place, with their `sourceResponseId` becoming a safely-represented unresolved historical reference; deleting a Teacher Review never mutates the Learner Response it targets. A closure patch after initial CI approval additionally blocks deleting a Learner Response or Teacher Review outright (no cascade, no confirmation) while a *live* remediation Translation Document still claims it as `sourceResponseId`/`sourceReviewId` — that claim is canonical, not historical, since `parseLibraryBackup()` requires it to keep resolving; the user must delete the dependent remediation material first.
- Closes an M6.6-documented gap by adding a "delete review" action to the Correction Workspace and to Translation History.
- Closes two backup-atomicity gaps found during the M6.7 storage-governance review: `parseLearnerResponseCollection()`/`parseTeacherReviewCollection()` now reject duplicate stable IDs within a collection (previously enforced only by the live `upsert*()` paths, not bulk/backup parsing), and `parseLibraryBackup()` now cross-validates every remediation Translation Document's provenance against that same backup's Learner Response/Teacher Review collections before any state is replaced.
- Completes a full storage-governance inventory of every M1-M6 localStorage key (schema/version, migration, backup inclusion, deletion behavior); no duplicate source of truth was found, and full-library backup already covered every canonical M6 record as of M6.6.
- Consolidates the manual-QA questionnaire with an M6.7 delta and a comprehensive end-to-end M6 acceptance journey covering M6.0 through M6.7, ready for the deferred M6-wide acceptance.
- Does not add any in-app AI API, semantic grading, advanced analytics, graph-style lineage visualization, cloud sync, or accounts. Does not begin M7 Product Hardening or declare Feature Freeze.

Approved macro scope:

- Provide a dedicated Translation Practice workspace inside Quiz Studio.
- Organize translation materials by folder and document.
- Import source-language material alone or bilingual source and reference-translation material in batches.
- Export translation-practice material and data.
- Let learners view source text and independently write translations.
- Let learners mark difficult words or phrases as unknown, uncertain, or known-but-not-retrieved.
- Provide a lightweight vocabulary inbox or handoff boundary without duplicating a full vocabulary application.
- Support post-practice review and correction, including whole-session or batch review.
- Keep source and target languages general rather than hard-coding one language direction.
- Keep the first implementation independent of AI grading and paid model APIs.

Non-goals for the initial milestone:

- AI grading or an assumption that one reference translation is uniquely correct.
- A full vocabulary-learning system inside Quiz Studio.
- Cloud accounts, collaboration, or in-app teacher account/administration workflows.
- Collapsing the approved M6.0-M6.7 sequence into one implementation pass.

Acceptance effect:

- Translation Practice must be implemented and, per the deferred acceptance policy, covered by the comprehensive M6-wide acceptance before the reopened current-version scope can pass Feature Complete Review.
- Each M6.x implementation must still receive its own implementation review, regression testing, CI, and scope review before the next sub-milestone begins; individual formal user acceptance is deferred to the one comprehensive M6-wide acceptance after M6.7 (this deferral does not apply retroactively to M6.0 and M6.1, which are already accepted).
- The M6-wide acceptance is complete, Review V3 passed, and Feature Freeze is active. The acceptance policy above is retained as historical process evidence.

## Pre-Freeze UI Productization: Layered Paper Study Desk

Status: Implementation complete and verified; Final Human Acceptance Gate = PASS

Pre-Freeze UI Productization establishes whole-product visual and physical interaction convergence before conducting the Whole-Product Feature Complete Review V2. It preserves all Milestone 1–6 functionality while replacing temporary prototype surfaces with a unified study desk design system.

Scope completed:

- **Design System Foundation (`DESIGN.md`)**: Complete tokens for surfaces (Light Strong Paper, Dark Soft Near-Black), neutral section labels, marking inks (Oxford Blue, Vermilion, Forest, Amber, Violet), typography scale, motion language, and synthesized audio architecture.
- **Application Shell & Preferences**: Tool Launcher home view (`homeView`), persistent UI preferences (`uiPreferences` storing theme, sound enabled, motion preference, and resizable sidebar width), preferences dialog, and topbar audio toggle.
- **Core Learning Surfaces**: Laid paper sheet presentation with organic page-turn transitions, pencil stroke feedback, and granular per-pair matching feedback with inline correction hints across Objective Quiz and Translation Practice.
- **Teacher Marking Desk**: Dedicated continuous paper marking desk with pen tray, real-time ink projection, and rubber stamp judgment with tactile thud audio.
- **Offline & Verification Closure**: 239 total tests: 238 passed, 1 skipped platform-specific Windows launcher test on Linux CI, 0 failed, complete Service Worker offline precaching closure.
- **Human Acceptance Gate**: Final Human Acceptance Gate has been executed and passed (PASS).

## Milestone 7: Product Hardening

Status: Complete and accepted (M7.0–M7.3 complete; H-01 resolved; C1–C4 PASS; Product Hardening complete)

Goal: make the existing feature set reliable, consistent, and verifiable without expanding the product scope.

Hardening areas:

- System Audit and Defect Inventory.
- Quiz Correctness and Data Integrity.
- Import / Export / Backup / Migration Safety.
- Workflow and UX Consistency.
- PWA / Local Launch / Browser Robustness.
- Privacy and Secret Safety.
- Regression and Manual Acceptance.

Core user journey for hardening:

```text
First launch
-> Create paper
-> Edit all five question types
-> Start practice
-> Refresh midway and recover
-> Complete and review results
-> Retry wrong questions
-> Review history
-> Switch between multiple papers
-> Export and import
-> Full library backup and restore
-> Legacy data migration
-> Organize translation folders and documents
-> Import translation material and complete written practice
-> Mark difficult vocabulary and review a full session
-> Export translation-practice data
```

Exit conditions:

- No known release-blocking defect remains.
- No known high-risk data loss, overwrite, migration, privacy, or security issue remains.
- All defined core user journeys pass manual acceptance.
- Automated tests and CI pass.
- Each important fixed defect has either a regression test or written verification steps.
- Known risks and unverified items are recorded.
- Deferred Features are separated from the current version scope.
- Roadmap, Project Status, README, Release Notes, and repository state are consistent.
- Privacy and secret-safety checks pass.
- Verified local commits match the target remote branch.

## Milestone 8: Release Candidate Validation

Status: Complete (Candidate `v1.0.0-rc.1` at `f33bafcfe42ac8dd521466026c343102dc18897a` verified and formally accepted by Product Owner)

Goal: validate a release candidate from clean environments without expanding the frozen V1 scope.

Executed verification scope:

- Created immutable candidate tag `v1.0.0-rc.1` on frozen commit `f33bafcfe42ac8dd521466026c343102dc18897a`.
- Clean clone and execution check with 292/292 automated unit/integration tests passing.
- Verified Windows `start-local.bat` and canonical Python static runtime (port 8000 binding, clean startup/shutdown/restart).
- Verified major desktop browsers (Chrome, Edge, Firefox).
- Verified hosted HTTPS PWA lifecycle (online load → SW registration → offline reopen/use → online reconnection).
- Verified representative accumulated full-backup export and import round-trip with media and translation lineage integrity.
- Verified native OS file dialog imports for Teacher Review and remediation documents.
- Final privacy, credential, and prompt-draft tracking scans passed.
- Audited all committed fixtures and examples as strictly synthetic.
- Reconciled documentation and accepted documented known limitations.

Repository visibility may be changed to public independently of optional GitHub Pages deployment, desktop application packaging, a formal GitHub Release, or final `v1.0.0`, which remain separately deferred.

RC rules:

- The RC phase must not expand functional scope.
- Zero product or runtime code modifications were introduced post-tag.

## Lifecycle State & Next Steps

Milestone 8 Release Candidate validation is complete and accepted (`v1.0.0-rc.1` accepted).

- The product repository is in an **Accepted Release Candidate / Maintenance Hold** state with no active engineering milestone.
- Acceptance of `v1.0.0-rc.1` establishes verified candidate quality and does not automatically trigger or require final `v1.0.0`, a formal GitHub Release, or GitHub Pages deployment.
- Changing the GitHub repository visibility to public is authorized and independent of Pages deployment or a formal GitHub Release.
- Any future release distribution, formal GitHub Release, final `v1.0.0`, GitHub Pages deployment, portfolio packaging, or next-version planning remains optional and requires separate Product Owner authorization.

## Maintenance / Next Version

Future work upon separate Product Owner authorization will focus on:

- Critical defect and compatibility maintenance.
- Explicitly selected next-version features.
- Re-evaluating Deferred Features.

## Deferred Features / Next Version Candidates

These remain outside the current v1 scope:

- AI-assisted question generation.
- Desktop application packaging.
- Cloud sync and user accounts.
- Sharing, collaboration, and in-app teacher account/administration workflows.
- Subjective question grading.
- Public GitHub Pages deployment and a formal GitHub Release.
- Multiple simultaneous whole-item metacognitive marks beyond the current one-mark toggle contract.
- Translation History pagination, virtualization, and advanced history graph visualization.
- Per-paper audio playback restrictions, seek lockouts, and replay limits.

## Roadmap Principle

The current lifecycle route is:

1. Preserve the earlier Milestone 1–5 candidate review as historical evidence. **Complete.**
2. Complete and accept Milestone 6 and the Pre-Freeze scope. **Complete.**
3. Pass Review V3, declare V1 Feature Complete, and activate Feature Freeze. **Complete.**
4. Complete Milestone 7 Product Hardening. **Complete.**
5. Produce and validate the Milestone 8 Release Candidate. **Complete.**
6. Release Candidate accepted (`v1.0.0-rc.1`); repository in maintenance hold. Optional future delivery decisions remain under separate Product Owner authorization. **Current lifecycle state.**
