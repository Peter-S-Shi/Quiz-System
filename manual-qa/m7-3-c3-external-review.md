# M7.3 C3 Authentic External Reviewer Round Trip

Status: **PENDING — independent external reviewer and Product Owner import verification required**

The repository contains a newly generated, synthetic product export at `manual-qa/m7-3-c3-review-request.json`. It was produced through the real Quiz Studio UI after importing `manual-qa/m7-3-c3-seed-backup.json` into a fresh isolated Chrome profile, opening the seeded finalized response in Translation History, and selecting Export Review Request. It is not the pre-authored example fixture. Both files contain only synthetic content and no external-session metadata.

Request SHA-256: `9a0cc759b7428064a916c001d0470b425a4bc1377db989963b3ba04ec447d5e0`

Seed-backup SHA-256: `95835dc8819de2dd9ee68e47c65a67415430d6c4c84f76a6c351a8dfbc096bb2`

## Reproduce the local matching response

The full-backup import replaces the current Quiz Studio library and evidence collections. Use a disposable fresh browser profile, or export and safely retain your existing backup first.

1. Verify the seed-backup hash above.
2. Open the Editor, return to the Categories level, and choose Import backup.
3. Import `m7-3-c3-seed-backup.json` and confirm Translation History contains `Synthetic Community Notes` with response ID `m7-3-c3-response-20260822`.
4. Open the history detail and verify its answers, span annotation, and whole-item mark match the request. The committed request can now be imported back against this exact local response after the external reviewer returns a review.

## External handoff

1. Verify the request hash above, then give `m7-3-c3-review-request.json` unchanged to one actual external human reviewer or to a new, independent AI/LLM session outside the Codex session that prepared this milestone.
2. The reviewer must return one newly authored `quiz-studio.teacher-review` JSON object, following the task embedded in the request.
3. Preserve these identifiers exactly:
   - `responseId`: `m7-3-c3-response-20260822`
   - item IDs: `m7-3-c3-item-1`, `m7-3-c3-item-2`, `m7-3-c3-item-3`
4. The review should exercise the real rich-review contract: all three item judgments, useful comments or suggested revisions, and at least one valid anchored content correction plus one valid presentation-style correction. The reviewer decides the review content; do not pre-author it in Quiz Studio.
5. Do not record the external account, session ID, private prompt history, or screenshots in the repository.

## Product Owner import and persistence gate

1. Before import, retain the original exported request unchanged and complete the seed-backup steps above in the same disposable profile.
2. In Translation History, open the seeded matching Learner Response and import the newly returned Teacher Review.
3. Verify the preview identifies the expected response and every reviewed item; cancel once and confirm nothing is persisted.
4. Import again, confirm, and verify the review appears in History and Correction Workspace with judgments, comments, suggested revisions, and rich corrections intact.
5. Reopen the review after leaving the workspace and after a browser restart; verify it remains attached to the same response.
6. Verify the original Learner Response answers, span annotation, whole-item mark, IDs, and timestamps remain unchanged.
7. Export the persisted Teacher Review and re-import it. Verify the same-ID unchanged review is handled idempotently and no duplicate or reassignment is created.
8. Make an invalid copy with a wrong `responseId` or unknown `itemId`. Verify preview/confirmation cannot persist it and the valid stored review and Learner Response remain unchanged.

## Acceptance record

- Independent reviewer used: PENDING
- Returned review newly authored from this request: PENDING
- Valid preview/cancel/confirm: PENDING
- Persist/reopen/history/lineage/re-export: PENDING
- Invalid-artifact rejection without mutation: PENDING
- Original Learner Response unchanged: PENDING
- Overall C3 Human Gate: **PENDING**

C3 must remain PENDING until the Product Owner supplies genuine external-review and in-product round-trip evidence. Automated fixtures and this preparation artifact do not close the gate.
