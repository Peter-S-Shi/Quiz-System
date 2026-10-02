# V2 V1 → V2 Migration — Milestone Record

**Branch:** `v2` (long-lived V2 development line; not merged to `main`)
**Status:** **ACCEPTED** (Human Gate PASS, 2026-10-02)
**Authority:** `V2_PRODUCT_SCOPE_FREEZE.md` Revision 1 (§4.5, §5.2, §10.3, §23), `docs/V2_MIGRATION_READINESS_INVENTORY.md` (Human Gate decisions D-1…D-15), ADR 0001 (ACCEPTED), **ADR 0002 (ACCEPTED — GO WITH AMENDMENT; §15 foundation extensions and §16 verification contract are this milestone's implementation and acceptance basis)**, the accepted Desktop Foundation.
**Code:** [`desktop/core/migrate_v1`](../desktop/core/migrate_v1) (`qs-migrate-v1`) plus the additive foundation extensions below. V1 production code, tests and CI are untouched (no file outside `desktop/`, `docs/`, `manual-qa/`, the status files and the V2 workflow changed). No V1.x patch, no browser-profile access, no real user data.

## 1. Objective and scope

Turn ADR 0002 into working, proven software: a valid V1 `v1.0.0` full backup is previewed, confirmed and migrated atomically into the V2 store with every historical fact conserved; everything else fails closed with the user's file and the live store untouched; a repeat import is a no-op; an import can be undone; crashes resolve to exactly *pre* or exactly *post*.

| In scope | Not started (unchanged) |
|---|---|
| Foundation extensions (ADR 0002 §15) | Scheduler / Recommendation / Calendar (their ADR is not started) |
| `qs-migrate-v1`: lossless intake/detection, mapping + provenance, history reconciliation, media + recovery artifact, staging/preview/confirmation, additive activation, idempotence, undo, conservation verifier | Objective / Translation / Typing domain integration, full product UI, conflict-resolution UX |
| Minimal formal WebView/native surface: native Open dialogs in Rust, path-free preview + confirm/cancel/undo commands, a Settings card | Code signing, auto-update, V1 changes |
| ADR 0002 §16 automated verification contract in CI | Executing manual items M1–M7 and D1–D4 (see §6) |

## 2. What was built

```text
WebView (offline shell)    Settings card "Import from Quiz Studio V1": preview, confirm / cancel, undo list
   │  migration.status | confirm | cancel | undo    (path-free, allowlisted)      ← native_migration_* choose files in Rust
   ▼
qs-port  Core: pending preview · write gate · migration.prepare (native-only, carries a path)
   ▼
qs-migrate-v1
   reader.rs   event-level lossless reader (dup keys, lone surrogates, JS-producible numbers, streamed base64 media)
   model.rs    detection precedence · structural/identity/referential/media/semantic validation · history classification
   stage.rs    plan rows (verbatim carry; media special mapping) · live reconciliation · staging store · Disposition Ledger
   verify.rs   conservation verifier C-1…C-9, C-12 (independent of the mapper)
   engine.rs   prepare → activate → post-verify → undo · status · Host trait
   catalog.rs  store schema 1 → 2: paper, library_categories, learner_response, teacher_review, translation_*,
               legacy_history_entry, legacy_residue, migration_origin/run/undo, recovery_artifact
   diag.rs     the closed registry of 50 diagnostic codes (blocking / reportable) and stages
```

### Foundation extensions (ADR 0002 §15) — additive, existing semantics unchanged

| # | Extension | Where | Evidence |
|---|---|---|---|
| 1 | Commit guard: read-only SQL assertions inside the commit transaction (`Guard::no_conflicting_ids`) | `qs-activation` | `activation_contract` (2 new tests): same-id/different-payload rolls back with live data physically unchanged; without guards behaviour is identical (the H3 suite is unchanged) |
| 2 | Write gate (`STORE_BUSY`, RAII, released on unwind) refusing store writes, restore and GC | `qs-port` | `port_contract` gate test; `migration_port` |
| 3 | Archive format v2 carrying `recovery_artifact` rows **and** files; v1 archives still readable; a v1 archive may not smuggle recovery entries | `qs-archive` | 4 new archive tests (byte-for-byte round trip, missing/tampered artifact refused before activation, v1 archive restorable) |
| 4 | Catalog migration 1 → 2 (domain collections) through the Foundation's schema ownership | `qs-migrate-v1::catalog` | `catalog_upgrade`: upgrade preserves data, failing upgrade → `UPGRADE_FAILED` + store unchanged, older build gets `SCHEMA_NEWER`, a Foundation-era archive restores into schema 2 |
| 5 | Collection roles `canonical` / `metadata` / `retained` / `recovery-only` | `qs-store::catalog` | `catalog_roles` |
| 6 | Fault checkpoints (`mig-*`) | `qs-platform` | `migration_faults`; the shipped binary still contains none (CI assertion unchanged) |

## 3. ADR 0002 §16 → evidence

| §16 item | Evidence (suite → what it proves) |
|---|---|
| 16.1 Fixtures | Producer-faithful: `scripts/gen-v1-fixtures.mjs` builds `r-min`, `r-full` (5 question types, image+audio, cross-paper duplicate question ids, CJK/astral/combining text, multiple reviews per response, remediation document, retry response with dangling provenance, twin/divergent/legacy-only history, shared-content media), `r-hist100` with **V1's own `createLibraryBackup` and interchange builders** (CI regenerates them and fails on drift). Hand-mutated cases derive from them; the 400 MiB fixture is streamed by `qs-scenario gen-big` |
| 16.2-1 Detection table | `detection`: 29-case table + precedence (declared beats shape; envelope version never decides alone; failing stage stops later stages but lists all of its own problems) |
| 16.2-2 Differential oracle | `oracle`: V1's `parseLibraryBackup` accepts ⇒ the migrator accepts except the 3 documented stricter cases; V1 rejects ⇒ the migrator blocks |
| 16.2-3 Zero silent discard | `conservation`: C-1…C-9, C-12 on every accepted fixture inside `prepare` and again after commit; the **mutation-kill suite** (15 sabotage classes: dropped field, reordered array, defaulted timestamp, absent→null, rewritten string, dropped unknown key, lost record, missing origin, wrong position, wrong history role, wrong media hash, base64 left in a payload, scheduling row created, dangling remediation provenance, an undispositioned source entity) must each fail the verifier |
| 16.2-4 Lossless round trip | `conservation` (unknown fields at every nesting level, path-like text, CJK, number forms) + `oracle` (JS canonicalizer hash == Rust origin hash for every entity of every fixture) + `migration_port` (path-like text unscrubbed through the WebView) |
| 16.2-5 Absence / gaps | `conservation`: absent stays absent (never null/default), gaps declared, no V2-only row or field created, offset encoding labeled only on migrated anchor-bearing records, payload verbatim |
| 16.2-6 History | `history`: twin / divergent / legacy-only, counting formula, collapse + conflict, content-derived key, translation-twin mismatch, exactly-100 cap flag |
| 16.2-7 Media | `media`: byte-identical files, no base64 stored, shared content, orphan reported not migrated (+ id mention warning), `data:` prefix and unpadded base64, staged media survives a 72 h-old GC, 400 MiB memory envelope (`migration_faults`) |
| 16.2-8 Idempotence / repeat | `idempotence`: same bytes twice is a no-op with zero writes; two previews activate once; overlap deduplicates; import → undo → import; undo refused when modified / depended upon; shared records survive undo of one source; **ownership vs disposition** (X carried + Y deduplicated: undo X keeps the record and Y's disposition, undo Y removes it; reverse order; a V2-native record deduplicated by two migrations survives both undos); absent section never deletes; post-commit defect → automatic undo |
| 16.2-9 Fail-closed | `blocking`: 40 mutated sources + 5 option/live cases cover **every** blocking code of the registry (the test fails if one is missing); each leaves the live store physically unchanged, no staging residue, the user's file byte-identical |
| 16.2-10 Preview contract | `preview`: deterministic `reportHash` across independent runs, path-free, every §12.1 section present, stale/foreign confirmation refused, blocked preview has nothing to confirm |
| 16.2-11 Source immutability / TOCTOU | `preview`: read-only file (so any write open would fail) migrates; the attempt completes after the user's file is changed and deleted; staged copy hash == `sourceId`; OS metadata is not an invariant |
| 16.2-12 Recovery artifact | `artifact`: byte-for-byte (CRLF, BOM), never canonical, `rawValue` that parses as a library stays inert, unrecognized artifact blocks, archive round trip, undo removes the row but never the file; **first import without artifact → same source later with artifact → artifact-only preservation with canonical state hash unchanged → archive round trip → repeat is a no-op → undo of the attach**; an illegal late artifact blocks and changes nothing |
| 16.3 Crash/fault matrix | `migration_faults`: every checkpoint (13, + 4 with an artifact) × `QS_H3_REPEATS` kills → exactly pre or exactly post, idempotent recovery, user's file untouched, retry completes; randomly timed kills (`QS_MIG_KILLS`); kill during undo (both the migration checkpoint and `uow-before-commit`); a preview→commit race caught by the commit guard (`idempotence`); failing/older schema (`catalog_upgrade`) |
| Memory envelope | `migration_faults::a_large_backup…`: peak working set of the migrating process stays under 300 MiB for the CI size (see §4) |

Exit criteria ↔ Scope §23 "Migration": valid import (`lifecycle`, `oracle`), historical semantics (`history`, `conservation`), Teacher Review and Translation evidence (`r-full`, C-2, hard FK), retry lineage (response-level provenance carried incl. dangling; no item-level inference), media/reference integrity (`media`), no silent data loss (mutation-kill), failure never destroys source data (`blocking`, `preview`, `migration_faults`).

## 4. Results

Local (development machine, debug test profile; thresholds default-scaled): full workspace suite green, `clippy -D warnings` clean, `rustfmt` clean, 18 JS tests, installed-style launch smoke (debug build) with the 8-step `--self-test` including a migration import + undo. The full 400 MiB envelope run (a 533 MiB backup file) took 21 s locally and the migrating process peaked at 10.3 MiB working set (limit 300 MiB); the dev profile optimizes only `sha2`, `qs-media` and `qs-migrate-v1` so such tests stay fast.

CI (`Desktop (V2)` on `windows-latest`, ADR-level thresholds `QS_MIG_KILLS=200`, `QS_H3_REPEATS=3`, `QS_HEAVY_MIB=400`): the Human Gate HOLD close-out is **green** on commit `1eefb2f`: [run 37039302072](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37039302072). Pre-HOLD implementation: **green** on commit `4a2ad03`, [run 37034644764](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37034644764). The first run (`3802ac6`) failed in the random-kill suite: the identity peek used a read-only connection that cannot recover a hot WAL after a killed first-time creation; fixed in `4a2ad03` (read-write, no-create peek).

## 5. Implementation clarifications for the Human Gate

None of these changes a policy of ADR 0002, the Inventory or the Scope Freeze; they are decisions the implementation had to make. Review them with the milestone.

1. **Category list payload.** A V1 category list is an array, but a canonical payload must be an object, so `library_categories` stores `{"categories": [...]}` under the fixed id `categories` (ADR §7.1). Consequence of the fixed singleton id: two backups whose category lists differ are a `MIG_LIVE_CONFLICT`, never a silent merge.
2. **Residue wrapper.** `legacy_residue` stores `{"pointer", "value"}` (the value is verbatim).
3. **Remediation provenance has no foreign key.** It only applies when `provenance.purpose == "remediation"`, and a projection pointer cannot express a condition. It is enforced by the P4 validator and re-proved after staging **and** after commit by verifier check C-12 (mutation-killed). `translation_document.folder_id` *is* a real FK (V1 requires a folder).
4. **Strictness beyond the ADR text** (each blocks rather than guesses): integer tokens outside ±(2^53 − 1) are unsafe; asset ids or media-reference ids with surrounding whitespace; a missing/non-integer declared asset `size`; both `mediaAssets` and `assets` non-empty; a document without a resolving `folderId`; position gaps in translation items. The differential oracle test lists the three cases where V1 accepts and the ADR requires blocking.
5. **`MIG_OFFSET_SPLITS_SURROGATE` is unreachable for real data.** An offset that splits a surrogate pair needs a lone surrogate inside the anchored text, which H-1 blocks at the reader (`MIG_SOURCE_LONE_SURROGATE`); `blocking` proves that path. The reportable code stays defined for completeness.
6. **Extra diagnostic** `MIG_HISTORY_RESPONSE_KIND_MISMATCH` (a history entry whose `responseId` resolves to a non-Objective response has no twin). `MIG_UNDO_REFUSED` is an *outcome* (`Refused { reasons }`), not a registry code.
7. **Undo ownership vs disposition** *(revised by the Human Gate HOLD, ADR §21 G-2).* `migration_origin.disposition` stays the original migration fact for ever. Current deletion ownership is the separate origin field `deletionOwner` (initially `disposition == carried`). Undoing a run that owns a record another active run still holds keeps the record and sets `deletionOwner` on those holders; their `disposition` is untouched. A record no origin owns (V2-native data that migrations only deduplicated) is never deleted by any undo.
8. **Undo dependency detection** covers hard foreign keys and the registered soft probes (`teacher_review.response_id`, history `twin_response_id`, media references). Soft dependents of *future* domains become detectable when those milestones register their probes.
9. **Corrections conflict rule.** V1's "overlapping content-changing corrections conflict" rule is not re-validated (only anchor/text conformance in UTF-16 is, as ADR 0002 specifies).
10. **Non-media JSON bound** is a constant 128 MiB (`MIG_SOURCE_TOO_LARGE`); the measured process peak is far below it for the tested media-heavy fixture.
11. **Pre-flight space check** requires `2 × source + 64 MiB` free on the staging volume (`MIG_INSUFFICIENT_SPACE`); a disk-full error during copy-in maps to the same code.
12. **Artifact after the fact** *(ADR §21 G-1).* A legal, not-yet-preserved recovery artifact supplied for an already-migrated source is preserved by an artifact-only operation: `plan.mode = "artifact-only"`, a `migration_run` row `kind: "artifact-attach"` (`sourceId`, `recoveryId`, `attachedTo`) is the durable link, and no canonical record, origin or import run is written. An artifact that is already preserved is a no-op; an illegal one still blocks. The Settings card shows a dedicated "Preserve artifact" preview; the run list labels attach runs.
13. **Wrapper records** *(ADR §21 G-3).* `library_categories` (`{categories}`), `legacy_history_entry` (`{entry, role, ...}`) and `legacy_residue` (`{pointer, value}`) are value-preserving structural mappings: the inner value is conserved exactly (verifier C-2(b)); no whole-payload hash equality with the source is claimed.

## 6. Open items (explicit, not waived)

- **Manual packaged checks M1–M7** (native Open dialog for the V1 backup incl. CJK and OneDrive-redirected sources, confirm/cancel, blocked input, optional artifact, repeat/undo, ≥ 400 MiB import): [`manual-qa/v2-migration.md`](../manual-qa/v2-migration.md). Not run; non-blocking acceptance debt like D1–D4 of the Desktop Foundation (which also remain open).
- S3 recovery blob intake remains a manual file by design (V1 has no export path for it; ADR 0002 §10.3).
- Real-world V1 data was never used; all fixtures are synthetic.

## 7. How to run

```text
node desktop/scripts/gen-v1-fixtures.mjs                      # regenerate fixtures with V1's own producer (must be a no-op)
cargo test -p qs-migrate-v1                                    # the migrator suites (needs Node for the oracles)
cargo test -p qs-scenarios --test migration_faults -- --nocapture
    # QS_H3_REPEATS=3  QS_MIG_KILLS=200  QS_HEAVY_MIB=400     # the CI thresholds
```

## 8. Gate readiness

Implementation complete; ADR 0002 §16 is implemented as automated tests that pass locally and are wired into the Windows CI workflow. The Human Gate first placed the milestone on HOLD (ADR 0002 §21 close-out, implemented and green), then **PASSED it: the Migration milestone is ACCEPTED**.

## 9. Human Gate outcome: ACCEPTED

The milestone is accepted. **Manual packaged checks M1–M7 (§6) and the Desktop Foundation's D1–D4 remain open, non-blocking acceptance debt: not PASS, not waived, not deleted.** Scheduler / Recommendation / Calendar implementation is **not authorized**; the next stage is the architecture decision [ADR 0003](adr/0003-learning-orchestration-scheduling-recommendation-calendar.md) (PROPOSED, awaiting its own Human Gate).
