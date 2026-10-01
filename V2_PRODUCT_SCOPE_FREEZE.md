# Quiz Studio V2 — Product Scope Freeze

**Status:** FROZEN  
**Freeze Date:** 2026-10-01  
**V1 Baseline:** `main@787fc5a9f8e5ff55826d05e5a1ca98781719e52e`  
**V1 Release:** `v1.0.0`

---

## 1. Purpose

This document freezes the product scope of Quiz Studio V2.

Feature discovery for V2 Core is complete.

From this point forward, implementation work should not reopen product scope unless new evidence reveals a material usability, data-integrity, migration, accessibility, or architectural problem.

New ideas that do not invalidate the frozen product model should be recorded for later evaluation rather than inserted into the active V2 implementation path.

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

V2 consists of three primary product/engineering systems, one new learning-content capability, and one cross-domain UX requirement.

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

`dueAt`, revisit intervals, and related scheduling facts describe when something should reappear.

They do not describe what the learner knows.

## 4.6 Deadline is Context, not Evidence

Future scoped deadline support may affect prioritization.

A deadline must never manufacture weakness or overwrite learning evidence.

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

V2 must not present a mysterious universal value such as:

```text
Mastery: 78%
```

as canonical learning truth.

---

# 7. Lightweight Scheduled Revisit — KEEP

V2 Core includes lightweight scheduled revisit.

Purpose:

```text
difficulty
→ remediation
→ recovery
→ wait
→ retrieve again
→ new evidence
```

Core scheduling needs only to support:

- future revisit time;
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

A future scoped deadline may exist as optional context.

Deadline remains Context, not Evidence.

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

- optional scoped Deadline Context;
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
Scheduler / Recommendation ADR
        ↓
Learning Orchestration Milestone
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
- Scheduler/Recommendation ADR gates Learning Orchestration implementation.

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
```

---

# 28. Final Freeze Statement

> **Quiz Studio V2 is a local-first desktop learning workspace built around durable learning evidence, explainable next-practice recommendations, and learner control. It preserves the strongest V1 workflows, establishes reliable desktop data ownership and V1 continuity, adds lightweight scheduled revisit, objective-answer explanations, and first-class copy-typing practice, while refusing unnecessary mastery scoring, analytics dashboards, embedded AI, mode proliferation, gamification, and cloud dependency.**

The product scope described in this document is now **FROZEN**.

Further work proceeds through architecture ADRs, bounded implementation spikes, milestone implementation, design validation, migration validation, and release hardening—not continued open-ended feature discovery.