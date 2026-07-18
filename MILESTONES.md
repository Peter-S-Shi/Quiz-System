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

Status: Planned

Milestone 2 will improve the learner's practice loop. The goal is to make each quiz attempt recoverable, reviewable, repeatable, and easier to filter.

Planned scope:

- Save in-progress quiz attempts and recover them after refresh.
- Check for unanswered questions before final submission.
- Improve the result overview and answer comparison experience.
- Record answer history and scores.
- Allow wrong questions to be practiced separately.
- Support random question selection.
- Support filtering by question type.

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
