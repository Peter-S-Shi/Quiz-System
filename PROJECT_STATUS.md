# Project Status

## Current Phase

Feature Development - Scope Reopened

## Current Milestone

Milestone 6: Translation Practice (planned; implementation prompt pending)

## Current Release Scope

The current-version scope includes the implemented Milestone 1-5 baseline plus the approved but not yet implemented Milestone 6 Translation Practice workspace. Translation Practice covers folder-and-document organization, batch source or bilingual material import, export, independent written translation, difficulty marking, a lightweight vocabulary handoff boundary, and post-practice batch review. It remains multilingual and local-first, and its first implementation will not depend on AI grading or paid model APIs.

## Feature Complete Status

Previous candidate review reached; current scope reopened and no longer feature complete.

Milestone 1 is complete as the foundation baseline. Milestones 2-5 have first implementations landed, but full acceptance is pending. The Feature Complete Candidate review reached under that earlier boundary remains historical evidence. Translation Practice was subsequently approved as required current-version work, so a new Feature Complete Review is required after Milestone 6 is implemented and accepted.

## Feature Freeze Status

Not entered.

Feature Freeze can begin only after Milestone 6 is implemented and accepted, the reopened scope passes a new Feature Complete Review, Deferred Features are separated from the current version, and the user explicitly accepts the expanded product boundary.

## Open Release Blockers

- Full project-wide manual acceptance has not been completed.
- Translation Practice is required current-version work but has not yet been designed in implementation detail, implemented, or accepted.
- Data migration, backup round-trip, active-session recovery, and destructive workflows have not yet received formal end-to-end verification.
- Public Pages deployment remains deferred while the repository is private.
- A release candidate and final clean-environment verification do not yet exist.

## Hardening Progress

Not started.

Product Hardening is now Milestone 7 and will begin only after Milestone 6 Translation Practice passes Feature Complete Review and Feature Freeze is explicitly entered.

## Verification Status

- Automated core tests exist and have passed in recent local checks.
- CI workflow exists.
- Manual acceptance for the full v1 journey is not complete.
- Clean clone verification has not been performed.
- GitHub Pages deployment is manual-only and deferred.
- No implementation or behavioral verification exists yet for Translation Practice.

## Known Risks

- GitHub Pages cannot currently be treated as available because the repository remains private and Pages deployment is deferred.
- Browser `file://` opening is not supported for the ES module app; users must use a local static server or `start-local.bat`.
- The project has a larger feature surface than its current manual QA evidence.
- Translation Practice introduces new document organization, import/export, persistence, review, and multilingual UX boundaries that still require design and acceptance criteria.

## Unknown Or Unverified

- Full backup export and import round trip with realistic local data.
- Legacy single-paper migration behavior across representative old localStorage states.
- Active-session recovery across refresh and browser restart.
- Destructive workflows such as paper delete, history clear, and backup import overwrite scenarios.
- PWA install, offline behavior, and cache upgrade behavior across major browsers.
- Accessibility and responsive behavior across representative devices.
- Clean-environment clone and run process.
- The detailed Milestone 6 data model, migration strategy, interaction design, and acceptance checks, pending the dedicated implementation prompt.

## Deferred Features

- AI-assisted question generation.
- Desktop application packaging.
- Cloud sync and user accounts.
- Sharing, collaboration, and teacher workflows.
- Subjective question grading.
- Public GitHub Pages deployment and final GitHub Release.

## Next Engineering Objective

Wait for and evaluate the dedicated Milestone 6 prompt, then design and implement Translation Practice within the approved macro scope. Do not begin Product Hardening or Feature Freeze work before Milestone 6 acceptance.

## Repository State

- Default branch: `main`
- Remote: `origin`
- Verified baseline before this documentation revision: `05cd288 Add manual QA baseline`
- Current documentation revision: the commit containing this status file; use Git history for its immutable identifier
- Synchronization target: validated documentation work merged to `main`, with `main` matching `origin/main`
- Private repository status: assumed private based on current project policy and deferred Pages decision
- Pull request status: none required for this documentation-only branch workflow
