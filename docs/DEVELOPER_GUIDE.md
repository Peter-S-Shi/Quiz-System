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
