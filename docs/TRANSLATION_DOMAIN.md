# Translation Domain And Persistence

Milestone 6.1 established the data foundation for Translation Practice. Milestone 6.2 added the first user-facing consumer of that foundation: the Translation Library workspace, with folder/document/item management and material import and export. Milestone 6.3 adds the first Translation Practice session workflow itself: productive-recall practice, session recovery, and non-objective finalization into a Learner Response.

## Aggregate Model

```text
Translation Library
|- Translation Folder
`- Translation Document
   `- ordered Translation Items
```

### Translation Folder

A folder has a stable `id`, a user-facing `name`, and `createdAt` / `updatedAt` metadata. Documents reference their folder through `folderId`.

### Translation Document

A document is a first-class learning material identified by `quiz-studio.translation-document`. It has a stable ID, title, folder relationship, generic source and target language identifiers, timestamps, ordered items, and optional provenance or extensions.

### Translation Item

An item has a stable ID, source text, and deterministic zero-based position. `referenceTranslation` and `notes` are optional. A reference translation is illustrative material, not a unique correct answer, and the domain contains no exact-string grading behavior.

## Integrity Rules

- Folder, document, and item IDs must be unique in their applicable scope.
- Every document must reference an existing folder.
- Item positions are normalized to a continuous deterministic order.
- Stored data is normalized and validated at `parseTranslationLibrary()`.
- Deleting a non-empty folder is rejected unless the caller explicitly requests cascading deletion.
- Folder deletion with cascade removes its documents and embedded items as one operation, preventing orphaned state.
- Domain operations are independent from the DOM and return new normalized library values.

## Persistence And Backup

The browser storage key is `quiz-studio-translation-library-v1`. The existing JSON storage boundary is reused; no backend or parallel database is introduced.

New full-library backups include `translationLibrary`. Legacy backups without that field remain readable. During restore, an absent field does not overwrite existing Translation data.

## Learner Response Compatibility

The generic Learner Response contract now applies objective scoring fields conditionally:

- `quiz-paper` responses still require per-item `result`, `correctCount`, and `percent`.
- Future `translation-document` responses can preserve written answers with `itemCount` only.

This is an additive relaxation. Existing Objective Quiz response files remain valid, finalized evidence remains protected, and later Teacher Reviews can still attach by response ID. M6.1 does not create Translation sessions or finalized Translation responses in the UI.

## Public Contract

- `schemas/translation-document.schema.json`
- `examples/sample-translation-document.json`

The contract is versioned, stable-ID based, multilingual, raw-HTML free, and independent of any AI provider.

## Library, Import, And Export (M6.2)

Milestone 6.2 adds a Translation Library workspace built entirely on the M6.1 domain functions; it introduces no parallel storage representation and no new schema version.

`src/core/translation-import.js` provides DOM-independent, unit-tested parsing and safety helpers used by the UI:

- Source-only batch import: one non-empty line becomes one Translation Item.
- Bilingual batch import: `source<TAB>reference` lines; any row missing a well-formed pair is reported as a validation error rather than silently dropped or silently imported.
- Portable Translation Document JSON import: validated independently of any local folder, so an externally authored document can be assigned to a user-chosen local folder without the author knowing local folder IDs. The document's own `folderId` is only used for structural validation and is replaced by the user's chosen folder at persist time.
- Duplicate document IDs are rejected by default. Explicitly choosing to import as a copy remaps the document ID and all item IDs before the existing `createTranslationDocument` call runs, so the collision policy is enforced by the same relationship-safe domain layer as every other write.

All three import paths follow Input -> Parse -> Validate -> Preview -> Confirm -> Persist. Preview and validation never mutate the stored library; only an explicit confirm calls into the M6.1 domain functions. A failed or cancelled import leaves existing Translation Library data unchanged.

Export uses `getTranslationDocument()` directly, so the exported file is exactly the same normalized, schema-valid shape used internally and accepted back on re-import.

## Practice And Session Recovery (M6.3)

Milestone 6.3 adds the first Translation Practice workflow in `src/core/translation-session.js`, independent of the Translation Library and Objective Quiz.

- `createTranslationSession()` snapshots a document's items at the moment practice starts. The session never re-reads the live document afterward, so later edits, reordering, moves, or even deletion of the source document cannot rewrite what the learner is practicing or has already practiced.
- Answers and optional reference-reveal state are keyed by stable Translation Item ID, independent of item position, and survive `JSON.stringify`/`parse` round trips through `normalizeTranslationSession()`, which rejects structurally invalid data by returning `null` rather than throwing.
- The active session is stored under its own key (`quiz-studio-translation-active-session-v1`), fully isolated from the Objective Quiz active session, so the two cannot silently overwrite each other even when both are unfinished at once.
- Finishing a session calls `createTranslationLearnerResponse()` in `interchange.js` to build a finalized Learner Response with `material.type: "translation-document"`. It supplies an `answer` (defaulting to an empty string) for every item in the snapshot so the interchange contract's full-coverage requirement is satisfied even when practice was left incomplete, and it never sets `result`, `correctCount`, or `percent`.
- The active session is only cleared after the Learner Response has been written successfully, so a storage failure during finalization leaves the recoverable session intact instead of silently discarding the learner's work.
- Repeated practice on the same document creates a new session ID and a new Learner Response ID; the existing idempotent/immutable `upsertLearnerResponse()` write path guarantees earlier finalized evidence is never overwritten.

## Deferred

Learner answer span markings, `unknown / uncertain / should_know` classifications, rich correction, Teacher Review round trips, remediation UI, and AI integration remain later M6 work.
