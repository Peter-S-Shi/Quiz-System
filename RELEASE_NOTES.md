# Release Notes

## Pre-release Preparation

Quiz Studio is currently in Milestone 6 feature development. M6.0 Open Teaching Interchange is accepted. M6.1 Translation Domain and Persistence Foundation is implementation complete and awaiting user acceptance; Translation Library and practice UI have not started. Full manual QA, Feature Freeze, Product Hardening, Release Candidate validation, and final clean-environment verification are not complete.

This is not a `v1.0.0` release.

## v0.1.0 Stable Preparation

This release prepares Quiz Studio as a local-first static quiz authoring and practice app.

Highlights:

- Bilingual Chinese and English interface.
- Objective question workflows for single choice, multiple choice, blank, true/false, and one-to-one matching.
- Local quiz library, practice history, refresh recovery, wrong-question retry, random selection, and type filters.
- Modular Quiz Core with tests and open JSON Schema.
- Portable finalized Learner Response export and versioned external Teacher Review contracts.
- Versioned Translation Folder, Document, and Item foundations with local persistence and backup coverage.
- PWA files and a manual-only GitHub Pages deployment workflow for future public release.

Known limitations:

- Data is stored in browser local storage, not cloud sync.
- Subjective grading is not included.
- Teacher Review import/rendering and Translation Practice are not included yet.
- Translation Library and practice UI are not included yet.
- GitHub Pages deployment is deferred while the repository remains private.
