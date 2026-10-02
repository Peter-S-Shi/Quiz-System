# Quiz Studio V1 → V2 Migration Readiness Inventory

**Status:** HUMAN GATE PASSED — decisions recorded in §10
**Audit baseline (code evidence):** `main@a79425db1bf1ec17d18f40476ead12146baeafea` (contains V1 `v1.0.0` = `787fc5a`)
**Current main at close-out:** `main@36075117464cb870814582c136e34355aa7fc18e` (PR #29). Delta `a79425d..3607511` touches **only** `V2_PRODUCT_SCOPE_FREEZE.md` (Revision 1: Calendar Scheduling Surface); `git diff --stat` over `src/`, `sw.js`, `index.html`, `styles.css`, `schemas/`, `scripts/`, `tests/`, `package*.json`, `manifest.webmanifest`, `start-local.bat` is empty → **no V1 production code change**, so all `path:line` evidence below remains valid. `npm test` re-run on `3607511`: 292 pass / 0 fail.
**Governing inputs:** `V2_PRODUCT_SCOPE_FREEZE.md` **Revision 1** (esp. §4, §5.2, §10.3, §23), `CLAUDE.md` Universal AI Coding Development Protocol, `docs/DEVELOPER_GUIDE.md` (Storage Governance table)
**Method:** static reading of production code under `src/`, public schemas, and docs; `npm test` as a baseline only. No code, tests, or governance files were modified. No browser profile was inspected.
**Note on governance sources:** no file named "AI Coding Operating Model" exists in tracked files (`git grep -il "operating model"` → no hits). The protocol applied is `CLAUDE.md`.
**Revision 1 relevance:** the Calendar Scheduling Surface adds user-authored scheduling facts (V2-only). V1 has none, so migration creates none (see M-17 and §10 D-15).

Evidence format: `path:line` (line numbers are for the audit baseline). Anything not provable from code is marked **UNVERIFIED**.

---

## 0. Executive summary

1. V1's canonical user data lives in **browser `localStorage` (10 live keys + legacy keys) and one IndexedDB database (`quiz-studio-media-db`)**. There is no server-side store.
2. The **only supported migration bridge is the V1 full backup JSON** (`createLibraryBackup`). It covers library, history, Learner Responses, Teacher Reviews, Translation Library and referenced media. It does **not** cover active sessions, active-paper selection, language/theme/UI preferences, or the library recovery blob.
3. Restore is **not atomic and not uniformly "replace"** (§5). Several V1 restore behaviors would be unsafe to reuse as V2's migration intake.
4. Evidence **fidelity gaps already present in V1 data** (cannot be recovered by any migrator): Objective feedback mode and Objective retry lineage are never persisted; Translation retry has no item-level lineage; history older than 100 entries or pre-dating Learner Responses has no canonical twin (§6).
5. Normalization is **lossy for unknown fields** on Learner Response, Teacher Review and Translation Document (§6.4). A V2 migrator must not reuse V1 `normalize*` as an intake path without a lossless-first read.
6. The V1 backup has **no integrity checksum, no app version, and an unenforced schema/documentType gate** (§5.3).

---

## 1. Source-of-truth map

### 1.1 Storage inventory

All keys are defined in `src/storage/local-storage.js:1-15` unless noted.

| # | Store / key | Contents | Writer(s) | Class |
|---|---|---|---|---|
| S1 | `localStorage` `quiz-studio-library-v1` | Library: `{schemaVersion, papers[], categories[]}` | `saveLibrary` `src/app.js:3550`; bootstrap `src/core/library-bootstrap.js:28,51,60` | **Canonical** |
| S2 | `quiz-studio-paper-v1` (`LEGACY_PAPER`) | Pre-library single paper | none (read-only source) `library-bootstrap.js:42` | **Legacy (read-once)** |
| S3 | `quiz-studio-library-recovery-v1` | `{schemaVersion, sourceKey, rawValue, reason, preservedAt}` raw copy of an unreadable/pre-migration library string | `preserveRecovery` `library-bootstrap.js:98-113` | **Recovery-only (may be sole copy of user data)** |
| S4 | `quiz-studio-active-paper` | Selected paper id | `src/app.js:1724,2294,2308,2343,2356,3542,3645,3709,3719` | **Transient / UI-selection** |
| S5 | `quiz-studio-active-session-v1` | In-progress Objective session (question snapshots, answers, results, `feedbackMode`) | `persistSession` `src/app.js:3760`; cleared `:5907`, `:3363` | **Recovery-only** |
| S6 | `quiz-studio-translation-active-session-v1` | In-progress Translation session (items snapshot, answers, annotations, itemMarks, `materialProvenance`) | `persistTranslationSession` `src/app.js:3801` | **Recovery-only** |
| S7 | `quiz-studio-history-v1` | Objective score-summary entries, capped at 100 | `recordHistory` `src/app.js:5912-5934` | **Derived (partly un-derivable, see §6.2)** |
| S8 | `quiz-studio-learner-responses-v1` | Finalized Learner Responses (Objective + Translation) | `finalizeLearnerResponse` `:3765`; `finishTranslationPractice` `:4582` | **Canonical** |
| S9 | `quiz-studio-teacher-reviews-v1` | Teacher Reviews | `saveCorrectionReview` `:5099-5103`; review import `:5234` | **Canonical** |
| S10 | `quiz-studio-translation-library-v1` | `{schemaVersion, folders[], documents[]}` incl. remediation documents | `saveTranslationLibrary` `src/app.js:3792` | **Canonical** |
| S11 | `quiz-studio-ui-preferences-v1` | `{theme, soundEnabled, motionPreference, sidebarWidth}` | `saveUiPreferences` `src/core/ui-preferences.js:92-106` | **Preference** |
| S12 | `quiz-studio-theme`, `quiz_system_theme`, `quiz_studio_sound_enabled` | Mirrors of S11 fields (written for backward compat) | `ui-preferences.js:102-104` | **Preference (redundant mirrors)** |
| S13 | `quiz_studio_ui_preferences` (`LEGACY_STORAGE_KEY_UI_PREFERENCES`) | Older prefs key, read-only fallback | read `ui-preferences.js:65` | **Legacy preference** |
| S14 | `quiz-studio-language` | `"zh"`/`"en"` | `src/app.js:1981`, read `:6019` | **Preference** |
| S15 | IndexedDB `quiz-studio-media-db` v1, store `media_assets` (`keyPath: id`) | `{id, mimeType, name, size, blob, createdAt}` | `saveMediaAsset`, `importMediaAssets` `src/core/media-store.js:191-349`; uploads `src/app.js:2615,2651` | **Canonical (binary)** |
| S16 | Cache Storage `quiz-studio-v6` + service worker | App shell cache | `sw.js:1-60` | **Transient** |
| S17 | In-memory only | e.g. `currentFeedbackMode`, selected category, selected question, history UI state | no persistence call found (`grep setItem/saveJson` list complete: `src/app.js`, `library-bootstrap.js`, `ui-preferences.js`) | **Transient** |

`THEME_KEY` is destructured (`src/app.js:145`) but the theme is actually persisted through `ui-preferences.js`; S12 `quiz-studio-theme` doubles as a legacy source in `loadUiPreferences` (`ui-preferences.js:69`).

**Doc/code discrepancies in `docs/DEVELOPER_GUIDE.md` Storage Governance table (lines ~108-119):** it names the legacy key `quiz-studio-legacy-paper` (code: `quiz-studio-paper-v1`); it omits S3, S11–S13, S15; it lists `quiz-studio-theme` as "N/A migration, not backed up". The code, not the table, is the source of truth.

### 1.2 Canonical vs derived vs transient

| Category | Items |
|---|---|
| **Canonical** | S1 library (papers, questions, categories), S8 Learner Responses (with embedded snapshots/annotations/marks/provenance), S9 Teacher Reviews, S10 Translation Library, S15 media binaries |
| **Derived (recomputable from canonical)** | Translation history index (`buildHistoryIndex` `translation-history.js:89`), needs-work items (`deriveNeedsWorkItemIds` `:16`), lineage view (`resolveResponseLineage` `:142`), wrong-question list (`getWrongQuestionIds` `src/app.js:5947` ← S7 + live paper), category counts (`categories.js getCategoryCounts`) |
| **Derived but not fully re-derivable** | S7 history (see §6.2) |
| **Recovery-only** | S3, S5, S6 |
| **Preference** | S11–S14 |
| **Transient** | S4, S16, S17, `mediaBlobUrlCache` (`src/app.js:1337`) |
| **Legacy / read-once** | S2, S13 |

---

## 2. Backup coverage matrix (V1 full backup)

Backup envelope: `createLibraryBackup` `src/core/backup.js:8-29`, parse `:31-80`, export UI `src/app.js:3660-3684`, import UI `:3686-3735`.

| Data | In backup? | Evidence | Restore behavior (`src/app.js:3690-3710`) | Notes |
|---|---|---|---|---|
| Library papers/questions/categories (S1) | **Yes** (raw `structuredClone`, not normalized at export) | `backup.js:19-20` | Replaced wholesale; `normalizeLibrary` on parse (`backup.js:62`) | |
| History (S7) | **Yes** | `backup.js:21` | **Always overwritten**, even when backup lacks `history` (parse returns `[]`, UI writes it) `backup.js:74`, `src/app.js:3706` | See R-05 |
| Learner Responses (S8) | **Yes** | `backup.js:22` | Overwritten **only if key present** (`hasLearnerResponses`) `src/app.js:3697` | Replace, not merge |
| Teacher Reviews (S9) | **Yes** | `backup.js:23` | Overwritten only if key present `:3698` | |
| Translation Library (S10) | **Yes** | `backup.js:24` | Overwritten only if key present `:3699-3705` | |
| Media (S15) | **Yes — only referenced IDs** | `src/app.js:3662-3667`; `collectReferencedMediaIds` `media-references.js:140` | `importMediaAssets` is upsert (`put`) `media-store.js:310-348`; never deletes | `createdAt` is **not** exported (`media-store.js:285-308`) |
| Active Objective session (S5) | **No** | `createLibraryBackup` has no such field | Restore calls `clearActiveSession()` `src/app.js:3726` | Intentional per guide |
| Active Translation session (S6) | **No** | — | **Not cleared** on restore (no call in import path) | May reference a document/ids absent after restore |
| Active paper id (S4) | **No** | — | Reset to `library.papers[0]` `:3708-3709` | |
| Language / theme / UI prefs (S11–S14) | **No** | — | Untouched | Device-local by guide |
| Recovery blob (S3) | **No** | — | Untouched | See R-09 |
| Legacy S2 / S13 | **No** | — | Untouched | |

**Backup-time asymmetry:** media IDs are collected from library + Learner Response snapshots **+ the active Objective session** (`src/app.js:3662-3666`), but the session itself is not exported. Export is **fail-closed**: if any referenced asset is missing from IndexedDB, the whole backup fails (`src/app.js:3668-3670`).

---

## 3. Entity inventory with identity, timestamps, snapshots, provenance

### 3.1 Library / Paper / Question
- **Paper** (`src/core/migrations.js:21-37`): `schemaVersion, id, title, description, category (string), tags[], createdAt, updatedAt, lastOpenedAt, questions[], provenance?`. Missing `id` → `makeId()`, missing timestamps → **`now`** (fabricated at normalization time) `:22,28-30`.
- **Library** (`migrations.js:8-19`): `{schemaVersion, papers, categories}`; `CURRENT_SCHEMA_VERSION = 1` (`:6`).
- **Category** is a **name string**, no stable ID (`categories.js`); renames rewrite every paper's `category` (`categories.js renameCategory`).
- **Question** (`question-registry.js:93-118`): spreads unknown fields (`...question`), ids defaulted with `makeId()`; five types `single|multiple|blank|truefalse|matching`; `image`/`audio` metadata `{id, mimeType, name, size, alt?|duration?}` (`media-types.js:97-132`). **No `explanation` field exists in V1** (V2 §10 additive).
- Question IDs are unique **within a paper**, not globally: `importPaper` regenerates the paper id but keeps question ids (`src/app.js:3636-3642`; `normalizePaper` keeps `question.id`).
- Media IDs: `img-<uuid>` / `aud-<uuid>` (`src/app.js:2615,2651`); not content-addressed, no hash stored.

### 3.2 Objective session → Learner Response → History
- Session shape created at `src/app.js:2990-3003`: `{id, paperId, paperTitle, startedAt, questions[] (prepared snapshots), index, answers, results, submitted, feedback, completed, feedbackMode}`.
- `prepareQuizQuestion` (`question-registry.js:157-178`): clones, sets `sourceId = question.id` (**item id == live question id**), **shuffles** `options` and builds shuffled `rightOptions` for matching. Snapshot therefore stores the shuffled presentation order.
- `createQuizLearnerResponse` (`interchange.js:78-121`): `material.type="quiz-paper"`, `material.id = paperId`, `snapshot.items = session.questions`, `responses[] {itemId, answer, result}`, `session {id, startedAt, completedAt}`, `summary {itemCount, correctCount, percent}`, `provenance {purpose:"practice"}`. **`feedbackMode` is not persisted.**
- `result` (`grading.js:makeResult`) embeds **localized display strings** (`correctLabel`, `correctAnswer`) in canonical evidence.
- History entry (`src/app.js:5912-5925`): `{id=session.id, paperId, paperTitle, completedAt, questionCount, correctCount, percent, responseId, missedQuestionIds, results}`; capped `slice(0,100)` `:5929`.

### 3.3 Translation domain
- **Folder** `{id, name, createdAt, updatedAt}`; **Document** `{schemaVersion, documentType, id, title, folderId, sourceLanguage, targetLanguage, createdAt, updatedAt, items[], provenance?, extensions?}`; **Item** `{id, sourceText, position, referenceTranslation?, notes?}` (`translation-domain.js:32-52,266-275 normalizeTranslationItem`).
- Library integrity: unique folder/document/item ids, doc→folder reference, contiguous `position` (`translation-domain.js:92-125`).
- **Translation Learner Response** (`interchange.js:123-180`): `material.type="translation-document"`, snapshot `{items, sourceLanguage, targetLanguage}`, `responses[] {itemId, answer:string}`, optional `learnerAnnotations[] {id, itemId, kind, start, end, text, createdAt}` and `learnerItemMarks[] {itemId, kind}`, `provenance = normalizeProvenance(session.materialProvenance) || {purpose:"practice"}`.
- **Annotation semantics:** offsets are **JS UTF-16 code-unit indices** into the learner answer; validated by `answer.slice(start,end) === text` and non-overlap (`translation-annotations.js:9-37`, `interchange.js:285-345`). Kinds: `unknown | uncertain | should_know` (`interchange.js` `LEARNER_ANNOTATION_KINDS`).
- **Teacher Review** (`interchange.js:383-422`): `{schemaVersion, documentType, id, responseId, createdAt, reviewer{type,displayLabel?,toolName?}, summary?, itemReviews[{itemId, judgment?, comment?, tags?, suggestedRevision?, corrections[]?, extensions?}], remediationRecommendations[], extensions?}`; corrections `{id, operation, start, end, anchoredText, text?, styleType?, color?, createdAt}` anchored to the same UTF-16 offsets (`interchange.js:19-47,455-500`).
- **Provenance** (`interchange.js:64-76`): `purpose ∈ practice|retry|remediation (string, not enum-checked) , sourceResponseId, sourceReviewId, sourceMaterialId, createdAt, author, extensions`.

---

## 4. Relationship / integrity map

| # | Relationship | Strength | Enforced where | Evidence |
|---|---|---|---|---|
| I-1 | Teacher Review `responseId` → Learner Response | **Hard (must resolve)** | Collection parse when `learnerResponses` context supplied; backup parse; live load | `review-records.js:3-27,82-93`; `src/app.js:3782-3785`, `backup.js:41` |
| I-2 | Teacher Review `itemReviews[].itemId` ∈ response items | Hard | `validateTeacherReview` | `interchange.js:437-452` |
| I-3 | Correction / annotation anchors match learner answer text | Hard | validators | `interchange.js:285-345,455-500` |
| I-4 | Multiple reviews per response allowed; unique review `id` | Hard (id) | `parseTeacherReviewCollection` | `review-records.js:20-24,81-83` |
| I-5 | Learner Response unique `id`; item ids unique; every item has exactly one response; `summary.itemCount` = responses | Hard | `validateLearnerResponse` | `interchange.js:245-276`; `learning-records.js:3-17` |
| I-6 | Finalized Learner Response immutable (same id with different content rejected) | Hard | `upsertLearnerResponse` | `learning-records.js:19-35` |
| I-7 | Live **remediation** Translation Document `provenance.sourceResponseId/sourceReviewId` → existing response/review, review belongs to response, `sourceMaterialId` matches | Hard for live docs | Backup parse; remediation import; deletion block | `review-transport.js:170-203`; `backup.js:52-57`; `deletion-policy.js:34-76` |
| I-8 | Learner Response own `provenance.sourceResponseId/sourceReviewId` → source response/review | **Soft (may dangle)** | Not validated; lineage viewer marks "unavailable" | `backup.js:47-51` (comment), `translation-history.js:142-185` |
| I-9 | Translation Document → Folder | Hard | `validateTranslationLibrary` | `translation-domain.js:117-120` |
| I-10 | Learner Response `material.id` → live paper/document | **Soft (snapshot makes it non-resolving by design)** | none | Retry uses snapshot only `translation-retry.js:8-18` |
| I-11 | Question/LR-snapshot `image.id`/`audio.id` → media asset (+MIME class) | Hard at **backup/restore/portable-paper** time | `validateItemsMediaIntegrity` | `media-references.js:107-137`; `backup.js:60-72`; `paper-portability.js:12-22` |
| I-12 | History `missedQuestionIds` → live paper question ids | Soft; filtered against live paper | none stored | `src/app.js:5947-5955` |
| I-13 | History `responseId` → Learner Response | Soft | none | `src/app.js:5921` |
| I-14 | Paper `category` → `library.categories` | Soft; auto-added by normalization | `normalizeCategoryList` | `categories.js` |
| I-15 | Objective Learner Response ↔ History entry via `session.id` (= `history.id`, `response.session.id`) | Soft | none | `src/app.js:5914-5915`, `interchange.js:101-105` |
| I-16 | Media cross-record: LR snapshots keep media alive after paper deletion | Policy | `cleanupOrphanedMedia` | `media-references.js:140-232` |

Not validated by backup parse: **history entries (no shape check)**, S5/S6 sessions (not in backup), Learner Response media in History (none).

---

## 5. Backup / restore contract analysis

### 5.1 `createLibraryBackup` (`backup.js:8-29`)
- Parses/validates LR, TR (against LR), translation library before export.
- Envelope fields: `schemaVersion` (=library `CURRENT_SCHEMA_VERSION`, i.e. 1), `documentType:"quiz-studio.library-backup"`, `exportedAt`, `library`, `history`, `learnerResponses`, `teacherReviews`, `translationLibrary`, `mediaAssets`.
- **No app version, no checksum/hash, no counts, no media manifest.**
- Media payload is **base64 inside one JSON** (`media-store.js dataToBase64`), so backup size scales with media (size limits/streaming behavior: **UNVERIFIED**).

### 5.2 `parseLibraryBackup` (`backup.js:31-80`)
Validation performed: library has ≥1 paper; `history` is array if present; LR/TR collections validated (duplicate ids, cross-record TR→LR); translation library validated; remediation provenance cross-check; media asset map validity; media references for papers and LR snapshots.
Accepted legacy shape: `value.assets` alias for `mediaAssets` (`backup.js:44`); missing `learnerResponses`/`teacherReviews`/`translationLibrary` keys tolerated.
**Not performed:** `documentType` check, backup `schemaVersion` gate (a backup with `schemaVersion: 99` is accepted), history validation, duplicate paper/question id check, referential check of history ↔ responses.

### 5.3 Restore sequence (`src/app.js:3690-3730`) — non-atomic
Order: (1) `importMediaAssets` → (2) LR → (3) TR → (4) Translation Library → (5) History → (6) in-memory `library` → (7) `saveLibrary()` at `:3727`. A failure between steps leaves mixed state (new media/LR/history, old library). **`saveLibrary()` returns `false` silently when `libraryBootstrapState.canPersist === false`** (`:3551`) while the success toast is shown at `:3710` before it.

### 5.4 Legacy / schema normalization chain
`bootstrapQuizLibrary` (`library-bootstrap.js:4-66`): canonical key → JSON parse → `isSupportedCanonicalLibrary` (requires `papers.length>0`, each paper has `questions[]`, `schemaVersion` integer 1..`CURRENT`) → `normalizeLibrary` → if serialization differs from raw, **preserve raw to S3 first** then rewrite (`:24-30`). Else legacy S2 → wrapped into library (S2 not deleted). Else default sample library. `migrateLibrary` only acts when `schemaVersion` is falsy (`migrations.js:39-49`) — i.e., there is **no real versioned migration ladder**; `CURRENT_SCHEMA_VERSION` has never advanced past 1.

---

## 6. Deletion, survivability, and fidelity

### 6.1 Evidence survivability on deletion
| Action | Effect on evidence | Evidence |
|---|---|---|
| Delete paper | Papers removed; **Learner Responses and history retained**; media retained if any LR snapshot references it | `src/app.js:2331-2349`; `media-references.js:140-232` |
| Delete category + papers | Same as above | `src/app.js:1709-1733` |
| Delete Translation Document | LRs untouched (snapshots self-contained) | `deletion-policy.js:15-21` |
| Delete Translation Folder | Cascades to its documents only | `translation-domain.js deleteTranslationFolder` |
| Delete Learner Response | Cascade-deletes its Teacher Reviews; derived responses kept (dangling-but-safe provenance); **blocked** if a live remediation document claims it | `deletion-policy.js:34-57`; `src/app.js:5839-5871` |
| Delete Teacher Review | Never mutates response; blocked if live remediation document claims it | `deletion-policy.js:59-76`; `src/app.js:5873-5886` |
| "Clear paper history" | Deletes that paper's history **and its Learner Responses** (no review/dependent check) | `src/app.js:5957-5975`; `learning-records.js:37-39` |
| Backup restore | Replaces (not merges) LR/TR/translation/history/library; see §5 | `src/app.js:3697-3708` |

### 6.2 What cannot be re-derived from canonical data
- **History (S7):** reconstructible from Objective Learner Responses only when `responseId` exists. Entries from before Learner Responses existed (pre-M6.0 data, `responseId` absent — **UNVERIFIED whether such users exist**) have no canonical twin. History beyond 100 entries is dropped at write time (`src/app.js:5929`) while the LRs survive, so a history-derived view and an LR-derived view can legitimately differ.
- **Objective feedback mode (Instant vs Submit-at-End):** present in session (`src/app.js:2990-3003`), absent from LR (`interchange.js:78-121`) and history (`:5914-5925`). **Permanently lost on finalization.** Relevant to V2 Practice/Test intent semantics.
- **Objective retry/"wrong-only" lineage:** `startQuiz({questionIds, wrongOnly})` (`src/app.js:2962-3003`) records no mode/source; LR provenance is always `{purpose:"practice"}` (`interchange.js:116-118`). No V1 data can say "this attempt retried that one" for Objective.
- **Translation item-level retry lineage:** `buildRetryMaterial` assigns **new item ids** (`translation-retry.js:21`) and records only response-level `sourceResponseId/sourceReviewId/sourceMaterialId`. Which original item a retried item corresponds to survives only via text equality / the user's selection (not stored).
- **Media `createdAt`:** dropped by `exportMediaAssets` (`media-store.js:285-308`); re-stamped to import time (`:343`).
- **Paper timestamps when absent:** synthesized at normalization (`migrations.js:22,28-30`).

### 6.3 Orphan / media behavior
- Cleanup is **candidate-driven** and reference-aware (library + active session + LR snapshots + active paper) `media-references.js:209-232`, `src/app.js:1355-1380`; errors are swallowed (`catch {}`).
- Un-referenced assets not passed as candidates **persist forever** in IndexedDB and are **excluded from backups** (export is reference-driven `src/app.js:3662`) → orphans silently do not migrate (acceptable if orphans are garbage; see Q-8).
- Restore imports media by upsert, never prunes; LR-referenced media from deleted papers is retained and exported.

### 6.4 Lossy normalization (silent discard of unknown fields)
`normalizeLearnerResponse` (`interchange.js:182-243`), `normalizeTeacherReview` (`:383-422`) and `normalizeTranslationDocument`/`normalizeTranslationItem` (`translation-domain.js:32-52,266-275`) rebuild objects from a fixed key set (only `extensions` and `provenance.extensions` survive). Collection parsers normalize **before** validating (`learning-records.js:9-10`, `review-records.js:10-17`), so the "reject unknown fields" check in `validateTeacherReview` (`interchange.js:19-47,430-435`) is **not effective on the storage/backup path** — unknown fields are dropped, not rejected. `normalizeQuestion`/`normalizePaper`, by contrast, retain unknown question fields via `...question` (`question-registry.js:96`). A V2 reader that adds fields and then a V1-style read would lose them; conversely V1 data read through V1 normalizers loses any non-V1 field.

---

## 7. V1 → V2 migration invariants (must-preserve)

Derived from V2 Scope Freeze §4, §5.2, §10.3, §23 and the entities above. Each is a **testable** assertion for the Migration milestone.

| ID | Invariant | Evidence it is meaningful |
|---|---|---|
| M-1 | Every Paper, Question, Option/Pair `id` preserved byte-for-byte | §3.1; I-12, I-15 depend on them |
| M-2 | Every Learner Response `id`, `session.id`, `finalizedAt`, `session.startedAt/completedAt` preserved | I-5/I-6/I-15 |
| M-3 | Every Learner Response `material.snapshot` preserved verbatim (items incl. shuffled option order, `sourceId`, media refs, positions) | Scope §10.3; `interchange.js:78-121,123-180` |
| M-4 | `responses[].answer`/`result`, `summary`, `learnerAnnotations`, `learnerItemMarks` preserved; annotation offsets remain **UTF-16 indices anchored to the same answer string** (any change of text units requires re-anchoring, not reinterpretation) | I-3; Scope §12.7 |
| M-5 | `unknown`, `uncertain`, `should_know` remain distinct values (no collapse) | Scope §6.1 |
| M-6 | Every Teacher Review `id`, `responseId`, `reviewer`, `createdAt`, `itemReviews`, `corrections` (ids, offsets, `anchoredText`), `remediationRecommendations`, `extensions` preserved; **multiple reviews per response preserved** | I-1, I-4 |
| M-7 | Provenance (`purpose, sourceResponseId, sourceReviewId, sourceMaterialId, author, createdAt, extensions`) preserved on responses and documents, **including dangling soft references** (I-8) — a missing source must remain representable, not be "fixed" | `translation-history.js:142-185` |
| M-8 | Live remediation documents keep resolving to their source response/review (I-7) | `backup.js:52-57` |
| M-9 | Translation folder/document/item ids, `position`, `referenceTranslation`, `notes`, `extensions` preserved | I-9 |
| M-10 | Every referenced media asset present, MIME-class compatible, payload byte-identical; media IDs preserved; question `image/audio` metadata preserved | I-11 |
| M-11 | History entries migrated or explicitly reported as non-migrated (they carry facts not derivable elsewhere, §6.2); `missedQuestionIds`/`results` preserved | §6.2 |
| M-12 | Categories (name list) and each paper's `category` string preserved; empty categories preserved | `categories.js` |
| M-13 | Library `tags`, `description`, `provenance` (paper-level), `createdAt/updatedAt/lastOpenedAt` preserved; **no fabricated timestamps** when V1 had real ones | `migrations.js:22,28-30` |
| M-14 | Unknown/extra fields in canonical records (`extensions`, unknown question fields) preserved, or an explicit loss report produced | §6.4; Scope §5.2 "Silent data discard is prohibited" |
| M-15 | Original V1 backup file untouched; migration reads it read-only | Scope §5.2 |
| M-16 | Counts reconcile before activation: papers, questions, LRs, TRs, folders, documents, items, media assets, history entries (source vs staged) | Scope §5.2 "Semantic audit / User preview" |
| M-17 | Evidence-vs-scheduling separation: migration creates **no** `dueAt`/recommendation/mastery facts and does not infer typing/knowledge semantics | Scope §4.5, §19 |

---

## 8. Confirmed risks, gaps, and unknowns

### 8.1 Confirmed (code-evidenced)
| ID | Finding | Evidence | Why it matters for migration |
|---|---|---|---|
| R-01 | Restore is non-atomic; success toast precedes `saveLibrary()`, which may silently no-op | `src/app.js:3690-3730,3551` | V1 intake semantics unsuitable as V2 pattern; partial states possible if user restores repeatedly |
| R-02 | LR/TR/translation are *replaced* (not merged) when their key is present; restoring an older backup drops newer local evidence | `src/app.js:3697-3705` | Informs "what is in the V1 backup is authoritative" assumption |
| R-03 | Restoring a backup that has `learnerResponses` but no `teacherReviews` leaves old reviews; `loadTeacherReviews()` then throws on any orphan `responseId` (breaks subsequent loads/exports) | `src/app.js:3697-3698,3782-3785`; `review-records.js:11-14` | Edge only for older/partial backups; UI reachability beyond M6-era backups **UNVERIFIED** |
| R-03b | `clearPaperHistory` deletes Objective LRs without a review-dependency check; review UI is wired to Translation history only (`isTranslationLearnerResponse`), so Objective-targeted reviews are not UI-reachable, but nothing in the data layer forbids them | `src/app.js:5957-5975`; `translation-history.js:89-92` | Low severity; documents a data-layer, not UI, guarantee |
| R-04 | Backup has no integrity checksum/app version; `schemaVersion` and `documentType` are not enforced on parse | `backup.js:19-20,31-80` | V2 intake cannot detect truncation/tamper beyond JSON validity; cannot distinguish V1 build versions |
| R-05 | History is overwritten with `[]` when the backup lacks `history`, unlike LR/TR which are guarded | `backup.js:74`; `src/app.js:3706` | A legacy backup silently erases history on V1 restore; also means history presence in a backup is not guaranteed |
| R-06 | Backup export fails entirely if **any** referenced media asset is missing from IndexedDB; active-session-only media also counts | `src/app.js:3662-3670` | Users with a dangling media reference cannot produce the sole migration bridge (V1 backup) — migration blocker for those users |
| R-07 | Objective feedback mode and Objective retry lineage are never persisted | `interchange.js:78-121`; `src/app.js:2990-3003` | Cannot be recovered by any migrator; V2 must not claim lineage/intent history for V1 Objective attempts |
| R-08 | Translation retry creates new item ids; no item-level lineage | `translation-retry.js:21` | V2 per-item scheduling/recommendation cannot map retried items to originals from V1 data |
| R-09 | S3 recovery blob may be the sole copy of a user's library but is excluded from backup; `preserveRecovery` writes once and, if a differing recovery already exists, returns `false` → library becomes non-persistable | `library-bootstrap.js:24-30,98-113`; `src/app.js:3551` | "Never silently drop" requires a policy for S3 (Q-4) |
| R-10 | History capped at 100 on write; canonical LRs uncapped | `src/app.js:5929`; `DEVELOPER_GUIDE.md` §Learner Evidence | Two Objective views of the same attempts can disagree; migration must choose LR as truth |
| R-11 | Unknown-field loss on LR/TR/Translation Document normalization; "reject unknown" validators are bypassed on the storage path | §6.4 | Drives lossless-first intake requirement |
| R-12 | Localized strings (`correctLabel`, `correctAnswer`) stored in canonical `result` | `grading.js` `makeResult` | Language-bound evidence; must be preserved verbatim, not re-localized |
| R-13 | `migrateLibrary` has no version ladder; `CURRENT_SCHEMA_VERSION` never advanced | `migrations.js:6,39-49` | No V1-internal version history exists for the migrator to branch on |
| R-14 | Media `createdAt` dropped on export; timestamps synthesized on normalize | `media-store.js:285-308`; `migrations.js:22` | Minor fidelity loss already baked into V1 backups |
| R-15 | Paper/question IDs are only intra-paper unique after paper import; duplicate question ids across papers are possible | `src/app.js:3636-3642` | V2 must not assume global question-id uniqueness |
| R-16 | Active Translation session not cleared on restore | `src/app.js:3690-3730` (no call) | Recovery-only; stale references possible after restore |
| R-17 | Doc table in `DEVELOPER_GUIDE.md` disagrees with code on legacy key and omits several keys | §1.1 | Governance docs cannot be used as the migration key inventory |

### 8.2 Unknown / UNVERIFIED (not provable from the repository)
- U-1: Whether any real V1 users hold pre-M6.0 history entries without `responseId` or backups from M6-era builds lacking some keys.
- U-2: Practical backup size ceiling (base64-in-JSON; browser memory/`FileReader` limits) for media-heavy libraries.
- U-3: Whether V1 data exists under more than one browser origin per user (e.g., `localhost:8000` vs `127.0.0.1:8000` vs hosted), producing split stores; `docs/DEVELOPER_GUIDE.md:125-129` fixes the local launcher to `http://localhost:8000` but this audit did not inspect any profile.
- U-4: IndexedDB eviction/persistence-grant behavior in the wild (V1 does not call `navigator.storage.persist()`: `grep navigator.storage` over `src/`, `sw.js`, `index.html` → no hits).
- U-5: Real-world `schemaVersion` values found in user backups beyond 1.
- U-6: Whether any public schema in `schemas/` is stricter than the runtime normalizers for fields the runtime silently keeps/drops (`schemas/*.json` were enumerated but not diffed against runtime).

---

## 9. Questions to answer before the Migration ADR

1. **Intake losslessness:** Must V2 intake read the V1 backup through V1 `normalize*` functions (lossy, §6.4) or a purpose-built lossless reader? What is the acceptable "loss report" format when a field is unknown?
2. **Backup versioning:** Should the V1 → V2 bridge require the V1 build to emit an improved backup (checksum, app version, counts, `createdAt` for media) via a V1.x patch, or accept existing `v1.0.0` backups as-is? (R-04, R-14, U-5.)
3. **R-06 recovery path:** What happens for users whose backup export fails due to a missing media asset? Offer a "export without missing media + manifest of gaps" option, or declare unsupported?
4. **S3 recovery blob policy:** Is `quiz-studio-library-recovery-v1` ever in migration scope (e.g., surfaced as a "recoverable raw copy" attachment), or explicitly not migrated? Who decides (Human Gate)? (R-09.)
5. **History policy:** Migrate S7 as-is, rebuild from Objective LRs, or migrate both and mark provenance? How are history-only entries (no LR twin) presented? (R-10, §6.2.)
6. **Non-recoverable fields:** For Objective feedback mode and Objective retry lineage (R-07), is V2's stance "unknown/legacy" (no inference) — and how is that represented so the Recommendation/Scheduler never treats absence as evidence?
7. **Item-level retry lineage:** Is best-effort inference (text match against source response snapshot) in scope, or must V1 retry lineage stay response-level only? (R-08.)
8. **Orphan media:** Confirm orphaned (unreferenced) media is intentionally dropped by migration (current backup behavior), or should migration attempt to include it from an IndexedDB export? (§6.3.)
9. **Preferences:** Are theme/language/sound/sidebar width migrated at all (V1 backup excludes them), and from where, given V2 must not scrape browser profiles (Scope §5.2)?
10. **Timestamps:** Policy when a V1 record lacks timestamps (preserve empty vs. `exportedAt` vs. migration time) so no fabricated provenance enters canonical data. (M-13.)
11. **Duplicate/colliding IDs:** If a backup contains duplicate paper ids or cross-paper duplicate question ids, does migration reject, remap with a recorded mapping, or preserve? (R-15.)
12. **Atomic activation unit:** Given V1 stores are separate keys and IndexedDB, what is V2's atomic unit and rollback story, and what is the minimum "user preview" content (M-16)?
13. **Annotation offset encoding:** V1 offsets are UTF-16 indices; V2 Typing requires grapheme-aware handling (Scope §12.7). Does V2 keep UTF-16 for migrated Translation evidence and add a separate encoding tag for new records?
14. **Schema registry:** Since no V1 version ladder exists (R-13), does the Migration ADR define a V1 "schema detection" that keys off `documentType`/`schemaVersion` of each sub-document rather than the envelope?
15. **Typing/Explanation fields:** Confirm V2-new fields (`explanation`, Typing Attempts, scheduling) are **purely additive** and absent in migrated data (M-17), and how "absent" is distinguished from "empty".

---

## 10. Human Gate Decisions

Recorded after Human Gate approval. These resolve Q-1…Q-15 of §9 at policy level; **mechanisms are left to the Migration ADR**. They restate and refine, and do not reopen, `V2_PRODUCT_SCOPE_FREEZE.md` Revision 1.

| ID | Decision | Resolves / relates to |
|---|---|---|
| D-1 | Migration uses a **purpose-built lossless-first reader**. V1 lossy `normalize*` functions are **not** the intake path. | §6.4, R-11, Q-1 |
| D-2 | Existing **`v1.0.0` backups must be supported as-is**. A V1.x patch is **not** a migration prerequisite. | R-04, R-14, Q-2, U-5 |
| D-3 | Automatic migration **fails closed** when referenced media is missing, with a **clear diagnostic** naming the missing references. | R-06, Q-3, M-10 |
| D-4 | S3 `quiz-studio-library-recovery-v1` is a **migration-scope recovery artifact**: preserved **byte-for-byte**, **reported in the preview**, and **never auto-activated** as canonical V2 data. | R-09, Q-4 |
| D-5 | **Learner Responses are canonical truth for Objective history.** Legacy facts in S7 that cannot be rebuilt are **retained**; no double counting of attempts present in both. | R-10, §6.2, Q-5, M-11 |
| D-6 | Objective **feedback mode** and **retry lineage**, never recorded by V1, stay **legacy unknown**; no inference. | R-07, Q-6 |
| D-7 | Translation **item-level retry lineage**: no text-match guessing; response-level provenance only. | R-08, Q-7 |
| D-8 | Truly **unreferenced orphan media is not migrated**. | §6.3, Q-8 |
| D-9 | V1 backups contain no preferences, so **V2 Core does not migrate preferences**; **no browser-profile scraping**. | §2, Q-9, Scope §5.2 |
| D-10 | **Missing timestamps stay unknown/absent.** Migration/import time may exist only as separate **operational metadata**, never substituted into canonical timestamps. | R-14, M-13, Q-10 |
| D-11 | **Legal V1 cross-paper duplicate question ids are preserved as-is.** Illegal canonical duplicates that create real **identity ambiguity block activation**; they are **never silently remapped**. | R-15, Q-11 |
| D-12 | Atomic activation must satisfy: **isolated staging → full validation → all-or-nothing activation → rollback-safe.** The mechanism is deferred to the ADR. | R-01, Q-12, M-16 |
| D-13 | Migrated Translation evidence **keeps UTF-16 offset semantics**, **explicitly labeled** as such. | M-4, Q-13 |
| D-14 | **Schema detection** must not rely on envelope `schemaVersion` alone; it combines `documentType` and sub-document shape. | R-04, R-13, Q-14 |
| D-15 | **V2-only fields stay absent** after migration — Answer Explanation, Typing, scheduling (incl. Calendar/user-authored schedules), recommendation — and are **not inferred** from V1 history. | M-17, Q-15, Scope Rev. 1 §4.5 |

### Consequences for ADR scope (not decisions)
- D-1/D-14 imply the ADR must define the lossless read model and the detection rules per sub-document.
- D-3/D-11/D-12 imply a defined set of **activation-blocking** conditions versus **reportable** warnings.
- D-5 implies the ADR must define the non-double-counting relationship between S7 facts and Learner Responses.

---

## 11. Out-of-scope for this inventory
No V2 design, schema, migrator, or refactor is proposed. No decision of Scope Freeze is reopened. Statements about V2 behavior above restate frozen scope only.
