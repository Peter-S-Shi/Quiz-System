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

No build step is required. On Windows, double-click `start-local.bat`; it delegates to the canonical Python runtime, verifies both advertised localhost address families, and opens `http://localhost:8000`.

Port `8000` is strict because browser-resident Quiz Studio data belongs to that origin. If the port is occupied, startup fails with diagnostics instead of silently selecting another port. The supported launcher also retires legacy Quiz Studio Service Worker/cache state without reading, clearing, or migrating localStorage. Production-hosted PWA behavior remains separate and available.

The equivalent foreground command is:

```bash
python -u scripts/dev-server.py
```

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
9. Switch to the **Translation** view to organize Translation Documents into folders, add items, import material in bulk, and export a document as portable JSON.
10. From a Translation Document, start practice, write your own translation for each item, optionally mark spans of your own answer as Unknown/Uncertain/Should know, and finish to save a protected Learner Response. See `docs/USER_GUIDE.md` for details.
11. Use **Translation History** to browse every finalized response, inspect its evidence and lineage, open or delete its Teacher Reviews, and retry the entire response, selected items, or needs-work items into a new attempt.

## Project Structure

```text
Quiz System/
  index.html        Application shell
  styles.css        Interface styling and responsive layout
  start-local.bat   Windows local launcher
  scripts/          Canonical Python local runtime
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

### Current-Version Capability

The Milestone 6 Translation Practice line (M6.0–M6.7), Pre-Freeze UI Productization, and Pre-Freeze scope-closure Batches A–C are implemented and accepted. Whole-Product Feature Complete Review V3 passed with zero Category A blockers, V1 Feature Complete is declared, and Feature Freeze is active. The frozen capability remains local-first, multilingual, and independent of AI grading or paid model APIs.

## Localization

The interface is designed for future multilingual expansion. UI text is centralized in the `locales` dictionary in `app.js`.

Quiz paper content is intentionally separate from the interface language. Switching the interface language does not rewrite authored questions, answers, or imported quiz content.

## Current Status

Current phase: Feature Freeze / Milestone 7 Product Hardening.

Quiz Studio is a local-first private pre-release product. The comprehensive M6 acceptance, Pre-Freeze acceptance gates, and Whole-Product Feature Complete Review V3 have passed. V1 Feature Complete is declared and Feature Freeze is active. M7.0 is accepted and the M7.1 UX/Interaction implementation is complete; its Product Owner Human Acceptance remains pending, so the product is not yet Release Candidate ready.

M7.2 data/recovery hardening (including open blocker H-01), M7.3 release-readiness verification, M7.1/final human acceptance, and Milestone 8 Release Candidate validation remain pending. Public GitHub Pages deployment and a formal GitHub Release are deferred outside the frozen V1 scope.

## Data and Privacy

Quiz papers, practice progress, local library metadata, answer history, and finalized Learner Responses are saved in the browser's local storage by default. Exported JSON files remain under the user's control and can contain original learner answers.

No data is sent to a server in the current static version.

## Development Notes

This project is intentionally lightweight at this stage. It uses plain HTML, CSS, and JavaScript so the product behavior can evolve quickly before introducing a larger framework or backend architecture.

See `docs/DEVELOPER_GUIDE.md` for architecture and validation details.
