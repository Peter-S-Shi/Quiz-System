# Changelog

## Unreleased

### Added

- Added M7.1 UX & Interaction hardening: semantic whole-item mark toggle states and pressed semantics, unified Study Desk text/confirm dialogs for the 19 approved native-dialog replacements, high-content Objective Question and Translation Item deletion safeguards, responsive/touch action layouts, and focused keyboard recovery after dynamic rerenders.
- Added a bilingual focused M7.1 Product Owner Human Acceptance checklist and four interaction-contract regressions.
- Added M6.7 History, Retry, Portability, and Whole-Product Integration, the last feature-development sub-milestone of M6: durable Translation History browsing across all finalized responses (independent of whether the source document still exists), retry-entire/retry-selected/retry-needs-work workflows that always produce new independent evidence, backward/forward lineage navigation, and explicit, warned deletion for Translation Documents, Learner Responses, and Teacher Reviews.
- Added `src/core/translation-history.js`: history entries and a deterministic needs-work rule derived entirely from the existing Learner Response/Teacher Review collections (never a second source of truth), plus lineage resolution that safely represents a deleted ancestor response or review as unavailable rather than throwing.
- Added `src/core/translation-retry.js`: builds an ephemeral retry material from a historical response snapshot with `provenance.purpose: "retry"`, reusing the existing M6.6 session/provenance machinery unchanged.
- Added `src/core/deletion-policy.js`: pure dependency analysis for deleting a Translation Document, Learner Response, or Teacher Review. Deleting a response cascades to its reviews (a protected link that must always resolve) but never to retry/remediation responses derived from it; deleting a review or a document never mutates other canonical evidence.
- Added a "Delete review" action to the Correction Workspace, closing a gap M6.6 had explicitly deferred to M6.7.
- Closed two backup-atomicity gaps found during the M6.7 storage-governance review: duplicate stable IDs within a Learner Response or Teacher Review collection are now rejected during bulk/backup parsing (previously only the live upsert paths enforced this), and `parseLibraryBackup()` now cross-validates every remediation Translation Document's provenance against that same backup's Learner Response/Teacher Review collections before any state is replaced.
- Added M6.6 External Teacher Round Trip: completes the first real end-to-end Open Teaching Interchange round trip using Translation Practice, entirely without an in-app AI API. Export a self-contained review-request from a finalized Translation Learner Response, hand it to an external human/AI/agent reviewer, import their returned canonical Teacher Review with validation/preview/confirm, inspect the imported rich corrections, export a remediation-request bundling the response and review, and import an externally produced remediation Translation Document with cross-validated provenance that practices and finalizes like any other material.
- Added `src/core/review-transport.js`: versioned, provider-independent `quiz-studio.review-request` and `quiz-studio.remediation-request` transport envelopes that embed faithful portable copies of the canonical Learner Response/Teacher Review rather than a competing evidence format; an explicit external-interchange version gate (stricter than the generic, forward-tolerant runtime validators) for Teacher Review import and both request envelopes; non-mutating import-collision classification (new / idempotent / update / reassigned-reject); and remediation Translation Document provenance cross-validation against local Learner Response/Teacher Review records.
- A response may now legitimately hold more than one Teacher Review; the Correction Workspace shows a minimal picker (reviewer, review ID) when more than one exists, with an in-workspace switcher, instead of the M6.7-scoped full history browser.
- Remediation material is an ordinary Translation Document distinguished only by an additive `provenance` block (`purpose: "remediation"`, `sourceResponseId`, `sourceReviewId`, `sourceMaterialId`, `createdAt`, `author`) that M6.0 already generically supported; it reuses the existing M6.2 import/collision pipeline unchanged. Practicing remediation material carries that provenance into the resulting finalized Learner Response, so lineage back to the source response and review survives even if the remediation document is later deleted.
- Closed three small M6.5 integrity/contract gaps before starting M6.6: Teacher Review to Learner Response referential integrity is now enforced whenever Learner Response context is supplied (an orphan `responseId` is rejected in `parseTeacherReviewCollection()`/`upsertTeacherReview()`, including on backup restore, while context-free structural-only validation remains available for generic use); `validateCorrection()` and `validateTeacherReview()` now share a single structural-rule implementation (`validateCorrectionShape()`) so the two can never drift apart, and `schemas/teacher-review.schema.json` gained conditional (`if`/`then`) per-operation requirements (insert requires empty `anchoredText` and non-empty `text`; replace/comment require non-empty `text`; style requires `styleType`, and `color` when `styleType` is `color`); and the Correction Workspace's Insert/Replace actions now read the existing color selector so reviewer-chosen colors on inserted/replacement text actually persist (a "default color" option was added so choosing a color remains optional).
- Added M6.5 Rich Correction / Revision Workspace: opened from a finalized Translation Learner Response, it shows the immutable original answer and M6.4 learner marks read-only, and lets a reviewer add structured rich correction evidence — bold, italic, underline, strikethrough, highlight, bracket, and reviewer-colored text on top, plus insert/replace/delete content changes and span or whole-item comments.
- Added `src/core/corrections.js`: a DOM-independent rich correction model where presentation styles may freely overlap each other and any content-changing operation, while content-changing operations (insert/replace/delete) may never overlap each other and a conflicting add is rejected; includes anchor/color validation and a deterministic render-projection helper.
- Extended the M6.0 Teacher Review contract additively with an optional `itemReviews[].corrections` array (and a matching `schemas/teacher-review.schema.json` addition); existing simple Teacher Reviews are unaffected, and `suggestedRevision` can coexist with rich correction on the same item.
- Added runtime cross-validation for Teacher Review corrections: anchored text must match the corresponding Learner Response answer, ranges must be in bounds, and content-changing operations must not conflict — a tampered or externally supplied review cannot pass on field shape alone.
- Added an independent Teacher Review storage collection (`src/core/review-records.js`, `quiz-studio-teacher-reviews-v1`) keyed by stable review ID with a stable `responseId` relationship that can never be silently reassigned; full-library backup/restore now includes Teacher Reviews, with legacy backups and malformed review data both handled safely.
- Hardened M6.4 annotation integrity: persisted-session recovery now enforces the same overlap policy as live marking (deterministically dropping later-conflicting or exact-duplicate-span entries instead of letting both survive), and finalized `learnerAnnotations` are now cross-validated at runtime against the corresponding learner answer text (anchor range, exact text match, and per-item overlap), so a tampered or externally supplied Learner Response cannot pass validation on field shape alone.
- Added M6.4 learner-controlled metacognitive marking (`unknown` / `uncertain` / `should_know`) on spans of the learner's own Translation Practice answer text, with deterministic overlap/duplicate handling and automatic invalidation of marks whose anchored text no longer matches after an edit.
- Extended the Learner Response public contract additively with an optional `learnerAnnotations` array, preserved through finalization, backup, and restore; responses without annotations are unchanged from their prior shape.
- Added the M6.3 Translation Practice workflow: start practice from a Translation Document, write independent translations with source text visible and reference translation hidden by default with a learner-controlled reveal, navigate between items, and finish into a protected non-objective Learner Response.
- Added a dedicated Translation Session model with document-item snapshotting, so later document edits never rewrite an in-progress or finalized session.
- Added isolated Translation active-session recovery (separate storage key from the Objective Quiz active session) with Resume / Discard choices and safe rejection of malformed session data.
- Added the M6.2 Translation Library workspace: folder, document, and ordered item management, with document move between folders.
- Added source-only and bilingual (tab-separated) batch import, and portable Translation Document JSON import with folder reassignment and a deterministic duplicate-ID copy policy, each through an Input -> Parse -> Validate -> Preview -> Confirm -> Persist pipeline.
- Added Translation Document JSON export using the canonical public contract.
- Added the M6.1 Translation Folder, Document, and ordered Item domain foundation with local persistence and explicit relationship-safe core operations.
- Added a versioned Translation Document JSON Schema, synthetic example, and full-library backup coverage.
- Generalized Learner Response additively so future Translation responses can preserve written answers without fabricated objective grading.
- Added the M6.0 Open Teaching Interchange foundation for external authoring, review, and remediation workflows.
- Added independent finalized Learner Response persistence with question snapshots, original answers, grading results, provenance, and portable JSON export.
- Added versioned Learner Response and Teacher Review schemas, validation boundaries, and synthetic interoperability examples.
- Added Learner Response coverage to full-library backups while preserving legacy backup compatibility.

### Fixed

- Preserved Correction Workspace Insert/Replace selection and color state across asynchronous custom-dialog entry; cancellation paths remain non-mutating.
- Fixed an M6.7 deletion-integrity gap: deleting a Learner Response or Teacher Review no longer ignores live remediation Translation Documents that still claim it as `sourceResponseId`/`sourceReviewId`. `analyzeLearnerResponseDeletion()`/`analyzeTeacherReviewDeletion()` now detect that case (`dependentRemediationDocumentIds`/`hasBlockingDependents`) and the deletion is refused outright with a bilingual warning until the dependent remediation material is deleted first, instead of silently leaving a live canonical record with unresolvable provenance (which `parseLibraryBackup()` would then reject on the next restore). Finalized retry/remediation responses are unaffected and still never block deletion; only *live* remediation documents do.

### Documentation

- Added `M7_HARDENING_AUDIT.md`, the evidence-based Milestone 7 execution contract covering B1–B4, C1–C4, classified hardening findings, human gates, and the M7.1/M7.2/M7.3 batch map.
- Synchronized bilingual lifecycle documentation with declared V1 Feature Complete, active Feature Freeze, the PR #19 baseline, M7.0 opening, and the decision to keep public Pages and a formal GitHub Release outside frozen V1 delivery.
- Added bilingual Translation History/Retry usage, developer architecture notes (including an M1-M6 storage-governance table), an M6.7 manual-QA delta, and a consolidated end-to-end M6.0-M6.7 manual acceptance journey.
- Added bilingual External Teacher Round Trip usage, developer architecture notes, and an M6.6 manual-QA delta.
- Added bilingual Correction Workspace usage, developer architecture notes, and an M6.5 manual-QA delta.
- Added bilingual learner-marking usage, developer architecture notes, and an M6.4 manual-QA delta.
- Added bilingual Translation Practice usage, developer architecture notes, and an M6.3 manual-QA delta.
- Recorded the user's decision to defer individual M6.x acceptance for M6.2-M6.7 to one comprehensive M6-wide acceptance after M6.7.
- Added bilingual Translation Library usage, developer architecture notes, and an M6.2 manual-QA delta.
- Renamed milestone documents to Roadmap documents.
- Added Project Status documents as the current lifecycle-state authority.
- Defined Feature Complete Review, Feature Freeze Gate, Product Hardening, and Release Candidate phases without changing product functionality.
- Added bilingual Open Teaching Interchange architecture, safety, usage, and M6.0 manual-QA documentation.
- Added bilingual Translation domain, persistence, compatibility, and lifecycle documentation.

## 0.1.0

- Established the local-first Quiz Studio foundation.
- Added bilingual quiz editing and practice.
- Added local multi-paper library workflows.
- Added practice recovery, answer history, wrong-question retry, random selection, and type filters.
- Added Quiz Core modules, schema versioning, tests, JSON Schema, sample quiz data, PWA files, CI, and a manual-only GitHub Pages workflow for future public release.
