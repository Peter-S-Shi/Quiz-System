# User Guide

Quiz Studio runs locally in the browser. It stores quiz papers, practice progress, answer history, and finalized Learner Response records in browser storage.

On Windows, double-click `start-local.bat` from the project folder. It opens the canonical `http://localhost:8000` origin and keeps the server in the same console window. Leave that window open while using the app; press Ctrl+C to stop it.

If port `8000` is already occupied, the launcher stops and identifies the listener where Windows permits it. Close that listener and retry; do not switch ports or clear browser site data, because existing Quiz Studio data is tied to `localhost:8000`. The launcher retires legacy Quiz Studio Service Worker/cache state while preserving localStorage.

If the browser does not open automatically, leave the server window running and open the recovery URL printed by its bilingual diagnostic.

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

## Correction / Revision Workspace

- After finishing a Translation Practice attempt, select **Open Correction Workspace** to review that response — or open it later from the same Translation Document's **Finalized responses** list.
- Your original submitted translation is always shown read-only and cannot be edited from this screen; any metacognitive marks you made during practice are shown alongside it, also read-only.
- Select a span of the original answer and apply presentation styles via the toolbar (**Bold**, **Italic**, **Underline**, **Highlight**, **Bracket**, or reviewer **Color**) to visually annotate it — these can be combined and may overlap freely, since they only affect presentation.
- Select a span and choose **Insert**, **Replace**, or **Delete** to record a content-changing correction. A content-changing correction that overlaps another one is rejected — remove or adjust the existing one first.
- Pick a color for inserted or replacement text from the color selector before applying it, so your additions stay visually distinct from the learner's original text.
- A live preview below the toolbar shows the corrected rendering: original text stays in the default color, struck-through where deleted or replaced, with your inserted or replacement text shown in your chosen color.
- Optionally set a judgment (**Correct** / **Incorrect** / **Partial** / **Needs review**), an item-level comment, and a suggested whole-answer revision for each item — these can coexist with your span-level corrections.
- Select **Save review** to persist your work. Reopening the same response later (even after a refresh) restores the exact same review; saving again updates it in place rather than creating a duplicate.
- Reviewing and correcting a response never changes the original Learner Response — the learner's submitted answer and marks remain exactly as finalized, no matter how the review is edited or re-saved.
- If a response has more than one review, opening its workspace shows a picker listing each one (reviewer and review ID) so you can choose which to open; once inside, a switcher lets you jump between them or start a new one without leaving.

## External Teacher Round Trip

Quiz Studio can involve an outside human teacher, an AI assistant, or another tool in reviewing and remediating practice — entirely by exporting and importing plain JSON files by hand. Nothing in the app calls an external AI service or requires an API key.

- After finishing a Translation Practice attempt (or from the same document's **Finalized responses** list), select **Export for external review** to download a self-contained review-request file. It contains everything an outside reviewer needs — the source text, your translation, your marks, and language context — without requiring access to this browser's local storage.
- Hand that file to whoever is reviewing (a teacher, an AI assistant, another tool). Ask them to return a single JSON file that follows the Quiz Studio Teacher Review format; the review-request file itself states this expectation.
- Back in Quiz Studio, use **Import Teacher Review** on the same response row and choose the returned JSON file. A preview shows the target response, the reviewer, the review ID, whether this is a new review, an identical re-import, or an update to an existing review, plus how many items and corrections it contains. Review it, then **Confirm** to save it — or **Cancel** to discard it with no effect on anything already stored.
- A response can receive more than one review over time; importing a new one never deletes or hides an earlier one.
- Once a review is saved, open it in the Correction Workspace and select **Export review JSON** to save a portable copy, or **Export remediation request** to bundle that review together with the original response into a file an outside party can use to write targeted follow-up practice material.
- Hand the remediation-request file to whoever is producing new material. Ask them to return a Translation Document JSON file for **Import remediation material**, found in the Translation Library's import section alongside the other import options. Its `provenance` must contain `purpose: "remediation"`, the request's `sourceResponseId` and `sourceReviewId`, `createdAt` as an ISO 8601 timestamp, and `author` using a supported actor shape such as `{ "type": "external-ai", "displayLabel": "Synthetic Reviewer" }`. `sourceMaterialId` is optional; when included, it must match the source response's material ID.
- When you import remediation material, Quiz Studio checks that it genuinely traces back to the response and review you exported — it will refuse a file that claims to be remediation material but points at evidence that doesn't exist or doesn't match. Choose a destination folder as with any other Translation Document import.
- Practicing imported remediation material works exactly like practicing anything else, and the resulting evidence keeps a record of which original response and review it followed from, even if the remediation document is later deleted.

## Translation History, Retry, and Lineage

- Select **Translation History** in the Translation Library to browse every finalized Translation response, independent of whether its original document still exists. Each entry shows the material title, languages, completion time, item count, review count, and badges for needs-work items, remediation, and retries.
- Filter by origin (original practice, retry, or remediation), by review status (unreviewed, reviewed, or needs work), and sort newest or oldest first.
- Open an entry to see its full evidence: the source text and your original answer for every item, any metacognitive marks, every linked Teacher Review (open a specific one, or delete one you no longer need), and — where applicable — a **Lineage** section showing where this response came from and a **Derived into** section showing anything retried or remediated from it. If a linked record has since been deleted, it is clearly labeled unavailable rather than hidden.
- From a history entry, use **Retry entire response** to practice the same material again as a brand-new attempt, **Retry selected items** to choose exactly which items to redo, or **Retry needs-work items** to automatically retry only the items that carry a mark or a review flag. Each retry creates new, independent evidence — it never overwrites or reopens the original response.
- **Export response** and **Export for external review** are also available from the history detail view, alongside **Delete this history entry** for a response you no longer need. If the response has reviews or retry/remediation records derived from it, the confirmation explains exactly what will happen before you proceed.
- Deleting a Translation Document that has finalized responses no longer makes that evidence disappear — it stays fully browsable and retriable from Translation History; the confirmation tells you how many responses exist before you delete the document.
- If a response or a review still has a **live remediation material** in your Translation Library based on it, deleting that response or review is blocked with a message telling you to delete the remediation material first. This only applies to remediation material that still exists in your library; it never blocks deleting a response or review just because a past retry or remediation attempt was made from it.

## Data Safety

Exported response and backup files can contain authored quiz or Translation material, reference translations, private notes, and learner answers. They remain under your control and are not uploaded automatically. Keep real data outside the repository in ignored folders such as `user-data/` or `exports/`, and review each file before sharing it with an external teacher.

Legacy backups without Learner Response data remain readable and do not silently delete existing response records.
