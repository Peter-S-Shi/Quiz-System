# Manual QA Baseline

This folder contains the retrospective manual QA baseline for Quiz Studio.

## Contents

- `manual_review_questionnaire.html` is a standalone bilingual review questionnaire. It works offline and can be opened directly in a browser.
- `samples/` contains synthetic quiz files for import, backup, boundary, and rejection-path testing.
- `results/` is reserved for filled review exports and screenshots. Filled results are local-only by default.
- `m7-1-human-acceptance.md` is the focused Product Owner gate for M7.1 UX and interaction hardening (**PASS — no issues found**).
- `m7-2-process-restart-acceptance.md` is the focused genuine browser-process restart gate for M7.2 C2 (**PASS — Product Owner accepted; no issues found**).
- `m7-3-c3-external-review.md`, `m7-3-c3-seed-backup.json`, and the real UI-exported `m7-3-c3-review-request.json` form the reproducible external-review handoff for C3 (**PASS — Product Owner accepted**).
- `m7-3-c4-clean-environment.md` records the required clean Windows and Ubuntu matrix (**PASS; macOS deferred / not verified**).
- `m7-3-final-human-acceptance.md` consolidates the M7.3 Product Owner gate (**PASS — Product Owner accepted; Product Hardening complete**).
- `m8-rc1-verification.md` establishes the comprehensive verification contract and completed matrix for Release Candidate 1 (`v1.0.0-rc.1`) (**COMPLETE / ACCEPTED**).
- `m8-b-exact-candidate-verification.md` records the exact candidate verification evidence across automated suite, Ubuntu CI, runtime contracts, accumulated backup round-trip, and release safety (**PASS**).
- `m8-c-human-acceptance.md` records the final Product Owner human acceptance across clean Windows launch, browser matrix smoke, native file pickers, hosted PWA, and known limitations (**PASS — ACCEPTED; Milestone 8 Complete**).

## How To Use

1. Start Quiz Studio with `start-local.bat`.
2. Open `manual_review_questionnaire.html` in a browser.
3. Fill the metadata fields, then work through each QA module.
4. Use the sample files from `samples/` when a test case asks for import or backup data.
5. Export JSON or Markdown results from the questionnaire and store them in `results/`.

## Scope

This baseline is for manual review only. It does not change product features, business logic, workflows, or release state.

The questionnaire includes milestone deltas for M6.0 and M6.2–M6.7 plus one continuous M6.0–M6.7 end-to-end journey. Those modules cover finalized evidence, Translation Library and Practice, learner marking, rich correction, external file exchange, History, retry, lineage, and destructive-workflow safety. These retained deltas served as reusable regression evidence throughout Milestone 7; Milestone 7 Product Hardening and Milestone 8 Release Candidate verification have since completed and been accepted.

## Privacy

Use tester codes, synthetic notes, and generic screenshot names. Do not enter real personal data, private quiz content, account details, login details, local absolute paths, or sensitive screenshots into exported QA results.
