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
- `src/core/translation-history.js`: DOM-independent M6.7 history derivation — builds a history entry/index from Learner Responses and Teacher Reviews (never a second source of truth), needs-work item derivation, entry status derivation, filtering, and backward/forward lineage resolution across retry and remediation provenance.
- `src/core/translation-retry.js`: DOM-independent M6.7 retry-material derivation — builds an ephemeral, document-shaped object from a historical Learner Response snapshot (whole response or a selected item subset) with `provenance.purpose: "retry"`, suitable for `createTranslationSession()` without ever touching the live Translation Library.
- `src/core/deletion-policy.js`: DOM-independent M6.7 dependency analysis for deleting a Translation Document, Learner Response, or Teacher Review — reports dependents without mutating anything, so `src/app.js` can render an accurate plain-language warning before a destructive action.
- `src/core/migrations.js`: schema versioning and data normalization.
- `src/storage/local-storage.js`: local browser storage boundary.
- `schemas/`: public Quiz Paper, Learner Response, Teacher Review, Translation Document, review-request, and remediation-request JSON Schemas.
- `examples/`: synthetic Quiz Paper and teaching-interchange examples, including a full M6.6 round-trip fixture chain (Translation Learner Response -> external Teacher Review -> review-request -> remediation-request -> remediation Translation Document).
- `docs/OPEN_TEACHING_INTERCHANGE.md`: M6.0 architecture and scope boundary.
- `docs/TRANSLATION_DOMAIN.md`: M6.1 Translation domain, persistence, and compatibility boundaries.

## Learner Evidence

A completed Objective Quiz creates a finalized Learner Response before the active session is cleared. It preserves attempted question snapshots, original submitted answers, grading snapshots, stable IDs, timestamps, and provenance.

The lightweight history array remains capped for display and wrong-question workflows. Learner Response records use a separate storage key and are not silently removed by that cap. Full backups include both collections.

Teacher Review validation accepts only additive review fields and rejects unknown top-level fields, mismatched response IDs, and unknown item IDs. Rich correction semantics and review-import UI were deferred at M6.0 and subsequently delivered in M6.5 and M6.6.

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

`parseExternalTeacherReview()` runs the full pipeline (documentType check -> version gate -> strict raw canonical validation against the target response -> normalization) and returns `{ review, errors }` without ever persisting anything. Unsupported fields, malformed reviewer metadata, missing canonical fields, and embedded replacement Learner Response data are rejected before normalization can discard or repair them. `classifyTeacherReviewImport(candidate, existingCollection)` is a pure, non-mutating planner that returns `"new"`, `"idempotent"` (identical content already stored), `"update"` (same ID and response, different content — requires confirmation), or `"reassigned-reject"` (same ID, different response — always rejected). `src/app.js` renders this classification in an import preview and only calls `upsertTeacherReview()` after the user confirms, so a cancelled or invalid import touches no stored data.

Because a response may now legitimately carry more than one review (different reviewers/tools, or repeated self-review), `renderCorrectionWorkspace()` uses `findTeacherReviewsForResponse()` instead of picking one automatically: zero reviews starts a fresh draft, exactly one opens directly (preserving the M6.5 single-review UX), and two or more show a minimal picker (reviewer label + review ID) before entering the workspace — with an in-workspace switcher to change reviews afterward without leaving. This is deliberately narrow: it is not the M6.7 history browser.

Remediation material is an ordinary `quiz-studio.translation-document` distinguished by an additive `provenance` block that M6.0 already generically supports (`purpose: "remediation"`, `sourceResponseId`, `sourceReviewId`, `sourceMaterialId`, `createdAt`, `author`). The generic `validateRemediationProvenance()` remains a no-op for documents that do not claim remediation. The dedicated remediation file parser and `validateRemediationImportProvenance()` instead require a real remediation claim, valid raw timestamp/actor metadata, locally resolving response/review IDs, a review that belongs to that response, and a matching optional material ID. Ordinary M6.2 import remains unchanged; collision detection, copy-as-new-ID remapping, and local-folder rebinding still never alter `provenance`.

Lineage into practice evidence is additive at the session layer: `createTranslationSession()` copies `document.provenance` into `session.materialProvenance` (present only when the document has one), and `createTranslationLearnerResponse()` normalizes that forward into the new response's `provenance` field instead of the hardcoded `{ purpose: "practice" }`. Because the finalized response carries the full provenance block by value, lineage back to the source response/review survives even if the live remediation document is later deleted — nothing depends on it still existing.

## Translation History, Retry, and Lineage (M6.7)

M6.7 does not introduce a second database. Translation History is derived on every render from the same canonical `quiz-studio-learner-responses-v1` and `quiz-studio-teacher-reviews-v1` collections that M6.0/M6.5 already maintain — `buildHistoryIndex()` filters to Translation responses (`material.type === "translation-document"`) and computes review counts, needs-work counts, and retry/remediation badges from those two collections alone, so it stays reconstructible, never caps history, and remains fully usable after the live Translation Document is deleted (the response's own `material.snapshot` already carries everything History needs).

`deriveNeedsWorkItemIds()` is the one documented, deterministic "needs work" rule: an item is included if it carries any learner annotation (`unknown`/`uncertain`/`should_know`), if any Teacher Review judges it `incorrect`/`partial`/`needs-review`, or if any Teacher Review attaches a correction to it — the signals are unioned across every review for the response (not just the newest), so the result never depends on review order.

Retry reuses the M6.6 provenance/session machinery rather than adding a parallel one: `buildRetryMaterial()` takes a historical Learner Response (optionally a subset of item IDs) and returns a document-shaped object with fresh item/material IDs, `provenance: { purpose: "retry", sourceResponseId, sourceReviewId?, sourceMaterialId, createdAt }`, and hands it straight to the existing `createTranslationSession()` — the same mechanism that already threads `document.provenance` into `session.materialProvenance` and then into the finalized response's `provenance` field for M6.6 remediation material does the same work here for retry, with zero changes to `translation-session.js` or `interchange.js`. Retry and remediation stay distinguishable purely by `provenance.purpose`; a needs-work retry never sets `sourceReviewId` when the needs-work set was derived from more than one review (or from annotations alone), since there is no single review it is "the" retry of.

`resolveResponseLineage()` walks `provenance.sourceResponseId` backward (through an optional `sourceReviewId`) and finds any responses whose `provenance.sourceResponseId` points at the current one, forward. A missing ancestor (deleted response or deleted review) is represented as `{ ...Available: false }` rather than thrown — this is the same "historical provenance may point to a now-missing source" contract that M6.6 already established for remediation, generalized to retry and to the History UI.

### Deletion Safety (M6.7)

`deletion-policy.js` never deletes anything itself; it only reports dependents so `src/app.js` can warn accurately before an irreversible action:

- **Translation Document**: deleting it never touches Learner Responses (they carry their own snapshot); the analysis only reports how many exist so the confirmation can mention them.
- **Learner Response**: high impact, because a Teacher Review's `responseId` is a protected link that must always resolve. The documented policy is an explicit cascade: confirming deletes the response together with every review that targets it, but never deletes retry/remediation responses derived from it — their `provenance.sourceResponseId` simply becomes a safely-represented unresolved reference afterward (see `resolveResponseLineage()` above).
- **Teacher Review**: never mutates the Learner Response it targets. A retry/remediation response may carry the review's ID as `sourceReviewId`; that is historical, not canonical, so the review can always be deleted — the UI just warns how many derived records reference it first.

**Closure patch — live remediation documents are canonical, not historical.** A *finalized Learner Response's* own `provenance.sourceResponseId`/`sourceReviewId` may safely reference an already-deleted source (see the lineage discussion above). A *live* remediation Translation Document sitting in the Translation Library is different: `parseLibraryBackup()` cross-validates its `provenance` against the backup's Learner Response/Teacher Review collections on every restore, so if a live remediation document's claimed source stopped resolving, the next backup would fail to restore. `analyzeLearnerResponseDeletion()`/`analyzeTeacherReviewDeletion()` therefore accept `translationDocuments` and report `dependentRemediationDocumentIds`/`hasBlockingDependents` for any *live* remediation document that still claims the target as its `sourceResponseId`/`sourceReviewId`. When `hasBlockingDependents` is true, `deleteLearnerResponseConfirm()`/`deleteTeacherReviewConfirm()` refuse the deletion outright (a `showToast()` message naming the count, no confirmation dialog at all) instead of cascading through it — remediation documents are never auto-deleted as a side effect. Deleting the dependent remediation document(s) first (ordinary Translation Document deletion, unchanged) clears the block and the existing cascade/warning behavior above applies normally.

One ordering rule matters for anyone extending this: `loadTeacherReviews()` in `src/app.js` re-validates every review against the *current* Learner Response collection on every call (so an orphan is caught immediately, not just at import time). A deletion flow that removes a response must snapshot `loadTeacherReviews()` *before* writing the updated response collection — calling it afterward would see the just-orphaned reviews and throw. `deleteLearnerResponseConfirm()` takes both snapshots up front for this reason.

### Storage Governance (M6.7)

Every persistent key introduced through M1-M6, reviewed for M6.7 lifecycle closure:

| Key | Canonical record | Migration | Backup | Deletion behavior |
| --- | --- | --- | --- | --- |
| `quiz-studio-library-v1` | Quiz papers | `migrations.js` | Included | Paper delete is explicit; history/responses for it require the same confirmed clear |
| `quiz-studio-legacy-paper` (`quiz-studio-paper-v1`) | Pre-library single paper | Migrated into the library once, then unused | N/A | Read-only migration source |
| `quiz-studio-active-paper` | Selected paper ID | N/A | Not backed up (UI selection state, reconstructible) | Cleared on paper delete |
| `quiz-studio-active-session-v1` | In-progress Objective Quiz session | N/A | Not backed up (ephemeral, recoverable state only) | Cleared on finish/discard |
| `quiz-studio-translation-active-session-v1` | In-progress Translation session | N/A | Not backed up (ephemeral, recoverable state only) | Cleared on finish/discard; isolated from the Objective Quiz key |
| `quiz-studio-history-v1` | Quiz score-summary history | N/A | Included | Capped at 100 entries by design; explicitly cleared alongside its paper's responses |
| `quiz-studio-learner-responses-v1` | Learner Response (Quiz and Translation) | N/A (versioned per-record `schemaVersion`) | Included | No cap; M6.7 adds per-response deletion with cascade-to-reviews (see above) |
| `quiz-studio-teacher-reviews-v1` | Teacher Review | N/A (versioned per-record `schemaVersion`) | Included | No cap; M6.7 adds per-review deletion |
| `quiz-studio-translation-library-v1` | Translation folders/documents/items (including remediation documents) | N/A (versioned `schemaVersion`) | Included | Folder delete cascades to its documents; document delete never touches Learner Responses |
| `quiz-studio-theme` / `quiz-studio-language` | UI preference | N/A | Not backed up (device-local preference) | N/A |

No duplicate source of truth was found: Translation History (M6.7) and the Quiz score-summary history are both derived/display layers over canonical collections, not separate canonical stores. Two integrity gaps were closed as part of this review rather than deferred, since they affect backup atomicity directly: `parseLearnerResponseCollection()`/`parseTeacherReviewCollection()` now reject a collection containing two records with the same stable ID (previously only the live `upsert*()` write paths enforced this, not bulk/backup parsing), and `parseLibraryBackup()` now cross-validates every remediation Translation Document's `provenance` against that same backup's Learner Response/Teacher Review collections before any state is replaced, reusing `validateRemediationProvenance()` from `review-transport.js`. Everything else — the canonical-must-resolve vs. historical-may-be-missing distinction, no silent cap, and full backup coverage — was already correct as of M6.6 and required no change.

## Local Runtime Contract

`start-local.bat` is a thin Windows wrapper around `scripts/dev-server.py`. Python is the single runtime owner: it binds the strict canonical origin `http://localhost:8000`, serves the current working tree with `Cache-Control: no-store`, verifies the health endpoint through the canonical `localhost` hostname and every IPv4/IPv6 localhost family advertised by the operating system, opens the browser, and owns shutdown. It never drifts to another port; on Windows, a collision report includes the listening PID when available. If the OS browser opener fails or rejects the request, the server remains active and prints the exact recovery URL with bilingual manual-open guidance.

The supported browser entry first visits the server-owned `/__runtime__/recover` page. That bounded migration unregisters only same-origin `/sw.js` Quiz Studio registrations and deletes only Cache Storage names beginning with `quiz-studio-`, then redirects to the ordinary `index.html -> src/app.js` bootstrap. It never reads, clears, or migrates localStorage. `src/core/service-worker-policy.js` prevents production Service Worker registration on loopback origins, while non-loopback hosted deployments retain the production PWA path in `sw.js`.

Runtime regression coverage exercises the real HTTP boundary: exclusive port `8000`, collision diagnostics/no drift, IPv4 and IPv6 localhost reachability, canonical health response, no-store headers, current-working-tree ESM graph coherence, scoped legacy recovery, localStorage non-access, the thin launcher contract, and the production/local Service Worker policy.

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

The repository includes CI and a manual-only GitHub Pages workflow (`workflow_dispatch`). GitHub Pages deployment and a formal GitHub Release are deferred outside the frozen V1 scope and require separate Product Owner authorization. Repository visibility may be public independently of Pages deployment.
