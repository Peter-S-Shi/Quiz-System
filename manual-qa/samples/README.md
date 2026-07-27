# Manual QA Samples

All files in this folder are synthetic and safe for manual testing.

## Files

- `quiz-normal-sample.json`: valid quiz paper covering single choice, multiple choice, blank, true/false, and one-to-one matching.
- `quiz-boundary-sample.json`: valid quiz paper with longer text, tags, symbols, bilingual content, case-sensitive blank answers, and larger matching content.
- `quiz-invalid-sample.json`: intentionally invalid quiz file for rejection-path testing. The app should reject it or normalize it without corrupting existing data.

## Usage Notes

- Use the normal sample for ordinary import, practice, export, backup, and answer-review checks.
- Use the boundary sample for layout, filtering, search, shuffle, and scoring edge cases.
- Use the invalid sample only when a test case explicitly asks for import failure behavior.

Do not replace these files with real user quiz content.
