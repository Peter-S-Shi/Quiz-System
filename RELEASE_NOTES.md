# Release Notes

## Pre-release Preparation

Quiz Studio V1 is Feature Complete and Feature Freeze is active. M7.0 and M7.1 are accepted. M7.2 engineering and automated verification are complete: canonical Library bootstrap now preserves malformed/unsupported raw data before any replacement, representative legacy migrations pass, Translation History has locked-tier characterization plus a bounded one-pass-map optimization, and Objective/Translation serialization recovery contracts pass. H-01 is resolved. The C2 genuine browser-process-restart Human Gate remains PENDING; M7.3 and Release Candidate validation have not started.

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
- External Teacher Review exchange remains manual and file-based; there is no in-app AI integration.
- Browser storage quotas apply to long-term local evidence collections.
- Public GitHub Pages deployment and a formal GitHub Release are deferred outside the frozen V1 scope.
