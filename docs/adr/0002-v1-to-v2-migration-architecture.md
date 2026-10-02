---
status: ACCEPTED — GO WITH AMENDMENT (Human Gate, 2026-10-02); Migration implementation NOT STARTED
decision-date: 2026-10-02
accepted: 2026-10-02
gates: V2 Migration milestone (implementation)
depends-on: V2_PRODUCT_SCOPE_FREEZE.md (Revision 1), docs/V2_MIGRATION_READINESS_INVENTORY.md (Human Gate decisions D-1 to D-15), docs/adr/0001-desktop-runtime-and-application-data.md (ACCEPTED), Desktop Foundation (ACCEPTED, `docs/V2_DESKTOP_FOUNDATION.md`)
---

# ADR 0002 — V1 → V2 Migration Architecture

**Status:** **ACCEPTED — GO WITH AMENDMENT** (Human Gate, 2026-10-02; the decisions and amendments are recorded in §18 and already folded into the text below). **Migration implementation is NOT STARTED** and needs its own authorization. This ADR turns the facts of the Migration Readiness Inventory and the policy decisions D-1…D-15 into an implementable, verifiable migration contract. It writes **no migrator and no test code**. It is authoritative for the Migration milestone. Nothing here changes Scope Freeze Revision 1, Inventory §10, ADR 0001, or the accepted Desktop Foundation; section 15 lists the only additive extensions the foundation will need.

## 1. Decision summary

The Inventory fixed *what* must be preserved and *which* policy applies. This ADR decides the mechanisms it left open:

| Area | Decision |
|---|---|
| Where it lives | A Rust migration crate (`qs-migrate-v1`, name provisional) on top of `qs-store` / `qs-media` / `qs-activation`. Rust reads, maps, stages, validates and activates; no JS code touches a path or the live store. |
| Reader | A purpose-built **event-level lossless reader**, never `serde_json::Value` (which collapses duplicate keys) and never V1's `normalize*`. Large media payloads stream; the rest of the document is materialized under a stated bound (section 6). |
| Carry rule | Structured canonical V1 records are carried **verbatim** as V2 payloads. Migration transforms nothing inside such a record; everything V2 needs to say *about* a record lives in sidecar records, never inside the payload. **Media assets are the one special mapping** (identity and metadata preserved, decoded bytes preserved, base64 not stored; section 7.1). |
| Provenance | One append-only `migration_origin` sidecar row per migrated record: source identity, JSON pointer, source position, as-migrated canonical hash, declared **gaps** and the authoritative `utf16-code-unit` offset label for migrated records (section 7.3, 7.5). |
| Legacy facts | S7 history is retained verbatim in `legacy_history_entry`, **classified** against Learner Responses as `twin`, `twin-divergent` or `legacy-only`; a fixed **counting contract** makes double counting impossible by construction (section 8). |
| Detection | A fixed-precedence classifier: container sniff → text/JSON well-formedness → declared identity → envelope shape → **per-sub-document** detection. Declared beats inferred; contradictions block; envelope `schemaVersion` never decides alone (section 5). |
| Operation identity | `sourceId` = SHA-256 of the exact source bytes; one append-only `migration_run` per *committed* attempt; `op_id` per attempt. Same source twice is a no-op; a different source with overlapping ids reconciles by canonical equality, otherwise blocks (section 9). |
| Activation mode (H-2) | **Additive only**: `Merge(KeepExisting)` plus a **commit guard** that makes any same-id/different-payload row a rollback. `Replace` is never offered to migration. |
| Undo | A targeted **inverse unit of work** over exactly the rows the run created. Snapshot restore remains the disaster path, not the undo path (section 13.3). |
| Proof | A per-run **Disposition Ledger** accounts for every source entity and every top-level/library-level key; an independent verifier (JS canonicalizer + Rust) re-derives conservation. Blocking count must be zero before activation (section 14). |

## 2. Inputs, authority and non-goals

**Authoritative inputs (in order):** Scope Freeze Revision 1 §4.5, §5.2, §10.3, §23; Inventory §1–§9 (facts) and §10 D-1…D-15 (decisions); ADR 0001 §5.2 (Store Port, UoW, payload/projection), §5.3 (fidelity contract, hard vs soft relationships), §5.4 (media), §6 (activation primitive), §7 (schema ownership), §8 (archive); the accepted Desktop Foundation as built (`qs-activation`, `qs-store`, `qs-media`, `qs-archive`, WebView boundary contract).

**Traceability (every Inventory decision lands in exactly one normative place):**

| Decision | Where |
|---|---|
| D-1 lossless-first reader | §6 |
| D-2 `v1.0.0` backups as-is | §5, §6 (no checksum/version reliance) |
| D-3 missing media fails closed | §10, §11 |
| D-4 S3 artifact | §10.3 |
| D-5 canonical vs legacy, no double count | §8 |
| D-6 feedback mode / retry lineage unknown | §7.4 |
| D-7 no item-level lineage guessing | §7.4, §6.4 |
| D-8 orphan media not migrated | §10.2 |
| D-9 no preferences, no profile scraping | §3, §12.2 |
| D-10 timestamps stay absent | §7.2, §7.4 |
| D-11 duplicate ids | §9.3 |
| D-12 staging → validation → all-or-nothing → rollback-safe | §4, §13 |
| D-13 UTF-16 offsets labeled | §7.5 |
| D-14 detection beyond envelope `schemaVersion` | §5 |
| D-15 V2-only fields absent | §7.4 |

**Not decided here (explicit):** the V2 domain contracts that will *evolve* migrated records (they are later, journaled transforms), the Scheduler/Recommendation/Calendar schema, product UI of the preview (only its data contract is fixed, §12), conflict-resolution UX, and anything about V1 code (V1 is immutable; D-2 forbids a V1.x prerequisite).

## 3. Vocabulary

- **Source** — the one V1 full backup JSON the user selects. **Recovery artifact input** — an optional second, explicitly user-selected file holding the V1 `quiz-studio-library-recovery-v1` value (§10.3). These are the only inputs; nothing is read from any browser profile or storage (D-9, Scope §5.2).
- **Entity** — a record the reader recognizes as a unit of source data: paper, category list, learner response, teacher review, translation folder, translation document, history entry, media asset.
- **Disposition** — what the run did with a source entity or key: `carried`, `deduplicated-identical`, `collapsed-duplicate`, `reported-unmigrated`, or `blocked`. Every entity and key has exactly one.
- **Origin** — the sidecar row recording where a migrated record came from (§7.3). **Gap** — a fact V1 could never have recorded for that record kind (§7.4). **Twin** — a history entry whose attempt is also a Learner Response (§8).
- **Blocking** vs **reportable** — §11. **Run** — one *committed* migration (`migration_run`). **Attempt** — one execution of the lifecycle with an `op_id`; most attempts never become runs.

## 4. Lifecycle

Scope §5.2 order, made concrete. Each phase names its owner and what is visible if the process dies there.

| # | Phase | What happens | Visible state if killed here |
|---|---|---|---|
| P0 | Select | Native Open dialog in Rust (path never reaches JS). | none |
| P1 | Intake | Read-only open; **copy-in while hashing** to `staging\<op>\source.bin` (single streaming pass). **Once P1 completes, the immutable staging copy (identified by `sourceId`) is the only authority for this attempt**: the user's file may afterwards be moved, deleted or modified externally and nothing about the attempt changes (the TOCTOU boundary). Pre-flight free-space check. | none (staging is disposable) |
| P2 | Detect | §5. | none |
| P3 | Structural validation | §6; shape, text/number/identity rules. | none |
| P4 | Referential validation | Hard relationships (§9.4) and media references (§10). | none |
| P5 | Stage | Build `staging.db` (product catalog, `journal_mode=DELETE`) and `staging\<op>\media\`; decode media streaming, SHA-256 on decoded bytes. Live store and live media store are untouched. | none |
| P6 | Semantic audit | Anchors (UTF-16), Learner Response invariants, history classification, **Disposition Ledger**, conservation proof (§14). | none |
| P7 | Preview | Write `report.json` (hash-bound, §12). Blocking ≥ 1 ⇒ run ends here as `blocked`; the report is the deliverable. | none |
| P8 | Confirm | User confirms *this* `reportHash` (bound to `sourceId` and the recovery artifact's hash). Selecting a different file is a new attempt; changes to the user's original after P1 are irrelevant. Live-store drift is handled by the commit guard (§9.5, §15.1), not by the confirmation. | none |
| P9 | Activate | Write-gate on; publish staged media and the recovery artifact into their content-addressed locations; then the activation primitive (`validate → snapshot → ONE transaction with commit guard → journal`). | exactly *pre* or *post* (§13.1) |
| P10 | Post-verify | Re-read the run's rows from the live store and re-check the ledger. A failure here is a defect: automatic undo (§13.3) and an `ACTIVATION_POST_VERIFY_FAILED` report. | *post*, or undone |
| P11 | Finalize | Delete staging after a retention period; keep the pre-activation snapshot per the foundation retention policy. | n/a |

The user's file is never opened for write at any point (M-15) and is not consulted again after P1. Re-running P1–P8 for the same source is always safe (§9.2).

## 5. Intake and detection precedence

D-14 forbids relying on the envelope `schemaVersion`. V1 never had a version ladder (R-13) and its parser accepts `schemaVersion: 99`; the classifier therefore keys off *declared identity and structure*, in a **fixed order that stops at the first failing stage** (every diagnostic of that stage is still collected):

1. **Container sniff (bytes).** ZIP magic ⇒ a V2 archive: refuse with `MIG_SOURCE_WRONG_KIND` and route the user to *Restore from backup*. A UTF-16/UTF-32 BOM or non-UTF-8 bytes ⇒ `MIG_SOURCE_NOT_UTF8` (a UTF-8 BOM is tolerated for parsing; the digest is over the raw bytes).
2. **Text and JSON well-formedness (§6).** Duplicate keys, lone surrogates, non-JS-producible numbers and oversize are decided here, before any interpretation.
3. **Declared identity.** Root must be an object. `documentType === "quiz-studio.library-backup"` is *declared V1 backup*. A different string is `MIG_SOURCE_DECLARED_CONFLICT`; a recognized *other* V1 artifact (`documentType` of a Learner Response / Teacher Review / Translation document, a single-paper package, or a recovery-artifact shape) is `MIG_SOURCE_WRONG_KIND` with the specific kind named. A declared identity is **never overridden by structure**.
4. **Envelope shape.** A declared or *undeclared* root qualifies as a V1 backup only if `library` is an object whose `papers` is an array. (V1 itself requires ≥ 1 paper; an empty `papers` array is therefore not a V1-producible backup and is `MIG_SOURCE_NOT_A_BACKUP`.) An undeclared qualifying root is classified **legacy/undeclared** (reportable `MIG_ENVELOPE_UNDECLARED`), never silently treated as declared.
5. **Envelope `schemaVersion`** is informational. Any value other than `1` is reportable (`MIG_ENVELOPE_VERSION_UNEXPECTED`) **only if** every sub-document still passes its own detection; the version never rescues a failing sub-document and never blocks a passing one.
6. **Per-sub-document detection**, each independent, in this fixed order: `library` → `mediaAssets` (alias `assets` accepted, reportable `MIG_ASSETS_ALIAS_USED`; if both exist they must be identical or `MIG_SECTION_SHAPE`) → `translationLibrary` → `learnerResponses` → `teacherReviews` → `history`.
   - *Present vs absent is a recorded fact.* A missing section is `MIG_SECTION_ABSENT` (reportable) and means "not in this backup", never "empty" and never "delete the live copy" (the V1 history-overwrite behavior, R-05, is not inherited; migration never deletes).
   - A present section whose container type is wrong is `MIG_SECTION_SHAPE` (blocking).
   - **Record kind** is decided per record from the *declared* `documentType` and, for Learner Responses, `material.type ∈ {quiz-paper, translation-document}`. An unknown `documentType` or `material.type` is `MIG_RECORD_KIND_UNKNOWN` (blocking): the record's collection and projections cannot be chosen without guessing. Unknown **fields** are not unknown **kinds** — they are preserved (§7.1).
   - Library: `schemaVersion` integer `1` ⇒ current; absent ⇒ pre-versioned (reportable `MIG_LIBRARY_PREVERSIONED`); any other value ⇒ `MIG_RECORD_KIND_UNKNOWN` for the library (V1 rejects it too).
7. **Cross-document referential validation** (§9.4) runs only after every sub-document is detected.

The classification (`declared|undeclared`, per-section present/absent, per-record kinds) is part of the report, so the user and the tests see *why* an input was accepted.

## 6. The lossless read model

**Reader rules** (all enforced before any mapping; D-1, Inventory R-11):

1. Event-level parse that tracks object keys: a duplicate key at any depth is `MIG_SOURCE_DUPLICATE_KEY` (blocking) because last-wins would silently discard data.
2. **Strings are code-point exact.** No normalization (no NFC/NFD), no trimming, no re-localization. A lone UTF-16 surrogate (`\ud800` escape without its pair) cannot be represented in a UTF-8 store: `MIG_SOURCE_LONE_SURROGATE` (blocking). It is **never** replaced with U+FFFD. (A V1 JS string can contain one; this is a known, accepted limitation — Human Gate decision H-1, §18.)
3. **Numbers must be JS-producible.** A token is accepted iff it denotes exactly the same value as the shortest ECMAScript representation of its IEEE-754 double (`1.0` and `1e2` are accepted; `9007199254740993` and `0.1000000000000000055511151231257827` are not). Otherwise `MIG_SOURCE_UNSAFE_NUMBER` (blocking). This is the A4 fidelity rule applied at intake.
4. **Unknown fields are data.** Every key the reader does not model is carried inside its parent record; nothing is dropped by omission from a whitelist.
5. **Absent ≠ null ≠ empty.** The reader preserves which of the three the source had.
6. **Order is data.** Array order inside a record is part of the payload; the order of *entities* in a source array is recorded as `sourcePosition` (§7.3).
7. **Media `data` streams.** Only `mediaAssets[*].data` is decoded in a streaming pass (base64 → temp file, SHA-256 over decoded bytes). Everything else is materialized; the materialized non-media JSON is bounded (design bound 128 MiB, `MIG_SOURCE_TOO_LARGE`, to be confirmed by the Milestone's measurement; the 2,500-response reference tier is 7.78 MiB). Peak working set must meet the Foundation's 300 MiB envelope (§16).
8. The reader never calls, imports or mirrors V1 `normalize*`/`migrate*`. V1 code appears only as a **test oracle** (§16).

**What the reader models** (the minimum needed for identity, projections and hard relationships; everything else is opaque): ids; `documentType`, `schemaVersion`, `material.{type,id}`, `session.{id,completedAt}`, `responses[].itemId`, `responseId`, `provenance.{purpose,sourceResponseId,sourceReviewId,sourceMaterialId}`, `itemReviews[].itemId`, `learnerAnnotations`/`corrections` anchors, `folderId`, `items[].{id,position}`, item/question `image.id`/`audio.id`, `history[].{id,responseId,paperId,completedAt,...}` (§8), media asset metadata. No other field influences a decision.

**§6.4 Lineage is not inferred (D-6, D-7).** The reader never compares text across records, never matches retried items to originals, never infers feedback mode, retry source, or schedule. Response-level `provenance` is carried as written, including dangling soft references (M-7).

## 7. Mapping V1 → V2 and provenance

### 7.1 Carry rule and collections

**Verbatim carry (structured canonical records).** The payload of a migrated paper, learner response, teacher review, translation folder/document or category list is the **V1 record's exact JSON value**: same keys, same values, same array order, unknown fields intact, `schemaVersion`/`documentType` untouched, nothing added. V1 documents are already native, self-describing contracts (ADR 0001 §5.3 "records stay native"), so carrying them verbatim is the lowest-risk reading of D-1/D-14/D-15. Later V2 domain contracts evolve them through explicit, journaled transforms (ADR 0001 §7), never during migration. Conservation of these records is proved by C-2 (source value ≡ stored payload).

**Media assets are an explicit special mapping, not a verbatim carry.** A V1 `mediaAssets[*]` entry is JSON that embeds a base64 `data` string; V2 never stores that string. What is conserved is (a) the asset's **identity and metadata** (`id`, `mimeType`, `name`, `size`, and any unknown asset keys, all as in the source), (b) the **decoded bytes**, stored once as a content-addressed file, and (c) every **reference** to the asset. `contentHash` is **V2-derived storage metadata** (SHA-256 of the decoded bytes), not a V1 fact. Consequently the `media_object` payload is *not* hash-equal to the source JSON entry, and no check may claim it is; conservation of media is proved independently by C-4 (byte identity, id/metadata and reference conservation).

The Migration milestone adds **one forward store migration** to the product catalog (store schema 1 → 2, the first domain migration, using the foundation's catalog mechanism). Collections (names provisional; shape normative):

| Collection | Source | Id | Projections (columns) and hard relationships |
|---|---|---|---|
| `paper` | each `library.papers[i]` | `/id` | `title`, `category`, `created_at`, `updated_at` (nullable). Relation `paper_media(paper_id, media_id)` **FK → `media_object`** (hard, I-11). Questions stay inside the paper payload, so question ids are scoped to their paper and cross-paper duplicates are legal and untouched (D-11). |
| `library_categories` | `library.categories` | fixed id `categories` | none. One singleton preserving list order and empty categories (M-12). |
| `learner_response` | each `learnerResponses[i]` | `/id` | `material_type`, `material_id` (soft), `session_id`, `completed_at`; relation `learner_response_media(response_id, media_id)` FK → `media_object` (hard). Items/answers/results/annotations/marks/provenance stay in the payload. |
| `teacher_review` | each `teacherReviews[i]` | `/id` | `response_id` **FK → `learner_response`** (hard, I-1); `created_at`. |
| `translation_folder` | each `translationLibrary.folders[i]` | `/id` | none |
| `translation_document` | each `translationLibrary.documents[i]` | `/id` | `folder_id` **FK → `translation_folder`** (hard, I-9); for documents whose `provenance.purpose == "remediation"`, `source_response_id` / `source_review_id` **FK** (hard for live remediation documents, I-7). A learner response's *own* provenance is **not** projected (soft, I-8). |
| `media_object` | referenced `mediaAssets[*]` | `/id` | existing foundation collection; **special mapping** (see above). Payload = the source asset's metadata without `data` (`id`, `mimeType`, `name`, `size`, plus any unknown asset keys) **plus** the V2-derived `contentHash`; the bytes live in the content-addressed file, never in the payload. |
| `legacy_history_entry` | each `history[i]` | `/entry/id`, or content-derived (§8.3) | payload is a V2 envelope `{entry: <verbatim V1 entry>, role, twinResponseId?, divergence?}`; columns `role`, `twin_response_id` (soft, **no FK**). |
| `legacy_residue` | unmodeled keys *outside* any entity (envelope, library level, section level) | `<sourceId>#<json-pointer>` | verbatim JSON value. |
| `migration_origin` | one per (source, record) pair | `<sourceId>:<collection>:<recordId>` | §7.3 |
| `migration_run`, `migration_undo` | operation records | `op_id` | §9.1, §13.3 |
| `recovery_artifact` | the S3 input | content hash | §10.3; **retained artifact index, not canonical data** (class 3 below) |

**Three classes of durable data** (ADR 0001 §5.3 and the foundation catalog's canonical/recovery-only split are refined, not contradicted):

1. **Canonical domain records** — `paper`, `library_categories`, `learner_response`, `teacher_review`, `translation_folder`, `translation_document`, `media_object`, `legacy_history_entry`, `legacy_residue`. This is the learning/product data that Evidence, Recommendation and every other consumer may read as canonical.
2. **Durable migration metadata** — `migration_origin`, `migration_run`, `migration_undo`. Provenance and operation records: preserved and archived, but **not** learning data and never an input to Evidence or Recommendation.
3. **Durable recovery-only artifact** — `recovery_artifact` (row and file, §10.3). Preserved long-term and **carried in V2 archives** (H-4), but **never** canonical learning/product data: no consumer may treat it as a canonical record, and nothing is derived from it.

`recovery_session` stays foundation recovery-only (excluded from archives). §15.5 states the catalog extension that expresses these classes. Projection pointers and foreign keys obey ADR 0001 §5.2–§5.3 (deferrable FKs, Rust-verified projections, `check_consistency`). A projection column the source lacks (e.g. missing `createdAt`) is **NULL** (D-10).

### 7.2 Timestamps and operational metadata

No field is added to, defaulted in, or normalized inside a canonical payload. A missing V1 timestamp stays missing; an `exportedAt` is carried in `migration_run.source.exportedAt` verbatim. The wall-clock time of the migration exists **only** in `migration_run` / journal (`activatedAt`), never in a record timestamp (D-10, ADR 0001 §9). Sorting/filtering code treats NULL timestamp columns explicitly; migration never fabricates a value to make them sortable.

### 7.3 Provenance: the `migration_origin` sidecar

One append-only row per (source, record) pair — media objects and history rows included, and records that were `deduplicated-identical` against live data (they record "this source contained this record" without touching the existing row). Because the key includes `sourceId`, the same record arriving from two sources yields two origins and never collides. Payload:

```text
{ collection, recordId, sourceId, sourcePointer, sourcePosition,
  disposition: "carried" | "deduplicated-identical",
  mappingVersion: "v1-mapping/1", canonHash, kind,
  gaps: [ ... ],            // §7.4, fixed per kind + computed absent-field codes
  offsetEncoding?: "utf16-code-unit",   // §7.5, REQUIRED on migrated records that carry anchors
  identity?: "v1" | "content-derived" } // §8.3
```

- `canonHash` is the canonical hash (ADR 0001 §5.3) of the record **as migrated** — for structured canonical records the stored payload (equal to the source value, C-2); for media objects the stored `media_object` payload (metadata + `contentHash`), which is *not* equal to the source entry (C-4 proves media conservation). It is the permanent conservation anchor: V2 may later evolve the payload by an explicit transform, but the origin keeps what was carried.
- `sourcePointer` is an RFC 6901 pointer into the source (e.g. `/library/papers/3`); `sourcePosition` is the array index. Together they make entity **order** a conserved fact.
- Origin rows are written in the **same activation transaction** as their records; a record without an origin, or an origin without a record, is a `check_consistency`-class defect found by the migration verifier (§14), not tolerated.
- Origin lives **beside** the payload on purpose: putting provenance inside the payload would break the verbatim carry rule and make per-record hash conservation impossible.

### 7.4 Gaps: V1-unrecorded facts stay unknown

D-6/D-7/D-10/D-15 require that "V1 never recorded this" stays distinguishable from "V2 recorded none". The mechanism is the origin `gaps` list, a **closed registry**:

| Gap code | Applies to | Meaning |
|---|---|---|
| `objective.feedback-mode` | migrated Objective Learner Responses | feedback mode was never persisted (R-07) |
| `objective.retry-lineage` | same | no retry/"wrong-only" source was recorded (R-07) |
| `translation.item-lineage` | migrated Translation Learner Responses and documents with provenance | item-level correspondence was never recorded (R-08) |
| `history.snapshot` | `legacy-only` history entries | no Learner Response snapshot exists for this attempt |
| `media.created-at` | media objects | V1 export drops `createdAt` (R-14) |
| `timestamp.absent:<field>` | any record | the source record lacked that timestamp |
| `v2.answer-explanation`, `v2.typing`, `v2.scheduling` | all migrated records of the relevant kinds | V2-only facts, never inferred (D-15) |

Rules: (1) the gap field is **absent from the payload** — never `null`, never a default; (2) a consumer that needs a gap fact reads `migration_origin` and must treat the fact as **unknown**; it may not substitute a default or infer it, and the Scheduler/Recommendation ADR must honor this (an unknown fact is never evidence); (3) native V2 records have no origin row, so for them absence means "not recorded" and `null`/empty mean what V2 says; (4) a V1-recorded empty value (`""`, `[]`) is preserved as empty — absence and emptiness are never converted into each other.

### 7.5 Offset encoding (D-13, Human Gate H-3)

Learner annotations and Teacher Review corrections are numeric offsets into the learner answer measured in **UTF-16 code units**. Migration keeps them byte-for-byte and labels them **explicitly**:

- every migrated record that carries anchors gets `offsetEncoding: "utf16-code-unit"` in its `migration_origin` row, which is the **authoritative label** for migrated records; the payload stays verbatim;
- this is a **legacy compatibility rule scoped to migrated records**. There is **no global default**: absence of an `offsetEncoding` is not read as UTF-16 for any record;
- **native V2 offset-bearing records** (Typing, new annotations, anything created after migration) must declare their encoding **explicitly under the future domain schema**; an offset-bearing record that has **no `migration_origin` row and no explicit encoding is invalid** and is rejected by that schema's validator. The Migration milestone does not define those native schemas but must not introduce any implicit default;
- a reader needing the encoding of an offset-bearing record therefore finds it in exactly one of two places (origin label, or the native record's declared field) or treats the record as invalid — never a guess.

The Rust validator checks anchors in UTF-16 arithmetic (`encode_utf16` on the answer, compared as `u16` sequences), so an offset that splits a surrogate pair is *valid and reportable* (`MIG_OFFSET_SPLITS_SURROGATE`), while a mismatching slice or an overlap is blocking (`MIG_ANCHOR_MISMATCH`, the same rule V1 enforces, I-3).

## 8. Legacy facts without double counting (D-5)

V1 recorded each finished Objective attempt twice: as a Learner Response (canonical) and as an S7 history entry (derived, capped at 100, written with a live-paper title). The Learner Response is truth; history entries are retained only for facts the Learner Response cannot supply.

### 8.1 Classification

For each history entry *E* the reader tries to resolve its **twin**: the Objective Learner Response *R* with `R.id == E.responseId` **and** `R.session.id == E.id`. Then:

| Role | Condition | Stored | Counted as an attempt? |
|---|---|---|---|
| `twin` | twin resolves and every field in the **reconciliation table** agrees | `legacy_history_entry` (verbatim `entry`, `twinResponseId`) | **No** — the attempt is `R` |
| `twin-divergent` | twin resolves but ≥ 1 reconcilable field disagrees | same, plus `divergence: [field…]` | **No** — the attempt is `R`; the report lists the divergent fields |
| `legacy-only` | no `responseId`, or no resolving twin | same | **Yes** — it is the only record of that attempt (gap `history.snapshot`) |

Reconciliation table (the fields where V1 duplicated facts; verified against the V1 baseline code by the Migration milestone, which may only *narrow* it with evidence): `E.id`↔`R.session.id`, `E.responseId`↔`R.id`, `E.paperId`↔`R.material.id`, `E.completedAt`↔`R.session.completedAt`, `E.questionCount`↔`R.summary.itemCount`, `E.correctCount`↔`R.summary.correctCount`, `E.percent`↔`R.summary.percent`, `E.results`↔`R.responses[].result` (ordered), `E.paperTitle`↔`R.material.title`. Comparison is by canonical value equality, never by display text.

### 8.2 Counting contract (normative for every later consumer)

> *The Objective attempt set is the Objective Learner Responses plus the `legacy-only` history entries. `twin` and `twin-divergent` entries are never attempts.* Equivalently: `|attempts| = |objective learner_response| + |legacy_history_entry where role = 'legacy-only'|`.

The classification is a **fact about the migration**, stored once and re-derivable: the verifier recomputes every role from the stored rows and fails on any difference. V2-native attempts never create history rows, so the contract holds for the whole store.

### 8.3 Edge rules

- History has no canonical identity guarantee (Inventory §4 and §5.2: no shape check). The row id is `E.id` when `E.id` is a non-empty string (origin `identity: "v1"`); otherwise `h-<canonical hash of E>` (origin `identity: "content-derived"`) — a *storage key*, never presented as a V1 identity.
- Two entries with the same `id` and identical canonical content collapse to one row and are reported (`MIG_HISTORY_DUPLICATE_COLLAPSED`, count, both source positions); same `id` with different content is `MIG_IDENTITY_AMBIGUOUS` (blocking).
- `history.length == 100` exactly is reported (`MIG_HISTORY_CAP_POSSIBLE`): V1 caps at 100 on write, so earlier attempts may have existed; migration states the fact and invents nothing.
- Translation attempts have no S7 twin (S7 is Objective only); a history entry whose `responseId` resolves to a non-Objective response has **no twin**, is `legacy-only`, and is reported (`MIG_HISTORY_RESPONSE_KIND_MISMATCH`), never reinterpreted.

## 9. Operation identity, idempotence and retry

### 9.1 Identities

| Identity | Definition | Purpose |
|---|---|---|
| `sourceId` | `v1-src-` + SHA-256 of the **exact source bytes** (computed during copy-in) | what was imported; stable across machines |
| `recoveryId` | SHA-256 of the artifact bytes (when supplied) | content identity of the artifact |
| `op_id` | the foundation's time-sortable operation id | one attempt; names staging, snapshot, journal |
| `migration_run` row | key `op_id`; carries `sourceId`, `recoveryId?`, `mappingVersion`, `reportHash`, per-entity counts, `exportedAt`, `activatedAt`, `appVersion` | the permanent record of a **committed** attempt; **append-only** |
| `migration_undo` row | key = undo `op_id`; carries `undoes: <run op_id>` | append-only undo record |

A source is **imported** iff a `migration_run` with its `sourceId` exists that no `migration_undo` references. Nothing is ever updated in place, which is exactly what `Merge(KeepExisting)` supports.

### 9.2 Repeat and retry semantics

| Situation | Result |
|---|---|
| Same `sourceId` already imported | **No-op**, no staging, no side effect; the report states `MIG_ALREADY_MIGRATED` with the original run. Edited V2 data is never re-imported over. |
| Previous attempt died before commit (no `migration_run`) | New attempt, new `op_id`, from scratch; leftover staging is discarded by recovery. Retry is safe at any point before commit. |
| Previous attempt died after commit | Foundation recovery resolves it `Committed` (complete-forward); the next launch shows the run; re-import is the no-op above. |
| Different source, some entities already live and **canonically identical** | Those entities get `deduplicated-identical` (reportable `MIG_EXISTING_IDENTICAL`, counts); the rest are added. |
| Different source, same id, **different** canonical payload | `MIG_LIVE_CONFLICT` (blocking, ids listed). Never overwritten, never remapped. |
| Source imported, then undone (§13.3) | Importable again. |

Idempotence is therefore defined on **entities by canonical equality** and on **sources by byte digest**; two exports of the same library produced at different times are different sources whose overlap reconciles entity by entity.

### 9.3 Duplicate and ambiguous identity (D-11)

Identity scopes: paper id — library-wide; question id — within its paper only; Learner Response id; Teacher Review id; folder/document id; translation item id — within its document; item id within a Learner Response snapshot; media id. For each scope:

- A duplicate in a scope that must be unique, with **any** content (identical or not), is `MIG_IDENTITY_AMBIGUOUS` (blocking), except media (§10) and history (§8.3) which have specified collapse rules for byte-identical duplicates.
- A *legal* duplicate (question id across papers) is preserved with no diagnostic beyond an informational count.
- No id is ever remapped, regenerated or suffixed. The user's recourse is to fix the V1 data and re-export.

### 9.4 Hard relationships validated in P4

Teacher Review → Learner Response (I-1) and `itemReviews[].itemId ∈ response items` (I-2); translation document → folder (I-9); live remediation document → source response/review, review belongs to response, `sourceMaterialId` matches (I-7); Learner Response invariants V1 already enforces (unique item ids, exactly one response per item, `summary.itemCount` = responses, I-5). Any failure is `MIG_REF_UNRESOLVED` / `MIG_LEARNER_RESPONSE_INVARIANT` (blocking). Soft relationships (I-8, I-10, I-12, I-13, I-14, I-15) are carried verbatim; dangling soft provenance is reportable (`MIG_PROVENANCE_DANGLING`, count) and **never repaired** (M-7).

### 9.5 The live-conflict guard

Reconciliation with the live store happens twice: at P6 (for the preview) and **again inside the commit transaction** (§15.1). The second check is the authoritative one; it makes a race between preview and activation unobservable.

## 10. Media and the recovery artifact

### 10.1 Media rules (D-3, M-10)

- A media asset referenced by a V1 reference site is **resolved by V1's contract**: item-level `image.id`/`audio.id` on paper questions and on Learner Response snapshot items, **trimmed exactly as V1 trims** when resolving. References are projected into `paper_media` / `learner_response_media` with hard FKs, so a dangling reference is rejected by the database as well as by the validator (defense in depth).
- Missing referenced asset ⇒ `MIG_MEDIA_MISSING` (blocking; the diagnostic lists every missing id with its referencing record pointers — D-3's "clear diagnostic naming the missing references").
- `data` must be valid non-empty base64 (`MIG_MEDIA_PAYLOAD_INVALID`); decoded length must equal declared `size` (`MIG_MEDIA_SIZE_MISMATCH`, blocking: a mismatch means truncation or tampering and the correct bytes cannot be known); MIME class must match the reference site (`MIG_MEDIA_MIME_CLASS`).
- Same id twice: identical (same MIME, same decoded bytes) ⇒ collapsed, reportable (`MIG_MEDIA_DUPLICATE_IDENTICAL`); otherwise `MIG_MEDIA_CONFLICT` (blocking).
- Different ids with identical bytes ⇒ one stored file, **two `media_object` rows** (ids are identity and are preserved); reportable (`MIG_MEDIA_SHARED_CONTENT`).
- Media is **staged outside the live media store** and published at P9 only. This is deliberate: foundation GC removes zero-reference files after 24 h, and a preview can legitimately wait longer than that. Publication reuses the foundation's temp → fsync → atomic-rename-with-retry and dedupes by hash; it is idempotent.

### 10.2 Orphan media (D-8)

A `mediaAssets` entry that no V1 reference site resolves is **not migrated** and is **reported** by id, MIME, size and hash (`MIG_MEDIA_UNREFERENCED_NOT_MIGRATED`) — never dropped silently. A diagnostic-only scan additionally flags when such an id appears *as a string value elsewhere in the source* (`MIG_MEDIA_ID_IN_UNMODELED_FIELD`, with the pointer). That scan only produces a warning; it never changes a disposition and is not an inference of references. The user's original backup remains the recovery path for anything not migrated (M-15).

### 10.3 The S3 recovery artifact (D-4)

V1 has **no export path** for `quiz-studio-library-recovery-v1` (it is excluded from the backup and a search of `src/` finds only the write in `preserveRecovery`). With D-2 forbidding a V1 prerequisite, the artifact reaches V2 only as an **optional, explicitly user-selected file** holding that value; V2 never reads it from a browser profile (D-9). The rules:

1. Recognition: a JSON object with `schemaVersion: 1`, `sourceKey: "quiz-studio-library-v1"`, string `rawValue`, and `reason`/`preservedAt` strings. An explicitly supplied file that is not recognized is `MIG_RECOVERY_ARTIFACT_UNRECOGNIZED` (blocking for the run: silently ignoring something the user asked to preserve contradicts D-4; they can retry without it).
2. **Byte-for-byte**: the file is copied to `recovery-artifacts\<sha256>.artifact` (temp → fsync → atomic rename), verified by re-hash, and indexed by a `recovery_artifact` row (`hash`, `size`, `reason`, `preservedAt`, `sourceKey`, `rawValueBytes`, `rawValueParses: bool`; no run reference in the payload, so the same artifact supplied again is canonically identical and deduplicates — the link to the run lives in `migration_run.recoveryId`). The parse is **display-only**.
3. **Never auto-activated and never canonical**: the artifact is durable recovery-only data (class 3, §7.1), not a canonical domain record. Nothing is read from `rawValue` into a canonical collection; the artifact has no foreign keys and no consumer, and Evidence/Recommendation or any other consumer must not treat it as a canonical record. It is shown in the preview (§12) and can later be exported byte-for-byte or offered to an explicit, separately-authorized recovery flow. Whether its `rawValue` overlaps the imported library is not computed (that would be guessing).
4. The artifact file is published before the commit (adding a content-named file is idempotent); the `recovery_artifact` row is written in the activation transaction; an unreferenced artifact file left by a crash is harmless and is removed only with the same safety-delay rule as media GC.
5. V2 archives must carry `recovery_artifact` rows **and** their files (§15.3, H-4), because the artifact may be the only copy of a user's library (R-09).

### 10.4 What is explicitly not migrated

Preferences and language (D-9, S11–S14), active sessions (S5/S6; not in V1 backups), active-paper selection (S4), caches, and S2/S13 legacy keys. The report states this fixed list so absence is explained, not silent.

## 11. Diagnostics: blocking versus reportable

**Rule.** A condition is **blocking** iff proceeding would require guessing, discarding or altering canonical data, or would break a hard relationship. It is **reportable** iff every source fact is carried or explicitly listed and nothing was guessed. Any diagnostic added later must be classified under this rule. Activation is allowed iff blocking = 0.

**Shape of a diagnostic.** `{code, severity, stage, pointer?, params:{…}}` — structured fields only. There is **no free-text message built from user content**; user text appears only inside `params` as data. This keeps the WebView boundary contract intact (user text round-trips; the only sanitized field is a system-generated `error.message`).

| Stage | Blocking | Reportable |
|---|---|---|
| Intake | `MIG_SOURCE_UNREADABLE`, `MIG_INSUFFICIENT_SPACE`, `MIG_SOURCE_NOT_UTF8`, `MIG_SOURCE_NOT_JSON`, `MIG_SOURCE_WRONG_KIND`, `MIG_SOURCE_DECLARED_CONFLICT`, `MIG_SOURCE_NOT_A_BACKUP` | `MIG_ENVELOPE_UNDECLARED` |
| Reader | `MIG_SOURCE_DUPLICATE_KEY`, `MIG_SOURCE_LONE_SURROGATE`, `MIG_SOURCE_UNSAFE_NUMBER`, `MIG_SOURCE_TOO_LARGE` | — |
| Detection | `MIG_SECTION_SHAPE`, `MIG_RECORD_KIND_UNKNOWN`, `MIG_RECORD_UNIDENTIFIABLE` | `MIG_ENVELOPE_VERSION_UNEXPECTED`, `MIG_LIBRARY_PREVERSIONED`, `MIG_SECTION_ABSENT`, `MIG_ASSETS_ALIAS_USED` |
| Identity | `MIG_IDENTITY_AMBIGUOUS`, `MIG_LIVE_CONFLICT` | `MIG_HISTORY_DUPLICATE_COLLAPSED`, `MIG_EXISTING_IDENTICAL`, legal-duplicate counts |
| Referential | `MIG_REF_UNRESOLVED`, `MIG_LEARNER_RESPONSE_INVARIANT` | `MIG_PROVENANCE_DANGLING` |
| Media | `MIG_MEDIA_MISSING`, `MIG_MEDIA_PAYLOAD_INVALID`, `MIG_MEDIA_SIZE_MISMATCH`, `MIG_MEDIA_CONFLICT`, `MIG_MEDIA_MIME_CLASS` | `MIG_MEDIA_DUPLICATE_IDENTICAL`, `MIG_MEDIA_SHARED_CONTENT`, `MIG_MEDIA_UNREFERENCED_NOT_MIGRATED`, `MIG_MEDIA_ID_IN_UNMODELED_FIELD` |
| Semantic | `MIG_ANCHOR_MISMATCH` | `MIG_OFFSET_SPLITS_SURROGATE`, `MIG_HISTORY_TWIN_DIVERGENT`, `MIG_HISTORY_RESPONSE_KIND_MISMATCH`, `MIG_HISTORY_CAP_POSSIBLE`, `MIG_UNKNOWN_FIELD_PRESERVED` (counts per path class), `MIG_RESIDUE_PRESERVED`, `MIG_TIMESTAMP_ABSENT` (counts), `MIG_GAPS_DECLARED` |
| Artifact | `MIG_RECOVERY_ARTIFACT_UNRECOGNIZED` | `MIG_RECOVERY_ARTIFACT_PRESERVED` |
| Internal | `MIG_LEDGER_INCOMPLETE`, `MIG_STAGING_INVALID`, `ACTIVATION_POST_VERIFY_FAILED` | — |
| Run | — | `MIG_ALREADY_MIGRATED` (terminal no-op) |

Stage collection is exhaustive within a stage (all problems of the failing stage are listed) so one fix cycle suffices; later stages are not run past a failing stage.

## 12. Preview and loss report

### 12.1 Contract

`report.json` is generated in staging, canonical-serialized, and identified by `reportHash`; confirmation binds to `(sourceId, recoveryId?, reportHash)`. It is **path-free** (the source appears as base name + `sourceId`), and the WebView receives it through new allowlisted, path-free commands (`migration.status`, `migration.preview`, `migration.confirm(reportHash)`, `migration.cancel`, `migration.undo(runOpId)`); file selection is a Rust-native flow like the existing dialogs. The report contains:

1. Classification (§5): declared/undeclared, envelope version, per-section presence, record kinds.
2. **Conservation counts** (M-16): per entity kind — source, carried, deduplicated-identical, collapsed, reported-unmigrated, blocked; media asset count and total decoded bytes.
3. **Diagnostics** (§11), blocking first, grouped by code with counts and sampled pointers (full list in the artifact file).
4. **Loss report** — everything V1 could not give or V2 did not take, as data: gaps (§7.4) with record counts, divergent history entries, history cap flag, absent sections, orphan media, the fixed not-migrated list (§10.4).
5. **Recovery artifact** (if supplied): hash, size, reason, `preservedAt`, whether `rawValue` parses — and the statement that it was preserved and **not** activated.
6. Activation plan: mode (`merge-keep-existing`), live-reconciliation result, whether a snapshot will be taken, the undo window.

### 12.2 What the preview never does

It never reads outside the source and the optional artifact, never scrapes a profile (D-9), and never offers per-entity cherry-picking — activation is all-or-nothing (D-12). A report with blocking diagnostics has no Confirm action.

## 13. Activation, failure and recovery

### 13.1 Phases and guarantees (P9)

Inside the activation phase, in order: (1) **write gate** on (the Store Port refuses `store.commit` and GC is excluded for the duration, closing the preview→commit race and the GC-vs-publish race); (2) publish staged media then the recovery artifact; (3) run the foundation primitive with `Mode::Merge(KeepExisting)`, `deep_media_check: true`, `kind: "migration"`, and the commit guard (§15.1): `validate → pre-activation snapshot → BEGIN IMMEDIATE → ATTACH staging read-only → guard → insert → operation_journal → COMMIT`; (4) write gate off; (5) P10.

| Kill point | Visible store | Disk leftovers | Recovery at next launch |
|---|---|---|---|
| P0–P8 (any) | unchanged | staging dir | staging discarded; user restarts, nothing to undo |
| during media/artifact publish (`mig-mid-media-publish`, `mig-after-media-publish`, `mig-after-artifact-publish`) | unchanged | content-named media/artifact files with no DB reference | harmless; GC after the safety delay; retry republishes idempotently |
| before-snapshot / after-snapshot / mid-copy / before-commit | unchanged (transaction not committed) | snapshot file, staging | foundation `recover` → `Discarded` |
| after-commit, before journal `done` | **fully applied** | none | `recover` → `Committed` (commit record in `operation_journal`) |
| after-journal-done, before P10 | applied | staging | P10 re-run from the run record; verify or auto-undo |
| during undo (`mig-before-undo-commit`) | unchanged | none | undo is one transaction: pre or post |

The invariant is exactly the Foundation's H3-class property: every kill leaves **exactly pre or exactly post**, and recovery is deterministic and idempotent. Migration adds no new atomicity mechanism, only checkpoints.

### 13.2 Failure semantics

- A blocking diagnostic, a guard failure, a validation failure or any error before COMMIT ⇒ **live data unchanged** (the primitive already guarantees this) and the attempt is `blocked`/`failed` with the structured report; the user's source is intact.
- A failure *after* COMMIT is possible only in P10; it triggers the automatic undo below and is reported as a defect, not as a normal outcome.
- Schema: if the forward store migration (1 → 2) required for the domain collections fails, Foundation behavior applies unchanged (`UPGRADE_FAILED`, store verified unchanged, new build refuses to run, ADR 0001 §7). The migration milestone does not introduce a degraded mode.

### 13.3 Undo and the disaster path (D-12 "rollback-safe")

Two different recoveries, deliberately separate:

1. **Undo import** — a single UoW (one transaction, same Store Port) that deletes exactly the records this run *created* (origin `disposition: carried` and no origin from any other active run), their relationship rows, the run's origin rows and its `recovery_artifact` row if no other run references it, inserts a `migration_undo` row, and leaves media/artifact **files** to garbage collection. It **refuses** (`MIG_UNDO_REFUSED`, with the reasons) if any of those records was modified after migration (stored payload ≠ origin `canonHash`'s payload), if a record created later references one of them (a V2 review of a migrated response, a V2 schedule of a migrated paper), or if the run is not the active run of its source. Undo is therefore safe at **any** later time and never takes newer V2 evidence with it. Partial undo does not exist.
2. **Disaster restore** — the foundation's pre-activation snapshot and `snapshots.restore` (replace). It restores the whole store to before the migration and is the correct tool for corruption, not for "I changed my mind"; the UI states that it also discards everything done since.

## 14. Conservation and invariants: how they are proved

### 14.1 The Disposition Ledger

During P6 the migrator writes `ledger.json` in staging: one entry per source entity and per top-level/library-level/section-level key, `{sourcePointer, kind, disposition, target:{collection,id}?, canonHash, diagnostics[]}`. The ledger is an *artifact to be verified*, not trusted output.

### 14.2 Independent verification (runs before P7 and again in P10)

The verifier does not call the mapper. It re-reads the **source copy** and the **staged (and later live) store** and proves:

| # | Property | Proves |
|---|---|---|
| C-1 | Every source entity has exactly one disposition; every top-level, section-level and library-level key is either in a carried record, in `legacy_residue`, or listed as reported/structural | **zero silent discard** (Scope §5.2) |
| C-2 | For every `carried` **structured canonical entity** (not media), `canon_hash(source value) == canon_hash(stored payload) == origin.canonHash`; the canonicalizer used for the source side is the JS implementation (`canonical.js`, vectors shared with Rust) | M-1…M-9, M-12…M-14 verbatim carry, unknown fields, array order, no fabricated timestamps |
| C-3 | `origin.sourcePosition` sequence equals the source index sequence per entity kind | entity order is conserved |
| C-4 | Per media asset (special mapping; **no** source-JSON-to-payload hash equality is claimed): `sha256(decoded source bytes) == stored file hash == media_object.contentHash`; decoded length `== declared size`; byte comparison of the published file with an independent decode; asset `id` and every source metadata key (`mimeType`, `name`, `size`, unknown keys) preserved in the payload exactly; `data` absent from the payload; every reference site resolves to its `media_object` and the referenced-id set equals the source's | M-10 |
| C-5 | Counts: for every kind `source = carried + deduplicated-identical + collapsed + reported-unmigrated` and `blocked = 0` | M-16 |
| C-6 | Every history row's `role` recomputes identically from stored rows; `|attempts|` equals the counting contract formula | M-11, D-5 |
| C-7 | No migrated payload contains a gap-listed field; every migrated record has an origin; every origin has a record | D-6, D-7, D-15, M-17 |
| C-8 | No row exists in any scheduling/recommendation/typing/explanation collection created by the run; no `dueAt`-class fact exists | M-17 |
| C-9 | `check_consistency` clean on staging; every projection recomputes; FK check clean | ADR 0001 A5 |
| C-10 | The staging source copy's SHA-256 equals `sourceId` at every phase and at P10; the migrator never opened the user's file with write access (access-mode assertion at the open site). Later moves, deletions or edits of the user's original are not part of any invariant | M-15 |
| C-11 | Recovery artifact: stored file hash == supplied bytes hash; no canonical row derives from `rawValue` | D-4 |

Any C-n failure is `MIG_LEDGER_INCOMPLETE` (blocking) in P6, or `ACTIVATION_POST_VERIFY_FAILED` (auto-undo) in P10.

### 14.3 Inventory invariants M-1…M-17

Each M-n is discharged by the C-checks above (mapping recorded in the Milestone's test matrix, §16): M-1…M-9, M-12…M-14 → C-2 (+C-3 for order); M-10 → C-4; M-11 → C-6; M-15 → C-10 and §4 (read-only intake); M-16 → C-5 and the report; M-17 → C-7/C-8.

## 15. Required foundation extensions (additive; nothing existing changes)

1. **Commit guard in `qs-activation`.** `Options` gains optional *guards*: read-only SQL assertions run inside the commit transaction after `ATTACH` and before the first write. For migration the guard is, per merged collection (`canonical`, `metadata` and `retained` roles, §15.5), "no row in `stg` shares an `id` with a row in `main` whose stored `payload` differs"; any violation rolls back as `ACTIVATION_FAILED` with live data unchanged. With no guard configured, behavior is byte-identical to today (the H3 suite must stay green unchanged).
2. **Write gate in `qs-port`.** A maintenance gate that refuses `store.commit` and excludes GC for a bounded activation window, released on every exit path; the WebView sees a `STORE_BUSY` envelope.
3. **Archive extension (H-4, required).** `recovery_artifact` rows and files travel in V2 archives; the archive `formatVersion` evolves accordingly, **older-format archives remain readable and restorable**, and a newer-format archive is refused by an older build with the existing specific code. Without this, a user's only copy of a recovered library would be lost on the first backup/restore cycle.
4. **Catalog migration 1 → 2.** The domain collections of §7.1, using the existing catalog mechanism; no foundation table changes.
5. **Catalog collection class.** The catalog gains a role per collection: `canonical` (consumer-visible domain data), `metadata` (migration origin/run/undo), `retained` (recovery artifact), `recovery-only` (existing). Activation merge, snapshots and archives include the first three; consumer-facing reads and the consistency/evidence hashes treat only `canonical` as domain data. Existing behavior for the current `canonical` boolean is preserved (foundation tests unchanged).
6. **Crate and checkpoint names.** New fault checkpoints (`mig-after-intake`, `mig-mid-staging`, `mig-after-staging`, `mig-after-report`, `mig-mid-media-publish`, `mig-after-media-publish`, `mig-after-artifact-publish`, `mig-before-undo-commit`) join the test-only `fault-injection` set; the shipped binary still contains none (CI assertion unchanged).

## 16. Automated verification contract for the Migration milestone

No part of this is written now. The milestone is not complete until every item below exists as an automated test, runs in Windows CI, and passes. Thresholds scale with environment variables exactly as in the Foundation (`QS_KILLS`, …); CI uses the ADR-level numbers.

### 16.1 Fixtures

All fixtures are **synthetic**, generated by scripts committed with the milestone, and contain no real user data, names, e-mails or machine paths. Two producers:

- **Producer-faithful**: Node scripts call V1's own `createLibraryBackup`/interchange builders over synthetic sessions so formats are exactly what V1 writes (this is also the differential oracle).
- **Hand-mutated**: byte/JSON-level edits of the faithful fixtures for malformed/partial/legacy cases.

| Group | Fixtures (minimum) |
|---|---|
| Representative | **R-min** (1 paper, 1 question); **R-full** (all five question types; image and audio refs; categories incl. empty; Translation folders/documents/items; Learner Responses Objective + Translation with annotations/marks (CJK, emoji, combining marks, astral characters, surrogate-splitting offsets); several Teacher Reviews on one response with corrections; remediation document with live provenance; retry responses with dangling soft provenance; history with twin / divergent / legacy-only entries; localized strings in results); **R-hist100** (exactly 100 history entries); **R-big** (media-heavy, ≥ 400 MiB base64 for the memory envelope) |
| Legacy / partial | no `documentType`; no `history`; no `translationLibrary` / `learnerResponses` / `teacherReviews`; `assets` alias; library without `schemaVersion`; envelope `schemaVersion: 99` with valid sub-documents; envelope version with an invalid sub-document; missing timestamps on papers/records |
| Unknown fields | an unknown key at **every** nesting level of every entity kind (envelope, library, paper, question, option/pair, response, response item, result, annotation, review, correction, folder, document, item, history entry, media asset), plus `extensions` objects |
| Malformed | empty file; truncated mid-token; truncated inside base64; UTF-8 BOM; UTF-16 file; not JSON; array root; ZIP (V2 archive); recovery-artifact shape as main input; single Learner Response / Teacher Review / Translation document / single-paper package as main input; wrong `documentType`; duplicate key (object and nested); lone surrogate; unsafe integer; non-JS-producible decimal; oversize non-media JSON |
| Media | missing referenced asset (paper, response snapshot, both); invalid / empty base64; size mismatch; same id identical; same id different bytes; same bytes different ids; wrong MIME class; unreferenced asset; unreferenced asset id mentioned in an unknown field; asset with unknown keys |
| Identity / relations | duplicate paper id; duplicate question id inside a paper; **cross-paper duplicate question ids (legal)**; duplicate Learner Response id (identical / different); duplicate Teacher Review id; duplicate folder / document / item ids; Teacher Review → missing response; review item id not in response; document → missing folder; remediation → missing review; response provenance → missing source (legal); history duplicate id (identical / different); history entry without id; history `responseId` → Translation response |
| Anchors | mismatching annotation slice; overlapping annotations; correction mismatch; valid offsets that split a surrogate pair |
| Recovery artifact | well-formed; wrong `sourceKey`; not JSON; `rawValue` that parses as a library; `rawValue` garbage; large |

### 16.2 Case families and assertions

1. **Detection table test.** For every fixture the classifier output (kind, per-section presence, record kinds, first failing stage, full diagnostic set of that stage) equals a committed expected value; precedence (§5) is covered by contradiction fixtures (declared vs shape).
2. **Differential oracle.** For every producer-faithful fixture: V1 `parseLibraryBackup` accepts **and** the migrator reports no blocking diagnostic other than the ADR-defined stricter ones (§9.3 duplicates, §6 text/number rules). Never the reverse for blocking-free outcomes: V1-valid + no stricter rule ⇒ migrator accepts.
3. **Zero-silent-discard.** C-1…C-11 run on every accepted fixture, plus: a **mutation-kill suite** that deliberately sabotages the mapper (drop a field, reorder an array, default a timestamp, convert absent→null, rewrite a string, merge two ids, drop an unknown key, skip an origin row) and asserts the verifier fails for each — proving the verifier would catch a real defect.
4. **Lossless round-trip.** Canonical hash source↔DB↔JS for all structured canonical entities (media is covered by C-4 instead), including the path-like and CJK/astral strings (reusing the Foundation's structured-contract path-like literals through `store.read`).
5. **Gap/absence.** Fixtures lacking fields remain absent after migration (never `null`/defaulted); gap lists match the registry; no V2-only field or collection row exists (C-7, C-8).
6. **History.** Role classification table over twin / divergent / legacy-only / duplicate / id-less / Translation-twin cases; counting-contract formula; `R-hist100` flag.
7. **Media.** Byte-identical published files; peak working set of the 400 MiB fixture ≤ the Foundation envelope (300 MiB); staged media survives a simulated > 24 h preview (GC cannot remove it); GC cannot remove a deduplicated file during activation (write gate).
8. **Idempotence and repeat import.** Table §9.2 as tests: import twice (second is `MIG_ALREADY_MIGRATED` with zero writes — verified by physical store hash); import overlapping source (identical overlap deduplicates; differing overlap blocks with no change); import → undo → import; import → edit migrated record → undo refused; import → V2 record referencing migrated record → undo refused; undo leaves no origin/run-active rows.
9. **Fail-closed.** Every blocking fixture ends with the live store **physically unchanged** (hash) and no snapshot/staging residue after recovery; every blocking diagnostic code of §11 has at least one fixture.
10. **Preview contract.** `report.json` is deterministic for identical inputs (same `reportHash`), path-free (the structured-contract path scan), contains the §12.1 sections; Confirm with a stale `reportHash` or a different `sourceId` is refused (edits to the user's original after P1 are irrelevant).
11. **Source immutability and the TOCTOU boundary.** The migrator never opens the user's file in a write mode and never modifies it (asserted at the open site in the harness); the staging copy's hash equals `sourceId` after success, blocked outcomes and kills; and if the user's file is moved, deleted or modified after P1 the attempt still completes on the staged copy unchanged. OS metadata such as access time is **not** an invariant.
12. **Recovery artifact.** Byte-for-byte file equality and hash; no canonical row derived from `rawValue` (including the "parses as a library" fixture); unrecognized input blocks the run; artifact survives archive create → restore (§15.3).

### 16.3 Crash and fault matrix

Using the Foundation's child-process kill harness: every checkpoint in §13.1 and §15.5 × both modes where applicable × `QS_H3_REPEATS` repeats (CI: ≥ 3), asserting **exactly pre or exactly post** (store physical hash equals pre-state or post-state; never a third), deterministic idempotent `recover`, source untouched, and — for post — C-1…C-11 pass on the live store. Plus a randomized-time kill loop over R-full (CI: ≥ 200 kills, 0 violations), a kill during undo, and an injected failure of the commit guard, of the gate release path, and of the 1 → 2 schema migration (`UPGRADE_FAILED`, store unchanged).

### 16.4 Exit criteria mapped to Scope §23 "Migration"

| Release-gate item | Satisfied by |
|---|---|
| valid V1 backup import | 16.2-1, -2 on R-min / R-full / legacy fixtures |
| historical semantic preservation | 16.2-3, -4, -6 |
| Teacher Review preservation | C-2/C-3 on multi-review fixtures; hard FK; 16.2-3 mutations |
| Translation evidence preservation | R-full annotations (UTF-16), marks, snapshots; 16.2-4, -5 |
| Retry lineage preservation | response-level provenance incl. dangling carried verbatim; no item-level inference asserted (16.2-5); D-6/D-7 gaps asserted |
| media/reference integrity | 16.2-7, media fixtures, hard FKs |
| no silent data loss | 16.2-3 including the mutation-kill suite |
| migration failure does not destroy source data | 16.2-9, -11, 16.3 |

## 17. Consequences, risks and honest limitations

- **Verbatim carry defers all V2 schema design.** Migrated records are V1-shaped until a later journaled transform evolves them. This is intentional (migration must not mix transformation with intake) and makes conservation provable; the cost is that the V2 domain contract milestone must read both V1-shaped migrated rows and native rows, distinguishable by presence of an origin row and by `schemaVersion`.
- **Strictness exceeds V1 in a few places** (duplicate keys, lone surrogates, non-JS-producible numbers, duplicate ids in unique scopes, size mismatch). Each blocks rather than guesses. A genuinely V1-valid backup that violates one of these has no automatic path in V2; the user's recourse is to correct the V1 data and re-export, because V2 may not remap or repair (D-11).
- **R-06 users remain blocked at the source.** A user whose V1 export fails because of a missing media asset cannot produce a backup; V2 cannot read what V1 cannot write, and D-2 forbids a V1 patch. D-3 governs the opposite case (a backup whose media is incomplete).
- **S3 intake is manual** (§10.3): V1 offers no export, so it requires the user to supply the value as a file. The mechanism is complete and the guarantees are real, but expected real-world usage is low.
- **Streaming bound.** Everything except media payloads is materialized; the 128 MiB design bound is a hypothesis to be measured by the milestone.
- **Single mapping version.** `mappingVersion` is recorded so a future corrected mapping can be reasoned about; this ADR defines version 1 only.

## 18. Human Gate record — ACCEPTED, GO WITH AMENDMENT (2026-10-02)

The Product Owner accepted this ADR with the following decisions and amendments; both are folded into the normative text above. **Migration implementation is NOT STARTED and is not authorized by this acceptance.**

| # | Decision | Where |
|---|---|---|
| H-1 | **Block** a source containing a lone UTF-16 surrogate; no U+FFFD substitution. | §6 rule 2 |
| H-2 | **Additive-only** `Merge(KeepExisting)` approved; no `Replace` / overwrite offered to migration. | §1, §9.2, §13.1 |
| H-3 | `migration_origin.offsetEncoding` is the authoritative UTF-16 label for **migrated** records. The proposed global "missing `offsetEncoding` ⇒ UTF-16" default is **withdrawn**: native V2 offset-bearing records must declare their encoding explicitly under the future domain schema, and a record with no migration origin and no encoding is invalid. | §7.3, §7.5 |
| H-4 | Recovery artifacts **must** be preserved in V2 archives/backups; archive `formatVersion` evolves and older formats stay readable. | §10.3, §15.3 |
| H-5 | Targeted inverse UoW **undo** approved; snapshot restore is the disaster path only. | §13.3 |
| H-6 | The §8.1 twin / twin-divergent reconciliation table is approved; the Migration milestone may only **narrow** it on evidence from V1 baseline code, never widen it by inference. | §8.1 |

**Amendments (contract consistency)**

1. **Media is a special mapping, not verbatim carry.** Structured canonical records are proved by C-2; media assets conserve identity/metadata, decoded bytes and references, never store base64, and carry a V2-derived `contentHash`, proved by C-4. No claim of source-JSON/stored-payload hash equality for media remains (§7.1, §7.3, C-2, C-4, §16.2-4).
2. **`recovery_artifact` is not canonical domain data.** Three classes are distinguished — canonical domain records, durable migration metadata (`migration_origin` / `migration_run` / `migration_undo`), durable recovery-only artifact — and the artifact is archived and kept but never consumed as canonical (§7.1, §10.3, §15.5).
3. **The P1 staging copy is the TOCTOU boundary.** After P1 the immutable copy (identified by `sourceId`) is the sole authority for the attempt; later changes to the user's file affect nothing. The P11 re-hash/metadata requirement and "original changed ⇒ confirmation invalid" are removed; the source-immutability test proves only that the migrator never opens the user's file for write and that the staging copy's hash equals `sourceId`; OS metadata (atime etc.) is not an invariant (§4, §11, C-10, §16.2-11).
4. **§7.5 follows H-3**: explicit origin label for migrated records, payload verbatim, no implicit default for native V2 records.

## 19. Not authorized by this ADR

Accepting this ADR does not start the Migration milestone (implementation is **NOT STARTED**; it needs its own explicit authorization), create V2 domain schemas beyond §7.1, start Scheduler/Recommendation/Calendar, or touch the V1 production line. Each remains a separate, explicitly authorized step (Scope §24).
