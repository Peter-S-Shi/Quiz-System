# Manual QA Samples

All files in this folder are synthetic and safe for manual testing.

This folder only covers Objective Quiz (Milestone 1-5). It does not contain Translation Practice, Learner Response, Teacher Review, or review/remediation-request samples.

## Files

- `quiz-normal-sample.json`: valid quiz paper covering single choice, multiple choice, blank, true/false, and one-to-one matching.
- `quiz-boundary-sample.json`: valid quiz paper with longer text, tags, symbols, bilingual content, case-sensitive blank answers, and larger matching content.
- `quiz-invalid-sample.json`: intentionally invalid quiz file for rejection-path testing. The app should reject it or normalize it without corrupting existing data.

## Translation / Open Teaching Interchange Samples

M6.0-M6.7 manual-QA modules in `../manual_review_questionnaire.html` do not use files from this folder. They reference the synthetic public contract examples in the top-level `examples/` directory instead, so the same fixtures stay in sync with the automated tests that validate them:

- `examples/sample-translation-document.json`
- `examples/sample-translation-learner-response.json`
- `examples/sample-learner-response.json` / `examples/sample-teacher-review.json`
- `examples/sample-external-teacher-review.json`
- `examples/sample-review-request.json`
- `examples/sample-remediation-request.json`
- `examples/sample-remediation-translation-document.json`

Do not copy these into `samples/`; edit or adapt them in place under `examples/` if a QA step asks you to hand-author a variant.

## Usage Notes

- Use the normal sample for ordinary import, practice, export, backup, and answer-review checks.
- Use the boundary sample for layout, filtering, search, shuffle, and scoring edge cases.
- Use the invalid sample only when a test case explicitly asks for import failure behavior.

Do not replace these files with real user quiz content.
