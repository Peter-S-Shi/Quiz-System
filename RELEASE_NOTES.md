# Release Notes

## v1.0.0-rc.1 Candidate Release & Acceptance

Quiz Studio V1 is Feature Complete and Feature Freeze is active. Milestone 7 Product Hardening (M7.0–M7.3) is complete and accepted across all verification layers (292 automated unit/integration tests green, H-01 resolved, C1–C4 verification passed, and all Product Owner Human Acceptance gates passed).

This release represents the frozen V1 candidate snapshot (tagged as `v1.0.0-rc.1` at commit `f33bafcfe42ac8dd521466026c343102dc18897a`) that completed Milestone 8 Release Candidate validation and received formal Product Owner acceptance across all automated, runtime, and human gates with 0 release-blocking defects.

Candidate `v1.0.0-rc.1` is ACCEPTED. Public repository visibility is independent of optional GitHub Pages deployment, desktop application packaging, a formal GitHub Release, or final `v1.0.0`, which remain separately deferred.

Highlights:

- Bilingual Chinese and English interface with Layered Paper Study Desk design system.
- Objective question authoring and practice for single choice, multiple choice, blank, true/false, and one-to-one matching with media attachments (image and audio).
- Local quiz library with categories, tags, search, paper duplication, and safe deletion.
- Isolated Objective Quiz and Translation Practice session models with automatic progress saving and refresh recovery.
- Portable finalized Learner Response export and Open Teaching Interchange external Teacher Review round trips without in-app AI dependencies.
- Metacognitive learner marking and structured rich correction workspace.
- Translation History with deterministic needs-work derivation and retry-entire / retry-selected / retry-needs-work workflows.
- Strict localhost runtime with zero production Service Worker on loopback and production-hosted PWA support.

Known Limitations:

- Data is stored in browser local storage and IndexedDB, not cloud sync.
- Subjective grading is not included; evaluation relies on objective rules or external teacher reviews.
- External Teacher Review interchange is manual file-based JSON; there is no embedded AI API.
- Browser storage quotas apply to accumulated local evidence; export/backup is recommended for long-term archives.
- Clean environment verification for macOS is explicitly DEFERRED / NOT VERIFIED.
- Public GitHub Pages deployment, desktop application packaging, and a formal GitHub Release are deferred outside the frozen V1 scope. Public repository visibility is independent of Pages deployment.

## Historical v0.1.0 Prototype Baseline

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
