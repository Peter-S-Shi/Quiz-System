# Project Status

## Current Phase

Feature Development - Scope Reopened

## Current Milestone

Milestone 6.2: Translation Library and Material Import / Export - implementation complete / user acceptance pending

## Current Release Scope

The current-version scope includes the Milestone 1-5 baseline and the approved Milestone 6 line. Translation Practice remains M6's primary new learner workflow. M6.0 Open Teaching Interchange is its accepted cross-cutting foundation. M6.1 Translation Domain and Persistence Foundation is user accepted. M6.2 now supplies the user-facing Translation Library workspace, folder/document/item management, source-only and bilingual batch import, portable Translation Document JSON import/export, and import safety boundaries needed by later Translation workflows. M6 remains local-first and does not require embedded AI APIs, paid inference, or network access.

## Feature Complete Status

Previous candidate review reached; current scope reopened and no longer feature complete.

Milestone 1 is complete as the foundation baseline. Milestones 2-5 have first implementations landed, but full acceptance is pending. The Feature Complete Candidate review reached under that earlier boundary remains historical evidence. M6.0 and M6.1 are user accepted. M6.2 implementation is complete and awaiting user acceptance; M6.3-M6.7 and Translation Practice sessions remain unimplemented. A new whole-product Feature Complete Review is required after all Milestone 6 work is implemented and accepted.

## Feature Freeze Status

Not entered.

Feature Freeze can begin only after Milestone 6 is implemented and accepted, the reopened scope passes a new Feature Complete Review, Deferred Features are separated from the current version, and the user explicitly accepts the expanded product boundary.

## Open Release Blockers

- Full project-wide manual acceptance has not been completed.
- M6.2 needs user acceptance for its Translation Library, import/export, and import-safety boundaries.
- Translation Practice is required current-version work, but M6.3-M6.7 have not started.
- Data migration, backup round-trip, active-session recovery, and destructive workflows have not yet received formal end-to-end verification.
- Public Pages deployment remains deferred while the repository is private.
- A release candidate and final clean-environment verification do not yet exist.

## Hardening Progress

Not started.

Product Hardening is Milestone 7 and will begin only after all Milestone 6 work passes review and Feature Freeze is explicitly entered.

## Verification Status

- Thirty-one automated core/interchange/translation/import tests pass, including stable Translation persistence, ordering, source-only and reference material, orphan prevention, explicit cascade deletion, non-objective Learner Response compatibility, finalized evidence protection, backup compatibility, public example validation, batch-import parsing, malformed-row rejection, JSON import folder reassignment, duplicate-ID collision handling, and export/import round-trip against the public schema.
- CI workflow exists.
- A local browser smoke test exercised the full M6.2 acceptance journey: folder/document/item CRUD, source-only and bilingual batch import (including malformed-row rejection), portable JSON import (including folder reassignment and duplicate-ID collision with copy), export, reload persistence, folder cascade deletion, full-backup coverage, and bilingual (Chinese/English) label parity, with no console errors. An earlier smoke test also completed a synthetic Objective Quiz and verified finalized-evidence messaging, bilingual result/history export controls, desktop layout, and a 390px responsive layout without console errors.
- The browser harness confirmed export download triggers (correct filename and event) but did not capture the programmatic download's on-disk content, so manual inspection of downloaded files remains part of user acceptance.
- Manual acceptance for the full v1 journey is not complete.
- Clean clone verification has not been performed.
- GitHub Pages deployment is manual-only and deferred.
- M6.0 and M6.1 are accepted. M6.2 Translation Library, import/export, and import-safety behavior has automated and smoke-test coverage; formal user acceptance is separate and still pending.

## Known Risks

- GitHub Pages cannot currently be treated as available because the repository remains private and Pages deployment is deferred.
- Browser `file://` opening is not supported for the ES module app; users must use a local static server or `start-local.bat`.
- The project has a larger feature surface than its current manual QA evidence.
- Finalized Learner Responses use browser local storage without silent history truncation; large long-term evidence collections may eventually encounter browser storage limits.
- Translation Library management UI now exists, but Translation Practice sessions, learner markings, and rich correction remain undesigned UX boundaries for later M6 sub-milestones.
- Translation Practice sessions, review, and remediation still require design and acceptance criteria beyond the M6.2 material-management scope.

## Unknown Or Unverified

- Full backup export and import round trip with realistic local data.
- Legacy single-paper migration behavior across representative old localStorage states.
- Active-session recovery across refresh and browser restart.
- Destructive workflows such as paper delete, history clear, and backup import overwrite scenarios.
- PWA install, offline behavior, and cache upgrade behavior across major browsers.
- Accessibility and responsive behavior across representative devices.
- Clean-environment clone and run process.
- Manual inspection of downloaded Learner Response JSON and a real browser backup/restore round trip containing learner evidence.
- Manual browser backup/restore round trip containing Translation Folder, Document, and Item data.
- Manual inspection of a downloaded Translation Document JSON file's on-disk content in a real browser (the automated smoke test verified the download trigger and filename, not on-disk bytes).

## Deferred Features

- AI-assisted question generation.
- Desktop application packaging.
- Cloud sync and user accounts.
- Sharing, collaboration, and in-app teacher account/administration workflows.
- Subjective question grading.
- Public GitHub Pages deployment and final GitHub Release.

## Next Engineering Objective

Complete user acceptance for M6.2. Do not begin M6.3 without a new prompt after acceptance, and do not begin Product Hardening or Feature Freeze work before all Milestone 6 acceptance gates are complete.

## Repository State

- Default branch: `main`
- Remote: `origin`
- Verified baseline before M6.2: `33aad75 Align M6.1 learner response schema`
- Current documentation revision: the commit containing this status file; use Git history for its immutable identifier
- Synchronization target: validated M6.2 feature work on `milestone/6.2-translation-library`, to be merged to `main` via pull request
- Private repository status: assumed private based on current project policy and deferred Pages decision
- Pull request status: a pull request is being opened for `milestone/6.2-translation-library` for independent review before merge
