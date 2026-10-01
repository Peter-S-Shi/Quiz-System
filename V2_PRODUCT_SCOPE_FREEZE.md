# Quiz Studio V2 — Product Scope Freeze

**Status:** FROZEN — Revision 1  
**Original Freeze Date:** 2026-10-01  
**Revision Date:** 2026-10-01  
**Revision:** Calendar Scheduling Surface scoped amendment  
**V1 Baseline:** `main@787fc5a9f8e5ff55826d05e5a1ca98781719e52e`  
**V1 Release:** `v1.0.0`

---

## 1. Purpose

This document freezes the product scope of Quiz Studio V2.

Feature discovery for V2 Core is complete.

From this point forward, implementation work should not reopen product scope unless new evidence reveals a material usability, data-integrity, migration, accessibility, or architectural problem.

New ideas that do not invalidate the frozen product model should be recorded for later evaluation rather than inserted into the active V2 implementation path.

### 1.1 Post-Freeze Scoped Amendment — Calendar Scheduling Surface

After the original freeze, a focused Socratic scope audit identified a material usability gap:

> V2 already owns future scheduling semantics, but a Today-centered surface alone leaves the learner with insufficient temporal visibility and insufficient direct control over future study arrangements.

Revision 1 therefore adds a **Calendar Scheduling Surface** to V2 Core.

This is a bounded extension of the existing Learning Orchestration / Scheduling system. It does **not** reopen:

- Goal / Exam planning;
- workload planning;
- daily study-budget planning;
- external calendar events;
- reminders / notifications;
- general-purpose calendar functionality.

The Calendar exists to expose and edit Quiz Studio’s own future learning schedules while preserving learner control.

---

## 2. Product Thesis

> **Quiz Studio V2 evolves from a collection of learner-selected practice tools into a local-first desktop learning workspace that can transform preserved learning evidence into explainable next-practice recommendations, while keeping the learner in control.**

Chinese product statement:

> **Quiz Studio V2 从“由学习者自行选择工具与材料进行练习”，升级为“能够利用既有学习证据生成可解释的下一步练习建议、同时保持学习者最终控制权的本地优先学习工作空间”。**

Core principle:

> **Engine recommends; learner remains sovereign.**

Quiz Studio may recommend what deserves attention and explain why.

It must not turn learning into an opaque algorithm-controlled feed.

---

## 3. V2 Product Structure

V2 consists of three primary product/engineering systems, one new learning-content capability, one cross-domain UX requirement, and one first-class scheduling surface.

### 3.1 Desktop Foundation

Quiz Studio becomes a normal installed desktop application with durable local data ownership.

V2 desktop productization means mainstream desktop parity, not maximal native-platform integration.

### 3.2 Learning Orchestration

Preserved learning evidence feeds lightweight scheduling and explainable recommendations.

The system helps answer:

> **What may be worth practicing next, and why?**

Recommendations remain non-authoritative.

### 3.3 Learning Task Domains

V2 recognizes three first-class learning task domains:

```text
Task Domain
├─ Objective
├─ Translation
└─ Typing
```

The domains may share session infrastructure, scheduling, recommendation, history, and focused-practice surfaces.

Their evidence semantics must remain distinct.

### 3.4 Objective Answer Explanation

Objective questions may contain an optional answer explanation.

Explanation is learning content, not learning evidence.

### 3.5 Focused Practice Surface

Active learning sessions should provide a dedicated answering/practice surface that minimizes unrelated application distractions.

Focused Practice is a UX property shared across domains.

It is not a separate canonical application mode.

### 3.6 Calendar Scheduling Surface

V2 includes a first-class Calendar surface for Quiz Studio learning schedules.

The Calendar exists to answer:

> **What learning sessions are scheduled beyond today, and how do I want to arrange them?**

The Calendar is part of Learning Orchestration.

It is **not**:

- a general-purpose calendar;
- a Goal / Exam planner;
- a workload planner;
- a reminder system;
- a deadline manager.

Calendar scheduling remains learner-controlled.

---

# 4. Core Architectural Principles

## 4.1 Evidence is canonical; interpretation is replaceable

Historical learning evidence must survive changes to scheduling and recommendation algorithms.

Derived interpretations must never overwrite canonical evidence.

## 4.2 Preserve heterogeneous evidence semantics

Objective performance, learner metacognition, teacher review, translation production, retry/remediation, and typing performance represent different kinds of evidence.

They must not be flattened into a universal low/high-confidence model.

## 4.3 No mandatory universal `EvidenceRecord`

V2 does **not** require a universal persisted `EvidenceRecord` entity.

Canonical learning evidence should remain preserved by its native evidence-bearing records, such as:

- objective results;
- Learner Responses;
- metacognitive annotations;
- Teacher Reviews;
- Retry lineage;
- Typing Attempts.

“Evidence” is a canonical semantic layer, not necessarily a database table.

## 4.4 Recommendation is derived

Recommendations may be recalculated from canonical evidence and scheduling context.

V2 does **not** require a permanent log of every recommendation generation, reranking, or refresh.

When a learner acts on a recommendation, the resulting selection/session may preserve sufficient provenance to answer:

> Why did this item appear in this session?

Example:

```text
Selection
source: recommended

reason:
- PREVIOUS_INCORRECT
- SCHEDULED_REVIEW_DUE

algorithmVersion: v1
```

## 4.5 Scheduling is not evidence

`dueAt`, revisit intervals, recurrence rules, user-scheduled dates, and related scheduling facts describe when something should reappear or when the learner intends to practice.

They do not describe what the learner knows.

Scheduling facts may change without rewriting canonical learning evidence.

### 4.5.1 Learner ownership of active schedules

V2 distinguishes between:

- engine-derived scheduling;
- user-authored scheduling.

Engine-derived schedules may be recalculated from new evidence while they remain engine-owned.

Once the learner explicitly creates or changes a schedule, that active schedule becomes user-owned.

The engine must not silently overwrite a user-owned date.

If new evidence produces a materially different engine recommendation, Quiz Studio should present the competing dates and ask the learner which date to use.

Only one active schedule should result from that decision; the product should not create duplicate competing dates for the same intended session.

## 4.6 External deadlines are outside V2 Core

V2 Calendar does not accept external events such as:

- exams;
- assignments;
- appointments;
- personal calendar events;
- external deadlines.

If a future version introduces scoped deadline context, it remains Context, not Evidence.

A future deadline must never manufacture weakness or overwrite learning evidence.

## 4.7 Explanation is Content, not Evidence

Objective answer explanations belong to question content.

They do not affect grading, scheduling, recommendation priority, or mastery.

## 4.8 Typing Error is not Knowledge Error

Typing/transcription performance belongs to the Typing domain.

A typing mistake must not automatically imply that the learner does not understand the word, sentence, concept, or language knowledge involved.

---

# 5. Desktop Productization — KEEP / V2 Foundation

V2 must reach the normal product lifecycle quality expected from a mature contemporary desktop application.

Expected lifecycle:

```text
Download
→ Install
→ Launch
→ Learn
→ Persist
→ Close
→ Resume
→ Backup / Restore
→ Upgrade
→ Existing data remains intact
```

## 5.1 Required Desktop Baseline

V2 Core requires:

- formal Windows installation;
- stable application identity, icon, and version;
- independent application launch;
- no requirement for the user to manually run Python;
- no user-facing localhost workflow;
- no browser-origin dependency for canonical user data;
- offline core operation;
- formal per-user application-data location;
- durable structured learning data;
- durable local media storage;
- native file open/save flows where appropriate;
- import/export;
- complete local backup/restore;
- abnormal-exit resilience;
- active-session recovery where feasible;
- upgrades that preserve user data;
- normal uninstall behavior;
- clean-install testing;
- upgrade-path testing;
- migration testing.

## 5.2 V1 → V2 Migration

V1 migration is a mandatory V2 release gate.

The canonical migration bridge is an explicit V1 backup/export.

V2 must not silently scrape browser profiles or browser storage.

Migration should follow:

```text
V1 Backup
→ Read-only intake
→ Schema detection
→ Structural validation
→ Referential-integrity validation
→ Staging migration
→ Media/reference validation
→ Semantic audit
→ User preview
→ Atomic activation
```

The original V1 backup remains untouched.

Migration must preserve relevant:

- IDs;
- timestamps;
- question/material snapshots;
- learner answers;
- metacognitive annotations;
- Teacher Reviews;
- review-response relationships;
- retry/remediation lineage;
- media references.

Silent data discard is prohibited.

## 5.3 Desktop Technology Is Not Product Scope

The following are **not** frozen product requirements:

- Tauri;
- Electron;
- Neutralino;
- SQLite;
- any specific desktop database engine.

Framework and storage technology must be decided through architecture work.

Current candidate direction may include Tauri + SQLite + filesystem media, but this remains subject to a bounded implementation spike and ADR.

---

# 6. Learning Orchestration — KEEP / V2 Core

The learning-orchestration loop is:

```text
Learning Content
        ↓
Practice / Test
        ↓
Canonical Evidence
        ↓
Remediation Semantics
        ↓
Lightweight Scheduling
        ↕
Calendar Scheduling Surface
        ↓
Explainable Recommendation
        ↓
Manual / Recommended Selection
        ↓
Next Practice / Test
        ↓
New Evidence
        ↺
```

## 6.1 Practice Priority / Recommendation Engine

V2 keeps an explainable Recommendation Engine.

It does **not** establish a canonical weighted mastery score.

Relevant signals may include:

- objective incorrect result;
- repeated objective failure;
- learner `uncertain`;
- learner `should_know`;
- learner `unknown`;
- actionable Teacher Review;
- unresolved remediation;
- Retry lineage;
- successful recovery;
- scheduled revisit becoming due.

Semantics must remain distinct.

In particular:

```text
unknown ≠ uncertain ≠ should_know
```

Teacher commentary does not automatically become remediation.

Successful retry reduces current urgency but does not erase historical evidence.

Age alone does not create urgency.

Time affects recommendations through scheduling semantics.

## 6.2 Recommendation Contract

> **Practice Priority / Recommendation consumes preserved learning evidence and scheduling context to produce explainable, non-authoritative next-practice recommendations. Derived priority must never overwrite canonical learning evidence.**

Recommendations should expose human-readable reasons.

When an engine-derived scheduling suggestion conflicts with a user-owned schedule, the system should negotiate rather than silently overwrite:

```text
Current user schedule
        +
Engine-suggested date
        ↓
Explicit learner choice
        ↓
One active schedule
```

The learner remains the final authority over the active user-owned date.

V2 must not present a mysterious universal value such as:

```text
Mastery: 78%
```

as canonical learning truth.

---

# 7. Lightweight Scheduled Revisit + Calendar Scheduling Surface — KEEP + ADD

V2 Core includes lightweight scheduled revisit and a first-class Calendar Scheduling Surface.

## 7.1 Scheduled revisit purpose

```text
difficulty
→ remediation
→ recovery
→ wait
→ retrieve again
→ new evidence
```

Core engine scheduling needs to support:

- future revisit date;
- Due / Overdue recognition;
- adjustment of the next revisit from new evidence;
- explainable revisit reasons.

Example:

```text
Previously needed remediation
·
Scheduled review is due
```

Advanced statistical memory modeling is not required for V2 Core.

FSRS is deferred.

## 7.2 Calendar purpose

The Calendar solves the temporal-visibility problem created by a Today-only view.

It lets the learner:

- inspect future Quiz Studio learning schedules;
- see which learning sessions are scheduled on which dates;
- inspect Due / Overdue items;
- directly reschedule an existing scheduled session;
- manually schedule a currently unscheduled learning material for a future date.

The Calendar is an editable scheduling surface, not merely a read-only projection.

## 7.3 Manual scheduling contract

A manual Calendar schedule is date-level only.

The minimum manually scheduled session contract is:

```text
date
+
material
+
Task Domain
+
Intent: Practice / Test
```

Manual scheduling does **not** require:

- exact clock time;
- estimated duration;
- question-count budget;
- daily workload target;
- automatic workload balancing;
- reminder / notification.

The learner may create a future session even when the engine has not created a revisit for that material.

## 7.4 User rescheduling authority

If the learner changes an existing scheduled date:

> **the new date becomes the current authoritative active schedule.**

The old date must not continue to generate Overdue status merely because it was previously suggested by the engine.

Changing a schedule changes scheduling context only.

It does not rewrite learning evidence.

## 7.5 Engine / user scheduling conflict

If new evidence causes the engine to recommend a different date from a user-owned active schedule:

- the engine must not silently overwrite the learner;
- the engine must not create a second competing active schedule;
- Quiz Studio should present both candidate dates;
- the learner chooses which date becomes active.

Conceptually:

```text
User schedule: Oct 6
Engine suggestion: Oct 8
        ↓
Choose Oct 6 / Choose Oct 8
        ↓
One active schedule
```

## 7.6 Simple recurrence

V2 Calendar supports simple user-authored recurrence for learning sessions.

Examples may include:

- every N days;
- weekly;
- other similarly simple bounded recurrence patterns.

V2 does not require a full general-purpose recurrence grammar.

Recurring schedules remain user-authored learning strategy, not canonical learning evidence.

## 7.7 Recurrence re-anchoring

If an engine conflict is presented and the learner accepts the engine-suggested date for a recurring schedule:

> **the accepted date becomes the new recurrence anchor.**

Future occurrences are recalculated from that new anchor using the existing cadence.

Example:

```text
Original:
Oct 3 → Oct 6 → Oct 9 → Oct 12
every 3 days

Learner accepts engine suggestion:
Oct 8

Result:
Oct 3 → Oct 8 → Oct 11 → Oct 14
```

## 7.8 Manual movement of a recurring occurrence

When the learner manually moves one occurrence of a recurring schedule, Quiz Studio should ask:

```text
Move this occurrence only
or
Move this occurrence and future occurrences
```

If the learner chooses **this occurrence only**:

- the moved item becomes a one-off exception;
- the remaining recurrence keeps its existing anchor.

If the learner chooses **this occurrence and future occurrences**:

- the new date becomes the new anchor;
- future occurrences are recalculated from that anchor.

The product must not guess which behavior the learner intended.

## 7.9 Missed schedules

If a scheduled session passes without completion:

> **it becomes Overdue.**

It must not:

- silently disappear;
- automatically move itself to another date.

The learner may then:

- start it;
- reschedule it;
- cancel it.

Overdue is a factual scheduling state, not a punishment or gamification mechanic.

## 7.10 Calendar non-goals

V2 Calendar does not include:

- external events;
- exam dates;
- assignment deadlines;
- personal appointments;
- cross-application calendar sync;
- exact-time scheduling;
- reminders;
- desktop notifications;
- workload planning;
- daily study-budget planning;
- automatic workload balancing;
- Goal / Exam planning.


---

# 8. Session Composition — KEEP

V2 does not create a canonical Study Mode Router.

Session behavior is composed from orthogonal dimensions.

Conceptually:

```text
Selection
├─ Manual
└─ Recommended

Intent
├─ Practice
└─ Test

Task Domain
├─ Objective
├─ Translation
└─ Typing

Lineage
└─ optional Retry relationship

Session Policy
├─ feedback timing
├─ item selection
├─ ordering
└─ domain-specific constraints
```

This prevents Mode Zoo proliferation.

Therefore concepts such as:

- Today Mode;
- Retry Mode;
- Translation Mode;
- Typing Mode;
- Needs-Work Mode;
- Evidence Mode;

must not automatically become canonical domain enums merely because they appear as product entry points or UI labels.

---

# 9. Objective Domain — KEEP + MATURE

V2 preserves the existing objective-practice capabilities and five objective question types.

Objective Practice continues to support:

- grading;
- Instant feedback;
- Submit-at-End feedback;
- media;
- recovery;
- wrong-question remediation;
- Retry lineage where applicable.

---

# 10. Objective Answer Explanation — ADD / V2 Core

All objective question types may contain an optional textual explanation.

Conceptually:

```text
Question
├─ Prompt
├─ Correct Answer
└─ Explanation? 
```

Explanation is optional for backward compatibility.

## 10.1 Instant Feedback

```text
Answer
→ Submit item
→ Grade
→ Correct answer becomes available
→ Explanation becomes available
```

Explanation may be shown whether the learner answered correctly or incorrectly.

## 10.2 Submit-at-End

Before whole-paper submission:

- grading feedback remains hidden;
- correct answers remain hidden;
- explanations remain hidden.

After submission:

```text
Submit paper
→ Grade
→ Results / Review
→ Correct answers + explanations available
```

No explanation leakage is permitted before the configured grading point.

## 10.3 Historical Integrity

Finalized attempts preserve the question snapshot, including the explanation that existed at attempt time.

Changing the source question later must not silently rewrite historical attempt content.

## 10.4 Non-goals

Answer Explanation does not automatically expand into:

- Hint systems;
- knowledge-point graphs;
- video explanation systems;
- AI explanation generation;
- citation systems;
- difficulty modeling.

---

# 11. Translation Domain — STRONG KEEP

Translation remains a first-class Task Domain and one of Quiz Studio’s defining workflows.

V2 preserves:

- immutable learner response;
- sentence translation;
- learner metacognitive annotation;
- `unknown`;
- `uncertain`;
- `should_know`;
- Teacher Review;
- multiple reviews;
- rich corrections;
- review history;
- retry/remediation lineage;
- evidence inspection;
- portable interchange.

Translation evidence must not be collapsed into objective correctness semantics.

---

# 12. Typing Practice — ADD / V2 Core

Typing Practice becomes a first-class Task Domain at the same architectural level as Translation.

```text
Task Domain
├─ Objective
├─ Translation
└─ Typing
```

V2 Typing is deliberately scoped as **copy typing practice**, not a complete typing-tutor platform.

Primary interaction:

```text
Reference Text
→ Keyboard transcription
→ Compare
→ Feedback
→ Result
→ Retry / Scheduled Revisit
```

## 12.1 Typing Evidence

Typing may preserve facts such as:

- reference-text snapshot;
- final committed text;
- start/completion timestamps;
- duration;
- committed grapheme count;
- error locations/spans;
- corrected vs unresolved typing errors where useful;
- Retry lineage.

Accuracy, CPM, WPM, and similar metrics may be derived from canonical attempt facts rather than treated as universal learning truth.

Raw permanent keydown/keyup streams are not required and should not be retained by default.

## 12.2 Typing Evidence Semantics

Typing evidence represents transcription/typing performance.

It must not automatically become:

- vocabulary mastery evidence;
- concept mastery evidence;
- translation evidence;
- objective correctness evidence.

Example:

```text
environment → enviroment
```

may produce typing/transcription evidence.

It must not automatically produce:

```text
Learner does not know "environment"
```

## 12.3 Practice Intent

Typing + Practice may provide live comparison/feedback while the learner types.

Corrections may be permitted according to session policy.

## 12.4 Test Intent

Typing + Test must not leak correctness before submission/completion.

During Test, the interface may communicate progress without revealing whether committed text is correct.

After completion, the learner may inspect differences and results.

## 12.5 Retry and Scheduling

Typing reuses existing Retry lineage and lightweight scheduling concepts.

Possible explainable recommendation reasons include domain-specific semantics such as:

```text
TYPING_ERRORS_REMAIN
TYPING_REVISIT_DUE
```

Typing recommendations remain recommendations.

They do not become general knowledge judgments.

## 12.6 Long-Text Practice

Long-form Typing Practice must support continuous reading/typing without forcing the learner to manually chase the active sentence.

The practice surface should support:

- natural word wrapping;
- stable layout during continued typing;
- continuous indication of the current typing position;
- automatic active-position following;
- completed preceding text moving upward/out of the active viewport as progress continues;
- preservation of a comfortable visible context around the active line;
- no disruptive layout jumps;
- no caret loss;
- no unexpected focus loss;
- no reference/input desynchronization;
- reliable behavior for long passages.

The exact visual mechanism is not frozen here.

This is a behavioral UX requirement.

## 12.7 International Text Correctness

Typing implementation must not assume one Unicode code point equals one visible character.

Comparison/scoring must account for appropriate Unicode grapheme handling and normalization.

IME composition must not be scored as committed learner input before composition is finalized.

Architecture must not assume Latin-only keyboard input.

## 12.8 Typing Non-goals

V2 Core does not include:

- full touch-typing curriculum;
- home-row teaching system;
- adaptive weak-key training;
- per-key behavioral profiling;
- permanent raw keystroke telemetry;
- multiplayer typing race;
- public leaderboard;
- XP/typing gamification;
- AI typing coach;
- Dictation as part of Typing;
- Translation disguised as Typing.

Dictation, if considered later, requires its own product decision.

---

# 13. Focused Practice Surface — KEEP / CROSS-DOMAIN UX REQUIREMENT

V1 already contains a dedicated practice surface.

V2 preserves and matures this pattern.

During active learning, the interface should prioritize the current learning task and minimize unrelated:

- authoring controls;
- library management;
- global administration;
- configuration distractions.

Focused Practice must retain necessary:

- progress;
- question/material context;
- answer/input controls;
- permitted feedback;
- navigation;
- submission;
- safe exit;
- session recovery.

This applies across:

```text
Objective
Translation
Typing
```

Focused Practice is not a canonical `ImmersiveMode`.

The implementation may use reduced chrome, navigation changes, fullscreen affordances, or other design solutions, but those choices belong to the Design Lane.

---

# 14. Evidence History & Learning Feedback — KEEP

V2 keeps Evidence History and actionable learning feedback.

Evidence History should allow the learner to understand relevant questions such as:

- What did I answer?
- What was incorrect?
- What uncertainty did I mark?
- What did the teacher say?
- Did I retry it?
- What happened after the retry?
- Why is this being recommended again?
- What happened in a previous Typing attempt?

Session outcomes may show appropriate factual results such as:

```text
17 / 20 correct
```

or Typing accuracy/duration.

This does not require a standalone Analytics product.

---

# 15. OTI — STRONG KEEP

Open Teaching Interchange remains a product and architectural asset.

V2 preserves the ability to exchange learning materials/evidence with external human or machine-assisted workflows through explicit portable contracts.

V2 Core itself remains AI-independent.

OTI must not require:

- embedded AI;
- API keys;
- cloud accounts;
- a specific model provider.

---

# 16. AI — CUT FROM V2 PRODUCT SCOPE

V2 Core contains no embedded AI product subsystem.

CUT:

- built-in AI teacher;
- AI chat;
- model selector;
- API-key management;
- AI question generation;
- AI explanation generation;
- AI mastery calculation;
- AI recommendation truth;
- AI scheduling;
- authoritative AI translation grading.

External AI may still interact with exported/OTI-compatible material outside the core product.

The application itself must not depend on AI or network access to function.

---

# 17. Analytics — PRODUCT SYSTEM CUT

V2 does not build:

- `AnalyticsService`;
- `MetricsRepository`;
- `TrendEngine`;
- standalone Analytics Dashboard.

KEEP near the action:

- session outcomes;
- Due / Overdue;
- Needs Attention;
- repeated difficulty reasons;
- unresolved Teacher Review;
- Evidence History;
- recovery history;
- Typing attempt results.

DEFER:

- accuracy trends;
- uncertainty trends;
- recovery-rate KPI;
- longitudinal typing trends.

CUT / DEFER:

- generic study-time dashboards;
- streak systems.

---

# 18. Goal / Exam System — CUT FROM CORE

V2 does not establish a full Goal/Exam subsystem.

CUT from Core:

- target score;
- workload planner;
- daily study-budget planner;
- large goal-management architecture.

V2 Calendar does not accept external exam dates, assignment deadlines, appointments, or other non-Quiz-Studio events.

A future version may separately revisit scoped Deadline Context, but that is outside V2 Core and outside the V2 Calendar contract.

If later introduced, Deadline remains Context, not Evidence.

Exam Simulation, if later required, should be modeled as Test session policy rather than a new canonical learning domain.

---

# 19. Mastery Model — CUT

V2 does not establish:

- canonical Mastery Score;
- persistent `New → Learning → Fragile → Stable → Due` state machine;
- universal knowledge percentage.

Labels shown in the UI may be replaceable projections.

They must not become canonical learning truth unless a future product decision explicitly changes this rule.

---

# 20. Gamification — CUT

V2 Core does not require:

- XP;
- coins;
- public leaderboards;
- competitive rankings;
- streak-loss pressure;
- reward-economy architecture.

The product should support learning continuity without manufacturing anxiety or engagement loops for their own sake.

---

# 21. Deferred / Later Capabilities

The following are explicitly outside V2 Core unless separately reopened:

### LATER

- optional scoped Deadline Context, outside V2 Calendar;
- exact-time scheduling / reminder notifications, if separately justified;
- desktop ergonomics beyond baseline parity.

### DEFER

- advanced FSRS/statistical memory scheduling;
- trend analytics;
- recovery KPIs;
- full workload planning;
- multi-window desktop workflows;
- cloud synchronization;
- accounts;
- adaptive keyboard pedagogy;
- longitudinal Typing analytics.

### CUT FROM CURRENT V2

- Embedded AI;
- canonical Mastery Score;
- canonical Learning State Machine;
- full Goal/Exam subsystem;
- general-purpose calendar / external-event manager;
- workload planner / daily study-budget planner;
- Study Mode Router / Mode Zoo;
- Analytics Dashboard;
- XP/streak/leaderboard gamification;
- browser-profile scraping migration;
- permanent raw-keystroke telemetry.

---

# 22. Design Lane

Product Scope Freeze does not freeze final visual appearance.

Final visual design remains owned by:

```text
User
+
CC / Claude Code Design
+
Human Design Gate
```

Product/architecture work supplies:

- functional constraints;
- workflow requirements;
- semantic invariants;
- desktop constraints;
- accessibility requirements;
- competitor/reference inputs;
- V1 evidence;
- Focused Practice requirements.

It should not prematurely dictate:

- sidebar appearance;
- card-vs-flat layout;
- exact navigation chrome;
- exact paper-metaphor strength;
- final typography;
- final color system;
- final motion language.

## 22.1 V2 Default Theme Candidate

The Typing Practice HTML prototype introduced a warm, restrained palette based around:

- warm off-white background;
- paper white surfaces;
- dark ink text;
- restrained blue interaction color;
- low-saturation green success feedback;
- low-saturation red correction/error feedback.

User evaluation of this direction is strongly positive.

Therefore:

> **The Typing Demo palette is a strong candidate input for the V2 default theme.**

This is a Design Input, not a frozen global visual specification.

The final adoption and exact color values belong to the Design Lane and Human Design Gate.

---

# 23. V2 Release Gates

A V2 release candidate must not be accepted solely because individual features function.

At minimum, release readiness must demonstrate:

### Desktop

- clean installation;
- normal application launch;
- offline core operation;
- durable local storage;
- backup/restore;
- native file workflows;
- upgrade without data loss.

### Migration

- valid V1 backup import;
- historical semantic preservation;
- Teacher Review preservation;
- Translation evidence preservation;
- Retry lineage preservation;
- media/reference integrity;
- no silent data loss;
- migration failure does not destroy source data.

### Learning Orchestration

- explainable recommendations;
- no canonical mastery fabrication;
- scheduling separated from evidence;
- recommendation separated from evidence;
- learner can choose Manual vs Recommended selection.

### Calendar Scheduling

- future Quiz Studio schedules are visible beyond Today;
- learner can directly reschedule an existing session;
- learner can manually schedule an unscheduled material as a future Practice / Test session;
- manually changed dates become the authoritative active schedule;
- engine/user date conflicts require explicit learner choice;
- no duplicate active schedule is created by a conflict;
- simple recurrence works;
- accepting a new date can re-anchor future recurrence;
- recurring-item manual movement offers `this occurrence only` vs `this and future`;
- missed sessions become Overdue rather than disappearing or auto-shifting;
- Calendar remains date-level only;
- no external events, exam dates, reminders, notifications, workload planning, or daily study-budget planning are introduced.

### Objective Explanation

- all five objective question types support optional explanation;
- Instant timing is correct;
- Submit-at-End does not leak explanation;
- historical snapshots preserve explanation.

### Translation

- immutable learner evidence preserved;
- metacognitive semantics preserved;
- Teacher Review preserved;
- Retry lineage preserved;
- OTI remains functional.

### Typing

- copy-typing session works reliably;
- Practice and Test policies remain distinct;
- long-text word wrapping works;
- active typing position remains visible;
- long passages do not produce disruptive layout/focus problems;
- IME committed-text handling is correct;
- Unicode/grapheme handling is tested;
- typing errors remain semantically isolated from knowledge evidence;
- Retry/history/scheduled revisit integrate correctly.

### Focused Practice

- active learning minimizes unrelated UI competition;
- keyboard operation remains usable;
- resize does not break active sessions;
- accessibility requirements are respected;
- safe exit/recovery works.

---

# 24. Architecture and Implementation Sequence

Product Scope Freeze is now complete.

The next sequence is:

```text
Feature Grill Closure
        ↓
PRODUCT SCOPE FREEZE
        ↓
Desktop Runtime & Application Data ADR
        ↓
Bounded Desktop Implementation Spike
        ↓
Desktop Architecture Gate
        ↓
Create V2 Development Branch
        ↓
Desktop Foundation
        ↓
V1 Migration ADR
        ↓
Migration Milestone
        ↓
Scheduler / Recommendation / Calendar ADR
        ↓
Learning Orchestration + Calendar Milestone
        ↓
Task-Domain Integration
(Objective / Translation / Typing)
        ↓
Answer Explanation + Focused Practice
        ↓
Approved UI Integration
        ↓
Hardening
        ↓
Packaged RC
        ↓
Clean Install / Migration / Upgrade Smoke
        ↓
V2 Acceptance
```

Important sequencing rule:

> **An ADR must precede the implementation it constrains. Not every future ADR must precede creation of the entire V2 development branch.**

Therefore:

- Desktop ADR gates Desktop Foundation.
- Migration ADR gates Migration implementation.
- Scheduler/Recommendation/Calendar ADR gates Learning Orchestration and Calendar scheduling implementation.

The V2 development branch should be created after the Desktop Architecture Gate passes and the first real V2 repository modification is ready.

---

# 25. Parallel Design Sequence

Design may proceed in parallel after Product Scope Freeze and once relevant desktop constraints are known.

```text
Product Scope Freeze
        +
Desktop Constraints
        ↓
Design Input Package
        ↓
CC + Claude Code Design Exploration
        ↓
Human Design Gate
        ↓
Approved V2 UI System
        ↓
Implementation Integration
```

Design exploration must not silently modify frozen product semantics.

---

# 26. Scope Change Rule

After this document is accepted, new ideas should default to:

```text
Does this invalidate a frozen product assumption?
        │
   ┌────┴────┐
   │         │
  YES        NO
   │         │
Reopen      Preserve current
specific    architecture;
decision    record idea for later
```

A new request should not automatically change V2 architecture merely because it is useful or interesting.

Reopening scope requires a concrete reason such as:

- current design cannot support a required workflow;
- migration/data integrity would be compromised;
- accessibility requires a product-level change;
- user testing invalidates a frozen assumption;
- architecture makes an accepted Core capability impractical;
- a newly discovered dependency materially changes feasibility.

Otherwise, preserve the frozen route.

---

# 27. Frozen V2 Core Summary

Quiz Studio V2 Core is:

```text
LOCAL-FIRST DESKTOP WORKSPACE

Desktop Foundation
├─ installed desktop application
├─ durable local ownership
├─ backup / restore
├─ native file interaction
├─ crash/session resilience
└─ reliable V1 migration

Learning Orchestration
├─ canonical heterogeneous evidence
├─ remediation semantics
├─ lightweight scheduled revisit
├─ Calendar Scheduling Surface
│  ├─ future schedule visibility
│  ├─ manual scheduling / rescheduling
│  ├─ simple recurrence
│  ├─ Due / Overdue
│  └─ learner-resolved engine conflicts
├─ explainable recommendation
├─ Manual / Recommended selection
└─ Practice / Test intent

Task Domains
├─ Objective
│  └─ optional Answer Explanation
│
├─ Translation
│  ├─ metacognition
│  ├─ Teacher Review
│  └─ Retry lineage
│
└─ Typing
   ├─ copy typing
   ├─ accuracy / duration / derived speed
   ├─ long-text active following
   ├─ IME / Unicode correctness
   └─ Retry / scheduled revisit

Cross-domain
├─ Focused Practice Surface
├─ Evidence History
├─ Session Outcome
└─ OTI
```

V2 Core is deliberately **not**:

```text
AI platform
Analytics platform
Goal-management platform
Gamification platform
Cloud SaaS
Typing-tutor curriculum
Mastery-scoring engine
Mode-heavy study application
General-purpose calendar
Goal / Exam / workload planner
Reminder / notification system
```

---

# 28. Final Freeze Statement

> **Quiz Studio V2 is a local-first desktop learning workspace built around durable learning evidence, explainable next-practice recommendations, learner-controlled calendar scheduling, and learner sovereignty. It preserves the strongest V1 workflows, establishes reliable desktop data ownership and V1 continuity, adds lightweight scheduled revisit, a date-level Calendar Scheduling Surface with manual scheduling/rescheduling and simple recurrence, objective-answer explanations, and first-class copy-typing practice, while refusing unnecessary mastery scoring, analytics dashboards, embedded AI, Goal/Exam/workload planning, general-purpose calendar behavior, reminders, mode proliferation, gamification, and cloud dependency.**

The product scope described in this document is now **FROZEN**.

Further work proceeds through architecture ADRs, bounded implementation spikes, milestone implementation, design validation, migration validation, and release hardening—not continued open-ended feature discovery.