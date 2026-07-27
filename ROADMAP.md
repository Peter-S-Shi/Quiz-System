# Quiz Studio Roadmap

This roadmap records the product lifecycle for Quiz Studio. It preserves the historical Milestone 1-5 structure while separating implementation status from acceptance, hardening, and release readiness.

## Milestone 1: Foundation Prototype

Status: Complete as foundation baseline

Milestone 1 established the local-first quiz authoring and practice prototype.

Scope completed:

- Editable quiz papers with title, description, and questions.
- Objective question support for single choice, multiple choice, fill-in-the-blank, true/false, and one-to-one matching.
- Shuffled answer options for quiz sessions.
- Correct and wrong answer feedback.
- Light and dark themes.
- Chinese and English interface support.
- Local browser storage.
- JSON import and export.
- English and Chinese project documentation.
- Private GitHub synchronization workflow.

## Milestone 2: Practice Flow Enhancements

Status: Implementation landed; full acceptance pending

Milestone 2 improves the learner's practice loop so each quiz attempt can be recoverable, reviewable, repeatable, and easier to filter.

Implemented scope:

- Save in-progress quiz attempts and recover them after refresh.
- Check for unanswered questions before answer submission.
- Improve the result overview and answer comparison experience.
- Record answer history and scores.
- Allow wrong questions to be practiced separately.
- Support random question selection.
- Support filtering by question type.
- Keep new user-facing interface text available in Chinese and English.

Acceptance status:

- Full project-wide manual acceptance has not been completed.
- Active-session recovery, answer history, wrong-question retry, random selection, and type filtering still need formal end-to-end verification.

## Milestone 3: Local Quiz Library

Status: Implementation landed; full acceptance pending

Milestone 3 moved Quiz Studio from a single-paper workflow to a local quiz library so users can manage many quiz papers on the same device.

Implemented scope:

- Manage multiple quiz papers.
- Create, duplicate, rename, and delete quiz papers.
- Organize quiz papers with categories, tags, and search.
- Track recently opened papers and last updated times.
- Provide safer import, export, and full local backup workflows.
- Migrate older single-paper local data into the quiz library.

Acceptance status:

- Full manual validation of destructive workflows, backup round trips, import safety, and legacy data migration is still pending.
- Data management remains local-first and privacy-conscious, but formal data integrity verification is not complete.

## Milestone 4: Quiz Core and Open Data Format

Status: Implementation landed; full acceptance pending

Milestone 4 turned the prototype's internal logic into a more durable foundation by separating reusable quiz behavior from the interface.

Implemented scope:

- Split the former single-file app structure into smaller modules.
- Create independent question models, validators, and grading logic.
- Establish a unified Question Type Registry.
- Add `schemaVersion` and data migration support.
- Decouple storage logic from UI rendering.
- Add unit tests, formatting checks, and basic CI.
- Publish JSON Schema files and synthetic example quiz files.

Acceptance status:

- Core tests exist and pass locally, but coverage is not yet a release-readiness guarantee.
- Schema, migration, storage, and grading behavior still need broader audit and regression review.

## Milestone 5: Public Release Preparation Foundation

Status: Implementation landed; full acceptance pending

Milestone 5 prepared the foundation for a future public release without declaring the current version release ready.

Implemented scope:

- Improve responsive design and accessibility foundation.
- Support offline-capable Progressive Web App behavior.
- Prepare GitHub Pages deployment workflow.
- Expand README, user guide, developer guide, and safety documentation.
- Add license, contributing guidelines, changelog, and release notes.
- Provide synthetic sample quizzes and safety guidance.
- Add a Windows local launcher.

Acceptance status:

- GitHub Pages deployment is deferred while the repository remains private.
- A stable public release tag has not been created.
- Full manual QA, Product Hardening, and Release Candidate validation remain pending.

## Feature Complete Review

Status: Current phase

The current v1 candidate scope includes:

- Existing five objective question types.
- Local multi-paper quiz library.
- Paper creation, duplication, renaming, deletion, categories, tags, and search.
- Practice progress saving and refresh recovery.
- Unanswered-question checks.
- Result comparison, answer history, and wrong-question retry.
- Random question selection and question-type filtering.
- JSON import and export.
- Full library backup and import.
- Schema versioning and legacy data migration.
- Chinese and English interface.
- Local-first data boundaries.
- Windows local launch path.
- PWA, CI, documentation, and future Pages release foundation.

Current interpretation:

- This is a Feature Complete Candidate.
- It is not yet Release Ready.
- The project still needs confirmation that no core loop is missing from the v1 boundary.
- System-level manual acceptance has not been completed.
- The project has not entered Feature Freeze.

## Feature Freeze Gate

Feature Freeze can begin only when:

- The v1 core scope review is complete.
- No required core feature remains missing.
- Deferred Features are clearly separated from the v1 release scope.
- The user explicitly accepts the current v1 product boundary.

Freeze rules:

- Allowed: fixes for crashes, incorrect results, data integrity, migration, privacy, security, core workflow defects, and severe UX problems.
- Not allowed by default: new question types, AI, cloud sync, accounts, collaboration, teacher workflows, desktop packaging, or other non-essential expansion.
- New features should default to the next version.
- If Freeze must be lifted, the reason must be recorded in `ROADMAP.md` and `PROJECT_STATUS.md`.

## Milestone 6: Product Hardening

Goal: make the existing feature set reliable, consistent, and verifiable without expanding the product scope.

Hardening areas:

- System Audit and Defect Inventory.
- Quiz Correctness and Data Integrity.
- Import / Export / Backup / Migration Safety.
- Workflow and UX Consistency.
- PWA / Local Launch / Browser Robustness.
- Privacy and Secret Safety.
- Regression and Manual Acceptance.

Core user journey for hardening:

```text
First launch
-> Create paper
-> Edit all five question types
-> Start practice
-> Refresh midway and recover
-> Complete and review results
-> Retry wrong questions
-> Review history
-> Switch between multiple papers
-> Export and import
-> Full library backup and restore
-> Legacy data migration
```

Exit conditions:

- No known release-blocking defect remains.
- No known high-risk data loss, overwrite, migration, privacy, or security issue remains.
- All defined core user journeys pass manual acceptance.
- Automated tests and CI pass.
- Each important fixed defect has either a regression test or written verification steps.
- Known risks and unverified items are recorded.
- Deferred Features are separated from the current version scope.
- Roadmap, Project Status, README, Release Notes, and repository state are consistent.
- Privacy and secret-safety checks pass.
- Verified local commits match the target remote branch.

## Milestone 7: Release Candidate and Public Delivery

Goal: validate a release candidate from a clean environment and prepare public delivery.

Required work:

- Create `v1.0.0-rc.1`.
- Clone the repository into a clean directory and run it.
- Verify Windows `start-local.bat`.
- Verify standard local static server startup.
- Verify major browsers.
- Verify PWA installation, offline use, and cache upgrades.
- Test empty data, synthetic sample data, and legacy data.
- Run final privacy and secret scans.
- Confirm all public examples are synthetic.
- Update README, CHANGELOG, and RELEASE_NOTES.
- Enable and verify GitHub Pages after the repository becomes public.
- Record known limitations.
- Create the final `v1.0.0` tag and GitHub Release.

RC rules:

- The RC phase must not expand functional scope.
- If a blocking issue is found, return to Milestone 6, fix it, and rerun regression checks.

## Current Version Complete

The current version can be marked as:

```text
Current Version Complete / v1.0.0
```

only after Milestone 7 acceptance is complete.

## Maintenance / Next Version

After current-version completion, work should focus on:

- Critical defect and compatibility maintenance.
- Explicitly selected next-version features.
- Re-evaluating Deferred Features.

## Deferred Features / Next Version Candidates

These remain outside the current v1 scope:

- AI-assisted question generation.
- Desktop application packaging.
- Cloud sync and user accounts.
- Sharing, collaboration, and teacher workflows.
- Subjective question grading.

## Roadmap Principle

The current lifecycle route is:

1. Confirm Feature Complete Candidate scope.
2. Enter Feature Freeze only after the v1 boundary is accepted.
3. Harden the current feature set.
4. Produce and validate a Release Candidate.
5. Mark Current Version Complete only after RC acceptance.
