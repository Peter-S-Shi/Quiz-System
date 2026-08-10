# Changelog

## Unreleased

### Added

- Added the M6.2 Translation Library workspace: folder, document, and ordered item management, with document move between folders.
- Added source-only and bilingual (tab-separated) batch import, and portable Translation Document JSON import with folder reassignment and a deterministic duplicate-ID copy policy, each through an Input -> Parse -> Validate -> Preview -> Confirm -> Persist pipeline.
- Added Translation Document JSON export using the canonical public contract.
- Added the M6.1 Translation Folder, Document, and ordered Item domain foundation with local persistence and explicit relationship-safe core operations.
- Added a versioned Translation Document JSON Schema, synthetic example, and full-library backup coverage.
- Generalized Learner Response additively so future Translation responses can preserve written answers without fabricated objective grading.
- Added the M6.0 Open Teaching Interchange foundation for external authoring, review, and remediation workflows.
- Added independent finalized Learner Response persistence with question snapshots, original answers, grading results, provenance, and portable JSON export.
- Added versioned Learner Response and Teacher Review schemas, validation boundaries, and synthetic interoperability examples.
- Added Learner Response coverage to full-library backups while preserving legacy backup compatibility.

### Documentation

- Added bilingual Translation Library usage, developer architecture notes, and an M6.2 manual-QA delta.
- Renamed milestone documents to Roadmap documents.
- Added Project Status documents as the current lifecycle-state authority.
- Defined Feature Complete Review, Feature Freeze Gate, Product Hardening, and Release Candidate phases without changing product functionality.
- Added bilingual Open Teaching Interchange architecture, safety, usage, and M6.0 manual-QA documentation.
- Added bilingual Translation domain, persistence, compatibility, and lifecycle documentation.

## 0.1.0

- Established the local-first Quiz Studio foundation.
- Added bilingual quiz editing and practice.
- Added local multi-paper library workflows.
- Added practice recovery, answer history, wrong-question retry, random selection, and type filters.
- Added Quiz Core modules, schema versioning, tests, JSON Schema, sample quiz data, PWA files, CI, and a manual-only GitHub Pages workflow for future public release.
