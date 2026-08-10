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

## Translation Practice

- Open a Translation Document with at least one item and select **Start practice**.
- The source text is shown for each item; write your own translation in the answer box. A reference translation, if present, stays hidden until you choose to reveal it — it is illustrative material, not the only correct answer, and is never auto-graded.
- Move between items with **Previous** / **Next**. Your answers and current position are saved automatically as you go.
- Use **Exit practice** to step away without losing progress. Reopening the same document later (even after a refresh) offers **Resume practice** or **Discard practice**; discarding requires confirmation and cannot be undone.
- Starting practice on a different document while another one is unfinished asks for confirmation before discarding the unfinished attempt, since only one Translation Practice session is active at a time.
- Use **Finish practice** whenever you are ready, even with some items left blank. Finishing saves your original submitted translations as an independent, protected Learner Response — no score is calculated, since translation is evaluated qualitatively rather than judged right or wrong.
- After finishing, review your submitted translations, export the response, or start a new attempt on the same document. A new attempt creates new evidence and never overwrites an earlier finalized response.
- While writing a translation, select a word or phrase in your own answer and mark it **Unknown**, **Uncertain**, or **Should know** to record your own confidence in that part of your translation. These marks are your personal metacognitive signal — they are never turned into a wrong answer, a score, or a vocabulary entry.
- Change a mark's category or remove it at any time from the list below the answer box. Marking the exact same span again replaces its category; a range that overlaps a different existing mark is rejected until you remove or adjust that mark first.
- If you edit text that a mark covers, the mark is removed automatically once its anchored text no longer matches — a brief notice tells you when this happens. Marks persist through navigation, refresh, and Resume, and are preserved unchanged as part of the finalized evidence when you finish.

## Data Safety

Exported response and backup files can contain authored quiz or Translation material, reference translations, private notes, and learner answers. They remain under your control and are not uploaded automatically. Keep real data outside the repository in ignored folders such as `user-data/` or `exports/`, and review each file before sharing it with an external teacher.

Legacy backups without Learner Response data remain readable and do not silently delete existing response records.
