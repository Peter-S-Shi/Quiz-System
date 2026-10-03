# V2 Final Product UI Integration milestone

**Status:** **ACCEPTED** (Human Gate PASS, 2026-10-03, after the first Human Evaluation, the Human Evaluation Repair and its targeted re-test; see `docs/V2_WHOLE_PRODUCT_FEATURE_GATE.md`). Next phase: Product Hardening (not started).
**Authority:** `V2_PRODUCT_SCOPE_FREEZE.md` Revision 1, `docs/V2_UI_ARCHITECTURE_FREEZE.md` (the approved prototype's information architecture, "Warm Paper · Living Ink", no second UI architecture), ADR 0001–0004 (ACCEPTED) and the accepted Desktop Foundation, V1 Migration, Learning Orchestration + Calendar, Task-Domain Integration and Objective Answer Explanation + Focused Practice milestones. **This is integration: no Evidence, Scheduling, Recommendation, session or domain semantics were changed.**

## 1. Scope

**Built** — every approved surface now runs on real data and real actions, in the real packaged app:

| Surface | What a learner can do (all through the accepted services) |
|---|---|
| **Today** | The daily briefing: due / overdue / dates waiting for a decision (derived, zero-write); suggestions from the deterministic Recommender with a readable reason (en / zh-CN), never a score; due scheduled sessions; unfinished-session resume / discard; a composer (Selection × Intent × Domain). Starting anything opens Focused Practice with the learner's real Selection (the shown reasons are stored) and, for a due occurrence, its schedule link. |
| **Calendar** | A month grid of the accepted occurrence projection; side panel for a day, an entry, a new schedule, and **dates waiting for your decision** (accept / keep). Move this occurrence / this and the following, cancel one / the series, create (once or simple recurrence) — all `ScheduleStore` operations by occurrence identity `(scheduleId, originalDate)`; drag-and-drop and a keyboard date field do the same operation. An occupied slot is refused with an explanation. |
| **Library** | The formal content entry: three columns (domains / categories / folders · list · detail), search, create / edit / delete / import / export for **Objective papers** (five types, optional explanation, image / audio), **Translation documents** (+ folders) and **Typing texts**. Editing or deleting content never touches a recorded attempt. |
| **Evidence history** | Every recorded attempt as recorded (Objective with the explanation of that moment, Translation with the learner's marks and any reviews, Typing differences, migrated V1 history; V1 twins are never listed). Retry (new session with recorded lineage), open in Review, export a review request. No mastery state. |
| **Review / Correction** | Independent Teacher Reviews of a recorded response: judgments, comments, tags, suggested rewrite and corrections (style / insert / replace / delete / comment) over exact UTF-16 ranges of the learner's answer (grapheme-snapped), the original answer read-only. Several reviews coexist; import of an external review (new / identical → no-op / explicit update / refused), export of a review, remediation request and review request. |
| **Exchange & backup** | Open Teaching Interchange tickets (review request, teacher review, remediation material with provenance check, quiz papers, translation documents), full backup, restore, and the V1 → V2 migration — every import previews first. |
| **Settings** | V1's preferences (language zh-CN / en, appearance, motion, physical sound, list width) stored in the Rust-owned database; read-only system facts; media files. |

**Required carry-forwards of the previous milestone — closed:**

1. **Objective image / audio now render through the formal media pipeline.** New Rust Store-Port commands `media.read` (bounded 1 MiB chunks by media id) and `media.put` (bytes → content-addressed object, image / audio types only, 24 MiB cap), both path-free and on the WebView allowlist; `desktop/ui/web/src/media/media-source.js` (DOM-free) and `practice/media-presenter.js` (decodes the image / loads the audio in the browser engine). **The `MEDIA_UNSUPPORTED` fail-closed is lifted only for media that has been PROVEN presentable** (read through the port, type matches its declared kind, the engine decoded it): `ObjectiveSession.start / restore` accept a `presentableMedia` set and refuse everything else; a missing, undecodable, mistyped object or an absent presenter still keeps the paper from starting and nothing is recorded.
2. **Typing text authoring moved into the Library content workflow**; the interim launcher (`practice/launcher.js`) and its harness were **removed** after the real product entry points fully covered them; their regression assertions (`app-selftest.mjs`, 23 checks) were ported to the product.

**Not done by design:** hardening, new Domain / Evidence / Scheduling semantics, hints / AI / knowledge points / citations, analytics or goals, external calendar / reminders / notifications, bundled fonts (see 3.9).

## 2. Architecture

```text
views (ui/views/*.js)  ── render, ask, never decide ─────────────────────────────┐
  Today · Calendar · Library (+editors) · History · Review · Exchange · Settings  │
shell (ui/shell.js) navigation · chrome · prefs · toasts · the door to practice  │
        │ product services (product/*.js, DOM-free, tested on the real store)    │
        ▼                                                                         │
  library · learning · history · reviews · exchange        practice runtime ──────┘ → SessionFinalizer (the ONE door for Evidence)
        │                                       ScheduleStore (the ONE writer of Scheduling Context)
        ▼
  Store Port (Rust: SQLite, constraints, media, archives)   native flows (Rust-owned dialogs; paths never reach the WebView)
```

Static tests (`product-architecture.spec.mjs`) pin: no remote URL / CDN / network API anywhere; no browser-origin storage, HTML parsing, dynamic code or inline style attribute (the CSP forbids them); views never write to the store; services and the exchange modules are DOM-free; Evidence is written only through the finalizer, Teacher Reviews only by the Review service; Focused Practice is mounted only through `practice-entry.js` (one shared surface, not a mode); the dictionary has every key in **both** languages with identical placeholders, real Chinese text, and every key the code uses is defined.

## 3. Implementation clarifications (for Human Gate review)

1. **Integration only.** Recommendations, Due / Overdue, conflicts, occurrence identity, fulfillment, finalization and the session engines are the accepted modules, called unchanged. The new modules are composition, queries and views.
2. **Selection is real and stored.** A suggested start stores the reasons the learner was shown (`selectionProvenance`); a manual start stores `manual`; a due occurrence starts with its `scheduleRef` (fulfilled by identity). The launch info is kept in the recovery state, so a session resumed after a restart finalizes with the same provenance.
3. **Media proof is behavioral.** A paper's media is proven when a session starts (and again when one is resumed); the engine, not the UI, refuses unproven media. The Library lists such papers as startable and explains the refusal when proof fails.
4. **Teacher Review, request packages, translation-document import and corrections are ports of the V1 modules**, pinned by differential tests (`exchange-differential.spec.mjs`: fuzzed corrections, a battery of mutated Teacher Reviews through the V1 and V2 validators, request / remediation packages, provenance). Differences are limited to the Learner Response validator messages (the V2 adapter validates the embedded response), whose verdicts are asserted equal.
5. **Reviews are create-only records;** an external review with an existing id is an explicit, preview-first update of that review only; it can never be moved to another response.
6. **Imports are untrusted.** Every file is validated; a colliding id becomes a separate copy, never an overwrite; a remediation document must trace to a response and review in this library; portable papers carry their media inline and are re-stored by content.
7. **New native surface (Rust-owned):** `native_export_text` (Save dialog + write) and `native_import_text` (Open dialog + bounded read, 32 MiB, UTF-8). The chosen path never reaches the WebView. The WebView allowlist gained only `media.read` and `media.put`; the audited path-free contract tests cover them.
8. **Language.** The whole product and Focused Practice are bilingual (zh-CN / en); the default follows the system language and is a preference. Material text is never translated.
9. **Fonts.** The product uses **system font stacks only** (no hosted font, no network). The architecture freeze also asks that every required font be bundled; no font is *required* by the layout, and bundling a CJK serif subset would add a binary asset that needs a licensing choice, so the Human Gate **decided to accept system font stacks** (narrow amendment in `docs/V2_UI_ARCHITECTURE_FREEZE.md`): the frozen invariant is offline, no CDN, no network font dependency. No font asset was added.
10. **Dark mode** follows the system unless the preference says otherwise; reduced motion is honoured from the system and the preference.

## 4. Evidence

Local (development machine): **210 unit + 92 integration JS tests**; browser self-tests in headless Edge over the real Rust store — **Focused Practice DOM 84/84**, **learning-session regression 23/23**, **final product UI 140/140**; and the same product **inside the real packaged `quiz-studio.exe` (real WebView2, CSP and Tauri IPC) 19/19** (developer machine only: the hosted CI runner WebView2 refused a debugging port — its command line carried no flag even via the environment variable and the registry policy — so that CI step reports **NOT RUN**, never PASS; CI still launches and smoke-tests the packaged app), plus the packaged-app smoke (`webview.pinned_comparison`, single instance, crash recovery); `cargo fmt --check` and `cargo clippy --workspace --all-targets -D warnings` clean; Rust `media.read` / `media.put` tests. Windows Desktop CI (CI-L2) for the candidate: **green**, [run 37131774633](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37131774633), head `837b07b`. Earlier runs on the way to it failed only in test infrastructure (a timing race in the product self-test; the hosted-runner WebView2 refusing a debugging port) and were repaired without product changes. On the hosted runner the real-packaged-app product check reports **NOT RUN** (it is verified 19/19 on a developer machine); the packaged app itself is still launched and smoke-tested in CI.

| Contract | Automated evidence |
|---|---|
| Media pipeline: bytes in, chunked bytes out, dedup, type / size refusal, foreign-key on references | Rust `port_contract.rs`, `webview_contract.rs`; `integration/media-pipeline.spec.mjs` |
| Objective image / audio shown and played; undecodable media refused and nothing recorded | `product-selftest.mjs` (Library), `packaged-product-check.mjs` (real WebView2), `objective-media-failclosed.spec.mjs`, `integration/practice-runtime.spec.mjs` |
| Library: Typing / paper / document authoring, revision-guarded saves, verbatim text, deletion keeps Evidence | `integration/product-library.spec.mjs`, `product-selftest.mjs` |
| Today / Calendar read-only projections; schedule operations by identity; suggestions decided or superseded; manual / recommended Selection stored | `integration/product-learning.spec.mjs`, `product-selftest.mjs` |
| History shows what was recorded (explanation of that moment, lineage, twins hidden, no mastery) | `integration/product-history.spec.mjs`, `product-selftest.mjs` |
| Review: contract on save and import, overlap refusal, update / idempotent / refused, V1-valid requests | `integration/product-reviews.spec.mjs`, `exchange-differential.spec.mjs`, `product-selftest.mjs` |
| Exchange: previewed imports, collisions become copies, hostile files refused, paper media round trip | `integration/product-exchange.spec.mjs`, `product-selftest.mjs` |
| Offline, no browser storage / HTML parsing, layering, one door for Evidence, bilingual dictionary | `product-architecture.spec.mjs`, `product-selftest.mjs` (external-resource scan) |
| Core cross-page journeys (suggestion → practice → Evidence → History → retry lineage → Review → Exchange; Library → authoring → practice; resume after restart) | `product-selftest.mjs`, `app-selftest.mjs` |
| Accessibility base contract on every view (one h1, labelled landmarks, unique ids, accessible names, alt text, no horizontal overflow at the minimum window) | `product-selftest.mjs` |
| Existing Migration / Orchestration / Task-Domain / Practice regressions | the unchanged suites in the same workflow |

## 5. Open — manual, not PASS, not waived

`manual-qa/v2-final-product-ui.md` (+ `.zh-CN.md`): M-U1–M-U8 (visual review at DPI / dark / high contrast, Narrator across the views, keyboard-only journeys, real Microsoft IME and a third-party IME in the **Library editors**, native file dialogs with real files, drag-and-drop, real backup / restore, installer upgrade with the new UI). Still open from earlier milestones: M-T1b/d/e, M-T2a–d, M-T3a–c, M1–M7, D1–D4 (M-T1a and M-T1c are PASS). The self-tests drive Chromium / the real WebView2 with trusted input — **not the OS IME, not Narrator, not the OS file dialogs.**

Other items: fonts are system stacks (accepted, decision above); the final application icon and the release version are RC acceptance items; the Typing live feedback and other behavior changes recorded in `docs/V2_PRACTICE.md` are unchanged.

## 6. Gate readiness

Implementation complete; the automated contract passes locally and runs in the Windows CI workflow (including the real packaged app). The milestone is **ACCEPTED**. The manual items listed in section 5 remain OPEN (not PASS, not waived) as Product Hardening / RC evidence debt. Hardening is **not started**.
