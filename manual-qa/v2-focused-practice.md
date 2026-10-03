# V2 Focused Practice — manual acceptance checklist

What the automated suites **cannot** prove for the Objective Answer Explanation + Focused Practice milestone: real OS input methods in the real WebView2, a human reading the long-text surface, and assistive technology. Everything else is automated (`docs/V2_PRACTICE.md`, section "Evidence"): the DOM self-test drives the real surface in a real Chromium-engine browser with trusted input, and the packaged-app smoke runs the pinned comparison inside the real WebView2.

**Status after the Human Gate (ACCEPTED): M-T1a and M-T1c are PASS; every other item below is still OPEN — not PASS, not waived.** Record the actual result in the right-hand column when it is performed; an item that was not performed stays "not performed".

Run on the installed app (`quiz-studio.exe`, Windows 11, WebView2 Evergreen). Library → *Start a practice*. Add a typing text of ≥ 3 000 characters (any synthetic prose, include a few CJK sentences) with *Add a typing text*, then *Practice*.

| # | Check | Steps | Expected | Result |
|---|---|---|---|---|
| M-T1a | Microsoft Pinyin (or Microsoft Japanese / Korean IME) composition | Switch to the IME. Type a phrase that matches the passage with the candidate window open; commit with Space/Enter and with a mouse click on a candidate | While the candidate window is open nothing is marked as typed or wrong; after commit exactly the committed text appears in the passage as typed; no duplicated or lost text; the caret stays in the input | **PASS** (Product Owner, 2026-10-03; a short CJK text, local release build of the milestone code at `77b259f`, not the CI-packaged installer; input and recognition correct, no fault or misrecognition); IME: Microsoft |
| M-T1b | Cancel a composition | Start composing, press Esc | The composition is cancelled; **the practice does not open its exit dialog**; committed text is unchanged | not performed |
| M-T1c | A third-party IME that may emit only `input` events | Use Sogou / Baidu / Google Japanese Input / another third-party IME (or an on-screen keyboard / voice typing that inserts text) to enter text | The text is committed like any other; nothing is dropped; the count `N of M characters typed` matches | **PASS** (Product Owner, 2026-10-03; a short CJK text, local release build of the milestone code at `77b259f`, not the CI-packaged installer; input and recognition correct, no fault or misrecognition); IME: Sogou (third-party); the Product Owner accepted the local release build as sufficient instead of the CI-packaged installer |
| M-T1d | Dead keys and AltGr | Type accented letters through a dead-key layout (e.g. US-International) | The accented letters are committed and compared as typed | not performed |
| M-T1e | Paste and drop | Paste text (Ctrl+V, right-click Paste) and drag text into the input | Rejected: the input reverts, a short notice appears; typing continues normally | not performed |
| M-T2a | Long-text reading and following | Type through the whole ≥ 3 000-character passage at a normal speed | The passage wraps naturally; the current position stays comfortably visible; completed text moves upward out of view; no layout jump, caret loss or focus loss; scrolling with the wheel does not fight you, and typing resumes following | not performed |
| M-T2b | Resize / DPI | While typing, resize the window narrow and wide, and move it between monitors of different scale | The active position stays visible; typed text and focus are intact | not performed |
| M-T2c | Test intent | Start the same text with *Test* | While typing nothing says whether text is right or wrong; after *Finish* the differences are listed | not performed |
| M-T2d | Interrupt and resume | Type half the passage, close the app (or end the process), reopen, Library → *Unfinished* → *Resume* | The typed text and position are restored; finishing records one result | not performed |
| M-T3a | Keyboard only (Objective) | Complete a five-question paper with the keyboard alone (Tab, arrows, Space, Enter, Esc) in both feedback modes | Every control is reachable and operable; focus is always visible; Esc asks before leaving | not performed |
| M-T3b | Narrator | With Narrator running, go through one Objective question (Instant), one Translation sentence, one Typing session | Prompts, option labels, progress, the grading feedback and the explanation are announced; the passage is readable; nothing important is color-only | not performed |
| M-T3c | High contrast and 200 % scale | Windows High Contrast theme; display scale 200 % | Text and controls remain legible and unclipped | not performed |
| M-T4 | Packaged WebView smoke | `scripts/package-test.ps1` (CI runs it) | `webview.pinned_comparison` and `webview.engine_reported` pass in `boot-status.json` | automated in CI (see `docs/V2_PRACTICE.md`) |

Out of scope here, by design: media (image / audio) display inside questions, Today / Calendar / Library final views, authoring UIs.

> **Required for the final Human Gate Exit evidence:** the Product Owner runs **M-T1a** and **M-T1c** on the final packaged candidate and records the real results here (not automatable; never an automated PASS).
