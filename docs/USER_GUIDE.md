# User Guide

Quiz Studio runs locally in the browser. It stores quiz papers, practice progress, answer history, and finalized Learner Response records in browser storage.

On Windows, double-click `start-local.bat` from the project folder to start the local server and open the app.

## Create And Manage Papers

- Use the local quiz library to create, duplicate, rename, delete, search, categorize, and tag papers.
- Use export for one paper.
- Use backup for the full local quiz and Translation data, answer history, and finalized Learner Response records.

## Practice

- Choose question type filters before starting.
- Enter a random question count to practice a subset.
- Refresh recovery can continue an unfinished attempt.
- After submission, use the result page to compare your answer with the correct answer.
- Use **Export response** on the result screen or a linked recent-history entry to download a portable JSON record containing the attempted question snapshots and original submitted answers.
- Use wrong-question retry to focus on missed questions from recent attempts.
- Clearing a paper's history asks for confirmation and explicitly removes both score summaries and corresponding Learner Response records.

## Translation Library

- Switch to the **Translation** tab to open the Translation Library.
- Create a folder first, then create a Translation Document inside it with a title, source language, and target language.
- Add, edit, reorder, and delete items directly in the document editor. A reference translation is illustrative material, not the only correct answer.
- Move a document to a different folder from the document editor.
- Use **Source-only batch import** to turn pasted lines into items without reference answers, or **Bilingual batch import** for `source<TAB>reference` rows.
- Use **Import Translation Document JSON** to bring in a file authored by another person, ChatGPT, Claude, Codex, or another compatible tool. You choose the local folder; the file does not need to know your local folder IDs.
- Every import shows a preview with the title, languages, item count, target folder, and any validation errors before anything is saved. If the file's document ID already exists locally, the import is rejected unless you explicitly choose to import it as a new copy.
- Use **Export document JSON** to download a Translation Document in the same portable format accepted by import.
- Deleting a folder deletes its Translation Documents; deleting a document is a separate confirmed action. Both only affect local browser data.

## Data Safety

Exported response and backup files can contain authored quiz or Translation material, reference translations, private notes, and learner answers. They remain under your control and are not uploaded automatically. Keep real data outside the repository in ignored folders such as `user-data/` or `exports/`, and review each file before sharing it with an external teacher.

Legacy backups without Learner Response data remain readable and do not silently delete existing response records.
