# Development Log

## 2026-07-18

- Defined the current Quiz Studio application as Milestone 1: Foundation Prototype.
- Confirmed the Milestone 1 scope covers editable quiz papers, objective question types, shuffled answer choices, bilingual UI, theme switching, local persistence, JSON import/export, and project documentation.
- Strengthened Git ignore rules for local environments, caches, generated data stores, and private export files before future GitHub synchronization.
- Clarified the future JSON data boundary: public examples should live in `examples/`, while real user quiz data should live in ignored local folders such as `user-data/` or `exports/`.
- Added English and Chinese milestone roadmap documents and defined Milestone 2 as practice flow enhancements.
- Expanded the roadmap vision with Milestone 3 local quiz library, Milestone 4 quiz core and open data format, Milestone 5 public release preparation, and long-term optional directions.

## 2026-07-17

- Rewrote the main README as a more standard English project document.
- Added a Chinese README translation in `README.zh-CN.md`.
- Documented localization, project structure, data behavior, and current prototype scope.

## 2026-07-09

- Added an interface language selector with Chinese and English support.
- Centralized UI copy in an extensible language dictionary for future locales.
- Kept quiz paper content independent from the interface language so authored questions are not rewritten by language switching.

## 2026-07-08

- Created the first static prototype of Quiz Studio.
- Added paper editing for single choice, multiple choice, blank, true/false, and one-to-one matching questions.
- Added light and dark theme switching.
- Added shuffled answer choices for quiz sessions.
- Added correct and wrong answer feedback.
- Added local browser storage and JSON import/export.
