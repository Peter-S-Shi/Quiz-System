# V2 Learning Orchestration + Calendar milestone

**Status:** implementation complete, **awaiting Human Gate**
**Authority:** `V2_PRODUCT_SCOPE_FREEZE.md` Revision 1 (§3.2, §3.6, §4.4–§4.6, §6, §7, §8, §23), ADR 0001 (ACCEPTED), ADR 0002 (ACCEPTED), **ADR 0003 (ACCEPTED — GO WITH AMENDMENT; §15 foundation extension and §17 verification contract are this milestone's implementation and acceptance basis)**, Desktop Foundation and V1 Migration (both ACCEPTED).
**Code:** [`desktop/core/orchestration`](../desktop/core/orchestration) (`qs-orchestration`, store schema 3), the additive foundation extensions below, and the pure JS/TS domain in [`desktop/ui/web/src/orchestration`](../desktop/ui/web/src/orchestration). V1 production code, tests and CI are untouched. No Objective / Translation / Typing domain integration, no Answer Explanation / Focused Practice, no product UI.

## 1. Goal and scope

Turn ADR 0003 into working, proven software: durable Scheduling Context (schedule, exception, fulfillment, suggestion, selection provenance) with database-enforced invariants; learner-sovereign ownership with revision-bound suggestions; simple recurrence with anchors, exceptions and this-vs-future moves; derived Due/Overdue; atomic fulfillment with evidence; a deterministic, explainable, score-free Recommender over heterogeneous evidence that treats unknown facts as unknown; a versioned planner; and the Calendar/Today projections.

| In scope | Out of scope (unchanged) |
|---|---|
| Store schema 2 → 3, catalog role `context`, five collections, partial unique indexes, hard FKs, `sched-*` fault checkpoints | Objective / Translation / Typing domain integration, the Typing domain and its Reader (reserved by contract) |
| `ScheduleStore`, occurrence projection, Calendar/Today projection, planner, Evidence Readers, Recommender, explanations, selection provenance | The approved final V2 UI (the shell still shows placeholders for Today / Calendar) |
| The session-finalization seam `completeSession` (evidence + selection + fulfillment in one Unit of Work) | Answer Explanation, Focused Practice, Session Composition item policy |
| Test bridge: the JS domain driven against the real Rust store | External events, exact time, reminders, notifications, deadlines/exams, workload planner, daily budget, AI scheduling, analytics, FSRS, mastery state |

## 2. What was built

```text
WebView domain (pure JS/TS, injected clock)                    Rust core
 dates · schema (closed) · occurrences (projection)             qs-orchestration: schema 2→3, 5 context collections,
 readers (Evidence Readers, unknown rules) · recommend           partial unique indexes, hard FKs (deferred)
 planner (algorithm v1, ladder) · ScheduleStore (only writer)   qs-store: Role::Context, UoW `tag` → sched-* checkpoints
        │  Store Port: read / commit(UoW + rev preconditions)    qs-platform: sched-before/after-commit:<op> (test builds)
        └──────────────────────────────────────────────────────► qs-port: product catalog = schema 3, 9-step self-test
```

| # | Piece | Where |
|---|---|---|
| 1 | Catalog role `context` (archived, restored, outside `domain_collections`) | `qs-store` (`Role::Context`, `Collection::context()`), `catalog_roles` test |
| 2 | Schema 2 → 3: `schedule`, `schedule_exception`, `schedule_fulfillment`, `schedule_suggestion`, `session_selection` with `ux_schedule_active_slot`, `ux_suggestion_pending`, `ux_fulfillment_occurrence`, `ux_fulfillment_session`, `ux_exception_occurrence`, `ux_selection_session`, CHECK enums, deferred FKs | `qs-orchestration` |
| 3 | `sched-before-commit:<op>` / `sched-after-commit:<op>` for nine operation tags, driven by an optional `"tag"` on a Unit of Work (compiled out of release builds) | `qs-platform` (`fault`), `qs-store` (`uow`) |
| 4 | Product catalog = schema 3 for the app, the self-test (new step `scheduling`) and the port | `qs-port::selftest` |
| 5 | Dates, closed schemas, occurrence projection (expansion, states, Calendar, Today, Overdue cap) | `orchestration/{dates,schema,occurrences}.js` |
| 6 | `ScheduleStore`: create (unoccupied slots only), moveOnce / moveOccurrence / moveFuture, cancel, decideSuggestion, applyPlan, sweep (incl. retiring engine schedules of removed material), completeSession | `orchestration/schedule-store.js` |
| 7 | Evidence Readers (Objective, Translation, Teacher Review, Retry/Recovery, Scheduling, reserved Typing), Recommender, closed reason registry, tiers as named groups, `explain` (en / zh-CN), `selectionProvenance` | `orchestration/{readers,recommend}.js` |
| 8 | Planner (algorithm `v1`, ladder `[1,3,7,14,30]`) | `orchestration/planner.js` |
| 9 | Test bridge: `qs-scenario port-serve` (the WebView dispatch over a pipe), `product-archive-create/restore` | `qs-scenarios`, `ui/tests/integration/bridge.mjs` |

## 3. ADR 0003 §17 → evidence

| §17 item | Evidence (suite → what it proves) |
|---|---|
| 1 Ownership matrix | `orch-store`: learner move/cancel flips owner in place (same row, engine metadata dropped, revision advances); the engine against a user row stores only a suggestion and leaves the row byte-identical |
| 2 Racing writers | `orch-store` races 1–5: engine vs learner move, in-place engine recalculation vs learner move, accept vs cancel, completion vs move (two variants) — the learner's change always survives, engine writes are dropped and recomputed |
| 3 Database enforcement | `qs-orchestration::schema` (second active schedule, second pending suggestion, second fulfillment of an occurrence/session, one exception/selection per key, CHECK enums, hard deferred FKs) + `orch-store` direct duplicate commit through the Store Port |
| 4 Conflict choice | `orch-store`: user Oct 4 vs engine Oct 3 (a **one-day** difference is a conflict) → accept leaves one active schedule, keep leaves the learner date; equal date is a no-op; no minimum delta (`decideProposal` table in `orch-recommend`) |
| 5 / 5a / 5b / 5c | Occupied slot refused with nothing rewritten and cancel-then-create = new identity (`orch-store`); learner changes supersede the pending suggestion in the same Unit of Work, stale **and forged** suggestions are rejected with no change; the sweep recomputes against the new revision and does not re-nag (covered basis incl. kept / superseded / accepted); property test |
| 6 Expansion table | `orch-occurrences`: cadence × anchor × `until`, week across a year boundary, leap day, month ends, large interval, anchor = until, once schedule, zone/DST independence |
| 7 This-only / this-and-future | `orch-occurrences` (Scope 7.7 example Oct 3→8→11→14, multiple re-anchors) + `orch-store` (exceptions, move-back, drops exceptions ≥ cut, DATE_TAKEN / NO_CHANGE / REANCHOR_OVERLAP / BEYOND_UNTIL / FUTURE_HAS_FULFILLMENT, every rejection byte-identical) |
| 8 Property test | `orch-store`: seeded random operation sequences (create, moves, cancel, completion, evidence, sweep, decide, clock ticks) assert S-1, S-3, S-6, S-7, L-3 and E-1 after **every** step (`QS_ORCH_SEQUENCES`, CI 60) |
| 9 State table, zero writes | `orch-occurrences`: Due/Overdue/Scheduled/fulfilled/cancelled over clock offsets including backwards moves on deep-frozen data |
| 10 Missed schedules | `orch-occurrences` (Overdue stays, 366 cap reports `overdueTruncated` + exact total) + `orch-recommend` (an Overdue engine-owned schedule yields a suggestion, never a move) |
| 11 Old date after reschedule | `orch-store`: the discarded date generates no occurrence, hence no Overdue |
| 12 / 13 / 13a Fulfillment | `orch-fulfillment`: slot-match, linked early start, unlinked early consumes nothing, intent/domain/material, ended series, several Overdue occurrences clear one at a time, one session ↔ one occurrence (database-enforced), re-submitting finalized evidence refused, **moved occurrence keyed by `originalDate`** (fulfillment, selection `scheduleRef`, no `#<movedTo>` key anywhere, display-date link fulfills nothing) |
| 14 Atomicity | `orch-faults`: kill at `sched-before/after-commit:session-complete` leaves evidence + selection + fulfillment all absent or all present |
| 15 Evidence immutability | `orch-store` property (every pre-existing evidence row byte-identical after every step), `orch-migrated` (evidence, origins, runs, papers, documents, media byte-identical after scheduling operations), `orch-architecture` (Evidence readers and Evidence-side code never touch scheduling) |
| 16 / 17 Unknown is not negative; migration mints no debt | `orch-recommend` (gap-listed lineage, undated records, `twin` entries, dangling retries) + `orch-migrated` (the real migrated `r-full` store: no recovery / scheduling / Typing reason, twin never counted, sweep creates nothing even a year later) and the NATIVE-copy contrast (same facts without an origin **do** propose) |
| 18 Heterogeneity | `orch-recommend`: three distinct learner codes, commentary alone emits nothing, Translation recovery only under an all-`correct` Teacher Review, Typing codes never appear |
| 19 No score | `orch-recommend` (no number or score-like key anywhere in the output) + `orch-architecture` (static) |
| 20 Determinism | `orch-recommend`: 60 shuffled-input runs byte-identical, committed golden JSON (`ui/tests/fixtures/orch-recommend.golden.json`), static no-clock/no-random/no-locale scan, explanations for every code in en and zh-CN |
| 21 Provenance | `orch-fulfillment` (the stored snapshot of what was shown is immutable, ids not positions, absence means unknown) + `orch-faults` archive round trip |
| 22 / 23 Closure and projections | `orch-occurrences` (CAL-1: time, reminder, notify, duration, budget, deadline, goal, exam, title, notes, location, extensions, time-of-day in slot/anchor, monthly cadence all rejected) + Calendar/Today projection tests + `orch-architecture` (no notification/timer/network vocabulary) |
| 24 Archive round trip | `orch-faults` (real `product-archive-create/restore`: identical digest of all five collections and evidence, clean consistency, constraints still live) + `qs-orchestration::schema` |
| 25 Upgrade | `qs-orchestration::schema` (2 → 3 preserves data, a failing 3 refuses and leaves the store openable by the previous build, an older build refuses a schema-3 store, a schema-2 archive restores) + `orch-migrated` (a real migrated schema-2 store upgrades verbatim) |
| 26 Fault matrix | `orch-faults`: all nine tags × before/after commit → exactly the pre- or post-state (post-state computed on a clone), consistency clean; randomly timed kills over a chaos workload (`QS_ORCH_KILLS`, CI 100) with atomicity invariants |

Mutation check (not a committed test): six deliberate defects in `ScheduleStore` — no supersede on move, ignoring the bound revision, a minimum-delta threshold, keying fulfillment by `displayDate`, dropping the engine revision precondition, Create rewriting an occupied slot — were each killed by the integration suites.

## 4. Results

Local (development machine, debug profile, thresholds default-scaled): `qs-orchestration` 13 Rust tests, `qs-store` and `qs-port` suites green (the self-test now has 9 steps), `clippy -D warnings` and `rustfmt` clean, 93 JS tests (18 existing + 38 pure + 37 integration against the real store). CI (`Desktop (V2)` on `windows-latest`, thresholds `QS_ORCH_KILLS=100`, `QS_ORCH_SEQUENCES=60` plus the existing `QS_*`): **green**, [run 37059517115](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37059517115) (first run 37058593471 was red on one Windows-only defect — CRLF checkout vs the LF golden file — fixed by `*.golden.json eol=lf`; the integration steps then ran and passed).

## 5. Implementation clarifications for the Human Gate

None of these changes a policy of ADR 0003, the Scope Freeze or Evidence semantics; they are choices the implementation had to make.

1. **Slot projection.** The ADR's `slot_key` is stored as the four component columns (`domain`, `material_type`, `material_id`, `intent`); the partial unique index runs over them, so the payload carries no computed field.
2. **Unit-of-Work `tag`.** A Unit of Work may carry an optional `"tag": "<op>"` that names the `sched-*` fault checkpoints; it is ignored by every other code path and the checkpoints compile to nothing in release builds.
3. **Covered basis includes accepted suggestions** (not only kept and superseded): the planner measures from the planning date, so without it an accepted date would be "different" again the next day and nag. For an Overdue engine-owned schedule its own `engine.basis` counts as considered for the same reason.
4. **Same-basis rule for engine-owned schedules.** A proposal whose basis is already contained in the schedule's `engine.basis` is a no-op whatever its date; otherwise the engine date would creep forward every day and never come due. Only a new evidence id recalculates it in place.
5. **Moving back.** Moving an occurrence to its own original date removes its exception (an exception never has `movedTo = originalDate`).
6. **Re-anchor refusals and cuts.** Moving this-and-future is refused when a later occurrence is already fulfilled (`FUTURE_HAS_FULFILLMENT`: nothing may silently vanish), and a cut inside an earlier segment also drops the segments that would start at or after it.
7. **Cancelling the last unresolved occurrence of a finite series completes it** (§9.3); an unbounded series never completes.
8. **`completeSession` seam.** It refuses to create evidence that already exists (`SESSION_ALREADY_RECORDED`: finalized evidence is never rewritten), retries up to three times on revision conflicts, and on a final conflict raises instead of committing evidence without its fulfillment. A `scheduleRef` to an ended or wrong-slot schedule fulfills nothing but the evidence and selection are still written.
9. **Recommendation details pinned for algorithm `v1`:** tiers are exposed as named groups (`overdue-or-remediation`, `due-or-learner-flagged`, `incorrect-or-teacher-flagged`), never numbers; a signal is superseded by a recovery only when **every** provenance entry is covered (so repeated failures with an older unrecovered attempt stay live); "latest" needs known ordering (two or more attempts, any undated ⇒ no signal), Translation learner marks come from the latest response of the material, and a Translation recovery is response-level (D-7: no item correspondence).
10. **Planner details:** a clean engine-revisit proposal carries the reason `SUCCESSFUL_RECOVERY`; a material whose native sessions cannot be ordered gets no proposal; the engine plans only from native records (M-1).
11. **Unavailable material.** The sweep retires engine-owned schedules whose Paper / Translation document no longer exists (`cancellation.by = engine`, which is not a learner cancel, so the slot can be re-planned); user-owned ones stay and are flagged `unavailable` by the projections through `materialAvailable()`. Material types without a collection (Typing, reserved) count as available.
12. **Overdue enumeration cap** lists the **most recent** 366 unresolved occurrences of a series and reports the exact total; it never deletes or alters anything.
13. **Recommendation targets of removed material** are kept and flagged `unavailable` instead of being dropped silently.
14. **Test bridge.** The JS domain is tested against the real store through `qs-scenario port-serve` (the shipped WebView allowlist dispatch over a pipe) rather than a re-implemented fake, so constraints, revisions, archives and fault points are the shipped ones.

## 6. Open items (explicit, not waived)

- **No product UI by design.** Today / Calendar remain placeholders in the shell; the approved final UI is integrated in its own milestone. The projections and the store are complete and tested.
- **Task-domain integration.** The real session records (Objective, Translation, Typing) and the Typing Reader arrive with the integration milestone; `completeSession` is the seam they will call, `evidenceOps` supplied by them.
- **Manual packaged checks M1–M7** (V1 migration) and the Desktop Foundation's **D1–D4** remain open, non-blocking acceptance debt: not PASS, not waived.
- Soft material and session references are not database-enforced (by ADR design); `check_consistency` plus the unavailable-material rule cover them.
- Algorithm `v1` parameters (ladder, 366 cap) are provisional and versioned (ADR 0003 §22).

## 7. How to run

```bash
# Rust (schema 3, constraints, upgrade, archive, fault-point registry)
cargo test -p qs-orchestration -p qs-store -p qs-port
# JS domain, pure (dates, occurrences, readers, recommender, planner, architecture)
node --test "ui/tests/*.spec.mjs"
# JS domain against the real Rust store (needs the scenario binary)
cargo build -p qs-scenarios --bin qs-scenario
node --test "ui/tests/integration/*.spec.mjs"      # QS_ORCH_KILLS=100 QS_ORCH_SEQUENCES=60 are the CI thresholds
```

## 8. Gate readiness

Implementation complete; ADR 0003 §17 is implemented as automated tests that pass locally and are wired into the Windows CI workflow. The milestone **awaits the Human Gate**. Task-Domain Integration (Objective / Translation / Typing), Answer Explanation, Focused Practice and the final UI integration are **not started** and need their own authorization.
