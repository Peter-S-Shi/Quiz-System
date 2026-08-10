# Developer Guide

Quiz Studio is a static ES module app.

## Architecture

- `src/app.js`: UI rendering, event binding, localization, and browser workflow.
- `src/core/question-registry.js`: supported question types, creation, normalization, readiness, answer completeness, and session preparation.
- `src/core/grading.js`: grading and answer formatting.
- `src/core/interchange.js`: versioned Learner Response, Teacher Review, actor, provenance, and validation contracts.
- `src/core/learning-records.js`: independent Learner Response collection operations without history truncation.
- `src/core/backup.js`: validated library backup composition and backward-compatible restore parsing.
- `src/core/translation-domain.js`: Translation Folder, Document, and ordered Item models, validation, and immutable core operations.
- `src/core/translation-import.js`: DOM-independent parsing for source-only and bilingual batch import, portable JSON import validation, and document-ID collision handling for the Translation Library UI.
- `src/core/translation-session.js`: DOM-independent Translation Practice session model — snapshotting a document's items at session start, per-item answers and optional reference-reveal state, navigation, and safe rejection of malformed persisted sessions.
- `src/core/translation-annotations.js`: DOM-independent learner metacognitive marking (`unknown`/`uncertain`/`should_know`) on the learner's own answer text — validation, overlap/duplicate policy, answer-edit revalidation, and safe normalization of persisted marks.
- `src/core/corrections.js`: DOM-independent rich correction model for the M6.5 Correction Workspace — a single `correction` concept covering presentation styles, content-changing operations (insert/replace/delete), and comments, each anchored to a character range; validation, style/color validation, the content-op conflict policy, and a deterministic render projection.
- `src/core/review-records.js`: independent Teacher Review collection operations (create/update by ID, lookup by `responseId` or all reviews for a `responseId`), mirroring `learning-records.js` without a silent history cap.
- `src/core/review-transport.js`: DOM-independent M6.6 external-interchange layer — versioned review-request and remediation-request transport envelopes (create/validate), Teacher Review external-import parsing with an explicit version gate, import collision classification (new/idempotent/update/reassigned-reject), and remediation Translation Document provenance cross-validation. Reuses the M6.5 Teacher Review validators and the M6.2 Translation Document JSON parser rather than duplicating them.
- `src/core/migrations.js`: schema versioning and data normalization.
- `src/storage/local-storage.js`: local browser storage boundary.
- `schemas/`: public Quiz Paper, Learner Response, Teacher Review, Translation Document, review-request, and remediation-request JSON Schemas.
- `examples/`: synthetic Quiz Paper and teaching-interchange examples, including a full M6.6 round-trip fixture chain (Translation Learner Response -> external Teacher Review -> review-request -> remediation-request -> remediation Translation Document).
- `docs/OPEN_TEACHING_INTERCHANGE.md`: M6.0 architecture and scope boundary.
- `docs/TRANSLATION_DOMAIN.md`: M6.1 Translation domain, persistence, and compatibility boundaries.

## Learner Evidence

A completed Objective Quiz creates a finalized Learner Response before the active session is cleared. It preserves attempted question snapshots, original submitted answers, grading snapshots, stable IDs, timestamps, and provenance.

The lightweight history array remains capped for display and wrong-question workflows. Learner Response records use a separate storage key and are not silently removed by that cap. Full backups include both collections.

Teacher Review validation accepts only additive review fields and rejects unknown top-level fields, mismatched response IDs, and unknown item IDs. Rich correction semantics and review-import UI remain later M6 work.

## Translation Library

The Translation Library UI in `src/app.js` is a third top-level mode alongside Edit and Quiz. It renders folder and document management directly from `translation-domain.js` operations and never duplicates that state; every mutation goes through the same immutable core functions used by the automated tests.

Batch and JSON import follow Input -> Parse -> Validate -> Preview -> Confirm -> Persist. Parsing and validation live in `translation-import.js` so they can be tested without a DOM. The UI only builds a draft object for preview and calls `createTranslationDocument()` on confirm, so a cancelled or invalid import never touches stored data.

## Translation Practice Sessions

A Translation Practice session snapshots the target document's items at `createTranslationSession()` time (`translation-session.js`). Later edits to the live Translation Document never rewrite an in-progress or finalized session, because the session carries its own independent copy of the items it was started against.

The active session is stored under a key separate from the Objective Quiz active session (`quiz-studio-translation-active-session-v1` vs `quiz-studio-active-session-v1`), so the two features cannot silently overwrite each other even when both have unfinished sessions at the same time. `normalizeTranslationSession()` rejects malformed persisted data by returning `null`, which the UI treats the same as "no unfinished session" rather than crashing recovery.

Finishing a session calls `createTranslationLearnerResponse()` (in `interchange.js`) to build a finalized, non-objective Learner Response — it never sets `result`, `correctCount`, or `percent`. The response is persisted through the existing `upsertLearnerResponse()` idempotent/immutable-write path before the active session key is cleared, so a storage failure during finalization leaves the recoverable active session intact instead of silently losing the learner's work.

## Learner Annotations

Annotations anchor to character ranges in the learner's own answer text (`{ id, kind, start, end, text, createdAt }`) and are never rendered as inline markup — the answer stays plain text, and marks are a parallel structured layer keyed by item ID in `session.annotations`. `translation-session.js` re-validates an item's annotations every time its answer changes (inside `setTranslationAnswer()`), dropping any whose anchor no longer matches so a stale mark can never point at the wrong text.

The overlap policy lives in `addAnnotation()`: an exact duplicate span replaces the existing mark's category; a different, partially-overlapping span throws and the UI surfaces that as a toast rather than silently accepting bad data. `createTranslationLearnerResponse()` flattens all per-item annotations into a top-level `learnerAnnotations` array on finalization, included only when non-empty so unannotated responses are byte-identical to their pre-M6.4 shape.

## Rich Correction (M6.5)

The Correction Workspace (`renderCorrectionWorkspace()` in `src/app.js`) opens against a finalized, immutable Translation Learner Response. It never edits `response.responses[].answer`, `response.learnerAnnotations`, or the material snapshot — both are rendered read-only (the original answer in a `readonly` textarea so native text selection still works without risking a `contenteditable` mutation).

`corrections.js` models a rich correction as one object with an `operation` (`style`, `insert`, `replace`, `delete`, or `comment`), a `start`/`end` anchor, the `anchoredText` slice it was validated against, and operation-specific fields (`styleType`/`color` for styles, `text`/`color` for insert/replace, `text` for comments). Presentation styles (bold, italic, underline, strikethrough, highlight, bracket, color) are orthogonal and may overlap each other and any content-changing operation freely — `addCorrection()` never rejects a style for overlapping. Content-changing operations (insert, replace, delete) may never overlap each other; `correctionsConflict()` treats a zero-length `insert` as a caret position and rejects it against any other edit op whose range contains that position, and `addCorrection()` throws (surfaced as a toast) rather than silently applying a conflicting edit. `renderCorrectionProjection()` turns an answer plus its corrections into an ordered list of render segments (plain/styled text runs, struck-through deleted or replaced original text, and inserted/replacement text) that `src/app.js` renders through `escapeHtml()` — reviewer and inserted text is never injected as raw HTML.

Corrections live inside the existing M6.0 Teacher Review contract, additively: `itemReviews[].corrections` is optional, so simple M6.0 reviews (judgment/comment/tags/suggestedRevision only) are untouched. `validateTeacherReview()` cross-checks each correction's anchor against the corresponding `responses[].answer` (unknown item, out-of-range, and text-mismatch all fail validation) and rejects any content-changing operations that conflict on the same item — this cross-field check is runtime-only, since the public JSON Schema (`schemas/teacher-review.schema.json`) cannot express "matches sibling data." Reviews are stored independently (`quiz-studio-teacher-reviews-v1`, via `review-records.js`), keyed by a stable review ID with a stable `responseId`; `upsertTeacherReview()` allows updating a review's content in place but throws rather than letting an existing review ID silently point at a different response. `parseTeacherReviewCollection()`/`upsertTeacherReview()` accept either a single `learnerResponse` or a `learnerResponses` array as context; when either is supplied, every review must resolve to a real response — an orphan `responseId` is rejected rather than silently validated with no cross-field context. When re-parsing the *existing* collection during an upsert, that context is deliberately not reapplied (the collection may hold reviews for other responses too); existing entries are trusted from when they were first validated.

## External Teacher Round Trip (M6.6)

M6.6 completes the Open Teaching Interchange loop without any in-app AI API: a learner practices, a Learner Response is finalized, the app exports a **review-request** package, an external human/AI/agent reviews it offline and returns a canonical Teacher Review, the app imports and validates it, and — optionally — the app exports a **remediation-request** package so the same (or another) external party can produce targeted follow-up Translation material.

`review-transport.js` defines two small, versioned transport envelopes: `quiz-studio.review-request` (`{ schemaVersion, documentType, id, exportedAt, task, learnerResponse, requestedOutput }`) and `quiz-studio.remediation-request` (adds `teacherReview`). Both embed a faithful portable copy of the canonical object(s) via `toPortableLearnerResponse()`/`toPortableTeacherReview()` rather than inventing a parallel evidence shape, and neither is ever written to a storage key — they exist only as `downloadJson()` output and `FileReader` input.

External interchange gets its own version gate, separate from and stricter than the generic runtime validators (which stay forward-tolerant for local data): `SUPPORTED_TEACHER_REVIEW_IMPORT_VERSIONS`, `SUPPORTED_REVIEW_REQUEST_VERSIONS`, `SUPPORTED_REMEDIATION_REQUEST_VERSIONS`, and `SUPPORTED_REMEDIATION_DOCUMENT_VERSIONS` are each `[1]` today; a schema version outside that list is rejected at the import boundary even though the same value might pass a generic `schemaVersion >= 1` check elsewhere.

`parseExternalTeacherReview()` runs the full pipeline (documentType check -> version gate -> `normalizeTeacherReview()` -> `validateTeacherReview()` against the target response) and returns `{ review, errors }` without ever persisting anything; `classifyTeacherReviewImport(candidate, existingCollection)` is a pure, non-mutating planner that returns `"new"`, `"idempotent"` (identical content already stored), `"update"` (same ID and response, different content — requires confirmation), or `"reassigned-reject"` (same ID, different response — always rejected). `src/app.js` renders this classification in an import preview and only calls `upsertTeacherReview()` after the user confirms, so a cancelled or invalid import touches no stored data.

Because a response may now legitimately carry more than one review (different reviewers/tools, or repeated self-review), `renderCorrectionWorkspace()` uses `findTeacherReviewsForResponse()` instead of picking one automatically: zero reviews starts a fresh draft, exactly one opens directly (preserving the M6.5 single-review UX), and two or more show a minimal picker (reviewer label + review ID) before entering the workspace — with an in-workspace switcher to change reviews afterward without leaving. This is deliberately narrow: it is not the M6.7 history browser.

Remediation material is an ordinary `quiz-studio.translation-document` distinguished only by an additive `provenance` block that M6.0 already generically supports (`purpose: "remediation"`, `sourceResponseId`, `sourceReviewId`, `sourceMaterialId`, `createdAt`, `author`). `validateRemediationProvenance()` is a no-op for documents that don't claim `purpose: "remediation"`; for ones that do, it cross-checks `sourceResponseId`/`sourceReviewId` against the local Learner Response/Teacher Review collections (rejecting unknown IDs and a review that belongs to a different response) and, when present, that `sourceMaterialId` matches the source response's material identity. Import reuses `translation-import.js`'s existing `parseTranslationDocumentJsonText()`, collision detection, and copy-as-new-ID remap unchanged — local-folder rebinding never touches `provenance`.

Lineage into practice evidence is additive at the session layer: `createTranslationSession()` copies `document.provenance` into `session.materialProvenance` (present only when the document has one), and `createTranslationLearnerResponse()` normalizes that forward into the new response's `provenance` field instead of the hardcoded `{ purpose: "practice" }`. Because the finalized response carries the full provenance block by value, lineage back to the source response/review survives even if the live remediation document is later deleted — nothing depends on it still existing.

## Validation

```bash
npm test
npm run check
```

If npm is unavailable, run the underlying Node checks directly:

```bash
node --check src/app.js
node --test
```

## Release Preparation

The repository includes CI and a manual-only GitHub Pages workflow. Pages deployment is deferred while the repository remains private and should be enabled only when the project is ready to become public.
