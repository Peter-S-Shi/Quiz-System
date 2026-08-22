# Human Gate C Verification Guide — Objective Question Media (Image & Audio)

**Scope**: Pre-Freeze V1 Scope Closure · Batch C  
**Status**: PASS  
**Evaluator**: Human Reviewer / Product Owner  

---

## Overview

This guide provides step-by-step verification journeys for the Objective Question Media capabilities introduced in Pre-Freeze V1 Scope Closure Batch C:
1. **Media Support across all 5 Objective Question Types**: Single Choice, Multiple Choice, Fill-in-the-Blank, True/False, Matching.
2. **Local-Only Media Storage Architecture**: Offline-first storage using an IndexedDB-backed binary Media Asset Store (`quiz-studio-media-db` / `media_assets` object store) storing runtime Blobs, linked with stable UUIDs in Question JSON.
3. **Image Authoring, Preview, and Accessibility**: Local image upload (PNG, JPEG, WebP, GIF, SVG), thumbnail preview, replace, remove, and accessible Alt text description.
4. **Interactive Image Viewer & Zoom Controls**: Responsive modal viewer with Zoom In (`+`), Zoom Out (`-`), Reset (`1:1`), Close (`✕`), and keyboard shortcuts (`+`, `-`, `0`, `Esc`).
5. **Audio Authoring and Practice Player**: Local audio upload (MP3, WAV, OGG, WebM, AAC, M4A, FLAC), in-editor preview, and in-question player with play/pause, seek/scrub, and unlimited replay.
6. **Single-Paper Portability & Full Backup/Restore with Referential Integrity**: Self-contained export/import envelopes with bundled base64 assets, IndexedDB synchronization, strict referential integrity validation (failing safely on missing/corrupted assets), and seamless backward compatibility with legacy text-only JSON.
7. **Evidence Immutability & Reference-Aware Conservative Cleanup**: Active session snapshots, finalized Learner Response snapshots, and review screen thumbnail rendering with media retention across mutations.

---

## Verification Journey 1: Objective Question Media Authoring (All 5 Types)

### Objective
Verify that all 5 Objective Question Types accept optional Image and Audio attachments (individually or simultaneously), with file type validation, live thumbnail/player previews, replacement, removal, and accessible alt text.

### Steps
1. Launch Quiz Studio (`start-local.bat` or `python scripts/dev-server.py`).
2. Navigate to **Edit** (编辑) mode, select or create a paper, and navigate to Level 3 (Questions).
3. Test each question type:
   - **Single Choice**: Click `+ Add Image` under **Question Image**, upload `manual-qa/media-sample/assets/geometry-angles.svg`. Confirm thumbnail preview, file name, and file size appear. Fill in Alt text: `Geometric angle diagram`.
   - **Multiple Choice**: Click `+ Add Audio` under **Question Audio**, upload `manual-qa/media-sample/assets/mystery-pitch-sequence.wav`. Confirm audio player preview appears and plays cleanly in the editor.
   - **Fill-in-the-Blank**: Attach **both** `manual-qa/media-sample/assets/data-structure.svg` (Image) and `manual-qa/media-sample/assets/chime-440hz.wav` (Audio) to the same question. Verify dual media sections coexist cleanly without UI collision.
   - **True/False**: Attach `manual-qa/media-sample/assets/data-structure.svg`. Test the `Replace Image` button by selecting `geometry-angles.svg`; verify image updates immediately.
   - **Matching**: Attach `manual-qa/media-sample/assets/beep-880hz.wav`. Test the `Remove Audio` button; verify audio is cleanly removed and the `+ Add Audio` empty state returns.
4. **Negative Validation**:
   - Try uploading an unsupported file format (e.g. `.txt`, `.pdf`, `.mp4` or executable) to the image or audio input.
   - Verify that an error toast appears and the question media is rejected without crashing the editor.

---

## Verification Journey 2: Offline Media Asset Store & IndexedDB Blob Persistence

### Objective
Verify that binary media assets are stored locally as native Blobs in IndexedDB (`quiz-studio-media-db`) and survive browser reloads and offline usage without data loss.

### Steps
1. In the Question Editor, attach an image and an audio file to a question.
2. Open Browser Developer Tools (`F12`) -> **Application** -> **IndexedDB** -> `quiz-studio-media-db` -> `media_assets`.
3. Verify that new records exist with keys matching the media IDs (`img-...`, `aud-...`), storing MIME type, file name, byte size, and native binary `Blob` object.
4. Hard refresh the page (`Ctrl+F5` / `Cmd+Shift+R`).
5. Return to the question in Edit mode:
   - Confirm image thumbnail preview loads immediately from IndexedDB.
   - Confirm audio player loads and plays immediately from IndexedDB.
6. Disconnect your network or toggle "Offline" in DevTools Network tab:
   - Confirm all media assets continue to load and play properly with zero network calls.

---

## Verification Journey 3: Practice Mode Inline Presentation & Audio-Dependent Solving

### Objective
Verify that practice mode renders attached images and audio players responsively in all 5 Objective Question Types, supporting play, pause, scrubbing, and unrestricted replay, with questions requiring listening/viewing to derive the answer.

### Steps
1. Navigate to **Practice** (练习) mode and start a quiz using `manual-qa/media-sample/quiz-studio-media-sample-paper.json`.
2. **Q1 (Image-Dependent Single Choice)**:
   - Observe the geometric diagram: the acute angle θ is labeled as 37°.
   - Select `θ = 37°`.
3. **Q2 (Genuinely Audio-Dependent Multiple Choice)**:
   - Click Play on the in-question audio player bar.
   - Listen to the 3-tone melody (`Low → High → Low`).
   - Select the options corresponding to the contour heard (Options A & B: Low → High → Low, and bursts 1 and 3 share the same pitch). Notice the answer cannot be guessed without listening.
4. **Q3 (Dual Media Fill-in-the-Blank)**:
   - Observe both the data structure diagram and the chime audio player stacked cleanly.
   - Enter `45` for the middle node value.
5. **Q4 & Q5 (True/False & Matching)**:
   - Solve the remaining questions with image and audio assistance.
6. Complete and submit the quiz; observe the score calculation and sound feedback.

---

## Verification Journey 4: Interactive Image Viewer & Modal Zoom Controls

### Objective
Verify the modal Image Viewer dialog (`#imageViewerDialog`), click-to-zoom interaction, zoom level scaling (25% to 400%), reset, and keyboard navigation.

### Steps
1. In Practice mode, navigate to an image-attached question (e.g. Q1).
2. Click on the image (or focus via `Tab` and press `Enter` / `Space`):
   - Verify the **Image Viewer Dialog** opens in a clean modal overlay with blurred backdrop.
   - Verify the initial zoom level shows `100%`.
3. Test toolbar buttons:
   - Click `+` (Zoom In): verify the image scales up by +25% per click (e.g. 125%, 150%) up to 400%.
   - Click `-` (Zoom Out): verify the image scales down by -25% per click down to 25%.
   - Click `1:1` (Reset): verify zoom resets to 100%.
   - Click `✕` (Close): verify modal closes and returns focus to the question.
4. Re-open the Image Viewer and test **keyboard shortcuts**:
   - Press `+` or `=`: verify image zooms in.
   - Press `-` or `_`: verify image zooms out.
   - Press `0`: verify zoom resets to 100%.
   - Press `Escape`: verify modal closes cleanly.

---

## Verification Journey 5: Single-Paper Portability, Referential Integrity & Legacy Compatibility

### Objective
Verify that single-paper export creates a self-contained portable package with bundled base64 assets (`documentType: "quiz-studio.quiz-paper"`), validates referential integrity upon import, and retains backward compatibility with legacy plain JSON papers.

### Steps
1. In Edit mode sidebar Level 3, click **Export** (导出) on the sample paper.
2. Open the downloaded `.json` file in a text editor:
   - Verify schema: `schemaVersion: 2`, `documentType: "quiz-studio.quiz-paper"`, `paper: { ... }`, `assets: [ { id, mimeType, name, size, data } ]`.
   - Verify binary media assets are converted to base64 strings in the `assets` array.
3. Clear application storage or open a private browsing window.
4. In Edit mode, click **Import** (导入) and select the exported paper JSON.
5. Verify:
   - The paper is imported successfully into the library.
   - Media assets are extracted, converted from base64 to native Blobs, and stored into IndexedDB.
   - Question Editor and Practice mode display and play all media assets immediately.
6. **Integrity Rejection Test**:
   - Manually edit an export JSON to remove one referenced asset from `assets` or set its data to `""`.
   - Try importing the corrupted file: verify the import is rejected with an error toast and no corrupted state is saved.
7. **Legacy Compatibility Test**:
   - Import a legacy text-only paper JSON (e.g. `manual-qa/samples/quiz-normal-sample.json`).
   - Verify the legacy paper imports smoothly without errors.

---

## Verification Journey 6: Full Library Backup & Restore with Media Assets

### Objective
Verify that full library backup bundles all referenced media assets across live papers, active sessions, and historical learner responses, and restores both library state and IndexedDB cleanly with referential integrity.

### Steps
1. In Edit mode sidebar Level 1, click **Backup** (备份).
2. Inspect the downloaded `quiz-studio-backup-*.json`:
   - Verify `documentType: "quiz-studio.library-backup"`.
   - Verify the top-level `mediaAssets` array contains all referenced images and audio files across all papers.
3. Open a clean browser profile or clear storage (`localStorage.clear()` and delete IndexedDB databases).
4. In Edit mode sidebar Level 1, click **Import backup** (导入备份) and choose the backup JSON.
5. Verify:
   - Library papers and categories are fully restored.
   - IndexedDB `quiz-studio-media-db` is populated with all restored media assets as Blobs.
   - All multimedia questions in the restored library display image previews and play audio immediately.

---

## Verification Journey 7: Evidence Immutability & Reference-Aware Conservative Cleanup

### Objective
Verify that active practice sessions and finalized Learner Responses retain independent media snapshots, historical review screens display media thumbnails with zoom, and editing or deleting live papers never corrupts historical evidence.

### Steps
1. Start a practice session on the sample multimedia paper and complete the quiz.
2. In the **Results & Review** screen:
   - Verify questions with images display clickable thumbnail previews (`.review-thumb-img`).
   - Clicking a thumbnail opens the Image Viewer modal.
   - Verify questions with audio display inline audio players (`.review-audio-inline`) that play sound.
3. Return to Edit mode and modify the original paper:
   - Remove the image and change the prompt of Question 1.
4. Check Answer History:
   - Export the Learner Response from history.
   - Verify the snapshot items inside the Learner Response JSON retain the original `image.id` and original prompt without mutation.
   - Verify the media asset in IndexedDB is preserved because historical evidence still references it.

---

## Sign-Off Checklist

| Journey | Focus | Result | Notes |
| :--- | :--- | :---: | :--- |
| **Journey 1** | Authoring across all 5 question types | **[x] PASS** | Validated image & audio upload/replace/remove and MIME checking across all 5 types. |
| **Journey 2** | Local IndexedDB Blob Media Asset Store | **[x] PASS** | Verified native Blob storage in `quiz-studio-media-db` with zero network calls and reload persistence. |
| **Journey 3** | Practice mode inline rendering & audio solving | **[x] PASS** | Verified responsive inline rendering, unrestricted audio player, and audio-dependent solving on Q2 (`mystery-pitch-sequence.wav`). |
| **Journey 4** | Image Viewer modal & keyboard zoom | **[x] PASS** | Verified modal dialog, click-to-zoom, toolbar zoom scaling (25% to 400%), reset, and keyboard shortcuts (`+`, `-`, `0`, `Esc`). |
| **Journey 5** | Single-paper portability & referential integrity | **[x] PASS** | Verified self-contained v2 portability export/import, strict integrity validation on missing/malformed payloads, and legacy fallback. |
| **Journey 6** | Full backup / restore with media assets | **[x] PASS** | Verified `mediaAssets` inclusion in backup, clean IndexedDB restoration, and missing-asset rejection across papers & history. |
| **Journey 7** | Evidence immutability & reference-aware cleanup | **[x] PASS** | Verified active session / finalized evidence media retention and conservative orphan cleanup. |

**Final Verdict**: **PASS** (7/7 journeys evaluated and accepted by Product Owner)
