# Quiz Studio

Quiz Studio is a local-first quiz authoring and practice prototype. It lets users create editable quiz papers, answer objective questions, receive immediate feedback, and switch the interface between Chinese and English.

The current version is a static ES module web application. It runs in a browser through a local static server and stores paper data in local browser storage, so no backend database is required for the first prototype.

## Features

- Paper editing for title, description, and questions.
- Question types:
  - Single-choice questions
  - Multiple-choice questions
  - Fill-in-the-blank questions
  - True/false questions
  - One-to-one matching questions
- Shuffled answer options when starting a quiz session.
- Shuffled right-side answers for matching questions.
- Immediate feedback with correct and wrong answer indicators.
- Saved in-progress practice sessions with refresh recovery.
- Unanswered-question checks before submitting each answer.
- Answer history and score records in local browser storage.
- Independent finalized Learner Response records with original answers and attempted-question snapshots.
- Portable Learner Response JSON export from results and linked recent history.
- Wrong-question retry sessions.
- Random question selection and question-type filters.
- Result review with user-answer and correct-answer comparison.
- Local quiz library for managing multiple papers.
- Paper creation, duplication, renaming, deletion, search, categories, and tags.
- Full local library backup and import.
- Light and dark theme support.
- Chinese and English interface language support.
- Local browser storage for draft quiz papers.
- JSON import and export for quiz paper files.
- Modular Quiz Core for question models, validation, grading, and migrations.
- Public JSON Schema and synthetic sample quiz data.
- Versioned Learner Response and Teacher Review contracts for file-based external-teacher interoperability.
- Translation Library workspace with folder, document, and item management.
- Source-only and bilingual batch import, and portable Translation Document JSON import and export.
- Translation Practice sessions: source text visible, independent learner translation, optional hidden-by-default reference reveal, and recoverable progress.
- Non-objective finalized Learner Response evidence for Translation Practice, kept separate from Objective Quiz grading.
- Learner-controlled metacognitive marking (Unknown / Uncertain / Should know) on spans of a learner's own translation, preserved as structured evidence.
- Rich Correction / Revision Workspace with reviewer styles, insert/replace/delete corrections, judgments, and comments, plus multiple reviews per response.
- External Teacher Round Trip: export a review-request, import an externally produced Teacher Review, and export/import a remediation Translation Document, entirely without an in-app AI API.
- Translation History browsing across all finalized responses, with filters, lineage navigation, and evidence access that survives deletion of the original document.
- Retry entire response, retry selected items, or retry needs-work items from any history entry, each producing new, independent evidence with retry provenance distinct from remediation.
- Explicit, warned deletion for Learner Responses and Teacher Reviews, with dependency analysis shown before any irreversible action.
- PWA files for offline-capable static hosting.
- CI workflow files and a manual-only GitHub Pages workflow for future public release.

## Getting Started

The canonical local development workflow on Windows is:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\start-local.ps1"
```

This starts the repository's Node.js local HTTP server on `127.0.0.1:8000`, verifies that the canonical `http://localhost:8000` origin is serving this worktree's exact `index.html`, and opens the app through a one-time same-origin boot URL. That boot removes legacy localhost Service Worker control before loading the current modules, restores the visible canonical URL, and preserves all application data in browser storage.

Alternatively, you can manually serve the repository with any local static server, for example Python:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`. Double-clicking `start-local.bat` is also supported as a batch fallback launcher.

## Validation

```bash
npm test
npm run check
```

If npm is not available locally, the equivalent core checks are:

```bash
node --test tests/*.test.js
node --check src/app.js
```

## How to Use

1. Serve the app locally using the PowerShell command above and open `http://localhost:8000`.
2. Browse the included sample quizzes in the library.
3. Select a quiz and click **Start Quiz** to answer questions.
4. Immediate feedback is shown for multiple-choice questions. Text-input questions are graded when you submit or finish.
5. Review your score and feedback on the completion screen.
6. Click **Edit Quiz** to modify existing questions or add new ones.
7. Click **New Quiz** to build a paper from scratch.
8. Click **Export Quiz** to save your work as a JSON file, or **Import Quiz** to load a saved quiz file.
9. Switch to the **Translation** view to organize Translation Documents into folders, add items, import material in bulk, and export a document as portable JSON.
10. From a Translation Document, start practice, write your own translation for each item, optionally mark spans of your own answer as Unknown/Uncertain/Should know, and finish to save a protected Learner Response. See `docs/USER_GUIDE.md` for details.
11. Use **Translation History** to browse every finalized response, inspect its evidence and lineage, open or delete its Teacher Reviews, and retry the entire response, selected items, or needs-work items into a new attempt.

## Project Structure

```text
Quiz System/
  index.html        Application shell
  styles.css        Interface styling and responsive layout
  start-local.ps1   Canonical PowerShell local development launcher
  start-local.bat   Windows batch launcher fallback
  src/app.js        Quiz library, editor, quiz session flow, and localization
  src/core/         Question registry, validation, grading, and migrations
  src/storage/      Browser storage boundary
  schemas/          Public JSON Schema files
  examples/         Synthetic public sample quiz files
  docs/             User, developer, and safety documentation
  .github/          CI and manual future GitHub Pages workflows
  README.md         English project documentation
  README.zh-CN.md   Chinese project documentation
  ROADMAP.md        English lifecycle roadmap
  ROADMAP.zh-CN.md  Chinese lifecycle roadmap
  PROJECT_STATUS.md Current project status
  PROJECT_STATUS.zh-CN.md Chinese current project status
  DEVLOG.md         Development log
```

The Open Teaching Interchange architecture is documented in `docs/OPEN_TEACHING_INTERCHANGE.md`.
The Translation domain and persistence foundation is documented in `docs/TRANSLATION_DOMAIN.md`.

## Roadmap

Project development is organized by lifecycle stages. See `ROADMAP.md` for the full roadmap and `PROJECT_STATUS.md` for the current release status.

### Planned Current-Version Capability

Translation Practice remains Milestone 6's primary new learning workflow. M6.0 Open Teaching Interchange and M6.1 Translation Domain and Persistence Foundation are accepted. M6.2 (Translation Library and material import/export), M6.3 (Translation Practice and session recovery), M6.4 (learner answer marking and annotation foundation), M6.5 (rich correction / revision workspace), M6.6 (external Teacher round trip), and M6.7 (history, retry, portability, and whole-product integration) are implementation complete; individual formal acceptance for M6.2 through M6.7 is intentionally deferred to one comprehensive M6-wide acceptance now that M6.7 is complete. The planned capability remains local-first, multilingual, and independent of AI grading or paid model APIs.

## Localization

The interface is designed for future multilingual expansion. UI text is centralized in the `locales` dictionary in `app.js`.

Quiz paper content is intentionally separate from the interface language. Switching the interface language does not rewrite authored questions, answers, or imported quiz content.

## Current Status

Current phase: Feature Development - Scope Reopened.

Quiz Studio is a local-first private pre-release prototype. M6.0 Open Teaching Interchange and M6.1 Translation Domain and Persistence Foundation are accepted. M6.2 Translation Library and Material Import/Export, M6.3 Translation Practice and Session Recovery, M6.4 Learner Answer Marking and Annotation Foundation, M6.5 Rich Correction / Revision Workspace, M6.6 External Teacher Round Trip, and M6.7 History, Retry, Portability, and Whole-Product Integration are implementation complete. Individual formal acceptance for M6.2 through M6.7 has been intentionally deferred: the user has decided to run one comprehensive M6-wide acceptance now that M6.7 is complete, instead of accepting each sub-milestone separately. The project is not Release Ready.

The comprehensive M6-wide acceptance, a new Feature Complete Review, Feature Freeze, Milestone 7 Product Hardening, Milestone 8 Release Candidate validation, full manual QA, and final clean-environment verification are still pending. GitHub Pages deployment remains deferred until the repository is public and release validation is complete.

## Data and Privacy

Quiz papers, practice progress, local library metadata, answer history, and finalized Learner Responses are saved in the browser's local storage by default. Exported JSON files remain under the user's control and can contain original learner answers.

No data is sent to a server in the current static version.

## Development Notes

This project is intentionally lightweight at this stage. It uses plain HTML, CSS, and JavaScript so the product behavior can evolve quickly before introducing a larger framework or backend architecture.

See `docs/DEVELOPER_GUIDE.md` for architecture and validation details.
