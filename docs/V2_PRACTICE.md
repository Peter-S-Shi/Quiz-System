# V2 Objective Answer Explanation + Focused Practice milestone

**Status:** implementation complete, **awaiting Human Gate**
**Authority:** `V2_PRODUCT_SCOPE_FREEZE.md` Revision 1 (§3.4–§3.5, §4.7, §10, §11, §12, §13, §22–§23), `docs/V2_UI_ARCHITECTURE_FREEZE.md`, the approved UI prototype / design inputs, ADR 0001–0004 (ACCEPTED), and the accepted Desktop Foundation, V1 Migration, Learning Orchestration + Calendar and Task-Domain Integration milestones. No Evidence or Scheduling semantics were reopened; no new UI architecture was introduced.

## 1. Scope

**Built**

1. **Objective Answer Explanation** — an optional textual `explanation` on all five question types (single, multiple, blank, true/false, matching). It is Content: it never enters grading, a result, the summary, the slot, a Reader or Scheduling. Instant feedback reveals the correct answer and the explanation only after that item is graded; Submit-at-End reveals nothing (no grading, no correct answer, no explanation) until the whole paper is submitted; a finalized Learner Response keeps the explanation that existed at attempt time, so editing the source question later cannot rewrite history. Backward compatible: a question without an explanation behaves exactly as before.
2. **Focused Practice surface** — one shared frame for the three domains (not a canonical mode): while a session is active the sidebar / navigation / administration chrome is removed; what remains is the domain's own interaction, progress, a safe exit (keep practicing / save and leave / discard) and session recovery.
3. **Objective** (five types, Instant and Submit-at-End, Practice and Test intents, retry of the incorrect questions), **Translation** (production, reveal-on-request reference, span annotations and item marks, retry from the finalized snapshot) and **Typing** (the committed-text engine, wired to a real textarea; long-text wrapping and active-position following) sessions as engines + views.
4. A **minimal practice launcher** (under the existing *Library* navigation entry) so the surface is reachable from materials in the store, with resume of unfinished sessions. It is interim by design — not Library, Today or Calendar — and includes a bare *Add a typing text* form because Typing text authoring does not exist yet.
5. **WebView smoke for the pinned comparison**: the app runs literal pinned `typing-compare/1` cases inside the real WebView at startup and reports them through `ui_ready`; the packaged-app smoke asserts them.

**Not built, by design:** Today / Calendar / Library / History / Review / Exchange / Settings final product UI; hints, AI explanations, knowledge points or citations; authoring UIs; image / audio display inside questions (**fail-closed**, see clarification 11); any change to Evidence, Scheduling, Recommendation algorithms (the Reader registry, recommender v2 and planner v1 are untouched), the V1 line, the Rust store schema (still 4) or the public JSON Schemas.

## 2. Where it lives

| Concern | Code |
|---|---|
| Question content, readiness, V1-pinned grading | `desktop/ui/web/src/objective/questions.js` |
| Objective engine (the only place that decides what is revealed; `view()` is an allow-list) | `…/objective/session.js` |
| Translation engine, retry material | `…/translation/session.js` |
| Typing engine: windowed live comparison; DOM adapter | `…/task-domains/typing/session.js`, `dom-adapter.js` |
| Passage cells / statuses / follow-scroll (pure) | `…/practice/typing-passage.js` |
| Surface frame, exit / recovery / commit plumbing | `…/practice/surface.js` |
| Per-domain views | `…/practice/objective-view.js`, `translation-view.js`, `typing-view.js` |
| Store glue (materials, ids at start, recovery, finalization door) | `…/practice/runtime.js` |
| Launcher, WebView self-check | `…/practice/launcher.js`, `webview-selfcheck.js` |
| Self-tests in a real browser engine | `desktop/ui/selftest/` (`practice-selftest.mjs`, `app-selftest.mjs`, CDP client, harnesses) |

## 3. Implementation clarifications (for Human Gate review)

1. **Explanation is a question field; no V1 or schema change was needed.** `explanation` is an optional string on the question, kept verbatim; absent, empty, whitespace-only or non-string means "no explanation" when normalizing, and authoring validation rejects a present non-string. The public quiz-paper JSON Schema is open per question and V1's own normalization / export preserves unknown question fields — both proved by a test — so `schemas/` and V1 code are untouched.
2. **The engine, not the UI, owns revelation.** The Objective view model is built from an explicit allow-list: no `correct` flags, accepted blank answers, true/false key, matching pairing or explanation exists in any view before it is allowed. Matching right-hand options are shown under opaque positional tokens that do not reveal the pairing (the stored V1 answer format is unchanged). The post-submission `review()` throws before the paper is finished.
3. **Snapshot at session start.** The question snapshot (V1 shape, with the explanation) is taken once when the session starts and is what both the learner response and a resumed session use; source edits cannot reach it. Grading is a port of V1's, pinned by a differential test against the unchanged V1 module.
4. **Translation engine ported from V1 semantics** (answers per item, reveal state is session-only, three distinct kinds, same-span replace / partial-overlap refusal, stale anchors dropped on edit, corrupt marks degrade on restore). New: annotation selections are snapped outward to extended-grapheme boundaries of the pinned Unicode tables, so a mark can never split a character; offsets stay UTF-16 and are declared in the session facts.
5. **Typing live feedback is windowed (behavior change of the live view only).** The live view compares the typed text with the reference window typing can have reached (starting at the typed length and growing while the typed text overruns it) instead of the whole passage, so its cost follows what was typed. The not-yet-typed remainder is therefore *pending* (`live.reached`), no longer reported as a trailing omission error. The final comparison at `finalize` is unchanged and always uses the full text.
6. **A narrow exception to "untrusted never enters"** (found by driving a real Chromium with CDP IME input): some user-agent paths deliver the closing `compositionend` with `isTrusted=false`. An untrusted `compositionend` may now only *close* a composition that trusted events opened, and only when the element still holds exactly the value the last trusted composition input reported; it can never inject or change text. Unit tests cover the forged-value refusal.
7. **Exit semantics.** Exit / Esc asks: keep practicing, save and leave (the recovery state is written), or discard (confirmed; no result is recorded). Esc during an IME composition never opens the dialog. Recovery state is written at session start, after each answer / change, on blur and when the page is hidden; it is cleared only after the evidence commit.
8. **One door for results.** Every finished session goes through `SessionFinalizer` (ADR 0004); nothing under `practice/` names an evidence collection (static test).
9. **Chromium, not WebView2 itself, in CI for the DOM checks.** The self-tests drive Microsoft Edge headless (the engine WebView2 embeds) with trusted `Input.insertText` / `Input.imeSetComposition` / key events; they prove the engine contracts but are *not* a real OS IME in WebView2 — those stay manual.
10. **Explicit exit actions are required actions (Human Gate repair).** Automatic saves (per change, on blur, when hidden) stay best-effort and report a persistent error on failure. *Save and leave* closes the surface only after the recovery state is really stored; *Discard* closes and reports `discarded` only after the recovery row is really cleared. On failure the surface stays open, a persistent error is shown, nothing is lost or recorded, and the action can be retried. Saves are serialized, so a discard cannot be undone by a save already in flight. The post-commit recovery cleanup is unchanged (idempotent, crash-safe) and finalization was not touched.
11. **Objective media is fail-closed (Human Gate repair).** The surface cannot show images or play audio yet, so a session that needs a question with `image` or `audio` never starts: the engine refuses (`MEDIA_UNSUPPORTED`) on start, on retry of a requested media question and on restore of a recovery state, and the launcher lists such a paper as not startable with the reason *Contains image or audio that this practice screen cannot show yet*. A retry of questions without media from a media paper stays possible. Media metadata is never removed or rewritten. **Carry-forward (required, not waived or deferred): real Objective image / audio rendering belongs to the Final Product UI Integration and must land before media papers become startable.**

## 4. Evidence

Local (development machine): **193 unit + 63 integration JS tests** pass (existing Migration / Orchestration / Task-Domain suites included), the DOM self-test **78/78** and the real-store app self-test **23/23** pass in headless Edge, `cargo fmt --check` and `cargo clippy --workspace --all-targets -D warnings` are clean (Rust code is unchanged). The Windows Desktop CI run for the repair candidate (head `77b259f`) is **green**: [run 37096529380](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37096529380). (`a95a654` failed one app-selftest check — an in-flight recovery save could land after the post-commit cleanup — fixed in `77b259f`: the commit now awaits the serialized save queue.) The earlier candidate `b318938` was green in [run 37083868209](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37083868209) but is superseded by the Human Gate repair.

| Contract | Automated evidence |
|---|---|
| Explanation on five types, optional, verbatim; V1 / public schema compatibility | `objective-explanation.spec.mjs` |
| Instant: reveal only after grading, right or wrong; locked afterwards | `objective-explanation.spec.mjs`, `practice-selftest.mjs` (keyboard flow) |
| Submit-at-End: no grading / answer key / explanation anywhere before submission (structural + textual + DOM) | `objective-explanation.spec.mjs`, `practice-selftest.mjs`, `app-selftest.mjs` |
| Snapshot keeps the attempt-time explanation; later source edits never rewrite it | `objective-explanation.spec.mjs`, `integration/practice-runtime.spec.mjs` (real store) |
| Explanation never changes grading, summary, slot, adapter verdict or what the Readers see | `objective-explanation.spec.mjs`, `integration/practice-runtime.spec.mjs` |
| Focused Practice removes chrome, restores it; exit / discard / resume; failed mount cleans up | `practice-selftest.mjs`, `app-selftest.mjs` |
| Translation production, reveal, marks (UTF-16, grapheme-safe), retry lineage | `translation-session.spec.mjs`, `practice-selftest.mjs`, `app-selftest.mjs` |
| Typing long text: wrapping, following (monotone, always visible), no focus / caret loss, resize, resume | `typing-long-text.spec.mjs`, `practice-selftest.mjs`, `app-selftest.mjs` |
| Typing committed-text path without keydown / compositionend; composition not scored; Test opaque | `typing-session.spec.mjs`, `practice-selftest.mjs` (trusted CDP input) |
| Keyboard operation, focus, basic accessibility contract (names, legends, progressbar, live region, one h1, unique ids, Exit first) | `practice-selftest.mjs` |
| Pinned comparison inside the real WebView | `webview-selfcheck.spec.mjs` + `scripts/smoke.ps1` (`webview.pinned_comparison`, `webview.engine_reported`) in the packaged-app step |
| Architecture: engines DOM-free; views cannot grade; only the runtime touches the store; no browser storage / HTML parsing | `practice-architecture.spec.mjs` |
| Save and leave / Discard are required actions: failed save / clear keeps the surface open, persistent error, retry works, no result recorded | `practice-selftest.mjs` (fault injection) |
| Media-bearing papers: not startable, refused by the engine on start / retry / restore, no Evidence, metadata intact | `objective-media-failclosed.spec.mjs`, `integration/practice-runtime.spec.mjs`, `app-selftest.mjs` |
| Existing Migration / Orchestration / Task-Domain regressions | the unchanged suites in the same workflow |

## 5. Open — manual, not PASS, not waived

`manual-qa/v2-focused-practice.md` (+ `.zh-CN.md`): M-T1a–e real Microsoft IME / third-party IME / dead keys / paste-drop in the real WebView2; M-T2a–d human long-text reading, resize / DPI, Test intent, interrupt-resume; M-T3a–c keyboard-only, Narrator, high-contrast / 200 %. Plus M1–M7 (Migration) and D1–D4 (Desktop Foundation), unchanged.

Other open items: **Objective image / audio rendering (required carry-forward of the Final Product UI Integration, not waived)**; a real Library / Today entry point; Typing text authoring; per-IME behavior beyond what the manual checklist records.

## 6. Gate readiness

Implementation complete; the automated contract passes locally and runs in the Windows CI workflow. The final Human Gate Exit evidence additionally required **M-T1a** and **M-T1c**: both **PASS** (Product Owner, 2026-10-03, local release build of `77b259f`, not the CI-packaged installer; see `manual-qa/v2-focused-practice.md`). The milestone **awaits the Human Gate**. The final product UI integration is **not started** and needs its own authorization.
