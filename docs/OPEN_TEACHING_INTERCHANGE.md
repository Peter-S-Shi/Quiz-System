# Open Teaching Interchange Architecture

Open Teaching Interchange is Quiz Studio's cross-cutting, local-first foundation for working with external human teachers, language models, and agents through portable structured data.

It is not a second standalone learning product beside Translation Practice. Translation Practice remains Milestone 6's primary new learner workflow and will be the first complete rich-response consumer of this foundation. Open Teaching Interchange also serves the existing Objective Quiz workflow.

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

The M6.0 contract deliberately does not define the full rich annotation or revision language. M6.4 and M6.5 will own those semantics. Unknown or protected top-level fields are rejected by the current validation boundary.

Reviewer metadata may be anonymous or synthetic. Supported actor categories are `anonymous`, `human`, `external-ai`, `agent`, and `system`; real names, email addresses, and account identifiers are not required.

### Remediation Material

Follow-up material created from prior learning evidence. Existing material formats should be reused when suitable. A remediation Quiz Paper can carry provenance such as `purpose`, `sourceResponseId`, and `sourceReviewId` without requiring a separate exercise engine.

## Portable Contracts

- `schemas/quiz-paper.schema.json` supports optional additive provenance.
- `schemas/learner-response.schema.json` defines finalized learner evidence.
- `schemas/teacher-review.schema.json` defines additive teacher feedback.
- `examples/` contains synthetic examples for external tools and teachers.

All contracts use `schemaVersion`, `documentType` where applicable, stable IDs, and additive extension points. Raw HTML is not canonical review data.

## Objective Quiz Behavior In M6.0

Completing an Objective Quiz creates a separate Learner Response before completion is finalized. If browser storage cannot preserve the record, the attempt remains recoverable and the app reports the failure.

Users can export a Learner Response from the result screen or a linked recent-history entry. Full-library backups include Learner Response records. Legacy backups without the new collection remain readable and do not silently delete existing learner evidence.

Clearing a paper's history requires confirmation and explicitly removes both summary history and that paper's corresponding Learner Response records.

## Teacher Review Boundary In M6.0

M6.0 supplies schemas, normalization, and validation functions for Teacher Review data. It does not add a Teacher Review import screen or render external corrections. Later milestones will use the same protected-response boundary for previewed and confirmed review imports.

## Deferred To Later M6 Work

- M6.1 adds the Translation domain, persistence, and non-objective response boundary described in `TRANSLATION_DOMAIN.md`.
- Translation Library, material import/export, and practice UI.
- Learner `unknown`, `uncertain`, and `should_know` span marking.
- Rich annotation and revision semantics and UI.
- Full Teacher Review upload, preview, confirmation, storage, and rendering.
- External remediation round-trip UI and Translation history integration.

No embedded AI API, provider configuration, or automatic AI grading is part of M6.0.
