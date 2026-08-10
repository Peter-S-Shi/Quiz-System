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
- PWA files for offline-capable static hosting.
- CI workflow files and a manual-only GitHub Pages workflow for future public release.

## Getting Started

Serve the repository with a local static server, then open `index.html` through that server.

No build step is required.

Example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

On Windows, you can also double-click `start-local.bat`. It starts a local server on port `8000` and opens the app in your browser.

## Validation

```bash
npm test
npm run check
```

If npm is not available locally, the equivalent core checks are:

```bash
node --check src/app.js
node --test
```

## Usage

1. Open `index.html`.
2. Use the **Edit** view to create or update a quiz paper.
3. Add questions and mark the correct answers.
4. Switch to the **Quiz** view.
5. Choose optional question type filters or a random question count.
6. Start the quiz, submit answers, and recover progress after refresh if needed.
7. Review the final score, per-question answer comparison, history, and wrong-question retry options.
8. Export the finalized Learner Response when you want to share a portable response package with an external teacher.

## Project Structure

```text
Quiz System/
  index.html        Application shell
  styles.css        Interface styling and responsive layout
  start-local.bat   Windows local launcher
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

## Roadmap

Project development is organized by lifecycle stages. See `ROADMAP.md` for the full roadmap and `PROJECT_STATUS.md` for the current release status.

### Planned Current-Version Capability

Translation Practice remains Milestone 6's primary new learning workflow and is not implemented yet. M6.0 Open Teaching Interchange is the cross-cutting foundation that serves existing Objective Quiz and will support Translation Practice as its first complete rich-response consumer. The planned Translation capability remains local-first, multilingual, and independent of AI grading or paid model APIs.

## Localization

The interface is designed for future multilingual expansion. UI text is centralized in the `locales` dictionary in `app.js`.

Quiz paper content is intentionally separate from the interface language. Switching the interface language does not rewrite authored questions, answers, or imported quiz content.

## Current Status

Current phase: Feature Development - Scope Reopened.

Quiz Studio is a local-first private pre-release prototype. M6.0 Open Teaching Interchange implementation is complete and awaiting user acceptance. Objective Quiz attempts now preserve independent finalized Learner Responses, support portable export, and participate in versioned external-review contracts. Translation Practice has not started, and the project is not Release Ready.

M6.0 user acceptance, the remaining M6.1-M6.7 work, a new Feature Complete Review, Feature Freeze, Milestone 7 Product Hardening, Milestone 8 Release Candidate validation, full manual QA, and final clean-environment verification are still pending. GitHub Pages deployment remains deferred until the repository is public and release validation is complete.

## Data and Privacy

Quiz papers, practice progress, local library metadata, answer history, and finalized Learner Responses are saved in the browser's local storage by default. Exported JSON files remain under the user's control and can contain original learner answers.

No data is sent to a server in the current static version.

## Development Notes

This project is intentionally lightweight at this stage. It uses plain HTML, CSS, and JavaScript so the product behavior can evolve quickly before introducing a larger framework or backend architecture.

See `docs/DEVELOPER_GUIDE.md` for architecture and validation details.
