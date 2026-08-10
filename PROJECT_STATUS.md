# Project Status

## Current Phase

Feature Development - Scope Reopened

## Current Milestone

Milestone 6.0: Open Teaching Interchange Foundation - implementation complete / user acceptance pending

## Current Release Scope

The current-version scope includes the Milestone 1-5 baseline and the approved Milestone 6 line. Translation Practice remains M6's primary new learner workflow. M6.0 Open Teaching Interchange is its cross-cutting foundation: it serves existing Objective Quiz and will support Translation Practice as the first complete rich-response consumer. M6 remains local-first and does not require embedded AI APIs, paid inference, or network access.

## Feature Complete Status

Previous candidate review reached; current scope reopened and no longer feature complete.

Milestone 1 is complete as the foundation baseline. Milestones 2-5 have first implementations landed, but full acceptance is pending. The Feature Complete Candidate review reached under that earlier boundary remains historical evidence. M6.0 implementation is complete but not yet user accepted; M6.1-M6.7 and Translation Practice remain unimplemented. A new whole-product Feature Complete Review is required after all Milestone 6 work is implemented and accepted.

## Feature Freeze Status

Not entered.

Feature Freeze can begin only after Milestone 6 is implemented and accepted, the reopened scope passes a new Feature Complete Review, Deferred Features are separated from the current version, and the user explicitly accepts the expanded product boundary.

## Open Release Blockers

- Full project-wide manual acceptance has not been completed.
- M6.0 needs user acceptance against the new manual QA delta.
- Translation Practice is required current-version work, but M6.1-M6.7 have not started.
- Data migration, backup round-trip, active-session recovery, and destructive workflows have not yet received formal end-to-end verification.
- Public Pages deployment remains deferred while the repository is private.
- A release candidate and final clean-environment verification do not yet exist.

## Hardening Progress

Not started.

Product Hardening is Milestone 7 and will begin only after all Milestone 6 work passes review and Feature Freeze is explicitly entered.

## Verification Status

- Seventeen automated core/interchange tests pass, including finalized-response replacement rejection, complete item-ID coverage, required session timestamps, protected learner evidence, Teacher Review rejection boundaries, unbounded response collection behavior, provenance, backup compatibility, and public example validation.
- CI workflow exists.
- A local browser smoke test completed a synthetic Objective Quiz and verified finalized-evidence messaging, bilingual result/history export controls, desktop layout, and a 390px responsive layout without console errors.
- The browser harness did not capture the programmatic download event, so exported-file landing and manual content inspection remain part of user acceptance.
- Manual acceptance for the full v1 journey is not complete.
- Clean clone verification has not been performed.
- GitHub Pages deployment is manual-only and deferred.
- M6.0 implementation exists; Translation Practice implementation and behavioral verification do not.

## Known Risks

- GitHub Pages cannot currently be treated as available because the repository remains private and Pages deployment is deferred.
- Browser `file://` opening is not supported for the ES module app; users must use a local static server or `start-local.bat`.
- The project has a larger feature surface than its current manual QA evidence.
- Finalized Learner Responses use browser local storage without silent history truncation; large long-term evidence collections may eventually encounter browser storage limits.
- Translation Practice introduces new document organization, import/export, persistence, review, and multilingual UX boundaries that still require design and acceptance criteria.

## Unknown Or Unverified

- Full backup export and import round trip with realistic local data.
- Legacy single-paper migration behavior across representative old localStorage states.
- Active-session recovery across refresh and browser restart.
- Destructive workflows such as paper delete, history clear, and backup import overwrite scenarios.
- PWA install, offline behavior, and cache upgrade behavior across major browsers.
- Accessibility and responsive behavior across representative devices.
- Clean-environment clone and run process.
- Manual inspection of downloaded Learner Response JSON and a real browser backup/restore round trip containing learner evidence.
- M6.1 Translation domain model and persistence design, pending a new prompt after M6.0 acceptance.

## Deferred Features

- AI-assisted question generation.
- Desktop application packaging.
- Cloud sync and user accounts.
- Sharing, collaboration, and in-app teacher account/administration workflows.
- Subjective question grading.
- Public GitHub Pages deployment and final GitHub Release.

## Next Engineering Objective

Complete user acceptance for M6.0 using the bilingual manual QA delta. Do not begin M6.1 without a new prompt after acceptance, and do not begin Product Hardening or Feature Freeze work before all Milestone 6 acceptance gates are complete.

## Repository State

- Default branch: `main`
- Remote: `origin`
- Verified baseline before M6.0: `9949dfb Reopen lifecycle scope for translation practice`
- Current documentation revision: the commit containing this status file; use Git history for its immutable identifier
- Synchronization target: validated M6.0 feature work merged to `main`, with `main` matching `origin/main`
- Private repository status: assumed private based on current project policy and deferred Pages decision
- Pull request status: none required for this local feature-branch workflow
