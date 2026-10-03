# V2 Human Evaluation Repair — record

One bounded repair milestone on the long-lived `v2` branch, driven by the Product Owner's first full human-evaluation walkthrough of Final Product UI Integration. Accepted Evidence / Scheduling / Recommendation / Task-Domain contracts, the store schema, the V1 / public schemas and the Evidence session-facts schema are **unchanged**. Product Hardening and RC have **not** started.

## What changed (six areas)

| # | Area | Behavior |
|---|---|---|
| 1 | Result / Evidence hierarchy | The Objective post-submit result and Evidence History share one presentation: a **score hero** (`correct / total` and percent first) and per-question **cards** that separate prompt, learner answer, verdict, correct answer (only when wrong) and the explanation as secondary content. Bands (display only, never stored): all correct = green + restrained flower mark; 90–99% green; 70–89% amber; below 70% red. Every tone is paired with a glyph and a word. All correct means every question correct: 199 of 200 is shown as 99% (high band), never as a full score. Translation stays unscored; Typing stays fact-based. |
| 2 | Library factual state | A derived, quiet marker on every Library row and in the detail: **Not started** (no canonical Evidence, no saved session), **In progress** (an active recoverable session exists), **Practiced** (at least one canonical completed attempt, with the count). In progress wins over Practiced. Derived from `learner_response`, `typing_attempt` and recovery state; **nothing is persisted**, and it is stated in the UI as a fact, not a mastery level. |
| 3 | Objective paper editor | A paper is authored in the **main workspace**: one active question card, a navigator (number, type, prompt preview) with jump, explicit move up / down per row, Previous / Next, a collapsible paper-details panel. Add / remove / reorder, all five types, image / audio + alt text, explanation, strict validation, stale-revision handling, save / cancel / discard and keyboard operation are preserved. Saving or cancelling returns to the Library on that paper. |
| 4 | Typing completion time | A human-readable duration (`Time taken: 1 min 5 sec`) on the Typing result and in Evidence History, derived from `session.startedAt` / `completedAt`. Missing, invalid or negative timing reads "Time not recorded". No WPM, speed or accuracy; `typing_attempt` unchanged. |
| 5 | Physical sound | The Rust-owned `sound` preference (default off) now gates **real practice**: page accent on question / sentence navigation, pen accent on discrete answer / selection / mark actions, stamp accent on grading, reveal and final submission. No sound per Typing keystroke or per character of any text field. Sound is never the only feedback. A suspended Web Audio context is resumed; an unavailable one is silent. No audio assets, no network. |
| 6 | Optional question-order shuffle | An Objective-only, **per-session learner choice** (default OFF, authored order): *Shuffle question order* in the Library detail, the Today composer and the result's retry. When ON the order is realized once at start with the session RNG; the realized snapshot order is the canonical record, survives save / resume, and is the order of the finalized response. No new Mode, no default, no Evidence field. |

## Where it lives

- Score bands and result presentation: `objective/score-band.js`, `practice/result-view.js` (used by `practice/objective-view.js` and `ui/views/history.js`).
- Material state: `product/material-state.js`, `learning.materialStates()`, `ui/views/library.js`.
- Editor workspace: `ui/views/editors.js` (`editPaper`), opened into the main region by `ui/views/library.js`.
- Duration: `duration.js`; shown by `practice/typing-view.js` and `ui/views/history.js`.
- Sound: `ui/sfx.js` (resume-aware) → `ui/practice-entry.js` passes `app.sfx` as `services.sfx` → `ctx.sfx(name)` in the practice surface (a no-op without one, so the practice layer never imports `ui/`).
- Shuffle: `ObjectiveSession.start({ shuffleQuestions })` → `runtime.startObjective` → `learning.start`; UI choices in Library / Today / result.

## Automated evidence

New unit suites: `objective-shuffle` (OFF authored, ON permutation, fixed across restore, retry subset, finalized order, no leakage, no stored flag), `score-band` (bands, boundaries, 199/200), `material-state`, `duration`, `sfx` (the preference gates every call, reduced motion, missing / throwing / suspended Web Audio, no asset or network reference). New integration tests over the real store (`product-learning`): derived Library state transitions with nothing persisted; shuffled start, restore and finalization order. Headless-Edge self-tests extended: practice 93 (sound reaches practice, no per-keystroke sound, result hero and cards, Typing duration), product UI 158 (editor workspace and navigator, reorder, Library state pills, shuffle choice, Typing duration in History, sound gate through the real app with a Web Audio spy). Real audible quality of the sounds remains a **manual** check.

## Not changed / not claimed

Evidence, Scheduling and Recommendation semantics; Instant vs Submit-at-End reveal rules; the Typing comparison and IME path; media `read` / `put` and fail-closed behavior; backup, migration and exchange contracts; system fonts (no font dependency was added). The earlier HE10 wording issue was a guide bug, not a product bug; no duplicate Review buttons were added.

## Status

Repairs implemented. Candidate CI-L2 and the Human re-test are tracked in `PROJECT_STATUS.md`. The next step belongs to the Product Owner: a targeted re-test of the repaired journeys, then the Whole Product Feature Gate; Product Hardening / RC begin only afterwards.
