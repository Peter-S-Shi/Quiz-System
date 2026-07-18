# Quiz Studio

Quiz Studio is a local-first quiz authoring and practice prototype. It lets users create editable quiz papers, answer objective questions, receive immediate feedback, and switch the interface between Chinese and English.

The current version is a static web application. It runs directly in the browser and stores paper data in local browser storage, so no server or database is required for the first prototype.

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

## Getting Started

Open `index.html` in a modern browser.

No build step is required.

## Usage

1. Open `index.html`.
2. Use the **Edit** view to create or update a quiz paper.
3. Add questions and mark the correct answers.
4. Switch to the **Quiz** view.
5. Choose optional question type filters or a random question count.
6. Start the quiz, submit answers, and recover progress after refresh if needed.
7. Review the final score, per-question answer comparison, history, and wrong-question retry options.

## Project Structure

```text
Quiz System/
  index.html        Application shell
  styles.css        Interface styling and responsive layout
  app.js            Quiz library, editor, quiz session logic, grading, and localization
  README.md         English project documentation
  README.zh-CN.md   Chinese project documentation
  MILESTONES.md     English milestone roadmap
  MILESTONES.zh-CN.md Chinese milestone roadmap
  DEVLOG.md         Development log
```

## Roadmap

Project development is organized by milestones. See `MILESTONES.md` for completed and planned milestone scope.

## Localization

The interface is designed for future multilingual expansion. UI text is centralized in the `locales` dictionary in `app.js`.

Quiz paper content is intentionally separate from the interface language. Switching the interface language does not rewrite authored questions, answers, or imported quiz content.

## Current Status

This is an early local-first prototype focused on objective question workflows, practice history, and a browser-based quiz library. Planned future expansion may include a modular Quiz Core, JSON Schema, public examples, CI, deployment, user accounts, backend persistence, AI-assisted question generation, and subjective question grading.

## Data and Privacy

Quiz papers, practice progress, local library metadata, and answer history are saved in the browser's local storage by default. Exported JSON files remain under the user's control.

No data is sent to a server in the current static version.

## Development Notes

This project is intentionally lightweight at this stage. It uses plain HTML, CSS, and JavaScript so the product behavior can evolve quickly before introducing a larger framework or backend architecture.
