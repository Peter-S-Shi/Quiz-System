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

Status: Implementation landed; full acceptance pending

Milestone 2 improves the learner's practice loop so each quiz attempt can be recoverable, reviewable, repeatable, and easier to filter.

Implemented scope:

- Save in-progress quiz attempts and recover them after refresh.
- Check for unanswered questions before answer submission.
- Improve the result overview and answer comparison experience.
- Record answer history and scores.
- Allow wrong questions to be practiced separately.
- Support random question selection.
- Support filtering by question type.
- Keep new user-facing interface text available in Chinese and English.

Acceptance status:

- Full project-wide manual acceptance has not been completed.
- Active-session recovery, answer history, wrong-question retry, random selection, and type filtering still need formal end-to-end verification.

## Milestone 3: Local Quiz Library

Status: Implementation landed; full acceptance pending

Milestone 3 moved Quiz Studio from a single-paper workflow to a local quiz library so users can manage many quiz papers on the same device.

Implemented scope:

- Manage multiple quiz papers.
- Create, duplicate, rename, and delete quiz papers.
- Organize quiz papers with categories, tags, and search.
- Track recently opened papers and last updated times.
- Provide safer import, export, and full local backup workflows.
- Migrate older single-paper local data into the quiz library.

Acceptance status:

- Full manual validation of destructive workflows, backup round trips, import safety, and legacy data migration is still pending.
- Data management remains local-first and privacy-conscious, but formal data integrity verification is not complete.

## Milestone 4: Quiz Core and Open Data Format

Status: Implementation landed; full acceptance pending

Milestone 4 turned the prototype's internal logic into a more durable foundation by separating reusable quiz behavior from the interface.

Implemented scope:

- Split the former single-file app structure into smaller modules.
- Create independent question models, validators, and grading logic.
- Establish a unified Question Type Registry.
- Add `schemaVersion` and data migration support.
- Decouple storage logic from UI rendering.
- Add unit tests, formatting checks, and basic CI.
- Publish JSON Schema files and synthetic example quiz files.

Acceptance status:

- Core tests exist and pass locally, but coverage is not yet a release-readiness guarantee.
- Schema, migration, storage, and grading behavior still need broader audit and regression review.

## Milestone 5: Public Release Preparation Foundation

Status: Implementation landed; full acceptance pending

Milestone 5 prepared the foundation for a future public release without declaring the current version release ready.

Implemented scope:

- Improve responsive design and accessibility foundation.
- Support offline-capable Progressive Web App behavior.
- Prepare GitHub Pages deployment workflow.
- Expand README, user guide, developer guide, and safety documentation.
- Add license, contributing guidelines, changelog, and release notes.
- Provide synthetic sample quizzes and safety guidance.
- Add a Windows local launcher.

Acceptance status:

- GitHub Pages deployment is deferred while the repository remains private.
- A stable public release tag has not been created.
- Full manual QA, Product Hardening, and Release Candidate validation remain pending.

## Feature Complete Review

Status: Historical candidate review reached under the previous scope; release scope subsequently reopened

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

- The project reached a Feature Complete Candidate review under the previous Milestone 1-5 boundary.
- That historical review remains valid for the scope assessed at the time, but it no longer closes the current-version feature scope.
- Translation Practice has since been approved as required current-version work, so feature development is active again.
- It is not yet Release Ready.
- Translation Practice is planned and has not yet been implemented or accepted.
- System-level manual acceptance has not been completed.
- The project has not entered Feature Freeze.

## Feature Freeze Gate

Feature Freeze can begin only when:

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

Status: In progress; M6.0 and M6.1 accepted; M6.2, M6.3, M6.4, M6.5, and M6.6 implementation complete with M6-wide acceptance deferred; M6.7 next

Acceptance policy note: individual formal user acceptance for M6.2 through M6.7 is intentionally deferred to one comprehensive M6-wide acceptance after M6.7 is complete. Implementation review, regression testing, CI, and scope review still apply to every sub-milestone in the meantime. M6.0 and M6.1 were accepted before this policy took effect and remain accepted.

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
- A remediation Translation Document reuses the existing M6.2 Translation Document contract and JSON import pipeline unchanged; it is distinguished only by an additive `provenance` block (`purpose: "remediation"`, `sourceResponseId`, `sourceReviewId`, `sourceMaterialId`, `createdAt`, `author`) that M6.0 already generically supported. Import cross-validates that `sourceResponseId`/`sourceReviewId` resolve to real local records and that the review actually belongs to that response before the document can be persisted; local-folder rebinding and the existing collision/copy-as-new-ID policy are unaffected and never discard provenance.
- A Translation Practice session started from remediation material captures that provenance, and finalizing carries it into the new Learner Response's `provenance` field, so the resulting evidence remains traceable to the source response, source review, and remediation material even if the live remediation document is later deleted.
- All externally supplied JSON is treated as untrusted: rendered through the existing escaped-text correction renderer, never as raw HTML, with no embedded script/markup execution.
- Deliberately does not add any in-app AI API, model selector, API key field, or automatic review/remediation generation; the user manually hands exported JSON to an external human/AI/agent and manually imports the result. Also does not build the M6.7 full history browser, analytics, retry system, or lineage dashboard.
- M6.7 must not begin without a new prompt.

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
- Feature Freeze remains inactive until the M6-wide acceptance is complete.

## Milestone 7: Product Hardening

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

## Milestone 8: Release Candidate and Public Delivery

Goal: validate a release candidate from a clean environment and prepare public delivery.

Required work:

- Create `v1.0.0-rc.1`.
- Clone the repository into a clean directory and run it.
- Verify Windows `start-local.bat`.
- Verify standard local static server startup.
- Verify major browsers.
- Verify PWA installation, offline use, and cache upgrades.
- Test empty data, synthetic sample data, and legacy data.
- Run final privacy and secret scans.
- Confirm all public examples are synthetic.
- Update README, CHANGELOG, and RELEASE_NOTES.
- Enable and verify GitHub Pages after the repository becomes public.
- Record known limitations.
- Create the final `v1.0.0` tag and GitHub Release.

RC rules:

- The RC phase must not expand functional scope.
- If a blocking issue is found, return to Milestone 7, fix it, and rerun regression checks.

## Current Version Complete

The current version can be marked as:

```text
Current Version Complete / v1.0.0
```

only after Milestone 8 acceptance is complete.

## Maintenance / Next Version

After current-version completion, work should focus on:

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

## Roadmap Principle

The current lifecycle route is:

1. Preserve the Feature Complete Candidate review reached under the previous Milestone 1-5 scope as historical evidence.
2. Complete Milestone 6 Translation Practice under the reopened current-version scope.
3. Perform a new Feature Complete Review and enter Feature Freeze only after the expanded boundary is accepted.
4. Complete Milestone 7 Product Hardening.
5. Produce and validate the Milestone 8 Release Candidate and public delivery.
6. Mark Current Version Complete only after RC acceptance.
