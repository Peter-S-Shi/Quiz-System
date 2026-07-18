# Developer Guide

Quiz Studio is a static ES module app.

## Architecture

- `src/app.js`: UI rendering, event binding, localization, and browser workflow.
- `src/core/question-registry.js`: supported question types, creation, normalization, readiness, answer completeness, and session preparation.
- `src/core/grading.js`: grading and answer formatting.
- `src/core/migrations.js`: schema versioning and data normalization.
- `src/storage/local-storage.js`: local browser storage boundary.
- `schemas/quiz-paper.schema.json`: public quiz paper JSON Schema.
- `examples/sample-quiz.json`: synthetic public sample data.

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

The repository includes CI and GitHub Pages workflows. GitHub Pages may still need to be enabled in repository settings before deployment succeeds.
