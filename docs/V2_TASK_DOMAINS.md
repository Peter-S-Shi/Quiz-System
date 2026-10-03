# V2 Task-Domain Integration milestone (Objective / Translation / Typing)

**Status:** **ACCEPTED (Human Gate PASS)**
**Authority:** `V2_PRODUCT_SCOPE_FREEZE.md` Revision 1 (§3.3, §4.2–§4.3, §4.8, §8, §9, §11, §12, §14, §23), ADR 0001–0003 (ACCEPTED), **ADR 0004 (ACCEPTED — GO WITH AMENDMENT; §5–§12 are the contract, §13 the verification and acceptance basis)**, Desktop Foundation, V1 Migration and Learning Orchestration + Calendar (all ACCEPTED).
**Code:** [`desktop/core/task_domains`](../desktop/core/task_domains) (`qs-task-domains`, store schema 4) and the pure JS domain in [`desktop/ui/web/src/task-domains`](../desktop/ui/web/src/task-domains), plus the additive changes listed in §2. V1 production code, tests and CI are untouched. **Not built, by design:** Answer Explanation, Focused Practice, any product or final UI, Typing text authoring UI, Teacher Review authoring/import changes.

## 1. Goal and scope

Make ADR 0004 real: the three Task Domains finalize real sessions through **one** closed seam while keeping their evidence semantics apart, and Typing becomes a first-class domain with its own immutable evidence. Everything is an invariant proved by automated tests against the real Rust store (the same test bridge as the Orchestration milestone).

Out of scope: UI of any kind (the WebView binding is a thin event mapper, not a surface), a Typing text library UI, Answer Explanation, Focused Practice, long-text layout, any deferred capability of Scope §21 (typing speed grades, mastery, analytics, adaptive keys, raw keystroke telemetry), and automatic Typing scheduling (declined at the Human Gate).

## 2. What was built

| # | Piece | Where |
|---|---|---|
| 1 | Store schema 3 → 4: collections `typing_text` (Content) and `typing_attempt` (Evidence), both `canonical`, soft references only, `intent` CHECK enum; the shipped catalog (`qs_task_domains::product_catalog`) replaces the schema-3 catalog in the self-test, scenarios and app | `core/task_domains`, `core/port/src/selftest.rs` |
| 2 | **Domain Evidence Adapter registry** (closed): Objective and Translation (`learner_response`, V1 contract unchanged, V2 session facts only in `extensions["quiz-studio.v2.session"]`) and Typing (`typing_attempt`); the write registry `SESSION_EVIDENCE_WRITABLE` is **derived from the adapters**, and is not the Reader registry | `task-domains/adapters.js` |
| 3 | The finalization seam: `validateSessionEvidenceOps` now runs the domain adapter before any Store Port access, requires exactly one evidence record, and **derives the slot from the evidence** (`SLOT_MISMATCH` on a disagreeing caller slot); `completeSession` stays create-only and atomic | `orchestration/session-finalization.js`, `schedule-store.js` |
| 4 | `SessionFinalizer`: the one door for all domains; idempotent across an ambiguous crash (canonical equality → already finalized; different content → `SESSION_ALREADY_RECORDED`) | `task-domains/finalizer.js` |
| 5 | `SessionRecovery`: recovery-only state in `recovery_session`; the evidence id is allocated at session start; a state whose evidence is already committed is discarded, never re-finalized | `task-domains/recovery.js` |
| 6 | **typing-compare/1**: project-controlled Unicode semantics pinned to **16.0.0** — NFC and UAX #29 extended grapheme segmentation (incl. GB9c/InCB, GB11, GB12/13) over generated tables, never `Intl.Segmenter` / `String.prototype.normalize`; deterministic minimum-edit alignment; UTF-16 grapheme-aligned spans | `task-domains/unicode/*`, `typing/compare.js`, `tools/gen-unicode-data.mjs` |
| 7 | `typing_attempt` record: closed schema, builder, validator that re-proves alignment only under the pinned version named in the record; unknown versions read-only | `typing/attempt.js` |
| 8 | Typing session engine: one committed-text path (trusted user-agent input, no keydown/composition requirement), composition never committed, paste/drop rejected, synthetic mutation excluded, Practice live feedback vs Test opacity, recovery snapshot/restore, finalize; plus the thin DOM event mapper | `typing/session.js`, `typing/dom-adapter.js` |
| 9 | Typing Reader (latest attempt only → `TYPING_ERRORS_REMAIN`, Tier 3, no params), reason registry v2 (no `TYPING_REVISIT_DUE`), Reader registry gains `typing_attempt`, material availability/evidence ids for `typing-text`; the planner is **unchanged** (own version constant `PLANNER_ALGORITHM_VERSION = 'v1'`) | `orchestration/readers.js`, `recommend.js`, `planner.js` |

Test-side additions: shared fixtures `tests/task-fixtures.mjs`, `tests/integration/faults-kit.mjs`; existing integration fixtures now build V1-valid native records with session facts.

## 3. ADR 0004 §13 → evidence

| §13 item | Evidence (file → what is asserted) |
|---|---|
| 1 Legal finalization, three domains | `integration/task-finalization` — Objective slot-match, Translation linked, Typing through the real session engine; selection keyed by evidence collection+id; recommended-selection snapshot round-trips byte-for-byte (`algorithmVersion` v2); Practice never fulfills Test; typing/quiz-paper/translation never fulfill each other's slots; Translation retry fulfills the **source** document's slot; remediation uses its own document |
| 2 Closed adapter boundary | `integration/task-finalization` (nine illegal payloads, byte-identical store, `SLOT_MISMATCH`), `integration/orch-finalization` (structural cases), `task-adapters` (V1 strictness preserved, closed key sets equal the public JSON Schema, session facts closed/domain-specific, domains never leak), `orch-architecture` (write registry ≠ Reader registry) |
| 3 Immutability and idempotence | `integration/task-finalization` — same session twice, different content refused, concurrent finalization, kill after/before commit then re-finalize (Objective and Typing) → exactly one record; recovery row for a finalized session discarded; retry is a new attempt |
| 4 Fault matrix | `integration/task-faults` — `sched-before/after-commit:session-complete` for **each** domain: exactly pre- or post-state, trio never split, consistency clean; random kills over a mixed three-domain workload (CI: `QS_ORCH_KILLS=100`) keep S-1/S-3/S-6/S-7, evidence immutability and collection/material-type integrity |
| 5 Schema, archive, upgrade | `core/task_domains/tests/schema` (roles, soft references, projection mismatch, intent enum, 3 → 4 upgrade, failing upgrade, `SCHEMA_NEWER`, archive round trip with NFD text, schema-3 archive restore), `typing-attempt` (validators), `integration/task-finalization` (archive via the real scenario tool, recovery excluded from archives), `integration/orch-migrated` (V1 import: zero Typing rows, gap `v2.typing`, shipped catalog), `core/port` migration tests on the schema-4 catalog |
| 6 Unicode fidelity and determinism | `typing-unicode` (**official** `GraphemeBreakTest.txt` and `NormalizationTest.txt`, Unicode 16.0.0), `typing-compare` (fixtures: Latin, NFC/NFD, ZWJ family, skin tone, flags, Hangul, CJK, RTL, Indic conjunct, CRLF, surrogates; seeded property test; static ban on ambient Unicode APIs; a deliberately broken host changes nothing), `typing-attempt` (tampered facts rejected, historical replay of stored literals, unknown version read-only and never creatable) |
| 7 IME / committed input | `typing-session` — composition never committed, cancel, commit; plain, dead-key, `insertText` and a **lone trusted input event** all commit; a non-composing input during a composition commits; paste/drop rejected and reverted; untrusted events never enter; DOM binding with a fake element |
| 8 Practice/Test semantics | `typing-session` (live view vs opaque Test/on-completion view, Test construction refused with live feedback, recovery reveals nothing), `orch-architecture` (structural gate on the comparison), `task-adapters` (Objective feedback timing changes nothing else) |
| 9 Recommendation non-contamination | `typing-recommend` — v2 equals the committed v1 golden modulo the label; adding Typing rows changes only Typing targets; `environment → enviroment` yields one Typing signal and nothing else; no cross-domain codes either way; latest-attempt-only; availability; shuffled determinism |
| 10 No automatic Typing scheduling | `typing-recommend` (planner output identical with/without attempts), `integration/task-finalization` (a sweep after a difficult attempt creates no schedule and no suggestion; manual scheduling and retry fulfillment work), `orch-architecture` (the planner never mentions Typing) |
| 11 Retry lineage | `task-adapters`, `integration/task-finalization` (Objective recovery read as before; Typing retry invisible to it), `task-v1-preservation` (V1 retry/remediation provenance) |
| 12 V1 preservation | `task-v1-preservation` — records from the **unchanged V1 builders** plus the facts are native; portable export, OTI review request, Teacher Review import with UTF-16-anchored corrections, retry material, remediation lineage all keep working |
| 13 Boundaries | closed schemas and static tests: no score/level/speed/mastery field, no raw keystroke data, no new collections beyond the two, the WebView allowlist and Store Port commands unchanged |

## 4. Results

Local (development machine, debug profile, thresholds default-scaled): `qs-task-domains` 6 Rust tests, `qs-orchestration`/`qs-store`/`qs-port` suites green, `fmt --check` and `clippy --workspace --all-targets -D warnings` clean, **136 unit + 55 integration JS tests** pass (the Orchestration and Migration suites unmodified in intent). Windows Desktop CI (`Desktop (V2)` on `windows-latest`, full thresholds): the first candidate (`d6cd0a6`) was green; after the Human Gate HOLD repairs (clarifications 2 and 3) the exact accepted head `601b4cf` is **green**: [run 37078651808 (attempt 2)](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37078651808). Attempt 1 was cancelled by the account owner mid-run (not a failure); the preceding `a1e354f` run failed only because the workflow did not install the locked `ajv` dev dependency (fixed in `601b4cf`).

## 5. Implementation clarifications for the Human Gate

These are choices the implementation had to make inside ADR 0004; none changes a decision.

1. **Unicode tables are generated, pinned and committed.** `tools/gen-unicode-data.mjs` reads UCD 16.0.0 files (not committed; URLs and SHA-256 of every input are recorded in the generated `data.js`) and writes the tables; the official conformance suites are committed (`GraphemeBreakTest.txt`, `NormalizationTest.txt.gz`) and run in CI, so the pinned semantics are proved, not assumed.
2. **Alignment tie-break and size limit.** The common prefix/suffix is trimmed, the middle aligned by minimum edit distance with the backtrace preferring diagonal, then omission, then insertion; maximal runs of non-matching steps are one error. The alignment is **band-limited** (Human Gate repair): only cells within `k` of the diagonal are computed, `k` doubling until the optimum fits, which yields exactly the full-matrix result including the tie-break (proved by a differential test against an independent full-matrix reference), so `typing-compare/1` and stored attempts are unchanged. Cost is distance x length, not length squared: a ~7 500-grapheme transcription with a few far-apart errors finalizes in well under a second. Stored direction cells are capped at 36 000 000; above that finalization fails closed (`COMPARE_TOO_LARGE`; recovery state keeps the text) — now reached only by a long text with very many errors.
3. **The Objective/Translation adapters mirror the V1 validator rather than import it** (the shipped UI cannot import files outside `desktop/ui/web`). The accepted set is proved to be a **subset of the unchanged V1 validator plus the public JSON Schema** (Human Gate repair): a systematic differential test mutates every leaf and container of several valid native payloads (delete, type-confusion pool, unknown keys) and checks every adapter-accepted mutant against both the V1 validator and the compiled public schema. It found and closed real gaps: V1 trims identity strings, quiz-paper snapshot items need `type`, optional `provenance` (incl. `author`/`extensions`) and `learnerItemMarks.createdAt` keep their schema types. A drift guard additionally pins the closed key sets to the schema.
4. **Native Objective/Translation records require `provenance`** (`purpose` practice | retry | remediation; a retry records `sourceResponseId` and `sourceMaterialId`) beside the session facts: V1's schema permits omitting it, ADR 0004 §6.3/§10.5 needs the lineage.
5. **`completeSession` requires exactly one evidence record** whose reference is the session; its `slot` argument is now optional and, if given, must equal the derived slot.
6. **`algorithmVersion` v2 / planner v1.** The planner previously imported the recommender's version constant; it now owns `PLANNER_ALGORITHM_VERSION = 'v1'` so engine schedules keep `v1`.
7. **Typing session policy values** are `feedbackTiming` live | on-completion and `corrections` allowed | disallowed (append-only when disallowed, enforced by a prefix check on the committed text).
8. **Recovery rows are keyed by session id**; V1's single active session is the common case, nothing forbids more.
9. **Tests for the shipped DOM binding use a fake element**; real IME/WebView behavior is manual (below).

## 6. Open items (explicit, not waived)

- **M-T1** real IME composition (Chinese/Japanese/Korean IMEs, third-party IMEs that emit only `input`) in WebView2 on Windows — **not automated, not PASS**.
- **M-T2** long-text word wrapping and active-position following (UI milestone, Scope §12.6).
- **M-T3** accessibility of the practice surface.
- **M-T4** a WebView smoke of the pinned comparison (wiring only; the semantics are pure project code covered by the official suites).
- **M1–M7** and **D1–D4** remain open, non-blocking, not PASS, not waived.
- **Teacher Review authoring/import** in V2 must apply the explicit-encoding rule of ADR 0002 §7.5 when it is ported (requirement on that milestone).
- **Typing text authoring UI, Answer Explanation, Focused Practice, final UI** are later milestones and need their own authorization.

## 7. How to run

```text
cd desktop
cargo test -p qs-task-domains                       # schema 4 (upgrade, archive, constraints)
cargo build -p qs-scenarios --bin qs-scenario       # the Store Port test bridge
cd ui
node --test "tests/*.spec.mjs"                      # pure domain: Unicode conformance, compare, attempt, session, recommend, adapters, V1
node --test "tests/integration/*.spec.mjs"          # against the real store; QS_ORCH_KILLS=100 is the CI random-kill threshold
node tools/gen-unicode-data.mjs                     # regenerate the pinned tables (needs tools/ucd-cache; not required to run tests)
```

## 8. Gate readiness

Implementation complete; ADR 0004 §13 is implemented as automated tests that pass locally and run in the Windows CI workflow. The milestone is **ACCEPTED (Human Gate PASS)**. M-T1–M-T4 (and M1-M7, D1-D4) that were not actually performed remain **open, not PASS, not waived**; the real-IME / long-text UI / accessibility / WebView items are taken up by the Objective Answer Explanation + Focused Practice milestone, which has its own record.
