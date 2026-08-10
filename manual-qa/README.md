# Manual QA Baseline

This folder contains the retrospective manual QA baseline for Quiz Studio.

## Contents

- `manual_review_questionnaire.html` is a standalone bilingual review questionnaire. It works offline and can be opened directly in a browser.
- `samples/` contains synthetic quiz files for import, backup, boundary, and rejection-path testing.
- `results/` is reserved for filled review exports and screenshots. Filled results are local-only by default.

## How To Use

1. Start Quiz Studio with `start-local.bat`.
2. Open `manual_review_questionnaire.html` in a browser.
3. Fill the metadata fields, then work through each QA module.
4. Use the sample files from `samples/` when a test case asks for import or backup data.
5. Export JSON or Markdown results from the questionnaire and store them in `results/`.

## Scope

This baseline is for manual review only. It does not change product features, business logic, workflows, or release state.

The questionnaire includes an M6.0 delta for finalized Learner Response creation, bilingual export controls, backup coverage, and explicit deletion confirmation; an M6.2 delta for the Translation Library workspace, batch and JSON import safety, export, persistence, and backup coverage; an M6.3 delta for the Translation Practice workflow, session recovery, non-objective finalization, and isolation from Objective Quiz; and an M6.4 delta for learner-controlled answer marking, overlap/duplicate handling, edit-invalidation, and finalized annotation evidence. Completing a delta builds acceptance evidence; its presence alone does not mean the corresponding milestone is accepted. Individual formal acceptance for M6.2 through M6.7 is intentionally deferred to one comprehensive M6-wide acceptance after M6.7 — the M6.2, M6.3, and M6.4 deltas are preserved for reuse in that later review.

## Privacy

Use tester codes, synthetic notes, and generic screenshot names. Do not enter real personal data, private quiz content, account details, login details, local absolute paths, or sensitive screenshots into exported QA results.
