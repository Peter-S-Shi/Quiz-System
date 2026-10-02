---
status: ACCEPTED — GO WITH AMENDMENT (Human Gate, 2026-10-02); Task-Domain Integration implementation NOT STARTED (awaiting explicit authorization)
decision-date: 2026-10-02
gates: Task-Domain Integration milestone (Objective / Translation / Typing) — implementation NOT STARTED, awaiting explicit authorization
depends-on: V2_PRODUCT_SCOPE_FREEZE.md (Revision 1), docs/adr/0001-desktop-runtime-and-application-data.md (ACCEPTED), docs/adr/0002-v1-to-v2-migration-architecture.md (ACCEPTED), docs/adr/0003-learning-orchestration-scheduling-recommendation-calendar.md (ACCEPTED — GO WITH AMENDMENT), Desktop Foundation (ACCEPTED), V1 Migration milestone (ACCEPTED), Learning Orchestration + Calendar milestone (ACCEPTED, incl. the completeSession closed write seam)
---

# ADR 0004 — Task-Domain Integration and the Typing Evidence Contract

**Status:** **ACCEPTED — GO WITH AMENDMENT** (Human Gate, 2026-10-02; the outcome and the three amendments are recorded in §18 and already folded into the text below). This ADR turns the frozen product semantics of Scope Freeze Revision 1 (§3.3, §4.2–§4.3, §4.8, §8, §9, §11, §12, §14, §23) into an implementable and verifiable cross-domain contract for the Task-Domain Integration milestone. It writes **no domain code, no schema migration and no UI**. Task-Domain Integration **implementation is NOT STARTED and not authorized by this document**: accepting this ADR does not by itself start it; it needs its own explicit authorization (Scope §24). Nothing here reopens Scope Freeze Revision 1 (§14 maps every frozen boundary to the mechanism that keeps it).

## 1. Decision summary

1. **One finalization seam, three domain adapters.** A completed session of any domain is written by **one** Unit of Work (`ScheduleStore.completeSession`, ADR 0003 §10): the session's single evidence record + `session_selection` + at most one `schedule_fulfillment`. Each domain plugs into it through a **Domain Evidence Adapter** (§5): a closed registry entry `{collection, validator, slot derivation}`. The **write registry** is derived from the adapters and is a different, closed interface from the Reader registry (ADR 0003 §5).
2. **Objective and Translation keep the existing `learner_response` unchanged** (§6, §7): V1 validators and the closed V1 JSON Schema still accept every native V2 record; their different evidence semantics (graded results vs. no `result`; metacognition annotations; Teacher Review; retry/remediation provenance) are untouched. The only V2-native additions live in the schema's already-open `extensions` field, under one namespaced key (§5.3).
3. **Typing gets one new Evidence collection, `typing_attempt`, and one minimal Content collection, `typing_text`** (§8). `typing_attempt` is an immutable, self-contained **copy-typing transcription record** (reference snapshot, verbatim committed text, explicit comparison basis, UTF-16 spans aligned to grapheme boundaries, counts, retry provenance). It stores **no** accuracy/speed/level/score. Typing error ≠ knowledge error (§9).
4. **The Evidence Source Registry and the session-finalization write registry are extended with `typing_attempt` here, formally** (§4.2). This ADR is the amendment ADR 0003 §5 requires; once accepted, the Reader registry becomes `learner_response`, `teacher_review`, `legacy_history_entry`, `typing_attempt`, and the write registry becomes `learner_response`, `typing_attempt` (never `teacher_review`, `legacy_history_entry`).
5. **The slot is derived from the evidence, not trusted from the caller** (§5.4): domain, material and intent of the fulfilled slot are computed from the validated evidence payload, so a session of one domain can never fulfill another domain's schedule.
6. **Finalization is idempotent across an ambiguous crash** (§10.3): the evidence id is allocated at session start and kept in recovery-only state; re-finalizing an already-committed session is recognized by canonical equality, never duplicated.
7. **No universal `EvidenceRecord`, no mastery state, no cross-domain signal** (§9, §12). The Recommender gains one Typing Reader and one reason code (`TYPING_ERRORS_REMAIN`); output for any snapshot without `typing_attempt` records is unchanged (§9.3). **A typing attempt never creates an engine-owned schedule** (§9.4): Typing is fully retryable and schedulable by the learner, but not automatically.
8. **Additive store schema 3 → 4** adds exactly `typing_text` and `typing_attempt` (§11); everything else (Objective/Translation records, scheduling context, archives) is untouched.

## 2. Inputs, authority and non-goals

**Authoritative inputs:** Scope Freeze Revision 1; ADR 0001 (Store Port, catalog, archive, recovery-only `recovery_session`); ADR 0002 (verbatim carry, gaps registry incl. `v2.typing`, §7.5 *native offset-bearing records must declare their encoding explicitly*); ADR 0003 (Evidence boundary E-1/E-2, Evidence Readers, selection provenance, fulfillment, planner v1, the closed reason registry, the Human-Gate-approved `completeSession` closed write contract); the V1 Objective and Translation contracts (`schemas/learner-response.schema.json`, `src/core/interchange.js`, `docs/TRANSLATION_DOMAIN.md`, the Teacher Review and retry/remediation provenance contracts).

**This ADR decides** only what the earlier documents left open: how Objective and Translation use `learner_response` through V2 finalization; the minimal `typing_attempt` schema and its comparison basis; the registry extension; the shared session mechanics; the Typing Reader; the one-way dependencies; and the automated verification contract.

**This ADR does not decide / does not authorize:** Answer Explanation (question *content*; later milestone); Focused Practice and any final UI or layout (design lane; the long-text *behavioral* requirement of Scope §12.6 is a UI milestone concern); the five Objective question types, the Translation Teacher Review model and the Calendar/Scheduler rules (frozen/accepted, unchanged); how Teacher Reviews are created or imported in V2 (existing contract, not a finalization concern); any typing speed grade, mastery or knowledge score, adaptive keyboard pedagogy, per-key profiling, raw keystroke retention or longitudinal typing analytics (Scope §12.8, §17, §19, §21); Dictation; any change to V1 production code.

## 3. Vocabulary

- **Domain Evidence Adapter** — the per-domain entry of the finalization registry: the evidence collection it may create, the payload validator, and the slot derivation (§5). Not a plugin framework: the registry is closed and changed only by ADR.
- **Session facts** — the V2-native facts of one session that V1 never persisted for Objective/Translation: `intent` (Practice | Test), `feedbackTiming` (Objective), `offsetEncoding`. They are facts **about the attempt**, written once with the evidence.
- **Typing Text** — Content: a learner-supplied reference text that can be practiced and scheduled. Not a library product (§8.1).
- **Typing Attempt** — one finalized copy-typing session's immutable record.
- **Committed text** — text that the user agent has committed to the typing input: never an in-progress IME composition; it arrives through one committed-text path regardless of how it was produced (§8.5).
- **Comparison basis** — the versioned, project-controlled rule by which a reference text and committed text are compared (`typing-compare/1`): its own pinned normalization and extended-grapheme segmentation semantics, never the host's ambient behavior (§8.3).
- **Unresolved typing difference** — a recorded difference between reference and committed text in the *final* comparison (§8.3).

Terms of ADR 0003 (Slot, occurrence, scheduleRef, selection provenance, Reader, Signal) are used as defined there.

## 4. Architecture and seams

```
 domain session engines (Objective | Translation | Typing)          ← Task-Domain Integration milestone
        │  start: allocate evidenceId, capture selection / scheduleRef / retry provenance into recovery_session
        │  finish: build the evidence payload (domain-owned semantics)
        ▼
 SessionFinalizer  ── Domain Evidence Adapter registry (closed) ──► validate payload, derive slot
        │  one Unit of Work (tag session-complete)
        ▼
 ScheduleStore.completeSession  →  evidence (create-only, absent precondition)
                                   + session_selection + schedule_fulfillment (+ schedule status)
        ▲
        │ reads only (never writes)
 Evidence Readers (Objective | Translation | Teacher Review | Recovery | Scheduling | Typing) → Recommender
```

### 4.1 Dependency direction (normative)

- Domain session engines depend on the finalization seam; the **seam never imports a domain session engine** (it knows adapters through the registry).
- **Evidence Readers and the Recommender never import finalization, session engines or adapters**, and never write. ADR 0003 E-2 holds: the Typing Reader reads `typing_attempt` (+ `typing_text` for material availability, + `migration_origin` for unknown-fact rules) only.
- **Domains do not import each other.** The Typing module knows nothing of Objective/Translation grading or annotations and vice versa; they meet only in the registry, the shared session envelope (§10) and the Recommender's closed output types.
- Evidence-side code (canonical JSON, projections, Store Port client, the migration crates) continues to know nothing of scheduling (ADR 0003 architecture test) and now also nothing of Typing.

### 4.2 The registries (the closed lists, formally amended)

| Registry | Purpose | Members after this ADR |
|---|---|---|
| **Evidence Source (Reader) registry** (ADR 0003 §5; code: `EVIDENCE_SOURCES`) | what Readers may **read** as Evidence | `learner_response`, `teacher_review`, `legacy_history_entry`, **`typing_attempt`** |
| **Session-finalization write registry** (ADR 0003 closed write seam; code: `SESSION_EVIDENCE_WRITABLE`) | what a completing session may **create** | `learner_response`, **`typing_attempt`** |

The two lists have different semantics and are **never derived from each other**: `teacher_review` and migrated `legacy_history_entry` are readable but never writable by finalization. Adding a member to either needs an ADR amendment; this ADR is that amendment for `typing_attempt`. On acceptance, ADR 0003 §5 and §12.1 receive a one-line pointer to this section (documentation only).

## 5. The finalization contract

### 5.1 Domain Evidence Adapter registry (closed)

| Domain | Collection | Material type | Validator (existing or new) | Slot (derived) |
|---|---|---|---|---|
| Objective | `learner_response` | `quiz-paper` | the V1 Learner Response validator + objective constraints (§6) | `(objective, {quiz-paper, <slotMaterialId>}, <intent>)` |
| Translation | `learner_response` | `translation-document` | the V1 validator + translation constraints (§7) | `(translation, {translation-document, <slotMaterialId>}, <intent>)` |
| Typing | `typing_attempt` | `typing-text` | the `typing_attempt` validator (§8) | `(typing, {typing-text, <material.id>}, <intent>)` |

Both Objective and Translation use the **same collection** with **different adapters selected by `material.type`**; an unknown `material.type` is rejected before any Store Port access. The adapter's validator runs **inside** the closed write contract (structure → adapter validation → absent preconditions), so an invalid payload fails deterministically with **zero writes** (the contract of ADR 0003's finalization seam is unchanged; adapters add *payload* checks to its *structure* checks).

### 5.2 What stays closed

Finalization still accepts only `put` (create) of the adapter's evidence collection; no delete, no update-existing, no other collection, no Scheduling Context, Content, `teacher_review`, `legacy_history_entry` or migration metadata write; every evidence id carries an `absent` precondition; duplicate ids and extra operation fields fail before the Store Port. The session reference must name an adapter collection. None of that changes.

### 5.3 Session facts for `learner_response` (V1 contract untouched)

The V1 Learner Response schema is closed at top level but defines an open `extensions` object. Native V2 Objective/Translation records carry their session facts there, in **one namespaced key**:

```text
extensions["quiz-studio.v2.session"] = {
  schemaVersion: 1,
  intent: "practice" | "test",                 // Scope §8
  feedbackTiming?: "instant" | "submit-at-end",// Objective only (Scope §10)
  offsetEncoding?: "utf16-code-unit"           // REQUIRED iff the record carries offsets (annotations)
}
```

- It is written **once, with the evidence**, and is immutable with it (E-1). Migrated records have **no** such key: absence means *unknown* (gaps `objective.feedback-mode`, and intent/offset labels live in `migration_origin`, ADR 0002 §7.4–§7.5), never "practice" and never UTF-16 by default.
- `offsetEncoding` is the **explicit declaration ADR 0002 §7.5 requires** for native offset-bearing records (Translation `learnerAnnotations`): a native record that carries annotations and no declared encoding is rejected by the adapter.
- The V1 schema and `validateLearnerResponse` keep validating every such record; unknown fields elsewhere stay rejected, exactly as in V1. Nothing is added to `responses`, `summary`, `provenance` or `learnerAnnotations`.
- `Typing` does not use `extensions`; its schema is new and carries these facts as first-class fields (§8.2).

### 5.4 The slot is derived from the evidence

`completeSession` receives the slot from its caller today. Under this ADR the finalizer **computes the slot from the validated payload** (§5.1) and `completeSession` rejects an input whose supplied slot differs (`SLOT_MISMATCH`, zero writes). Consequences: (a) a typing attempt can never fulfill an Objective/Translation schedule and vice versa; (b) the schedule's intent is the session's recorded intent: a Practice session never satisfies a Test schedule (ADR 0003 §10) without trusting the caller; (c) the Recommendation never fixes Practice/Test (ADR 0003 §12.3) — the learner chooses it at start and it is recorded.

**Slot material.** `slotMaterialId` is `material.id` except for a **Translation retry**: V1 builds the retry material with fresh, ephemeral ids and records `provenance.sourceMaterialId`; such a session's slot material is the **source document** (`provenance.sourceMaterialId`), because the ephemeral material is not a schedulable thing. A Translation **remediation** session practices a live remediation document and uses its own `material.id`. An Objective retry keeps the paper's `material.id` (§6.3).

## 6. Objective integration

### 6.1 What does not change

The five question types, grading, the attempted-question snapshot, original submitted answers, grading snapshots, stable ids and timestamps, `summary.itemCount/correctCount/percent`, and the V1 `provenance.purpose: "practice"` default are exactly as in V1 (`createQuizLearnerResponse`). Wrong-question remediation remains a **selection of items**, not a mode (Scope §8). Answer Explanation, when added, extends question *content* and therefore the attempt snapshot by value (Scope §10.3) — **not decided here**.

### 6.2 Evidence semantics kept

Objective evidence is **correctness per item** (`responses[].result`), per attempted question snapshot. It never carries Translation metacognition semantics (`learnerAnnotations`, `learnerItemMarks` are Translation facts and the objective adapter rejects them on a `quiz-paper` record). Feedback timing (Instant vs Submit-at-End) is **Session Policy**, orthogonal to Practice/Test intent, and is recorded as a session fact (§5.3); it never changes grading or any recommendation.

### 6.3 Retry lineage

A native Objective retry (wrong-question practice with recorded lineage) writes the V1-defined provenance — `provenance: { purpose: "retry", sourceResponseId, sourceMaterialId, createdAt }` — with `material.id` equal to the source paper id and item ids equal to a subset of the source's item ids. That is exactly the lineage the existing Recovery Reader consumes (it matches source items by id, recovery only for items recorded correct that were previously incorrect, Rule 4 of ADR 0003 §12.2). V1 never recorded Objective retry lineage (gap `objective.retry-lineage`); V2-native sessions now do. A bare retry proves nothing; dangling lineage is carried and proves nothing.

## 7. Translation integration

Translation uses `learner_response` with `material.type = "translation-document"` exactly as V1 `createTranslationLearnerResponse`: **never** `result`, `correctCount` or `percent` (the translation adapter rejects them); `learnerAnnotations` (`unknown`, `uncertain`, `should_know`) and `learnerItemMarks` keep their V1 meaning and stay three distinct kinds; the document snapshot is by value; `provenance` carries retry/remediation lineage by value (`purpose`, `sourceResponseId`, `sourceReviewId?`, `sourceMaterialId`), so lineage survives deletion of the live document. Teacher Review stays a separate, multiple, rich-correction record keyed by `responseId` (`teacher_review.response_id` → `learner_response`, hard FK) and is **not** written by session finalization. Remediation documents remain live Translation Documents; the retry/remediation distinction stays purely `provenance.purpose`. Offsets: native annotation offsets are UTF-16 code units and the record declares `offsetEncoding` (§5.3); Teacher Review corrections created by a later milestone must follow the same explicit-encoding rule (ADR 0002 §7.5) — noted as a requirement on that milestone, not decided here.

## 8. Typing: `typing_text`, `typing_attempt`

### 8.1 `typing_text` (Content, minimal)

`{ schemaVersion: 1, id, title, text, createdAt, updatedAt }` — a learner-supplied reference text. Role `canonical` (archived/backed up like `paper`), **Content** class of ADR 0003 §5 (read for material identity/availability, never Evidence). Projections: `title`, `created_at`, `updated_at`. It deliberately has no folders, categories, import pipeline, difficulty, level or curriculum (Scope §12.8); authoring UI is a later milestone. Editing or deleting a Typing Text **never** rewrites or deletes any attempt (each attempt carries its own snapshot); a schedule on a deleted text is `unavailable` by ADR 0003 §9.4.

### 8.2 `typing_attempt` (Evidence) — normative minimal schema

```text
{ schemaVersion: 1,
  id,                                           // allocated at session start (§10.3)
  status: "finalized",
  material: { type: "typing-text", id, title, snapshot: { text } },   // reference-text snapshot, verbatim
  session:  { id, startedAt, completedAt },
  intent: "practice" | "test",
  policy: { feedbackTiming: "live" | "on-completion",                 // test => "on-completion"
            corrections: "allowed" | "disallowed" },
  committed: { text },                          // final committed text, verbatim (as typed, NOT normalized)
  comparison: { version: "typing-compare/1",           // names a FROZEN, project-controlled spec (§8.3)
                normalization: "NFC",
                segmentation: "extended-grapheme-cluster",
                offsetEncoding: "utf16-code-unit" },                  // explicit, never defaulted (ADR 0002 §7.5)
  counts: { referenceGraphemes, committedGraphemes },
  errors: [ { kind: "substitution" | "omission" | "insertion",
              reference: { start, end },        // UTF-16 code-unit span into material.snapshot.text, grapheme-aligned
              committed: { start, end } } ],    // UTF-16 code-unit span into committed.text, grapheme-aligned
  correctedErrorCount?: integer,                // optional; absent = not recorded (never 0 by default)
  provenance: { purpose: "practice" | "retry",
                sourceAttemptId?, sourceMaterialId?, createdAt } }
```

- **Closed** (no unknown fields; the validator rejects them) and **immutable**: a finalized attempt is never updated, rewritten or deleted by scheduling, recommendation, finalization or any domain operation (E-1). A retry is a **new** attempt.
- `errors` is the *final comparison* (§8.3): empty means the committed text equals the reference under the comparison basis. `correctedErrorCount` is the only fact about in-session corrections, optional because the session engine keeps no raw keystroke stream (Scope §12.1).
- **Facts, not derived truth.** Accuracy, CPM/WPM and similar are **never stored**: they are pure functions of recorded facts, computed at read time, and are not universal learning truth (Scope §12.1). Duration is `completedAt − startedAt` (gross, including pauses): **pause accounting is not part of v1** — an honest limitation (§15), so no speed figure is claimed precise.
- **Projections:** `material_id` (soft, no FK), `session_id`, `completed_at`, `intent`, `source_attempt_id` (soft, no FK — lineage survives deletion, the precedent of ADR 0002 I-8 and V1 provenance). No relation tables. No media.
- **Typing has no Teacher Review**: `teacher_review.response_id` references `learner_response` only; no review/annotation/mark attaches to a typing attempt, and no learner metacognition (`unknown`/`uncertain`/`should_know`) exists for Typing.
- **No native migration source:** V1 recorded no typing; migrated records keep gap `v2.typing` and the Typing Reader sees nothing for them.

### 8.3 Comparison, determinism and the error facts

**`typing-compare/1` is a frozen, project-controlled specification, not a call into the host.** It fixes (a) the **NFC** normalization behavior, (b) the **extended grapheme cluster** segmentation rules of UAX #29, each **pinned to one stated Unicode version**, (c) the cluster-equality rule, and (d) the edit-alignment algorithm with its tie-break order. The specification and a committed **conformance corpus** (inputs → expected clusters, NFC equality results and alignments) ship with the project. The canonical generation of typing facts and every later validation or replay **must not take their segmentation or normalization from the ambient platform** (the current Node/WebView `Intl.Segmenter`, `String.prototype.normalize`, ICU or OS tables): those are version-unpinned and differ across runtimes and over time. *How* the pinned semantics are realized (a project-owned implementation, vendored pinned tables, a pinned engine) is left to the milestone; the contract is that the same input yields byte-identical segmentation and error facts on every supported runtime and in any future replay.

Comparison is by pinned extended grapheme cluster of the **verbatim** reference and committed strings; two clusters are equal iff their pinned-NFC forms are equal (so a precomposed `é` equals `e` + U+0301; Hangul jamo sequences, emoji ZWJ sequences, regional-indicator flags and Indic conjunct clusters are single units as the pinned version defines). The deterministic cluster-level alignment yields `errors`. Every span starts and ends on a pinned-cluster boundary of its own string and is expressed in UTF-16 code units of the **stored verbatim string**. Consequences: the stored texts are lossless (an NFD input stays NFD), spans never split a surrogate pair or a pinned cluster, and two inputs that differ only canonically are **not** errors.

**Historical legitimacy is a function of the recorded `comparison.version`, never of the host.** A stored attempt's verbatim texts, counts, spans and `comparison.version` are **authoritative facts**. The validator checks (i) *structural* validity — bounds, ordering, non-overlap, UTF-16 well-formedness, count shape — which needs no Unicode tables, and (ii) *alignment and counts* **under the pinned semantics named by `comparison.version`**, never under ambient tables. Consequently an attempt that was valid when written stays valid after any WebView/OS/Node Unicode upgrade; nothing is ever recomputed to "fix" it. An attempt naming a `comparison.version` the running build does not implement is **carried verbatim and read-only** (structurally validated, not alignment-validated), exactly like a record from a newer schema; it is never rejected as corrupt and never rewritten. A future comparison version (a newer Unicode version or a different alignment) is a **new ADR-level decision that applies only to new attempts**; old attempts keep their version.

### 8.4 Practice and Test intent

- **Practice:** `policy.feedbackTiming` may be `live` (the session may compare while typing) or `on-completion`; corrections per `policy.corrections`.
- **Test:** `feedbackTiming` is `on-completion` **by contract** (the validator rejects `intent: test` with `live`). The session engine exposes **no comparison, diff or correctness signal until finalization** (Scope §12.4); progress may be shown without revealing correctness. After finalization the learner may inspect differences and results.
- Intent never changes what is recorded about the typed text; it changes only what the learner saw while typing (recorded, so history is interpretable).

### 8.5 IME, composition and committed input

Only **committed text** is scored. An in-progress composition is not input: composition updates never alter committed text, are never compared, never reach recovery state as committed text, and a **cancelled** composition leaves committed text unchanged.

**One committed-text path.** The canonical input boundary accepts **user-agent committed text** and does **not** require it to be accompanied by `keydown` or a composition lifecycle. A plain key, a dead-key result, a composition commit, a non-composing `insertText`, and a committed insertion produced by a third-party IME or other input method (including one that emits only an `input` event, no `compositionend` and no key events) all reach committed text through the **same** path: committed text is what the typing input holds after a **trusted user-agent input event** reports a committed change, not something reconstructed from `keydown` or `compositionend`. Input is **never dropped for lacking** a composition end or a keydown. The architecture assumes no Latin-only layout, and no input method or key identity is recorded (no per-key profiling).

**Two explicit exclusions, narrowly drawn.** (1) **Recognizable paste and drop** (user-agent input of the paste/drop kinds, and clipboard/drop events) are rejected by the Typing session policy: the committed text stays what it was before, nothing is recorded as evidence, and no partial paste is committed. (2) **Synthetic or app-owned DOM mutation** — untrusted (script-dispatched) events and the application's own programmatic changes to the input — **never enters the committed-input channel**; the app restores a recovered session through the explicit recovery path (§10.2), not by simulating input. These are distinct from a *real* non-composing `insertText`, which is accepted: "programmatic insertion" is **not** a generic rejection rule, and no path may classify a trusted user-agent insertion as synthetic because it lacked key or composition events.

The session engine speaks to the DOM through an event-model adapter (composition start/update/end, trusted committed insertion, trusted deletion, paste/drop, untrusted events), which is what makes the above automatable; **real IMEs on real platforms remain a manual check (§13 M-T1)**.

## 9. The Typing Reader and Recommendation

### 9.1 Typing error is not a knowledge error (normative)

`typing_attempt` is **Typing-domain evidence only**. No Objective, Translation or Teacher Review Reader reads it, and the Typing Reader reads nothing else. A typing difference such as `environment → enviroment` produces **at most** a Typing signal about that Typing Text; it **never** produces `LEARNER_*`, `OBJECTIVE_*`, `TEACHER_*`, `REMEDIATION_UNRESOLVED` or `SUCCESSFUL_RECOVERY`, never lowers any other domain's standing, and never becomes vocabulary, concept, translation or objective-correctness evidence (Scope §4.2, §4.8, §12.2).

### 9.2 Typing Reader (ADR 0003 §12.1 reserved row, now defined)

For each Typing Text the Reader takes the **latest finalized native attempt** (ordered by `session.completedAt`, ties by id; migrated attempts do not exist). If that attempt has **≥ 1 `errors`**, it emits `TYPING_ERRORS_REMAIN` with provenance `[{collection: "typing_attempt", id}]` and **no params** (no count, no number). A later error-free attempt of the same text means the latest attempt carries no errors, so the signal ends and the earlier attempt stays in history (urgency reduced without erasing history, the principle of ADR 0003 §12.3). No error list is read as "the learner does not know" anything. `TYPING_ERRORS_REMAIN` is a **Recommendation only**: the learner can retry immediately, start the text manually, or schedule it (once or recurring) at any time.

- **Reason registry:** `TYPING_ERRORS_REMAIN` is activated in **Tier 3** (a presentation grouping, not a rank — ADR 0003 §12.3); `TYPING_REVISIT_DUE` is **not introduced**: a Due/Overdue Typing schedule already surfaces through the existing four scheduling codes (the ownership and Overdue distinction is a frozen scheduling requirement, Scope §7), and the domain is visible on the target. Scope §12.5 names it only as an example. The registry otherwise stays closed.
- `explain` gains one entry (en, zh-CN) that speaks of *typing differences in the latest copy of this text*, never of knowledge.

### 9.3 Algorithm labelling and non-contamination

`algorithmVersion` becomes `v2` when the Typing Reader is added. Normative: **for any snapshot containing no `typing_attempt`/`typing_text` rows, `recommend` output is identical to `v1` output except for the version label**, and adding Typing rows changes only Typing targets. Both are automated (§13.9).

### 9.4 Typing and the engine planner: no automatic scheduling in this version

**A `typing_attempt`, with or without unresolved differences, never creates an engine-owned schedule or suggestion.** The planner's eligible evidence and algorithm (ADR 0003 §11, `algorithmVersion` `v1`) are **unchanged**: it does not read `typing_attempt`, and a single typo is never converted into Calendar debt. This is a deliberate, **conservative Human Gate choice** (§18, D-9 declined for this version). Typing nevertheless fully supports Retry (an immediate new attempt with lineage, §10.5) and Scheduling: the learner may manually schedule any Typing Text (once or recurring), and fulfillment, ownership, Overdue and conflict rules are exactly ADR 0003's for the `typing` domain. A future repeated-difficulty rule or any other Typing scheduling heuristic requires **new real-use evidence and a new `algorithmVersion`/ADR**; it is not introduced here.

## 10. Shared session mechanics (all three domains)

### 10.1 Orthogonal dimensions, no new enums

Selection (`manual` | `recommended`) × Intent (`practice` | `test`) × Domain × optional Retry lineage × Session Policy compose per session (Scope §8). Nothing becomes a "mode": no Retry/Today/Typing/Needs-Work enum exists in any schema. Selection and `scheduleRef` are recorded **only** in the `session_selection` sidecar (ADR 0003 §7.6); intent and policy are recorded **in the evidence** (§5.3, §8.2); retry lineage is **in the evidence provenance**. Starting from a schedule is a **Manual** selection that carries a `scheduleRef` `(scheduleId, originalDate)`; displayDate/movedTo are never identity.

### 10.2 What a session captures at start (recovery-only state)

At session start the engine writes a `recovery_session` row (ADR 0001 §5.5: recovery-only, outside archives and canonical hashes) holding: the domain, `evidenceId` (§10.3), session id, material reference (+ snapshot for Typing), `intent`, policy, `selection` (`source`, and for `recommended` the `selectionProvenance` snapshot **exactly as shown to the learner**, ADR 0003 §13), optional `scheduleRef`, optional retry provenance, `startedAt`, and an opaque **domain state** (answers so far; for Typing the **committed text only**, never a composition). Recovery restores *state, never results*: restoring a Test session reveals no correctness. Recovery state is never evidence, never read by Readers, never an input to fulfillment. An abandoned or incomplete session writes **no evidence, no selection, no fulfillment** (ADR 0003 §10); its recovery row is the only residue and is discarded on abandon.

### 10.3 Idempotent finalization

- The **evidence id is allocated at session start** and stored in recovery state; the finalizer uses it, never a fresh id at finish. `session_selection` is keyed `<collection>:<id>`; fulfillment is `UNIQUE(session_collection, session_id)` and keyed `<scheduleId>#<originalDate>` — so a repeated finalization can neither duplicate evidence nor debt.
- If finalization is retried after an ambiguous crash (the Unit of Work committed, the recovery row remained), the finalizer reads the existing evidence: **canonically equal** payload ⇒ the session is reported *already finalized* (success, no write); **different** payload ⇒ `SESSION_ALREADY_RECORDED` conflict, never a rewrite (E-1). Recovery state for an already-finalized session is discarded, never re-finalized.
- Clearing the recovery row is **not** part of the evidence Unit of Work (recovery-only state cannot corrupt evidence); the guard above makes the crash window safe in both directions.

### 10.4 Atomic completion and fulfillment

Exactly the ADR 0003 §10 behavior for all three domains: evidence + selection + at most one fulfillment (+ schedule status) in one Unit of Work with the `session-complete` fault tags and `rev`/`absent` preconditions; linked (`scheduleRef`) vs slot-match fulfillment; at most one occurrence per session and once per occurrence; a wrong-slot or ended link fulfills nothing but the evidence and selection are still written. Only the **slot derivation** changes (§5.4).

### 10.5 Retry lineage across domains

One lineage vocabulary, domain-owned fields: Objective and Translation use the V1 `provenance` (`purpose`, `sourceResponseId`, `sourceReviewId?`, `sourceMaterialId`); Typing uses `provenance` with `sourceAttemptId`. Lineage is recorded by value, survives deletion of live material, never needs another table, and is read only by the Reader of its own domain. A Typing retry re-types the **historical snapshot** of the source attempt (its `material.snapshot.text`), keeps the source text's `material.id`, and records `sourceAttemptId`/`sourceMaterialId`.

## 11. Schema, catalog and foundation requirements

For the implementation milestone (additive; nothing existing changes):

1. **One forward store migration (schema 3 → 4)** through the catalog-owned mechanism (snapshot first, one transaction, refuses a failing upgrade, `SCHEMA_NEWER` for a newer store): collections `typing_text` and `typing_attempt`, role `canonical`, with the projections of §8.1–§8.2. No hard FK is added (material/session/source references are soft); `check_consistency` reports unresolved soft references as it does for other soft references.
2. **Evidence-domain view:** `typing_attempt` and `typing_text` are canonical, so they appear in `domain_collections()`, archives, state hashes and backups; the migration commit guard and the V1 migrator, which enumerate their own collections, are unaffected and the migrator **never** writes either (§13.3).
3. **Registries** (§4.2): `EVIDENCE_SOURCES` and `SESSION_EVIDENCE_WRITABLE` gain `typing_attempt`; the Adapter registry gains the Typing adapter.
4. **Fault checkpoints:** the existing `sched-{before,after}-commit:session-complete` pair already covers the single finalization Unit of Work for every domain; no new checkpoint is required.
5. **No new WebView capability:** the same named Store Port commands; no path is carried; the allowlist gains nothing.

## 12. Invariants

- **T-1 (closed finalization):** a session finalization writes only the adapter's evidence collection (create-only), `session_selection`, and at most one fulfillment + schedule status; nothing else, ever.
- **T-2 (slot from evidence):** the fulfilled slot equals the slot derived from the evidence; a mismatching input writes nothing.
- **T-3 (immutability):** no finalized `learner_response` or `typing_attempt` is ever rewritten, completed-over, annotated in place or deleted by any session, scheduling or recommendation operation.
- **T-4 (idempotent finalization):** finalizing the same session twice yields exactly one evidence record, one selection, at most one fulfillment.
- **T-5 (domain isolation):** each domain's evidence yields only its own domain's signals; no `typing_attempt` signal reaches an Objective/Translation/Teacher target and none of those reaches a Typing target.
- **T-6 (V1 preservation):** every native Objective/Translation record validates under the unchanged V1 validators and JSON Schema; Teacher Review, annotations, remediation and retry provenance behave as in V1.
- **T-7 (lossless text):** reference and committed text are stored verbatim (no normalization, no trimming); normalization and segmentation affect comparison only.
- **T-8 (explicit encoding):** every native record carrying offsets declares `offsetEncoding`; no default exists anywhere.
- **T-9 (no derived truth stored):** no score, level, accuracy, speed, mastery or recommendation is persisted in any evidence record or sidecar.
- **T-10 (commit-only, never-dropped input):** nothing from an uncommitted IME composition is compared, stored, recovered as committed text or scored; and trusted user-agent committed text is never discarded for lacking a keydown or composition lifecycle; synthetic/app-owned mutation never enters the committed-text path.
- **T-11 (Test is opaque):** a Test-intent session exposes no correctness signal before finalization, and recovery restores no results.
- **T-12 (one-way dependency):** Readers/Recommender never import finalization or session engines; domains never import each other; evidence-side code knows nothing of scheduling or Typing.
- **T-13 (comparison determinism):** typing facts and their validation depend only on the recorded `comparison.version`'s pinned semantics, never on ambient Unicode tables; a stored attempt's legitimacy never changes with host upgrades.
- **T-14 (no automatic Typing scheduling):** no `typing_attempt` ever creates an engine-owned schedule or suggestion in this version.

## 13. Automated verification contract (Task-Domain Integration milestone)

All tests run against the real Rust store through the existing test bridge where durability is involved; thresholds for random-kill/property runs are CI environment variables as in ADR 0003 (CI-scale suites run on GitHub Actions, targeted ones locally).

1. **Legal finalization, three domains (T-1, T-2, T-4).** One Objective, one Translation and one Typing session each commit evidence + selection + fulfillment atomically (linked and slot-match); the unlinked/linked variants and a recommended-selection provenance snapshot round-trip; ephemeral Translation retry fulfills the source document's slot (§5.4); a Practice session never fulfills a Test schedule; a typing attempt never fulfills an Objective slot and a `quiz-paper` record never fulfills a Translation slot (`SLOT_MISMATCH`, byte-identical store).
2. **Closed write contract per adapter.** Every illegal input — delete, update-existing, unknown/other collection, `teacher_review`, `legacy_history_entry`, Scheduling Context, `paper`/`typing_text`, extra fields, duplicate ids, unknown `material.type`, objective record carrying annotations, translation record carrying `result`, native annotations without `offsetEncoding`, `intent: test` with `feedbackTiming: live`, unknown typing fields — is rejected before the Store Port with a byte-identical store. A **write-registry / Reader-registry** architecture test pins that they differ and that `teacher_review`/`legacy_history_entry` are not writable.
3. **Immutability and idempotence (T-3, T-4).** Re-finalizing the same session id: canonical-equal ⇒ already-finalized, no write; different ⇒ `SESSION_ALREADY_RECORDED`, byte-identical store. A kill between commit and recovery-row clearing, then restart and re-finalize, yields exactly one record. Evidence ids come from recovery state, not from finish time.
4. **Fault matrix.** `sched-before/after-commit:session-complete` for **each** of the three domains yields only the full pre- or post-state (post-state computed on a clone), consistency clean; randomly timed kills over a mixed three-domain workload preserve S-1/S-3/S-6/S-7, E-1 and T-1…T-4 after every restart.
5. **Typing schema, archive/restore, upgrade.** The `typing_attempt`/`typing_text` validators (closed schema, required fields, `comparison` explicit, spans well-formed and within bounds, `errors` ordered and non-overlapping, counts consistent); store 3 → 4 upgrade with data in all existing collections preserved byte-identically; a failing upgrade leaves the 3-schema store intact; `SCHEMA_NEWER`; archive round trip including `typing_attempt`/`typing_text` (state hash equal after restore); restore of a schema-3 archive into the schema-4 build; `check_consistency` clean and reporting soft-reference loss; **migration regression**: a V1 import produces zero `typing_*` rows, gap `v2.typing` present, conservation/verifier suites unchanged and green.
6. **Unicode fidelity (T-7, §8.3).** Committed fixtures: Latin; precomposed vs decomposed accents (`é` vs `e`+U+0301 equal under comparison, both stored verbatim); emoji and ZWJ families; skin-tone modifiers; regional-indicator flags; Hangul precomposed vs jamo; CJK; RTL Arabic/Hebrew; Indic conjuncts with virama; surrogate pairs. Assertions: counts equal the expected grapheme counts; spans start/end on cluster boundaries and never split a surrogate pair or cluster; verbatim round-trip through store, archive and canonical JSON; NFC-equal inputs produce no errors; a seeded property test generates edit scripts over a mixed-script alphabet and asserts (a) identical texts ⇒ no errors, (b) every recorded span is cluster-aligned and in bounds, (c) applying the recorded edits to the reference reproduces the committed text under cluster equivalence, (d) determinism (same input ⇒ byte-identical `errors`). **Determinism (T-13):** (e) the committed **conformance corpus** passes under the pinned semantics; (f) a static test proves canonical typing code and validators reference neither `Intl.Segmenter` nor `String.prototype.normalize` nor any ambient Unicode source; (g) a test substitutes a deliberately divergent ambient `Intl.Segmenter`/`normalize` and shows facts and validation outcomes **unchanged**; (h) a **historical-replay** suite re-derives and re-validates committed stored attempts (`comparison.version` `typing-compare/1`) and requires byte-identical facts; (i) an attempt naming an unimplemented `comparison.version` is carried verbatim, structurally validated and read-only, never rejected as corrupt or rewritten; (j) the same corpus is run in Node on CI, and because the semantics are pure project code with no ambient dependency, a WebView smoke (manual M-T4) only confirms wiring.
7. **IME / committed-input boundary (T-10).** Through the event-model adapter: composition update events never change committed text or the comparison; cancelled composition changes nothing; composition commit yields exactly the composed text; a plain key, a dead-key result and a trusted non-composing `insertText` each equal the equivalent committed text; a committed insertion arriving as a **lone trusted `input` event with no keydown and no composition events** (the third-party-IME case) **is accepted** and equals the equivalent text — **no test, and no code path, may drop input for lacking `compositionend`/`keydown`**; recognizable paste and drop are rejected, leave committed text unchanged and are absent from evidence; **untrusted/script-dispatched events and app-owned programmatic input changes never enter the committed channel**, while recovery restores state only through the explicit recovery path; a recovery snapshot taken mid-composition contains no composed text. Real IME behavior on real platforms is **not** claimed automated (manual M-T1).
8. **Practice/Test semantics (T-11).** Typing Test exposes no diff/correctness/accuracy value before finalization (behavioral test on the session view type plus a static test that the Test view type has no comparison fields); Practice live comparison works; restoring a Test recovery state reveals nothing; `intent`/`policy` are recorded and validated; Objective `feedbackTiming` instant vs submit-at-end affects only visibility (grading output identical).
9. **Recommendation non-contamination (T-5, §9.3).** (a) A fixed snapshot without Typing rows yields byte-identical `recommend` output under `v2` and `v1` modulo the label (golden file); (b) adding `typing_attempt` rows leaves every Objective/Translation target's reasons, provenance and order unchanged; (c) the `environment → enviroment` case: a typing attempt and a Translation response involving the same word emit **no** `LEARNER_*`/`OBJECTIVE_*`/`TEACHER_*`/recovery signal from the typing record; (d) no Objective/Translation/Teacher evidence ever yields `TYPING_ERRORS_REMAIN`; (e) the Typing Reader emits only for the latest attempt and carries no numbers; (f) static dependency tests (T-12) extended to the Typing Reader; (g) shuffled inputs ⇒ byte-identical output.
10. **No automatic Typing scheduling (§9.4, T-14).** For typing attempts with differences and without, the planner/sweep creates **zero** schedules and **zero** suggestions and its output for every snapshot is byte-identical to the output without the attempts (the planner does not read `typing_attempt`); the ADR 0003 §17 suites stay green unmodified; the learner can manually schedule a Typing Text, retry immediately, and a completed Typing session fulfills the matching manual schedule by the ADR 0003 rules (linked and slot-match) with ownership, Overdue and conflict behavior unchanged.
11. **Retry lineage (§6.3, §7, §10.5).** Objective retry provenance is consumed by the existing Recovery Reader (recovery only for items previously incorrect and now correct); Translation retry/remediation fixtures from V1 behave identically (Rule 4 unchanged); Typing retry records lineage and snapshot; dangling lineage proves nothing; a typing `sourceAttemptId` is invisible to the Objective/Translation Recovery Reader.
12. **V1 preservation (T-6).** Every native Objective/Translation record passes the unchanged V1 validators and `schemas/learner-response.schema.json`; the OTI review-request/remediation-request round trip accepts native records carrying the `extensions` key; metacognition annotations, Teacher Review (corrections anchor-checked against the response) and remediation provenance behave as in V1; V1 production code, tests and CI are untouched.
13. **Boundaries.** No schema or collection beyond `typing_text`/`typing_attempt`; no field named like a score/level/mastery/speed grade in any record; no raw keystroke or per-key data anywhere; no external-event or time-point field; the WebView allowlist is unchanged.

**Manual/open checks (not claimed automated):** M-T1 real IME composition (e.g. Chinese/Japanese/Korean IMEs) in WebView2 on Windows; M-T4 WebView smoke of the pinned comparison (wiring only; semantics are pure project code); M-T2 long-text word-wrapping and active-position following (a UI milestone concern, Scope §12.6); M-T3 accessibility of the practice surface. M1–M7 and D1–D4 remain open, non-blocking, not PASS, not waived.

## 14. Frozen-boundary conformance

| Frozen boundary | Mechanism |
|---|---|
| Evidence canonical, interpretation replaceable (§4.1) | attempts store facts only; metrics derived at read time; no recommendation persisted |
| Heterogeneous semantics (§4.2) | per-domain adapters/validators; domain-isolated Readers (T-5) |
| No universal `EvidenceRecord` (§4.3) | evidence stays in native records (`learner_response`, `typing_attempt`); no new umbrella table |
| Recommendation derived (§4.4) | Typing signal derived on demand; selection provenance only in the sidecar |
| Scheduling is not evidence (§4.5) | sidecar writes only; Typing Reader never reads Scheduling Context |
| Explanation is content (§4.7) | not decided here; snapshots carry content by value |
| Typing error ≠ knowledge error (§4.8, §12.2) | §9.1, T-5, tests 9(c)/(d) |
| Scheduling surface only internal, date-level (§7) | unchanged; slot derived from evidence |
| Composition of Selection × Intent × Domain × Lineage (§8) | §10.1, no mode enums |
| Typing = copy typing, facts, no raw keystrokes (§12.1) | §8.2, T-9, no per-key data |
| Practice/Test distinct (§12.3–§12.4) | §8.4, T-11 |
| Retry reuses lineage (§12.5) | §10.5 |
| International text correctness, IME (§12.7) | §8.3 (pinned, versioned comparison), §8.5 (one committed-text path), T-7, T-8, T-10, T-13 |
| Typing reuses lightweight scheduling (§12.5) without becoming Calendar debt (§7, §4.5) | §9.4: manual scheduling only, no automatic Typing planning (T-14) |
| Typing non-goals (§12.8) | no curriculum, adaptive keys, profiling, telemetry, race, XP, AI, Dictation, Translation-as-Typing |
| Deferred capabilities (§17, §19, §21) | no analytics, mastery, speed grades, longitudinal trends |

## 15. Consequences, risks and honest limitations

- **A second Content collection exists solely for Typing.** `typing_text` is the minimum that makes Typing material schedulable and its availability checkable (ADR 0003 §9.4); the alternative (attempts with no stable material) would make Typing unschedulable. It adds a store collection but no product surface.
- **Gross duration only.** Without pause accounting, CPM/WPM computed from `completedAt − startedAt` are approximate; the schema reserves nothing for it and a later version would add a field by ADR.
- **Pinned semantics trade currency for reproducibility.** `typing-compare/1` is frozen at one Unicode version, so a newer script or emoji sequence added to Unicode later is segmented by the pinned rules until a new comparison version is adopted for *new* attempts; old attempts never change. The cost is a project-owned (or vendored) segmentation implementation and its conformance corpus instead of the host's built-in one. Ambient platform tables are deliberately **not** used, so there is no "platform tables may change" exposure: the validator re-proves alignment only under the pinned version named in the record.
- **`extensions` as the V1 carrier for session facts** keeps the V1 contract and OTI untouched, at the cost of one namespaced, validated key; a first-class field would have forked the V1 schema. Another reader of exported records ignores the key by design.
- **Retry material identity** (Translation retry slots to the source document; Objective retry keeps the paper id) is chosen so that retry sessions neither mint ephemeral schedulable materials nor fail to fulfill the right slot; it relies on V1's recorded `sourceMaterialId`.
- **Paste/drop rejection** is a session-policy choice (copy typing is keyboard transcription); it is not recorded evidence. It is limited to recognizable paste/drop; whether an exotic input path is a paste is decided by the user agent's reported input kind, so an unusual platform may classify an edge case wrongly, which is why real-IME/real-platform behavior is a manual check (M-T1) and the rule is never "reject what lacks key events".
- **Typing evidence is not retroactive:** V1 history contains none; absence is "not recorded", never "no typing".
- **No automatic Typing scheduling (D-9 declined):** a learner who makes a typo gets a Recommendation (`TYPING_ERRORS_REMAIN`), an immediate Retry and manual scheduling, but no engine-owned revisit; the cost is that Typing revisits depend on the learner or on a future, evidence-backed heuristic.

## 16. Decisions reviewed at the Human Gate (outcome in §18)

| # | Decision | Recommendation |
|---|---|---|
| D-1 | Formal amendment of the closed registries: add `typing_attempt` to the Reader registry and the write registry (`teacher_review`/`legacy_history_entry` stay read-only) (§4.2) | **approved** |
| D-2 | A minimal Content collection `typing_text` (id/title/text/timestamps), no library features (§8.1) | **approved** |
| D-3 | Session facts (`intent`, `feedbackTiming`, `offsetEncoding`) for Objective/Translation in `extensions["quiz-studio.v2.session"]`; first-class fields for `typing_attempt` (§5.3, §8.2) | **approved** |
| D-4 | The slot is derived from the evidence; the caller's slot must match (`SLOT_MISMATCH`); Translation retry slots to `sourceMaterialId` (§5.4) | **approved** |
| D-5 | Evidence id allocated at session start; idempotent finalization by canonical equality; recovery-row clearing outside the evidence Unit of Work (§10.3) | **approved** |
| D-6 | `typing_attempt` as facts: verbatim texts, grapheme-aligned UTF-16 spans with explicit encoding, counts, no stored metrics, gross duration (§8.2–§8.3) — **amended:** `typing-compare/1` is a frozen, project-controlled, version-pinned comparison; historical validity never depends on ambient Unicode tables | accept with amendment (A-1) |
| D-7 | Recognizable paste/drop rejected; one committed-text path accepts all user-agent committed text without requiring keydown or composition events; synthetic/app-owned mutation never enters it; no generic "programmatic insertion rejected" rule (§8.5) | accept with amendment (A-2) |
| D-8 | Typing Reader emits only `TYPING_ERRORS_REMAIN` (Tier 3, no params); `TYPING_REVISIT_DUE` not introduced; `algorithmVersion` `v2` with proven non-contamination (§9.2–§9.3) | **approved** |
| D-9 | Planner: a typing attempt with differences is a difficulty signal for its Typing slot | **declined for this version (A-3)** — conservative choice, see §9.4 and §18 |
| D-10 | No Teacher Review / metacognition for Typing (§8.2) | **approved** |

## 17. Not authorized by this ADR

Task-Domain Integration implementation; any schema migration or product code; Answer Explanation; Focused Practice; final or approved UI integration; Teacher Review authoring/import changes; any deferred capability of Scope §21; any change to V1 production code; merging `v2` into `main`. Those need this ADR's Human Gate and their own explicit authorization.

## 18. Human Gate record — ACCEPTED, GO WITH AMENDMENT (2026-10-02)

**Outcome.** D-1, D-2, D-3, D-4, D-5, D-8 and D-10 approved unchanged. D-6 approved with its Evidence design intact (verbatim reference/committed text, explicit comparison basis, grapheme-aligned UTF-16 spans, counts, retry lineage, no accuracy/WPM/speed/mastery score) plus amendment A-1. D-7 modified (A-2). D-9 **declined for this version** (A-3). The amendments are folded into the normative text above; this record is their index. Task-Domain Integration implementation remains **NOT STARTED, awaiting explicit authorization**.

- **A-1 — Comparison determinism (D-6, §8.3, §13.6, §15, T-13).** `typing-compare/1` is a frozen, project-controlled, Unicode-version-pinned specification (NFC + extended grapheme segmentation + alignment); canonical generation and historical validation never use ambient `Intl.Segmenter`/`normalize` behavior. Stored verbatim text, counts, spans and `comparison.version` stay authoritative; a host Unicode upgrade never changes the legitimacy of a stored attempt; the validator re-proves alignment only under the version pinned in the record, and an unimplemented version is carried read-only. The "platform tables may change" limitation is replaced by the pinned-semantics trade-off.
- **A-2 — Committed-input boundary (D-7, §8.5, §13.7, T-10).** Recognizable paste/drop is rejected; the generic "programmatic insertion rejected" rule is deleted. The boundary accepts user-agent committed text through **one** path with no requirement of keydown or composition events (plain key, dead-key result, composition commit, non-composing `insertText`, third-party-IME committed insertion); input is never dropped for lacking `compositionend`/`keydown`; untrusted/synthetic and app-owned DOM mutation never enters the channel and is not confused with a real non-composing `insertText`. Real WebView2 IME stays manual check M-T1.
- **A-3 — No automatic Typing planning (D-9, §9.4, §13.10, T-14).** A single `typing_attempt`, even with unresolved differences, never creates an engine-owned +1-day Practice schedule or any suggestion; the planner and its `algorithmVersion` are unchanged. `TYPING_ERRORS_REMAIN` remains a Recommendation, and Typing keeps full Retry and (manual / recurring) Scheduling. **This is a conservative Human Gate choice**: a repeated-difficulty rule or any other Typing scheduling heuristic may be introduced later only on real-use evidence through a new `algorithmVersion`/ADR, not by turning one typo into Calendar debt.

**Unchanged and still open:** M1–M7 and D1–D4 (open, non-blocking, not PASS, not waived); M-T1–M-T4 (manual, §13). Nothing here authorizes a schema migration, product code, Answer Explanation, Focused Practice or final UI.
