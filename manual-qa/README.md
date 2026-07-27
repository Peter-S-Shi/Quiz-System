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

## Privacy

Use tester codes, synthetic notes, and generic screenshot names. Do not enter real personal data, private quiz content, account details, login details, local absolute paths, or sensitive screenshots into exported QA results.
