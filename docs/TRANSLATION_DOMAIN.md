# Translation Domain And Persistence

Milestone 6.1 establishes the data foundation for Translation Practice without adding the Translation Library or practice UI.

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

## Deferred

Translation Library UI, material import/export UI, practice sessions, learner markings, rich correction, Teacher Review round trips, remediation UI, and AI integration remain later M6 work.
