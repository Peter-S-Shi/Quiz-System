# Release Notes

## v1.0.0 Final Release

Quiz Studio V1 is finalized and in Maintenance Hold. The product baseline embodies the fully verified and accepted Release Candidate lineage (`v1.0.0-rc.1` at commit `f33bafcfe42ac8dd521466026c343102dc18897a`) across all verification layers (292 automated unit/integration tests green, H-01 resolved, C1–C4 verification passed, representative multi-version backup migrations verified, and all Product Owner Human Acceptance gates passed).

This final release establishes the public `1.0.0` version line with zero runtime behavior changes beyond the accepted candidate baseline, integrating evidence-first portfolio presentation assets, structured bilingual documentation, and durable governance metadata.

Highlights:

- Bilingual Chinese and English interface with Layered Paper Study Desk design system (`DESIGN.md`).
- Objective question authoring and practice for single choice, multiple choice, blank, true/false, and one-to-one matching with media attachments (image and audio with IndexedDB Blob storage).
- Local quiz library with categories, tags, search, paper duplication, progressive 3-level sidebar navigation, and safe deletion.
- Isolated Objective Quiz and Translation Practice session models with automatic progress saving and refresh recovery.
- Portable finalized Learner Response export and Open Teaching Interchange external Teacher Review round trips without in-app AI dependencies.
- Metacognitive learner confidence marking (*Unknown*, *Uncertain*, *Should know*) and structured rich correction workspace with reviewer inks and rubber stamp judgments.
- Translation History with deterministic needs-work derivation, bidirectional lineage navigation, and retry-entire / retry-selected / retry-needs-work workflows.
- Zero-dependency procedural Web Audio synthesis for tactile physical feedback (paper rustle, pencil scratch, rubber stamp thud).
- Strict localhost runtime with zero production Service Worker on loopback, accompanied by offline production-hosted PWA support.
- 292 automated tests with zero external test framework dependencies.

Known Limitations:

- Data is stored in browser local storage and IndexedDB, not cloud sync.
- Subjective grading is not included; evaluation relies on deterministic objective rules or qualitative external teacher reviews.
- External Teacher Review interchange is manual file-based JSON; there is no embedded AI API.
- Browser storage quotas apply to accumulated local evidence; export/backup is recommended for long-term archives.
- Clean environment verification for macOS is explicitly DEFERRED / NOT VERIFIED.
- Public GitHub Pages deployment and desktop application packaging remain separately deferred outside the frozen V1 scope.

## Historical Release Candidates and Baselines

### v1.0.0-rc.1 Candidate Release & Acceptance (2026-08-23)

Quiz Studio V1 completed Milestone 8 Release Candidate validation on frozen candidate snapshot `v1.0.0-rc.1` (commit `f33bafcfe42ac8dd521466026c343102dc18897a`) with formal Product Owner acceptance across all automated, runtime, and human gates with 0 release-blocking defects.

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
