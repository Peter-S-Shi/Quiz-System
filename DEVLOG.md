# Development Log

## 2026-08-10

- Aligned the public Learner Response schema with generic material snapshots: only `id` is universally required, while Objective Quiz snapshots conditionally retain the `type` requirement. Added executable Draft 2020-12 schema regression coverage for both Translation and Objective Quiz responses.
- Recorded M6.0 as user accepted and implemented M6.1 Translation Domain and Persistence Foundation without starting M6.2 UI work.
- Added a separate Translation Library aggregate with stable Folder, Document, and ordered Item identities; generic language metadata; optional reference translations; immutable core operations; and explicit cascade deletion.
- Added the `quiz-studio-translation-library-v1` local storage boundary and included validated Translation data in complete backups while preserving legacy-backup behavior.
- Added a versioned Translation Document schema and synthetic example without raw HTML, provider dependencies, or objective-answer semantics.
- Generalized Learner Response additively: Objective Quiz retains required grading results, while future Translation responses can preserve written answers without `correctCount`, `percent`, or per-item `result`.
- Added bilingual Translation architecture and lifecycle documentation. Automated coverage expanded from 17 to 23 passing tests.
- Recorded M6.1 as implementation complete / user acceptance pending. Translation Library UI, practice sessions, rich correction, external Translation review, and M6.2 remain unimplemented.
- Closed the M6.0 integrity review by making finalized Learner Response writes idempotent for identical content and rejecting same-ID replacement attempts.
- Strengthened Learner Response validation so material snapshots and response entries have the same complete item-ID set, with required non-empty session timestamps aligned across runtime validation and JSON Schema.
- Expanded automated coverage from 15 to 17 tests; M6.0 remains implementation complete / user acceptance pending, and M6.1 has not started.
- Implemented M6.0 Open Teaching Interchange as a cross-cutting foundation serving existing Objective Quiz and future Translation Practice.
- Added versioned Learner Response and Teacher Review contracts, runtime validation boundaries, synthetic examples, and optional Quiz Paper remediation provenance.
- Added independent finalized Learner Response persistence containing attempted question snapshots, original submitted answers, grading snapshots, stable linkage, summary, timestamps, and provenance.
- Kept finalized Learner Responses outside the 100-entry lightweight history cap; explicit per-paper history clearing now confirms and removes linked response evidence.
- Added minimal bilingual Learner Response export from the result screen and linked recent-history entries.
- Added Learner Response coverage to full-library backup and validated restore while preserving legacy backups that lack the new collection.
- Added bilingual Open Teaching Interchange architecture, user/developer/safety documentation, lifecycle alignment, and an M6.0 manual QA delta.
- Expanded automated coverage from 6 to 15 tests; local browser smoke testing verified completion, evidence messaging, bilingual controls, desktop and 390px layouts, and no console errors.
- Recorded the M6.0 state as implementation complete / user acceptance pending. Translation Practice, Teacher Review import/rendering, rich correction, AI APIs, and M6.1 remain unimplemented.

## 2026-08-09

- Approved Translation Practice as a first-class capability required for the current version.
- Preserved the earlier Feature Complete Candidate review as a valid historical assessment of the previous Milestone 1-5 scope, while reopening the current release scope before Feature Freeze.
- Defined Milestone 6 at the product-lifecycle level as a local-first, multilingual Translation Practice workspace; detailed implementation planning remains pending the dedicated Milestone 6 prompt.
- Renumbered Product Hardening to Milestone 7 and Release Candidate / Public Delivery to Milestone 8.
- Confirmed that Feature Freeze remains inactive until Translation Practice is implemented, accepted, and included in a new Feature Complete Review.
- Updated macro lifecycle documentation only; no application behavior, schema, tests, examples, release notes, or manual QA materials changed.

## 2026-07-18

- Renamed milestone roadmap files to `ROADMAP.md` and `ROADMAP.zh-CN.md`.
- Established Feature Complete Review, Feature Freeze Gate, Product Hardening, Release Candidate, and Current Version Complete lifecycle stages.
- Added `PROJECT_STATUS.md` and `PROJECT_STATUS.zh-CN.md` as current-state authority documents.
- Added a Windows `start-local.bat` launcher so the ES module app can be opened through a local static server without manually typing the server command each time.
- Defined the current Quiz Studio application as Milestone 1: Foundation Prototype.
- Confirmed the Milestone 1 scope covers editable quiz papers, objective question types, shuffled answer choices, bilingual UI, theme switching, local persistence, JSON import/export, and project documentation.
- Strengthened Git ignore rules for local environments, caches, generated data stores, and private export files before future GitHub synchronization.
- Clarified the future JSON data boundary: public examples should live in `examples/`, while real user quiz data should live in ignored local folders such as `user-data/` or `exports/`.
- Added English and Chinese milestone roadmap documents and defined Milestone 2 as practice flow enhancements.
- Expanded the roadmap vision with Milestone 3 local quiz library, Milestone 4 quiz core and open data format, Milestone 5 public release preparation, and long-term optional directions.
- Landed the first Milestone 2 implementation: saved practice sessions, refresh recovery, unanswered checks, result answer comparison, answer history, wrong-question retry, random question selection, and question-type filters.
- Landed the first Milestone 3 implementation: local multi-paper library, paper create/duplicate/rename/delete, category and tag metadata, search, updated/recent timestamps, full library backup import/export, and legacy single-paper migration.
- Landed the first Milestone 4 implementation: modular Quiz Core, question type registry, grading module, schema migration module, storage boundary, unit tests, CI, JSON Schema, and synthetic example quiz data.
- Landed the first Milestone 5 preparation: PWA manifest and service worker, GitHub Pages workflow, MIT license, contributing guide, user/developer/safety documentation, changelog, and release notes.
- Changed GitHub Pages deployment to manual-only because the repository remains private and Pages deployment is deferred until a future public release.

## 2026-07-17

- Rewrote the main README as a more standard English project document.
- Added a Chinese README translation in `README.zh-CN.md`.
- Documented localization, project structure, data behavior, and current prototype scope.

## 2026-07-09

- Added an interface language selector with Chinese and English support.
- Centralized UI copy in an extensible language dictionary for future locales.
- Kept quiz paper content independent from the interface language so authored questions are not rewritten by language switching.

## 2026-07-08

- Created the first static prototype of Quiz Studio.
- Added paper editing for single choice, multiple choice, blank, true/false, and one-to-one matching questions.
- Added light and dark theme switching.
- Added shuffled answer choices for quiz sessions.
- Added correct and wrong answer feedback.
- Added local browser storage and JSON import/export.
