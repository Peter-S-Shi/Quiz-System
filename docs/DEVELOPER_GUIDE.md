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
- `src/core/migrations.js`: schema versioning and data normalization.
- `src/storage/local-storage.js`: local browser storage boundary.
- `schemas/`: public Quiz Paper, Learner Response, and Teacher Review JSON Schemas.
- `examples/`: synthetic Quiz Paper and teaching-interchange examples.
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
