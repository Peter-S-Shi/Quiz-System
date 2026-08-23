# M7.1 Human Acceptance Checklist

Status: **PENDING — Product Owner execution required**

Use synthetic papers, Translation Documents, responses, and reviews. Test in both English and Chinese. Record PASS/FAIL and a short synthetic note for each section; keep screenshots and exported results local-only.

## Test matrix

- Viewports: 320 px, 375 px, 768 px, and normal desktop width.
- Input: keyboard-only plus representative touch/pointer input.
- Themes: light and dark on at least one phone width and desktop.

## 1. Whole-item marking

- Toggle Unknown, Uncertain, and Should know; each active state uses a distinct semantic ink and announces `aria-pressed="true"`.
- Switch directly between all three states; only one whole-item mark remains active.
- Activate the selected mark again, then use Clear mark; both paths remove the mark.
- After each rerender, keyboard focus remains on a useful marking control.
- Navigate away, refresh, and recover; the selected mark persists and finalization preserves it.

## 2. Study Desk dialogs

- Text entry: create and rename a category, Paper, and Translation folder; confirm applies trimmed valid text, while Cancel, Escape, close, and backdrop cancellation change no canonical data.
- Ordinary deletion: cancel once and then confirm Paper, empty-category, folder, document, response, review, and Paper-history deletion.
- Dependency warning: verify response/review/document warnings still show the existing dependency counts and retained-record meaning before confirmation.
- Progress loss: cancel and confirm active Translation session overwrite/discard; cancellation preserves answers and current position.
- Correction Insert/Replace: select a known range before opening the dialog; cancellation adds nothing, while confirmation applies to the exact captured caret/range even though the dialog took focus.
- Keyboard: initial focus is predictable, Tab remains within the modal, Enter confirms where valid, Escape cancels, and focus returns sensibly.
- Confirm that Submit-at-End and Start needs-work retry intentionally retain their native confirmations.

## 3. High-content deletion safeguards

- Objective Question: Cancel preserves content, media, order, and selection; Confirm deletes once, updates selection, persists, and performs conservative media cleanup.
- Translation Item: Cancel preserves source/reference/notes/order; Confirm deletes once and preserves remaining item order and document rules.

## 4. Responsive and touch surfaces

- At 320/375/768/desktop, Translation History filters, cards, lineage, long labels, and the seven-action detail row remain readable and reachable without horizontal clipping.
- Retry selection rows provide practical checkbox targets; changing a checkbox restores focus to that item and Confirm remains reachable.
- Whole-item and span-marking controls wrap coherently and remain practical touch targets.
- Correction Workspace text selection, pen tray, color selector, Insert/Replace/Delete, review rows, and save/navigation actions remain operable without clipped controls.
- All dialogs fit the viewport, allow long warning text to scroll/read, and keep actions reachable.

## 5. Bilingual and regression smoke

- Repeat representative marking, text-entry, destructive, dependency-warning, retry-selection, and correction flows in both Chinese and English.
- Smoke Objective grading/practice, Translation Practice recovery/finalization, media persistence, Teacher Review reopen, retry lineage, and category/Paper deletion semantics.

## Result

- Tester code:
- Browser/version:
- Device or viewport method:
- English: PASS / FAIL
- Chinese: PASS / FAIL
- Keyboard/focus: PASS / FAIL
- Touch/narrow layout: PASS / FAIL
- Overall M7.1 Human Gate: PASS / FAIL
- Synthetic notes:
