# Open Teaching Interchange Architecture

Open Teaching Interchange is Quiz Studio's cross-cutting, local-first foundation for working with external human teachers, language models, and agents through portable structured data.

It is not a second standalone learning product beside Translation Practice. Translation Practice remains Milestone 6's primary new learner workflow, and as of M6.6 is the first complete rich-response consumer of this foundation, including the full external review and remediation round trip. Open Teaching Interchange also serves the existing Objective Quiz workflow.

## Product Principle

```text
External Authoring
-> Learner Practice
-> Learner Response
-> External Review
-> Remediation
-> Learner Practice Again
```

The system is AI-native and API-optional. These workflows use local JSON files and do not require an embedded AI provider, API key, paid model, account, or network connection.

## Domain Boundaries

### Learning Material

The material assigned for practice, such as a Quiz Paper or a Translation Document.

### Learner Response

A finalized, versioned record of the learner's submitted work. For Objective Quiz, it contains:

- stable response, session, material, and item identities;
- attempted question snapshots;
- original submitted answers;
- grading snapshots and score summary;
- timestamps and provenance.

Learner Response is stored independently from the lightweight history list. The history list may retain only recent summaries, but it does not silently truncate finalized Learner Response records.

Application code treats finalized evidence as protected: a later review cannot replace the original material snapshot or submitted answers. This is an application-level immutability rule, not a cryptographic tamper-proof guarantee.

### Teacher Review

A separate versioned artifact linked to a Learner Response by `responseId`. It may contain reviewer-added judgments, comments, tags, suggested revisions, summaries, remediation recommendations, and versioned extensions.

The M6.0 contract deliberately did not define the full rich annotation or revision language up front. M6.4 added learner-controlled metacognitive marking (`learnerAnnotations` on the Learner Response), and M6.5 added the rich correction/revision language (`itemReviews[].corrections` on the Teacher Review) described in `DEVELOPER_GUIDE.md`. Unknown or protected top-level fields are rejected by the current validation boundary.

Reviewer metadata may be anonymous or synthetic. Supported actor categories are `anonymous`, `human`, `external-ai`, `agent`, and `system`; real names, email addresses, and account identifiers are not required.

### Remediation Material

Follow-up material created from prior learning evidence. Existing material formats should be reused when suitable. A remediation Quiz Paper can carry provenance such as `purpose`, `sourceResponseId`, and `sourceReviewId` without requiring a separate exercise engine.

M6.6 implements this concretely for Translation: a remediation Translation Document is an ordinary `quiz-studio.translation-document` carrying an additive `provenance` block (`purpose: "remediation"`, `sourceResponseId`, `sourceReviewId`, `sourceMaterialId`, `createdAt`, `author`). Its dedicated import boundary requires that claim and metadata and cross-validates the references against local Learner Response/Teacher Review records before persistence; ordinary M6.2 Translation Document import remains unchanged. Practicing the remediation material carries the same provenance forward into the resulting Learner Response, so lineage survives even if the remediation document is later deleted.

### Transport Envelopes (M6.6)

Two small, versioned envelopes carry canonical evidence to and from an external party without becoming a second source of truth: `quiz-studio.review-request` (a finalized Learner Response plus the expected Teacher Review output contract) and `quiz-studio.remediation-request` (a Learner Response and a Teacher Review plus the expected remediation Translation Document output contract). Both embed faithful portable copies of the canonical objects and exist only as export/import artifacts — never persisted as canonical learning records. See `DEVELOPER_GUIDE.md` for the implementation (`src/core/review-transport.js`).

## Portable Contracts

- `schemas/quiz-paper.schema.json` supports optional additive provenance.
- `schemas/learner-response.schema.json` defines finalized learner evidence.
- `schemas/teacher-review.schema.json` defines additive teacher feedback, including the M6.5 rich-correction extension.
- `schemas/translation-document.schema.json` defines Translation material, including the additive remediation `provenance` block.
- `schemas/review-request.schema.json` and `schemas/remediation-request.schema.json` (M6.6) define the external transport envelopes.
- `examples/` contains synthetic examples for external tools and teachers, including a full M6.6 round-trip fixture chain.

All contracts use `schemaVersion`, `documentType` where applicable, stable IDs, and additive extension points. Raw HTML is not canonical review data.

## Objective Quiz Behavior In M6.0

Completing an Objective Quiz creates a separate Learner Response before completion is finalized. If browser storage cannot preserve the record, the attempt remains recoverable and the app reports the failure.

Users can export a Learner Response from the result screen or a linked recent-history entry. Full-library backups include Learner Response records. Legacy backups without the new collection remain readable and do not silently delete existing learner evidence.

Clearing a paper's history requires confirmation and explicitly removes both summary history and that paper's corresponding Learner Response records.

## Teacher Review Boundary In M6.0

M6.0 supplied schemas, normalization, and validation functions for Teacher Review data, without a Teacher Review import screen or external-correction rendering. M6.6 completed this: it added the Teacher Review upload/preview/confirmation/storage/rendering pipeline described in `DEVELOPER_GUIDE.md`, reusing this same protected-response validation boundary for previewed and confirmed review imports.

## History, Retry, and Lineage (M6.7)

M6.7 turns the interchange loop into a durable, navigable history rather than a one-off screen. Translation History (`src/core/translation-history.js`) is derived from the same canonical Learner Response and Teacher Review collections described above — it is an index/navigation layer, never a second source of truth, and it remains fully usable after the originating live Translation Document is deleted.

M6.7 adds a second, distinct provenance purpose alongside `"remediation"`: `"retry"`. A retry (entire response, selected items, or automatically selected needs-work items) always produces new, independent evidence with its own stable IDs; it never reopens or overwrites the historical response it was retried from. `resolveResponseLineage()` walks both directions — back through `sourceResponseId`/`sourceReviewId` to the response's origin, and forward to anything retried or remediated from it — representing a deleted ancestor or reviewer as explicitly unavailable rather than crashing or silently dropping the relationship.

M6.7 also makes deletion semantics explicit for the first time: deleting a Learner Response cascades to its Teacher Reviews (a protected link that must always resolve) but never to responses derived from it; deleting a Teacher Review never mutates the Learner Response it targets. See `DEVELOPER_GUIDE.md` for the full dependency-analysis and storage-governance detail.

## Deferred Beyond M6.7

M6.0 through M6.7 delivered the full round trip described above plus durable history, retry, lineage, and deletion safety. No embedded AI API, provider configuration, or automatic AI grading is part of M6.0-M6.7. Still explicitly out of scope: advanced history analytics or search, a graph-style lineage visualization, cloud sync or accounts, and any of the M7 Product Hardening or M8 Release Candidate work.
