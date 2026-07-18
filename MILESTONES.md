# Quiz Studio Milestones

This document tracks planned product milestones for Quiz Studio. Each milestone should define a focused outcome, a practical scope, and clear acceptance criteria before implementation starts.

## Milestone 1: Foundation Prototype

Status: Complete

Milestone 1 established the local-first quiz authoring and practice prototype.

Scope completed:

- Editable quiz papers with title, description, and questions.
- Objective question support for single choice, multiple choice, fill-in-the-blank, true/false, and one-to-one matching.
- Shuffled answer options for quiz sessions.
- Correct and wrong answer feedback.
- Light and dark themes.
- Chinese and English interface support.
- Local browser storage.
- JSON import and export.
- English and Chinese project documentation.
- Private GitHub synchronization workflow.

## Milestone 2: Practice Flow Enhancements

Status: First implementation landed

Milestone 2 will improve the learner's practice loop. The goal is to make each quiz attempt recoverable, reviewable, repeatable, and easier to filter.

Planned scope:

- Save in-progress quiz attempts and recover them after refresh. First implementation landed.
- Check for unanswered questions before answer submission. First implementation landed.
- Improve the result overview and answer comparison experience. First implementation landed.
- Record answer history and scores. First implementation landed.
- Allow wrong questions to be practiced separately. First implementation landed.
- Support random question selection. First implementation landed.
- Support filtering by question type. First implementation landed.

Recommended implementation order:

1. Session progress persistence and refresh recovery.
2. Unanswered-question checks before submission.
3. Improved result overview and answer comparison.
4. Answer history and score records.
5. Wrong-question retry workflow.
6. Random question selection and question-type filters.

Acceptance criteria:

- A user can refresh the browser during a quiz and continue from the saved attempt.
- A user can see which questions are still unanswered before submitting.
- After submission, a user can compare their answers with the correct answers in a clear summary.
- Quiz attempts are stored locally with score, date, question count, and result details.
- A user can start a focused retry session using only previously missed questions.
- A user can start a practice session with a random subset of questions or selected question types.
- All new user-facing interface text is available in both Chinese and English.

Data and privacy notes:

- Real user quiz content should stay in ignored local folders such as `user-data/` or `exports/`.
- Public sample quizzes should use synthetic content and may live in `examples/`.
- Future JSON schemas or fixtures should be safe to commit only when they do not contain personal or real quiz data.

## Milestone 3: Local Quiz Library

Status: First implementation landed

Milestone 3 will move Quiz Studio from a single-paper workflow to a local quiz library. The goal is to let users manage many quiz papers safely and quickly on the same device.

Planned scope:

- Manage multiple quiz papers. First implementation landed.
- Create, duplicate, rename, and delete quiz papers. First implementation landed.
- Organize quiz papers with categories, tags, and search. First implementation landed.
- Track recently opened papers and last updated times. First implementation landed.
- Provide safer import, export, and full local backup workflows. First implementation landed.
- Migrate older single-paper local data into the quiz library. First implementation landed.

Expected outcome:

- Users can keep a growing local collection of quiz papers without losing the simplicity of the Milestone 1 editor.
- Data management remains local-first and privacy-conscious.
- Import, export, and backup workflows clearly separate public examples from private user data.

## Milestone 4: Quiz Core and Open Data Format

Status: First implementation landed

Milestone 4 will turn the prototype's internal logic into a more durable foundation. The goal is to separate the quiz core from the interface so question formats, grading, storage, and future integrations can evolve cleanly.

Planned scope:

- Split the current single-file `app.js` structure into smaller modules. First implementation landed.
- Create independent question models, validators, and grading engines. First implementation landed.
- Establish a unified Question Type Registry. First implementation landed.
- Add `schemaVersion` and data migration support. First implementation landed.
- Decouple storage logic from UI rendering. First implementation landed.
- Add unit tests, formatting checks, and basic CI. First implementation landed.
- Publish JSON Schema files and synthetic example quiz files. First implementation landed.

Expected outcome:

- New question types can be added through a clear registry pattern.
- Saved quiz data can evolve through explicit versioning and migrations.
- Core grading and validation can be tested without relying on the browser UI.
- Public JSON formats are documented enough for future tools, imports, and integrations.

## Milestone 5: Public Release Preparation

Status: First implementation landed

Milestone 5 will prepare Quiz Studio for a first stable public release. The goal is to make the app easier to use, easier to trust, and easier for others to run or contribute to.

Planned scope:

- Improve responsive design and accessibility. First implementation landed.
- Support offline use or Progressive Web App behavior. First implementation landed.
- Deploy with GitHub Pages. Workflow prepared; repository settings may still need to enable Pages.
- Expand README, user guide, and developer documentation. First implementation landed.
- Add license, contributing guidelines, and release notes. First implementation landed.
- Provide sample quizzes and safety guidance. First implementation landed.
- Complete the first stable public version. Stable preparation landed; final public release tag should be created after manual smoke testing.

Expected outcome:

- Users can open and use the app comfortably across common screen sizes.
- The project has enough documentation for non-developer users and future contributors.
- Public examples are synthetic and safe to share.
- The first stable version is tagged and documented.

## Long-Term Optional Directions

These directions are intentionally outside the core milestone path for now. They may become future milestones after the local-first product is stable.

- AI-assisted question generation.
- Desktop application packaging.
- Cloud sync and user accounts.
- Sharing, collaboration, and teacher workflows.

## Roadmap Principle

The current roadmap is:

1. Complete the practice experience.
2. Build the local quiz library.
3. Extract a reusable quiz core and open data format.
4. Prepare the first stable public release.
