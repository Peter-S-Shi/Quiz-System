# V2 Final Product UI — manual acceptance checklist

What the automated suites **cannot** prove for the Final Product UI Integration milestone: what the screens look and feel like to a person, assistive technology, the real OS input methods in the **Library editors**, and the native file dialogs with real files. Everything else is automated (`docs/V2_PRODUCT_UI.md`, section 4): the product self-test drives every view in a real Chromium-engine browser over the real Rust store, and the same product is driven **inside the real packaged `quiz-studio.exe`** (real WebView2, CSP, Tauri IPC) — but with scripted file dialogs and without the OS IME.

**These items are OPEN. None is PASS, none is waived.** Record the actual result in the right-hand column when it is performed; an item that was not performed stays "not performed". Items from earlier milestones (M-T1b/d/e, M-T2, M-T3, M1–M7, D1–D4) are tracked in their own files and remain open.

## How to run the app on sample data without touching real data

```powershell
node desktop/ui/selftest/seed-data-root.mjs "$env:TEMP\qs-manual"      # needs: cargo build -p qs-scenarios --bin qs-scenario
$env:LOCALAPPDATA = "$env:TEMP\qs-manual"; & "<path to>\quiz-studio.exe"
```

The sample has a paper with an image and a sound, a translation document with a review, typing texts, recorded attempts and a learner schedule with a date waiting for a decision. Delete the folder afterwards.

| # | Check | Steps | Expected | Result |
|---|---|---|---|---|
| M-U1 | Visual review of the seven views | Open Today, Calendar, Library (select an item, open an editor), Evidence history, Review, Exchange & backup, Settings in light and dark appearance, at 100 % and 150 % display scaling and at the minimum window size | The Warm Paper · Living Ink direction is recognizable; nothing is clipped, overlapped or unreadable; the sidebar, list and detail panes stay usable; no horizontal scrolling at the minimum size | not performed |
| M-U2 | Narrator across the views | Turn on Narrator. Visit every view with the keyboard; start a practice from Today; open the Calendar side panel | Headings, landmarks, buttons, segmented controls, tabs and dialogs are announced with sensible names and state; toasts and the practice live region are read; focus lands on the view heading after navigation | not performed |
| M-U3 | High contrast and reduced motion | Turn on a Windows high-contrast theme and, separately, "Show animations" off | Text, focus rings, selected states (navigation, list rows, stamps, segmented controls) remain distinguishable; with reduced motion the ink indicator and toggles do not animate | not performed |
| M-U4 | Keyboard-only journeys | Without the mouse: Today → start a suggestion → answer → finish → History → retry → Review a translation → save a review; Library → New → Typing text → save → practice | Every control is reachable and operable; Tab order follows the visual order; Esc/Enter behave in dialogs; shortcuts 1–6 and , work outside fields; the Calendar grid works with the arrow keys and the date field | not performed |
| M-U5 | Real IME in the Library editors | In New → Typing text (title, language, body), New → Objective paper (prompt, options, explanation) and New → Translation document use Microsoft Pinyin (or Japanese / Korean) and a third-party IME (e.g. Sogou); compose with the candidate window open, commit with Space/Enter and with the mouse | Text commits exactly as typed; no duplicated or lost characters; composing does not trigger shortcuts or save; the stored Typing text equals what was typed (line breaks and spaces included) | not performed |
| M-U6 | Native file dialogs with real files | Library → Import (paper JSON, translation JSON / text); Exchange: export a review request, import a teacher review, export / import a paper with media, attach an image to a question; cancel each dialog once | The Windows dialogs open and return; the preview shows the right content before anything is stored; cancelling changes nothing; exported files open in an editor and are valid JSON | not performed |
| M-U7 | Drag and drop and media | Settings → Media: drag an image and an audio file onto the window; Library: attach them to a question and practice it | The files are stored once (a second drop reports "already present"); the image and the sound show / play inside Focused Practice | not performed |
| M-U8 | Backup, restore and upgrade with the new UI | Create a backup from Exchange; add content; restore the backup; install the next build over the current one with the sample data present | The backup verifies and restores; content added after the backup is gone and a snapshot is kept; the upgraded app opens on the same data with preferences intact | not performed |

> After the Human Gate decides on the fonts (system stacks vs. a bundled CJK serif), M-U1 is the check that looks at the result.
