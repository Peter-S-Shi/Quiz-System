---
status: ACCEPTED — GO WITH AMENDMENT (Human Gate, 2026-10-02); implementation NOT STARTED, awaiting explicit authorization
decision-date: 2026-10-02
gates: Learning Orchestration + Calendar milestone (implementation)
depends-on: V2_PRODUCT_SCOPE_FREEZE.md (Revision 1), docs/adr/0001-desktop-runtime-and-application-data.md (ACCEPTED), docs/adr/0002-v1-to-v2-migration-architecture.md (ACCEPTED), Desktop Foundation (ACCEPTED), V1 Migration milestone (ACCEPTED)
---

# ADR 0003 — Learning Orchestration: Scheduling, Recommendation and Calendar Architecture

**Status:** **ACCEPTED — GO WITH AMENDMENT** (Human Gate, 2026-10-02; the review outcome and the four amendments are recorded in §22 and already folded into the text below). This ADR turns the frozen product semantics of Scope Freeze Revision 1 (§3.2, §3.6, §4.4–§4.6, §6, §7, §8, §12.5, §14, §23) into an implementable and verifiable data and behavior contract. It writes **no scheduler, recommender or Calendar code and no schema migration**. Scheduler / Recommendation / Calendar **implementation is NOT STARTED and is not authorized by this document**: the Learning Orchestration + Calendar milestone needs its own explicit authorization (Scope §24). Nothing here reopens Scope Freeze Revision 1; §18 maps every frozen boundary to the mechanism that keeps it.

## 1. Decision summary

| Area | Decision |
|---|---|
| Where it lives | Domain semantics (planner, recommender, occurrence projection, validators) are **pure JS/TS modules** with an injected clock; **Rust** persists, constrains and archives them through the Store Port (ADR 0001 §4). Rust enforces only structural invariants: identity, uniqueness (partial unique indexes), foreign keys, atomic Units of Work. |
| Data classes | Three, never mixed: **Evidence** (native evidence-bearing records, untouched), **Scheduling Context** (new durable, archived user data: `schedule`, `schedule_exception`, `schedule_fulfillment`, `schedule_suggestion`, `session_selection`), **Derived** (Recommendations, occurrences, Due/Overdue, Calendar view: computed, never stored as canonical). A new catalog role `context` expresses the middle class (§5, §15). |
| Schedule identity | A **Scheduling Slot** = (Task Domain, material, Intent). **At most one `active` schedule per slot**, enforced by a **partial unique index**, not just by domain code. |
| Ownership | Every schedule is `owner: engine` or `owner: user`. Any explicit learner **move or cancel** of an existing schedule makes it user-owned **in place** (same row, the new date is the authority); a learner **create** is only possible in a slot with no active schedule and makes a new user-owned schedule. The engine can write only schedules that were engine-owned when it read them (revision precondition), so overwriting a user-owned date is structurally impossible. |
| Conflict | Whenever a new-evidence proposal **differs** from the current active/display date of a user-owned (or Overdue engine-owned) schedule, it is stored as an **inert `schedule_suggestion`** bound to the **schedule revision** it was computed against (never a second schedule, never Due/Overdue); the same date is a no-op. The learner's decision is **one atomic Unit of Work** that verifies the binding: accept (re-anchor) or keep; at most one pending suggestion per schedule (partial unique index); every explicit learner change closes the pending suggestion as `superseded` in the same Unit of Work. |
| Dates | **Local calendar dates** `YYYY-MM-DD`, no time, no zone. "Today" is injected at read time. Due / Overdue / Scheduled are **derived**, never stored, so clock changes and time zones cannot corrupt data. |
| Recurrence | A schedule is a **series**: `once`, or `every {N day(s)|N week(s)}` with an optional `until` date. The cadence is anchored; **segments** record re-anchors; per-occurrence **exceptions** record `moved` / `cancelled`. Occurrences are **derived**, identified by `(scheduleId, original date)`. |
| Fulfillment | A completed session is recorded in **the same Unit of Work as its evidence** as a `schedule_fulfillment` keyed by the occurrence (unique) and by the session (unique): one session fulfills at most one occurrence, an occurrence is fulfilled at most once, so no duplicate debt. |
| Engine | A **deterministic, versioned planner** (`algorithmVersion`) turns *native V2* evidence into engine-owned revisit schedules or suggestions on a fixed interval ladder. It never moves an Overdue schedule silently, never schedules from migrated evidence, and never creates a Test schedule. |
| Recommendation | A **pure function** over per-domain **Evidence Readers** (heterogeneous signals, no universal record) plus scheduling context. Output is a list of targets with **closed-registry reason codes** and stable provenance pointers; ordering is by reason tiers and a stable key, **never a numeric score**. Same snapshot + same date ⇒ byte-identical output. |
| Unknown ≠ negative | A signal exists only when a **recorded fact** asserts it. Absence, a migration gap (ADR 0002 §7.4) or an unknowable ordering never produces a signal, never counts as "not practiced / not known / not recovered", and migration never mints debt. |
| Explanation | Live explanations are **recomputed**, not stored. When the learner acts on a recommendation, a `session_selection` sidecar stores the **snapshot of what was shown** (source, reason codes, params, algorithm version). |
| Calendar | A **read/edit projection** over the same scheduling records. No calendar entity; closed schemas without any time, title, reminder, deadline, duration or budget field make out-of-scope content unrepresentable. |

## 2. Inputs, authority and non-goals

**Authoritative (in order):** Scope Freeze Revision 1; ADR 0001 (Store Port, Unit of Work, payload/projection, catalog ownership, §12 deferral of "table schemas for Scheduling/Calendar"); ADR 0002 (origin gaps §7.4, counting contract §8.2, three data classes §7.1, activation guards); the shipped Desktop Foundation and Migration implementation (catalog roles, commit guards, archive, fault checkpoints).

**Decides:** persistence and ownership of schedules, the conflict mechanism, the recurrence model, derived states and fulfillment, the planner/recommender contracts, provenance storage, schema/projection requirements, invariants and the automated verification contract.

**Does not decide (explicit):** UI layout and copy (design lane); the Session Composition item-selection policy (the Recommendation only *may* name focus items); Objective/Translation/Typing domain integration (a Typing Attempt record does not exist yet, so Typing is reserved by contract, not built); Answer Explanation; anything in Scope §21 LATER/DEFER/CUT. Parameter values in §11 and §12 are **provisional and versioned**; the *mechanisms* are normative.

## 3. Vocabulary

- **Evidence** — native evidence-bearing records (Learner Responses incl. results/annotations/marks/provenance, Teacher Reviews, retry lineage, future Typing Attempts) and, per ADR 0002 §8.2, `legacy-only` history entries. Immutable to this ADR.
- **Scheduling Context** — facts about *when the learner or engine intends a session*. Never Evidence (Scope §4.5).
- **Scheduling Slot** — the identity of an intended session: `(domain, material, intent)`.
- **Schedule (series)** — the one authoritative arrangement for a slot: owner, cadence, anchors.
- **Occurrence** — one derived date of a series. Its **only identity is `(scheduleId, originalDate)`** (§7.8); `displayDate` (= `movedTo` when moved) is a presentation/state attribute and is **never an identity or a key**.
- **Exception** — a stored per-occurrence override (`moved` or `cancelled`).
- **Fulfillment** — the stored fact that a real completed session satisfied an occurrence.
- **Suggestion** — an engine proposal competing with a user-owned or Overdue schedule, stored inert and **bound to the schedule revision it was computed against** until the learner decides or an explicit change supersedes it.
- **Signal** — a derived, ephemeral, domain-native fact read from Evidence or Context by an Evidence Reader; never persisted as canonical, never a universal record.
- **Reason** — a closed-registry code + primitive params + provenance pointers attached to a Recommendation.
- **Selection provenance** — the stored snapshot of the reasons that were shown when the learner started a session from a recommendation.

## 4. Architecture and seams

```text
WebView (JS/TS domain semantics)                               Rust core (durability)
 ┌────────────────────────────────────────────────┐
 │ Evidence Readers (per domain) ──► Signals      │
 │ Occurrence Projection (pure)  ◄── schedules    │  Store Port: read / commit(UoW, preconditions)
 │ Planner (pure, versioned)  ──► proposals       │ ───────────────────────────────────────────►
 │ Recommender (pure) ◄── Signals + sched context │   catalog collections + partial unique indexes
 │ ScheduleStore (the ONLY writer of sched. data) │   archive / backup / recovery / fault points
 │ Calendar & Today views = projections           │
 └────────────────────────────────────────────────┘
```

- **ScheduleStore is the only mutator** of Scheduling Context. Every operation in §8 is one Store Port Unit of Work with revision preconditions; no multi-call transaction exists. This module is a deep module: a small interface (`create`, `move`, `cancel`, `decideSuggestion`, `applyPlan`, `recordFulfillment`) hiding validation, segmentation and constraint handling.
- **Evidence Readers are the only code that reads Evidence for these systems.** The dependency direction is one-way: Scheduling and Recommendation read Evidence; Evidence modules never import or reference scheduling (§17, architecture test).
- **Pure functions take the clock and the snapshot as arguments** (no `Date.now()`, no randomness, no locale), so the Node test suite remains the primary domain test vehicle (ADR 0001 §4).

## 5. Data classes and the Evidence boundary

| Class | Collections | Properties |
|---|---|---|
| Evidence | `learner_response`, `teacher_review`, `legacy_history_entry` (`legacy-only` role counts as attempts), future `typing_attempt` | Native records, verbatim, immutable to scheduling/recommendation. The **Evidence Source Registry** is this closed list; adding a source needs an ADR amendment. |
| Content/context read-only inputs | `paper`, `translation_document` (incl. remediation `provenance`), `migration_origin` (gaps) | Read for material identity, remediation links and *unknown-fact* rules; never written by these systems. |
| **Scheduling Context** | `schedule`, `schedule_exception`, `schedule_fulfillment`, `schedule_suggestion`, `session_selection` | Durable, user data, **archived and restored** with the store (H-4 spirit), never read as Evidence, catalog role `context`. |
| Derived | recommendations, occurrences, Due/Overdue/Scheduled, Calendar and Today views, live explanations | Recomputed on demand; never canonical; never written as a cache that could disagree. |

**E-1 (Evidence immutability).** No scheduling or recommendation operation writes, deletes or rewrites any Evidence record or adds a field to one. Selection provenance and fulfillment are **sidecar** records keyed by the session (§10), exactly as ADR 0002 keeps `migration_origin` beside payloads.

## 6. Date semantics

1. A scheduled date is a **local calendar date** string `YYYY-MM-DD` (proleptic Gregorian). It carries no time, no zone, no instant. It is stored and compared as a string/day number; it is **never** converted to an instant.
2. **Today** is the device's local calendar date from an **injected clock**, evaluated at read time. The planning date of a sweep and the `fulfilledOn` date of a session are the local dates at that moment, stored as dates.
3. Day arithmetic is calendar-day arithmetic (add days to the date), so DST transitions, leap days, month ends and a changed system time zone cannot shift or duplicate an occurrence.
4. **Due/Overdue are functions of (occurrence, today)**, never stored: moving the system clock backwards turns Overdue back into Due/Scheduled with no write; forward turns it Overdue with no write. No process "marks" anything Overdue.
5. Operational timestamps (`createdAt`, `updatedAt`, `decidedAt`) are RFC 3339 instants for diagnostics only. **No scheduling decision reads them**; ordering that matters (what is "new evidence") uses record identity sets, not wall-clock comparison (§11.4).
6. Validators accept a new or moved date only if it is `>= today` (a schedule cannot be placed in the past); an existing Overdue date is changed only by an explicit learner move to `>= today`.

## 7. The scheduling data model

Names are provisional; shape is normative. All records carry `schemaVersion: 1` and obey the ADR 0001 §5.3 fidelity contract. **Schemas are closed** (`additionalProperties: false`, no `extensions` in version 1): extending a schema is a versioned change that needs an ADR amendment, which is what makes "no time, no reminder, no external event" unrepresentable (§18).

### 7.1 `schedule` (series)

```text
{ schemaVersion: 1, id,
  slot: { domain: "objective" | "translation" | "typing",
          material: { type, id },            // same vocabulary as Learner Response `material.type`
          intent: "practice" | "test" },
  owner: "engine" | "user",
  status: "active" | "cancelled" | "completed",
  cadence: { kind: "once" }
         | { kind: "every", unit: "day" | "week", interval: 1..365 (day) | 1..52 (week), until?: "YYYY-MM-DD" },
  segments: [ { anchor: "YYYY-MM-DD", takesOverAt?: "YYYY-MM-DD" } ],   // §7.4; exactly one segment for `once`
  engine?: { reasons: [ {code, params} ], algorithmVersion, basis: [ {collection, id} ] },   // present iff owner = engine
  cancellation?: { by: "user" | "engine", considered: [ {collection, id} ] },                // present iff status = cancelled
  createdAt, updatedAt }
```

Projections (indexed columns): `slot_key` (`domain|material.type|material.id|intent`), `domain`, `material_type`, `material_id`, `intent`, `owner`, `status`. **Hard constraint:** `UNIQUE INDEX ux_schedule_active_slot ON schedule(slot_key) WHERE status='active'` (S-1). Schedules are never hard-deleted; `cancelled` / `completed` rows remain (archived history of intent, never Evidence).

The material reference is **soft** (a schedule may refer to a Typing text that does not exist yet and materials live in different collections); an unresolved material makes the schedule `unavailable` in views (§9.4), never silently removed.

### 7.2 `schedule_exception`

`{ schemaVersion, id: "<scheduleId>#<originalDate>", scheduleId, originalDate, kind: "moved" | "cancelled", movedTo? }`. Projections: `schedule_id` (**hard FK** → `schedule`), `original_date`, `kind`. Identity makes one exception per occurrence by construction.

### 7.3 `schedule_fulfillment`

`{ schemaVersion, id: "<scheduleId>#<originalDate>", scheduleId, originalDate, session: { collection, id }, fulfilledOn, via: "linked" | "slot-match" }`. `originalDate` is the occurrence's identity date (§7.8) **even when the occurrence was moved and completed on its `displayDate`**; `fulfilledOn` is merely the local date of the completion and is never an identity. Projections: `schedule_id` (**hard FK**), `original_date`, `session_collection`, `session_id`; **`UNIQUE(session_collection, session_id)`** so a session fulfills at most one occurrence (S-6). The session reference is soft (a Learner Response today, a Typing Attempt later).

### 7.4 Segments, anchors and re-anchoring

A series' dates are the union over its **segments**. Segment *i* generates `anchor_i + k·step` (`k ≥ 0`, step = interval days, or 7·interval for weeks, bounded by `until`) for dates **strictly before** the next segment's `takesOverAt` (the last segment has no upper bound). `takesOverAt` is the **original date of the occurrence that the re-anchor replaces**, so every occurrence before it is exactly what it was, resolved or still Overdue — nothing before the cut can vanish. Validity (checked by the validator, structurally relied on by the unique keys): each new `anchor` is `>= today` and **strictly greater than the previous segment's last generated date before `takesOverAt`**, so segments never overlap and occurrence identities stay unique. A `once` series has one segment and is moved by replacing its anchor.

### 7.5 `schedule_suggestion`

`{ schemaVersion, id, scheduleId, scheduleRev, targetOriginalDate, currentDate, suggestedDate, reasons: [..], algorithmVersion, basis: [ {collection, id} ], status: "pending" | "accepted" | "kept" | "superseded", createdAt, decidedAt? }`. **`scheduleRev` is the revision of the `schedule` row the suggestion was computed against** (the catalog `rev`); `targetOriginalDate` is the identity date (§7.8) of the occurrence the suggestion concerns (the schedule's only occurrence for `once`); `currentDate` is that occurrence's `displayDate` at creation. Projections: `schedule_id` (**hard FK**), `status`; **`UNIQUE INDEX ux_suggestion_pending ON schedule_suggestion(schedule_id) WHERE status='pending'`** (S-3). A suggestion is **inert**: it is not a schedule, has no Due/Overdue state, and never appears as a session. A suggestion is **valid to decide only while `schedule.rev == scheduleRev`**; an old suggestion can never be applied to a schedule that has since changed (L-3).

### 7.6 `session_selection` (selection provenance and the fulfillment link)

`{ schemaVersion, id: "<collection>:<sessionId>", session: { collection, id }, selection: { source: "manual" | "recommended", reasons?: [ {code, params, provenance} ], algorithmVersion? }, scheduleRef?: { scheduleId, originalDate }, createdAt }`. `scheduleRef.originalDate` is the occurrence's identity date (§7.8), **never** the date it was displayed or moved to. `selection.source` keeps the frozen two values (Scope §8): starting a session from a schedule is a **Manual** selection that carries a `scheduleRef`; "Today", "Scheduled" or "Overdue" never become Selection or domain enums. Projections: `session_collection`, `session_id`, `source`, `schedule_id` (nullable, **hard FK**). It is written in the **same Unit of Work as the session's evidence** (§10). Migrated sessions have **no** row: absence means *unknown*, never "manual".

### 7.7 Slot occupancy (normative)

A slot is *occupied* while it has an `active` schedule. **Create is defined only for an unoccupied slot.** For an occupied slot the learner is shown the existing schedule and changes it through an explicit move / re-anchor / cancel (O-2…O-5). A schedule's `segments`, `exceptions`, `fulfillments` and history of intent are **never rewritten by a Create**. Replacing a schedule's cadence wholesale is *cancel the old series, then create a new schedule with a new identity*; the old series keeps its history and may be the learner's explicit first half of a single Unit of Work that also inserts the new one.

### 7.8 Occurrence identity (normative)

The identity of an occurrence is **always `(scheduleId, originalDate)`**, where `originalDate` is the date the cadence/segments generated for it (§7.4). It is the key of `schedule_exception` and `schedule_fulfillment`, the value of `schedule_suggestion.targetOriginalDate` and `session_selection.scheduleRef.originalDate`, and the `originalDate` of every calendar entry. `movedTo` / `displayDate` only determine **where and in what state** the occurrence is presented (Due/Overdue/Scheduled); they are never stored as an identity, never part of a key, and never referenced by another record. Consequently an occurrence moved from Oct 6 to Oct 8 is still `(scheduleId, Oct 6)`: its fulfillment, its selection provenance and its exception all use Oct 6, and no second occurrence can come into existence on Oct 8 by moving (a move onto a date already displaying another unresolved occurrence of the series is rejected).

## 8. Operations (each is exactly one Unit of Work)

All carry **revision preconditions** on every row read to decide (`schedule`, `schedule_suggestion`). A failed precondition aborts with no change; user operations reload and ask again, the engine sweep recomputes (§14). **Every operation that changes a schedule's state or dates (O-2…O-5, O-6, O-7, fulfillment) also writes the `schedule` row, so its revision advances, and closes the schedule's pending suggestion as `superseded` in the same Unit of Work** (L-3); O-8 (keep) leaves the schedule row alone and decides only the suggestion.

| # | Operation | Effect |
|---|---|---|
| O-1 | **Create (learner)** `{date, material, domain, intent, cadence?}` | **Only for a slot with no active schedule**: insert a new `owner: user` schedule with a new identity. If the slot is occupied the operation is **refused** (`SLOT_OCCUPIED`, returning the existing schedule); it never alters the existing schedule's cadence, segments, exceptions, fulfillments or history. A racing create loses to the partial unique index (S-1) and reloads. A full cadence change is **cancel (O-5) the old series, then create** a new schedule (§7.7). |
| O-2 | **Move a `once` schedule** | Replace the anchor with the new date; `owner: user`; supersedes a pending suggestion. The previous date stops existing: it can never be Overdue (Scope §7.4). |
| O-3 | **Move one occurrence only** (recurring) | Upsert `schedule_exception{kind: moved, movedTo}` keyed by the occurrence's `originalDate`; the rest of the series keeps its anchor. `movedTo >= today`, `movedTo != originalDate`, and no other unresolved occurrence of the series is displayed on `movedTo`. Touches the `schedule` row (`owner: user`, `updatedAt`) so its revision advances and a pending suggestion is superseded. |
| O-4 | **Move this and future** (recurring) | Append a segment `{anchor: newDate, takesOverAt: X's original date}`; delete exceptions whose `originalDate >= X` (the learner chose to recalculate the future; the confirmation states their count); `owner: user`; supersedes a pending suggestion. The product **asks** (this only / this and future) and never guesses (Scope §7.8). |
| O-5 | **Cancel** (a `once` series, one occurrence, or the whole series) | `once`/whole series: `status: cancelled` with `cancellation{by: user, considered}`; one occurrence: `schedule_exception{kind: cancelled}` (and a touch of the `schedule` row). `owner: user`; supersedes a pending suggestion. Reaching zero unresolved occurrences completes the series (§9.3). |
| O-6 | **Engine apply** (§11) | For each proposal: create an engine-owned schedule, update an engine-owned non-Overdue schedule **in place**, or upsert the single pending suggestion. Every write carries the revision read while `owner = engine` (sovereignty). |
| O-7 | **Decide suggestion — accept** | One UoW, **valid only if the suggestion is `pending` and `schedule.rev == suggestion.scheduleRev`** (otherwise it aborts with no change): (recurring) append the segment cutting at `targetOriginalDate` with `anchor = suggestedDate`, or (once) replace the anchor; `owner: user`; suggestion `accepted`. **The accepted date becomes the new anchor** (Scope §7.7). |
| O-8 | **Decide suggestion — keep** | One UoW, valid under the same revision check as O-7: suggestion `kept` (its `basis` is the considered set, §11.4); the schedule is unchanged. |
| O-9 | **Record fulfillment** (§10) | In the session's evidence UoW. |

Ownership transitions: `engine →(O-2,3,4,5,7)→ user` in place; a learner Create produces a new user-owned schedule and never transitions an existing one; `user` never becomes `engine` by itself. A user-owned schedule stays user-owned for life; the engine can only *suggest* against it. Dismissing a suggestion (`kept`) never changes ownership.

**What is a conflict (normative).** Whenever the engine's proposed date `P` **differs** from the current active/display date of the target occurrence of a user-owned schedule, or of an Overdue engine-owned schedule, that is a conflict that needs the learner's choice (Scope §4.5.1, §7.5); **there is no minimum difference**. Only an **equal** date is a no-op. Repeat reminders are prevented **only** by the covered-basis rule (§11.4): without a new evidence id a decided or superseded basis never raises a suggestion again.

## 9. Derived states

### 9.1 Occurrence states

For occurrence `O = (S, originalDate)`, in this precedence:

1. `S.status = cancelled`, or an exception `cancelled` ⇒ **cancelled** (a record, hidden by default views).
2. A fulfillment keyed by `O` ⇒ **fulfilled**.
3. Otherwise `displayDate = exception.movedTo ?? originalDate`; relative to **today**: `displayDate < today` ⇒ **overdue**; `= today` ⇒ **due**; `> today` ⇒ **scheduled**.
4. If the material does not resolve ⇒ the state above plus `unavailable: true` (§9.4).

**Overdue is a factual state, not a stored status** and not gamified (no counters, no streaks). An Overdue occurrence is never moved, never dropped, never auto-cancelled (Scope §7.9); the learner may start it, reschedule it or cancel it, each an O-operation.

### 9.2 Recurring series and Overdue volume

Occurrences are **expanded lazily** for a requested window plus all *unresolved* occurrences at or before today. Presentation may group a series' Overdue occurrences, but the data model stays per occurrence. `OVERDUE_ENUMERATION_CAP` (provisional 366 per series) is an **explicit projection-enumeration safety limit only**: it bounds how many unresolved past occurrences one projection call lists, reports `overdueTruncated: true` plus the exact count when it bites, and **never deletes, cancels or alters any schedule or occurrence**, so truncation is never silent and never destructive; a bulk learner action "skip earlier missed occurrences of this series" is a batch of O-5 occurrence cancels.

### 9.3 Series status

`active` while any occurrence remains unresolved or the series is unbounded (no `until`); `completed` when a `once` occurrence is fulfilled, or when a series with `until` has every occurrence resolved (the UoW that resolves the last one sets it); `cancelled` by O-5. `completed`/`cancelled` free the slot immediately (the partial unique index only covers `active`).

### 9.4 Unavailable material

If a schedule's material no longer resolves, the schedule is **kept and shown as unavailable**; the learner can cancel it. An *engine-owned* schedule whose material was removed is retired (`status: cancelled`, `cancellation.by: engine`) because the engine owns recalculation; a user-owned one is never retired automatically.

### 9.5 The Calendar projection

`calendarView(range, today)` is a pure function `expandOccurrences(schedules, exceptions, fulfillments, window, today)` returning, per date, entries `{scheduleId, originalDate, displayDate, slot, owner, state, hasPendingSuggestion}` (the entry is placed on `displayDate`; its identity is `(scheduleId, originalDate)`, §7.8). It supports exactly Scope §7.2: inspect future schedules, see Due/Overdue, reschedule an existing one (O-2/3/4), schedule a currently unscheduled material (O-1, unoccupied slots only). `Today` is the same projection with `displayDate <= today` plus due items; it adds no data. There is **no calendar entity, store or sync**.

## 10. Fulfillment: one real session, one occurrence, no duplicate debt

The session-finalization Unit of Work that writes the evidence record also writes, **in the same transaction**:

1. the `session_selection` sidecar (if the session has recorded selection provenance or a `scheduleRef`);
2. at most one `schedule_fulfillment` plus the schedule's status update (`completed` when §9.3 applies).

**Which occurrence a completion fulfills** (deterministic, evaluated against the revisions read in that UoW):

- **Linked:** the session was started from an occurrence (`scheduleRef` captured at start, held in recovery-only session state until finalization). That occurrence is fulfilled — even if it is still in the future (an early, deliberate start).
- **Slot-match (no link):** a completed session whose slot equals an active schedule's slot fulfills that series' **earliest unresolved occurrence with `displayDate <= fulfilledOn`** (Due or Overdue). An unlinked session never fulfills a *future* occurrence (the learner's plan stands; the engine re-plans from the new evidence, §11).
- **Intent and domain must match** the slot: a Practice session never satisfies a Test schedule.
- **At most one** occurrence per session (`UNIQUE` session) and **at most once** per occurrence (key). Several Overdue occurrences of one series stay individually Overdue; one session never silently clears them.
- A `cancelled` or `completed` series fulfills nothing. An abandoned or incomplete session fulfills nothing and writes no evidence.

Because fulfillment commits with the evidence, there is no window in which the evidence exists and the occurrence is still Due, and a crash cannot produce a duplicate debt. The engine's follow-up planning is a **separate, idempotent sweep** (§11.5), recomputed from scratch.

## 11. The engine planner

### 11.1 Scope of the engine

The planner creates **revisit** schedules only: `intent: practice`, `cadence: once`, `owner: engine`. It never creates recurrence (user-authored strategy, Scope §7.6) and never a Test schedule (Test is learner-chosen).

### 11.2 Eligible evidence — migration never mints debt

The planner reads **native V2 evidence only**: records **without a `migration_origin`**. Migrated evidence feeds the on-demand Recommendation (§12) and nothing else: importing a V1 backup must never create schedules or Overdue items out of history the learner never scheduled (D-15 unknown facts; "age alone does not create urgency", Scope §6.1). The learner can always schedule manually.

### 11.3 Proposal rule (algorithm `v1`, parameters provisional)

For a material, let the latest native session (ordered by its recorded completion; ties by id) be `L`.

- If `L` carries a **difficulty signal** (an incorrect objective result, a learner `unknown`/`uncertain`/`should_know` annotation, a Teacher Review with actionable judgment or remediation recommendations) ⇒ proposal date `= planningDate + LADDER[0]`.
- Else if `L` is the fulfilling session of an engine-owned revisit and was clean ⇒ with `c` = the number of consecutive clean engine-revisit fulfillments of the slot (counted from `schedule_fulfillment` + session signals), if `c < LEN(LADDER)` ⇒ `planningDate + LADDER[c]`; else **no proposal** (the ladder is complete; the learner may schedule further).
- `LADDER = [1, 3, 7, 14, 30]` days (provisional). Dates are always relative to the **planning date** (today), never to historical evidence dates; the minimum is one day ("wait").

This is a **versioned, provisional, lightweight heuristic** (an interval ladder), **not** a memory model and **not claimed to be scientifically optimal**: no stability/difficulty variables, no FSRS (deferred), no stored mastery. The rung is *derived* from fulfillment facts and never stored as state; the values may change only through a new `algorithmVersion`.

### 11.4 Applying a proposal

For each slot with a proposal `P` and the slot's active schedule `S` (read with its revision):

| Situation | Action |
|---|---|
| no active schedule, and the slot is not user-cancelled-with-unchanged-basis | create engine-owned `S` (`engine.basis` = the evidence ids that justify it) |
| `S` engine-owned, **not Overdue** | update **in place** (anchor, reasons, basis, `algorithmVersion`) — allowed recalculation, Scope §4.5.1 |
| `S` engine-owned **and Overdue** | **no silent move** (Scope §7.9): store a suggestion instead |
| `S` user-owned | `P` **differs** from the target occurrence's `displayDate` ⇒ store a suggestion bound to `S.rev` (no minimum difference, §8); `P` equals it ⇒ nothing |
| `P` equals the current date, or a pending suggestion already carries the same date and a basis that covers `P.basis` | nothing (idempotent) |
| the **covered basis** of `S` (the union of `basis` over its `kept` **and** `superseded` suggestions) already contains `P.basis` | nothing (**no re-nagging**): only **new evidence ids** can raise a suggestion again, including after an explicit learner change closed an earlier one |
| a pending suggestion exists, bound to `S.rev`, with an older basis | update that single pending row in place (same `scheduleRev`); a pending suggestion bound to an **older** revision is first closed as `superseded` (§8) and the sweep recomputes against the current revision |

**Cancellation tombstone:** a cancelled slot stores `cancellation.considered` (the evidence ids known at cancel time). The engine may create a new engine-owned schedule in that slot only from evidence ids **not** in `considered`; it appears as an ordinary visible engine-owned schedule the learner can cancel again. Newness is decided by **identity sets**, not timestamps, so clock skew and back-dated imports cannot misfire.

### 11.5 Sweep, triggers and idempotence

The planner runs after a session's evidence commits, at app start, and after a restore or migration (re-planning from scratch is always safe). Each sweep is a pure `plan(snapshot, clock) → proposals` followed by O-6 with revision preconditions: a lost race with a learner action aborts that slot's write (the learner wins) and the next sweep **recomputes against the schedule's new revision**. The planner is **time-triggered by nothing**: the passage of time alone never changes a schedule.

## 12. The Recommendation contract

### 12.1 Inputs: heterogeneous evidence, kept separate

Per-domain **Evidence Readers** (one per Evidence Source Registry entry) turn records into **Signals** of their own domain; there is no universal `EvidenceRecord` and no flattened confidence (Scope §4.2–§4.3). A Signal carries `{code, subject, provenance: [{collection, id, itemId?}], params}`.

| Reader | Reads | Emits (examples) |
|---|---|---|
| Objective | `learner_response` (objective) + `legacy-only` history | item incorrect in its latest attempt; item incorrect in ≥ 2 distinct attempts |
| Translation | `learner_response` (translation) annotations/marks | `unknown`, `uncertain`, `should_know` — three distinct signals |
| Teacher Review | `teacher_review` | actionable judgment; remediation recommended; remediation unresolved / closed |
| Retry/recovery | response `provenance` (`retry`) + later evidence | retry exists; successful recovery |
| Scheduling | `schedule*` (derived states) | scheduled Due/Overdue |
| Typing (reserved) | future `typing_attempt` | `TYPING_ERRORS_REMAIN`, `TYPING_REVISIT_DUE`; never a knowledge judgment (Scope §4.8) |

**Counting contract:** the Objective attempt set is ADR 0002 §8.2 exactly (`twin`/`twin-divergent` history entries never create signals, so nothing is counted twice).

### 12.2 The unknown-is-not-negative rules (normative)

1. **A signal exists only when a recorded fact asserts it.** No absence produces a signal.
2. **Gap-listed or origin-absent facts are unknown** (ADR 0002 §7.4): a migrated Objective response without `provenance.retry` yields **no** retry, recovery or "never retried" signal (`objective.retry-lineage`); a migrated record without `uncertain` annotations is not "confident"; a missing feedback mode is not a default (`objective.feedback-mode`); a migrated record is not "unscheduled debt" (`v2.scheduling`).
3. **Temporal relations require recorded, comparable ordering.** "Recovery after remediation" or "latest attempt" needs both records to carry recorded timestamps (or an explicit lineage link); a record with `timestamp.absent:<field>` makes the relation **unknown**, so no signal is derived from it. Age itself is never a signal (Scope §6.1).
4. **Heterogeneous success is not inferred across domains.** A Translation retry is a *successful recovery* only if a recorded Teacher Review of that retry judges **every** item `correct`; a bare retry, or a learner's silence, proves nothing. An Objective retry recovers only items recorded correct.
5. **Teacher commentary is not remediation** (Scope §6.1): comments/tags alone and `correct` judgments emit nothing; only a recorded actionable judgment (`incorrect`, `partial`, `needs-review`, the V1 vocabulary) or a non-empty `remediationRecommendations` does.
6. **Migration `legacy-only` entries** carry item correctness for `(paperId, questionId)` only; they never resolve to items of another paper (D-11).

### 12.3 Output and ordering (no score)

```text
Recommendation { target: { domain, material: {type, id}, focus?: [ {itemId} ] },
                 reasons: [ { code, params, provenance:[...] } ],      // closed registry
                 context?: [ historical reasons now superseded ],
                 scheduling?: { scheduleId, state },                    // read-only note, never suppresses
                 algorithmVersion }
```

- **Closed reason registry (v1):** `OBJECTIVE_INCORRECT_LATEST`, `OBJECTIVE_INCORRECT_REPEATED`, `LEARNER_UNKNOWN`, `LEARNER_UNCERTAIN`, `LEARNER_SHOULD_KNOW`, `TEACHER_ACTIONABLE_REVIEW`, `REMEDIATION_UNRESOLVED`, `SUCCESSFUL_RECOVERY`, `SCHEDULED_REVIEW_DUE`, `SCHEDULED_REVIEW_OVERDUE` (engine-owned), `LEARNER_SCHEDULED_DUE`, `LEARNER_SCHEDULED_OVERDUE` (user-owned), reserved `TYPING_ERRORS_REMAIN`, `TYPING_REVISIT_DUE`. `unknown`, `uncertain` and `should_know` are **three codes, never merged** (Scope §6.1).
- **Successful recovery reduces urgency without erasing history:** reasons recorded *before* a recorded successful recovery of the same response/items are excluded from tier computation and listed under `context`, still with provenance.
- **Ordering without a score:** targets are grouped by **tier of their best live reason** — Tier 1: `*_OVERDUE`, `REMEDIATION_UNRESOLVED`; Tier 2: `*_DUE`, `OBJECTIVE_INCORRECT_REPEATED`, `LEARNER_UNKNOWN`, `LEARNER_UNCERTAIN`, `LEARNER_SHOULD_KNOW`; Tier 3: `OBJECTIVE_INCORRECT_LATEST`, `TEACHER_ACTIONABLE_REVIEW` — then by the stable key `(domain, material.type, material.id)`. A tier is a **presentation grouping of reason kinds**, not a rank between them: reasons sharing a tier imply no relative importance, and **no number is computed, stored or displayed** (no mastery %, no priority score).
- **Intent and selection stay the learner's:** a Recommendation never fixes Practice/Test; `Manual` and `Recommended` selection are both always available (Scope §8, §23).

### 12.4 Determinism

`recommend(snapshot, today, algorithmVersion)` is pure: the snapshot's record order is irrelevant (inputs are sorted by id inside the Readers), no clock or randomness is read inside, reason and provenance lists have a total order, and the output serializes **byte-identically** for identical inputs. Human-readable text is rendered from `(code, params)` by a locale layer outside the algorithm, so explanations are stable across locales and runs.

## 13. Explanation and stable provenance

- **Live explanation ("why is this recommended again?")** is recomputed from Evidence and Context on demand (Scope §14); nothing is cached that could disagree with the evidence.
- **Selection provenance ("why did this item appear in this session?", Scope §4.4)** is the stored `session_selection` snapshot: `selection.source`, the **reason codes and params that were shown**, `algorithmVersion`, and provenance pointers `(collection, id[, itemId])` — **ids, never row positions or timestamps**, so pointers survive restore and migration. A later algorithm change never rewrites it; it records what the learner saw.
- A selection **without** provenance (a migrated session, or a manual start) simply has no reasons; nothing is inferred backwards.

## 14. Failure and conflict semantics

| Situation | Behavior |
|---|---|
| Any scheduling operation fails or the process dies mid-way | One Unit of Work: **no change** (Store Port atomicity); fault checkpoints (`sched-*`) prove pre-or-post only. |
| Precondition (revision) mismatch | Abort, no change; a learner operation reloads and re-asks, an engine write is dropped and recomputed. **Learner wins every race.** |
| Evidence committed but a fulfillment is missing | Impossible by construction (same UoW, §10); if a store is found inconsistent, `check_consistency` reports it. |
| Two pending suggestions / two active schedules for a slot | Impossible: partial unique indexes reject the commit (S-1, S-3). |
| Accepting or keeping a stale suggestion (the schedule's revision no longer equals `scheduleRev`, or the suggestion is no longer `pending`) | The decision aborts with **no change** (L-3); an explicit learner change has already closed the suggestion as `superseded` in its own Unit of Work, and the next sweep recomputes against the current revision. |
| Re-anchor would overlap the previous segment | Validator rejects (`SCHEDULE_REANCHOR_OVERLAP`), no change; engine proposals are clamped to `> previous date`. |
| Material removed | §9.4: kept as `unavailable`; engine-owned retired; user-owned never auto-removed. |
| Restore / import / migration after schedules exist | Scheduling Context travels in the archive (§15); a sweep re-plans; migrated evidence creates no schedule (§11.2). |
| Clock moved backwards/forwards, time-zone change | Derived states change, **no write**, no corruption (§6). |
| Schema newer than the build | The store refuses to open (existing foundation rule). |

## 15. Schema, projection and foundation requirements

For the implementation milestone (additive; nothing existing changes):

1. **One forward store migration** (schema 2 → 3) adding the five collections with the projections, hard FKs (`schedule_exception`, `schedule_fulfillment`, `schedule_suggestion`, `session_selection.schedule_id` → `schedule`; all `DEFERRABLE INITIALLY DEFERRED`) and the **partial unique indexes** of §7 (`ux_schedule_active_slot`, `ux_suggestion_pending`, `UNIQUE(session_collection, session_id)`), through the Foundation's catalog-owned migration mechanism (snapshot first, one transaction, refuses a failing upgrade).
2. **Catalog role `context`** (additive, beside canonical / metadata / retained / recovery-only): durable, archived and restored, included in the physical state hash, **excluded from the Evidence set**; `Catalog::domain_collections()` stays the evidence-domain view and the migration commit guard is unaffected.
3. **Archive:** scheduling context rows travel and restore with the existing archive format (no format change needed beyond including the collections; `check_consistency` runs on restore).
4. **Fault checkpoints** `sched-*` for the Unit-of-Work boundaries (create, move, decide, fulfillment-with-evidence, apply-plan), compiled only into test builds, following the `mig-*` precedent.
5. **No new WebView capability:** the WebView calls the same named Store Port commands; no schedule operation carries a path.

## 16. Invariants

| ID | Invariant |
|---|---|
| **L-1** Learner sovereignty | The engine never overwrites, moves or silently replaces a user-owned date; engine writes require the revision read while `owner = engine`. Any learner move/cancel makes the schedule user-owned in place; Create never touches an existing schedule. |
| **L-2** Learner authority on conflict | A conflict (any difference from the current active/display date) is resolved only by an explicit learner decision (O-7/O-8); the engine never decides for them. |
| **L-3** Learner wins races / no stale suggestion | A suggestion is bound to the schedule revision it was computed against; it can be accepted or kept only while that revision is current; every explicit learner change closes the pending suggestion as `superseded` in the same Unit of Work; the engine recomputes against the new revision and cannot re-nag without a new evidence id. |
| **S-1** Single active schedule | At most one `active` schedule per slot, enforced by the database; Create is defined only for an unoccupied slot. |
| **S-2** Authoritative new date | After a learner change the new date is the only authoritative date; the old date generates no Overdue and no occurrence. |
| **S-3** One pending suggestion | A suggestion is inert, at most one pending per schedule, and never a second schedule. |
| **S-4** No silent disappearance | Overdue occurrences are never dropped, moved or auto-cancelled by time or by the engine. |
| **S-5** Derived states | Due/Overdue/Scheduled are functions of `(data, today)` and are never stored. |
| **S-6** No duplicate debt | One session fulfills at most one occurrence; an occurrence is fulfilled at most once; fulfillment commits with the evidence. |
| **S-7** Recurrence identity | An occurrence is identified **only** by `(scheduleId, originalDate)`; `movedTo`/`displayDate` is never an identity or a key; segments never overlap; anything before a cut is unchanged. |
| **E-1** Evidence immutability | No scheduling/recommendation operation writes or alters Evidence; scheduling facts are sidecars. |
| **E-2** Scheduling is not evidence | No Reader treats a schedule, fulfillment, suggestion or selection as evidence of knowledge. |
| **R-1** Derived, replaceable | Recommendations are recomputed, never canonical, and carry an `algorithmVersion`. |
| **R-2** No score | No numeric mastery/priority value is computed, stored or displayed. |
| **R-3** Unknown ≠ negative | §12.2 holds for every signal. |
| **R-4** Determinism | Same snapshot and date ⇒ byte-identical recommendations and explanations. |
| **CAL-1** Calendar closure | Schedules contain only slot, owner, cadence, anchors, engine/cancellation metadata; no time, title, note, reminder, duration, budget, deadline or external reference field exists. |
| **M-1** Migration never mints debt | Migrated evidence never creates a schedule, suggestion or Overdue item. |

## 17. Automated verification contract

Implemented by the Learning Orchestration milestone; **not written by this ADR**. Pure-domain suites run in the Node test vehicle with a frozen injected clock; persistence suites run in the Rust harness against the real Store; CI thresholds follow the existing `QS_*` environment-variable convention. All fixtures are synthetic.

### 17.1 Learner sovereignty and single-active-schedule (L-1, L-2, S-1, S-2, S-3)

1. **Ownership matrix:** for every operation (O-1…O-8) × initial owner, the resulting owner and date match §8; the engine apply path against a user-owned schedule never alters its row (hash-compared) and only stores a suggestion.
2. **Racing writers:** engine apply versus learner move at every interleaving the harness can force (revision precondition): the learner's date always survives; the engine write is dropped and recomputed against the new revision.
3. **Database enforcement:** direct commits that create a second `active` schedule in a slot, a second `pending` suggestion, or a second fulfillment of one occurrence/session are rejected by the constraint (not by domain code).
4. **Conflict choice:** user date Oct 6 + engine date Oct 8 ⇒ exactly one active schedule after accept (anchor Oct 8, suggestion `accepted`) or keep (anchor Oct 6, suggestion `kept`); never two active dates, never Overdue from the discarded date. **Any** differing date is a conflict (a 1-day difference included); only an equal date is a no-op.
5. **Occupied slot:** Create in an occupied slot is refused with the existing schedule returned and **changes no row** (segments, exceptions, fulfillments, history hash-compared); a racing create is rejected by the partial unique index; cancel-then-create yields a **new schedule identity** while the old series' history is byte-identical.
5a. **Stale suggestion cannot apply:** a suggestion bound to revision *r*, then a learner move/re-anchor/cancel (O-2…O-5) ⇒ in that same Unit of Work the suggestion becomes `superseded` and the schedule revision advances; a later accept/keep of the old suggestion aborts with no change; killed at every `sched-*` checkpoint around it, the store is exactly pre (pending, old revision) or post (superseded, new revision).
5b. **Recompute after supersede:** the next sweep recomputes against the new revision; it creates a new suggestion only if the proposal differs from the new date **and** its basis contains an evidence id not covered by any `kept` or `superseded` suggestion of the schedule; with only already-covered evidence nothing is raised (no re-nag).
5c. **Learner-wins race:** engine apply/suggestion write versus learner move/cancel versus suggestion decision at every forced interleaving: no state with two active schedules, two pending suggestions, an applied stale suggestion, or an overwritten user date.

### 17.2 Recurrence edge cases (S-7)

6. **Expansion table:** committed expected occurrence lists for every cadence × anchor × `until` × window, including anchor = today, `until` = anchor, month ends, leap day, week cadence across a year boundary, large intervals, and DST-transition dates (dates are zone-free, asserted under several simulated zones).
7. **Move this only / this and future:** the Oct 3 → 6 → 9 → 12 example; the Oct 3 → 8 → 11 → 14 re-anchor example (Scope §7.7); an exception on an occurrence that a later this-and-future move replaces (exceptions at or after the cut are dropped, earlier ones kept); moving onto an occupied date and to the same date rejected; a new anchor that overlaps the previous segment rejected; moving beyond `until` handled per §7.4; multiple re-anchors in sequence.
8. **Property test (seeded):** random sequences of O-1…O-8 never violate S-1, S-3, S-6, S-7; occurrence identities stay unique; no occurrence before a cut changes.

### 17.3 Due/Overdue, cancel, reschedule (S-4, S-5)

9. **State table:** for every occurrence state × `today` offset (−2…+2 days around the date, clock moved backwards and forwards, midnight rollover) the derived state equals the §9.1 table with **zero writes** between evaluations.
10. **Missed schedules:** an unfulfilled schedule becomes Overdue and stays; the planner and sweep never move or drop it; start/reschedule/cancel are the only exits; the engine-owned-and-Overdue case yields a suggestion, not a move; the Overdue-enumeration cap reports `overdueTruncated` with the exact count.
11. **Old date after reschedule** never generates Overdue (S-2).

### 17.4 Completion and fulfillment (S-6)

12. **Linked and slot-match fulfillment** over the §10 matrix (Due, Overdue, future, early linked start, wrong intent/domain, cancelled/completed series, abandoned session); every case ends with exactly one fulfillment or none as specified.
13. **No duplicate debt:** after a completed session no occurrence it satisfied remains Due; one session never fulfills two occurrences; several Overdue occurrences stay individually Overdue.
13a. **Moved occurrence regression:** occurrence `(S, Oct 6)` moved to Oct 8, started from the schedule on Oct 8 and completed ⇒ the fulfillment id and `originalDate` are Oct 6, `session_selection.scheduleRef.originalDate` is Oct 6, `fulfilledOn` is the completion date; no record is keyed by Oct 8; the same session cannot fulfill a second occurrence; moving onto a date that already displays another unresolved occurrence is rejected; a slot-match completion of a moved occurrence resolves by `displayDate <= fulfilledOn` yet still writes `originalDate`; the keys survive an archive round trip.
14. **Atomicity:** kills at every `sched-*` checkpoint around session finalization leave exactly pre (no evidence, no fulfillment) or post (both), never evidence without fulfillment.

### 17.5 Evidence boundary and recommendation (E-1, E-2, R-1…R-4, M-1)

15. **Evidence immutability property:** run random scheduling operations and sweeps; the physical hash of every Evidence collection is unchanged (E-1). An architecture test proves Evidence modules do not reference scheduling collections and Readers do not read Scheduling Context as evidence (E-2).
16. **Unknown is not negative:** run the Recommender on a store migrated from the Migration fixtures (`r-full` with its origin gaps): no retry/recovery/"never retried"/"confident"/unscheduled-debt signal appears; `timestamp.absent` records yield no temporal relation; `legacy-only` entries are counted once and `twin` entries create no signal; a record with the same facts but a native (no-origin) record **does** yield the signal — the difference proves the rule is about recorded facts, not absence.
17. **Migration never mints debt (M-1):** import every fixture into a store with schedules; the sweep creates no schedule or suggestion from migrated evidence; Overdue count stays zero.
18. **Heterogeneity:** `unknown`, `uncertain`, `should_know` produce three distinct codes; Teacher commentary alone emits nothing; a Translation retry is `SUCCESSFUL_RECOVERY` only under §12.2 rule 4; Typing codes are reserved and never appear without a Typing Reader.
19. **No score (R-2):** the recommendation output schema is closed and contains no numeric ranking field; a static test rejects any numeric score/percent in the Recommender's output type.
20. **Determinism (R-4):** golden recommendation JSON for committed fixtures and a fixed date; identical bytes on repeat runs and under shuffled input order; no `Date.now`/`Math.random`/locale APIs in the pure modules (static test); explanation text renders from `(code, params)` and is identical across runs and locales for the code layer.
21. **Provenance:** a started recommended session stores the exact reasons that were shown; later algorithm or evidence changes leave the stored snapshot byte-identical; pointers are ids and survive archive create → restore.

### 17.6 Calendar closure and boundaries (CAL-1)

22. **Schema closure:** the validator rejects `time`, `reminder`, `notify`, `duration`, `budget`, `deadline`, `goal`, `exam`, `title`, `notes`, `location` and any unknown key on every scheduling record; no schedule can name an external event (the slot admits only a Quiz Studio material).
23. **Calendar projection:** `calendarView` returns exactly the §9.5 shape for a fixture of mixed series, exceptions, fulfillments and a pending suggestion; Today equals the same projection narrowed to the date.

### 17.7 Persistence, archive and recovery

24. **Archive round trip:** schedules, exceptions, fulfillments, suggestions and selections survive create → verify → restore with identical state hash; `check_consistency` clean.
25. **Upgrade:** the 2 → 3 migration preserves all existing data, refuses to run when forced to fail (store unchanged), and an older build refuses a newer store.
26. **Fault matrix:** every `sched-*` checkpoint (× repeat factor) and random kills during sweeps/decisions leave exactly pre or post.

## 18. Frozen-boundary conformance

| Frozen boundary (Scope) | How it is kept |
|---|---|
| Scheduling is not Evidence (§4.5) | separate collections, `context` role, E-1/E-2, evidence-hash property test |
| Learner sovereignty, one active schedule (§4.5.1, §7.4, §7.5) | ownership model, revision-bound suggestions (L-3), Create only for unoccupied slots, partial unique indexes, inert suggestions, O-7/O-8 |
| Recommendation derived, no mastery score (§4.4, §6) | pure recompute, tiers not scores, closed registry, R-1/R-2 |
| Heterogeneous evidence, unknown ≠ uncertain ≠ should_know (§4.2, §6.1) | per-domain Readers, three distinct codes, §12.2 |
| Calendar internal, date-level, Quiz Studio sessions only (§3.6, §7.3, §7.10) | closed schemas (CAL-1), slot = (domain, material, intent), date strings, no time/reminder/external fields |
| No FSRS, no mastery state machine, no AI (§7.1, §16, §19) | fixed interval ladder derived from fulfillment facts, no stored state, no model |
| No exact-time, reminders, notifications, daily budget, workload balancing, analytics (§7.10, §17) | no such fields or processes exist; the planner is not time-triggered |
| No deadline/exam context (§4.6, §18) | not representable; any future context stays Context, never Evidence |
| Simple recurrence, re-anchor, move this vs future, Overdue (§7.6–§7.9) | §7.4, O-3/O-4/O-7, §9.1 |
| Typing error is not a knowledge error (§4.8) | reserved Typing codes only from a Typing Reader, never cross-domain |
| Calendar is not a new learning domain (§3.6) | a projection of Scheduling Context inside Learning Orchestration |

## 19. Consequences, risks and honest limitations

- **One schedule per slot is restrictive.** A learner who wants Paper A Practice on two dates must use a recurrence or an occurrence exception, or cancel the series and create a new one; Create never overwrites an occupied slot. This is the cost of "no duplicate competing dates for the same intended session". If user testing shows otherwise it reopens one decision (a slot-level multiplicity), not the scope.
- **Engine-owned revisits are Practice-only and native-evidence-only.** This is conservative by design (M-1, §11.1); it means a freshly migrated library has recommendations but no automatic schedule until the learner practices in V2.
- **Segments make anchors history-preserving** at the price of a small piecewise model instead of a single anchor; the alternative (materializing occurrences) was rejected because it would store derivable data that could disagree with the cadence.
- **Parameter values are provisional** (§20); a change is a new `algorithmVersion`, never a rewrite of stored provenance.
- **Soft material and session references** keep Typing and future domains pluggable but are not database-enforced; `check_consistency` and the unavailable-material rule cover them.
- **Overdue volume** for very frequent cadences is truncated explicitly (§9.2) rather than hidden.
- **Domain integration is out of scope:** Readers are specified; the Objective/Translation/Typing integration milestone supplies the real session records and the Typing Reader.

## 20. Decisions reviewed at the Human Gate (outcome in §22)

None reopens Scope Freeze Revision 1. These are the engineering choices the Gate is asked to confirm or adjust:

| # | Decision | Alternative |
|---|---|---|
| P-1 | Slot = `(domain, material, intent)`; one active schedule per slot, enforced by the database; **Create only for an unoccupied slot** (§7.1, §7.7, O-1). *(Amended: the proposed replace-on-create is removed.)* | Allow several active schedules per slot with explicit grouping (more states, weaker "single active schedule"). |
| P-2 | Ownership flips in place; no separate engine row beside a user row (§8). | Two rows with a superseded link (breaks the one-row sovereignty proof). |
| P-3 | Suggestions apply to user-owned **and** Overdue engine-owned schedules whenever the proposed date **differs** from the current active/display date; equal is a no-op; suggestions are bound to the schedule revision (§7.5, §8, §11.4). *(Amended: `MATERIAL_DELTA_DAYS` is removed.)* | A minimum difference threshold (rejected: Scope §7.5 makes any different date a conflict). |
| P-4 | The engine plans from **native V2 evidence only**; migration never creates schedules (§11.2). | Let migrated difficulty seed revisits (risks an Overdue flood from history). |
| P-5 | The engine creates only Practice, `once` revisits on the **provisional, versioned, lightweight heuristic** ladder `[1,3,7,14,30]` days from the planning date; no claim of scientific optimality (§11.3). | Different ladder values/shape (a new `algorithmVersion`). |
| P-6 | A cancelled slot may be re-proposed only from evidence ids not in `cancellation.considered` (§11.4). | Never re-propose after a learner cancel. |
| P-7 | Fulfillment commits with the evidence; linked vs slot-match rules; an unlinked session never fulfills a future occurrence (§10). | Any matching session fulfills the next occurrence (can silently consume a planned future date). |
| P-8 | Definitions pinned to the V1 vocabulary: actionable Teacher Review = judgment `incorrect`/`partial`/`needs-review`; Translation recovery needs an all-`correct` Teacher Review; repeated incorrect = ≥ 2 distinct attempts (§12.2, §12.3). | Looser success inference (rejected by "unknown ≠ negative"). |
| P-9 | Reasons are grouped into three tiers, not scored; ties break by a stable key (§12.3). | An opaque weighted score (forbidden by Scope §6.2). |
| P-10 | New catalog role `context`, one store migration 2 → 3 (§15). | Reuse `canonical`/`metadata` (blurs the Evidence boundary in the catalog). |
| P-11 | `OVERDUE_ENUMERATION_CAP = 366` is an explicit projection-enumeration safety limit with explicit truncation; it never deletes any schedule or occurrence; the cap and the ladder are provisional versioned parameters (§9.2, §11). | Unbounded enumeration. |

## 21. Not authorized by this ADR

Accepting this ADR does not by itself start the Learning Orchestration + Calendar milestone: **implementation is NOT STARTED and awaits its own explicit authorization.** It also does not authorize schemas or code beyond the requirements of §15, Objective/Translation/Typing domain integration, Answer Explanation or Focused Practice, any change to a frozen scope item, or any touch of the V1 production line. Each remains a separate, explicitly authorized step (Scope §24).

## 22. Human Gate record — ACCEPTED, GO WITH AMENDMENT (2026-10-02)

The Product Owner accepted this ADR. **P-2, P-4, P-6, P-7, P-8, P-9 and P-10 are approved as written.** **P-5** is approved with its ladder `[1,3,7,14,30]` explicitly a *versioned, provisional, lightweight heuristic*, not claimed to be scientifically optimal. **P-11** is approved with the 366 cap defined as an explicit *projection enumeration safety limit* that never deletes any schedule or occurrence. **P-1 and P-3 are approved with the amendments below.** The four amendments are folded into the normative text above.

| # | Amendment | Where |
|---|---|---|
| A-1 | **Create never overwrites.** The Scheduling Slot and the database-level one-active-schedule invariant stay (P-1), but Create is defined only for a slot with no active schedule; an occupied slot returns the existing schedule and is changed only by explicit move / re-anchor / cancel; a full cadence change is cancel-then-create with a new schedule identity, so segments, exceptions, fulfillments and history are never rewritten by Create. | §1, §7.7, O-1, S-1, L-1, §17.1 items 5 |
| A-2 | **No minimum date difference.** `MATERIAL_DELTA_DAYS` and the "differs by less than 2 days is ignored" rule are removed: any engine date that differs from a user-owned or Overdue engine-owned schedule's current active/display date is a conflict needing the learner's choice; only an equal date is a no-op; repeat reminders are prevented solely by the covered-basis (no new evidence id ⇒ no nag) rule. | §1, §8, §11.4, P-3, L-2, §17.1 item 4 |
| A-3 | **Suggestions are bound to a schedule revision.** `schedule_suggestion.scheduleRev` records the revision it was computed against; accept/keep verify it; every explicit learner change (and every schedule-row write) closes the pending suggestion as `superseded` in the same Unit of Work; the sweep recomputes against the new revision; kept and superseded bases are both covered for anti-nagging. Added to the learner-wins-race invariants (L-3) and the conflict/race tests. | §7.5, §8, §11.4, §14, L-3, §17.1 items 5a–5c |
| A-4 | **One occurrence identity.** The only identity is `(scheduleId, originalDate)`; `movedTo`/`displayDate` is never an identity or a key. `occurrenceDate` is renamed `originalDate` in `schedule_fulfillment`, `session_selection.scheduleRef`, calendar entries and `schedule_suggestion.targetOriginalDate`; a moved-occurrence fulfillment/provenance regression case is added. | §3, §7.3, §7.5, §7.6, §7.8, S-7, §17.4 item 13a |