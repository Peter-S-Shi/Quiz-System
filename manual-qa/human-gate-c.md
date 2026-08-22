# Human Gate C Verification Guide — Objective Question Media (Image & Audio)

**Scope**: Pre-Freeze V1 Scope Closure · Batch C  
**Status**: PENDING EVALUATION  
**Evaluator**: Human Reviewer / Product Owner  

---

## Overview

This guide provides step-by-step verification journeys for the Objective Question Media capabilities introduced in Pre-Freeze V1 Scope Closure Batch C:
1. **Media Support across all 5 Objective Question Types**: Single Choice, Multiple Choice, Fill-in-the-Blank, True/False, Matching.
2. **Local-Only Media Storage Architecture**: Offline-first storage using an IndexedDB-backed binary Media Asset Store (`quiz-studio-media-db` / `media_assets` object store) linked with stable UUIDs in Question JSON.
3. **Image Authoring, Preview, and Accessibility**: Local image upload (PNG, JPEG, WebP, GIF, SVG), thumbnail preview, replace, remove, and accessible Alt text description.
4. **Interactive Image Viewer & Zoom Controls**: Responsive modal viewer with Zoom In (`+`), Zoom Out (`-`), Reset (`1:1`), Close (`✕`), and keyboard shortcuts (`+`, `-`, `0`, `Esc`).
5. **Audio Authoring and Practice Player**: Local audio upload (MP3, WAV, OGG, WebM, AAC, M4A, FLAC), in-editor preview, and in-question player with play/pause, seek/scrub, and unlimited replay.
6. **Single-Paper Portability & Full Backup/Restore**: Self-contained export/import envelopes with bundled base64 assets, IndexedDB synchronization, and seamless backward compatibility with legacy text-only JSON.
7. **Evidence Immutability & Historical Snapshot Safety**: Active session snapshots, finalized Learner Response snapshots, and review screen thumbnail rendering.

---

## Verification Journey 1: Objective Question Media Authoring (All 5 Types)

### Objective
Verify that all 5 Objective Question Types accept optional Image and Audio attachments (individually or simultaneously), with file type validation, live thumbnail/player previews, replacement, removal, and accessible alt text.

### Steps
1. Launch Quiz Studio (`start-local.bat` or `python scripts/dev-server.py`).
2. Navigate to **Edit** (编辑) mode, select or create a paper, and navigate to Level 3 (Questions).
3. Test each question type:
   - **Single Choice**: Click `+ Add Image` under **Question Image**, upload `manual-qa/media-sample/assets/geometry-angles.svg`. Confirm thumbnail preview, file name, and file size appear. Fill in Alt text: `Geometric angle diagram`.
   - **Multiple Choice**: Click `+ Add Audio` under **Question Audio**, upload `manual-qa/media-sample/assets/chime-440hz.wav`. Confirm audio player preview appears and plays cleanly in the editor.
   - **Fill-in-the-Blank**: Attach **both** `manual-qa/media-sample/assets/data-structure.svg` (Image) and `manual-qa/media-sample/assets/beep-880hz.wav` (Audio) to the same question. Verify dual media sections coexist cleanly without UI collision.
   - **True/False**: Attach `manual-qa/media-sample/assets/data-structure.svg`. Test the `Replace Image` button by selecting `geometry-angles.svg`; verify image updates immediately.
   - **Matching**: Attach `manual-qa/media-sample/assets/chime-440hz.wav`. Test the `Remove Audio` button; verify audio is cleanly removed and the `+ Add Audio` empty state returns.
4. **Negative Validation**:
   - Try uploading an unsupported file format (e.g. `.txt`, `.pdf`, `.mp4` or executable) to the image or audio input.
   - Verify that an error toast appears and the question media is rejected without crashing the editor.

---

## Verification Journey 2: Offline Media Asset Store & IndexedDB Persistence

### Objective
Verify that binary media assets are stored locally in IndexedDB (`quiz-studio-media-db`) and survive browser reloads and offline usage without data loss.

### Steps
1. In the Question Editor, attach an image and an audio file to a question.
2. Open Browser Developer Tools (`F12`) -> **Application** -> **IndexedDB** -> `quiz-studio-media-db` -> `media_assets`.
3. Verify that new records exist with keys matching the media IDs (`img-...`, `aud-...`), storing MIME type, file name, byte size, and base64/blob data.
4. Hard refresh the page (`Ctrl+F5` / `Cmd+Shift+R`).
5. Return to the question in Edit mode:
   - Confirm image thumbnail preview loads immediately from IndexedDB.
   - Confirm audio player loads and plays immediately from IndexedDB.
6. Disconnect your network or toggle "Offline" in DevTools Network tab:
   - Confirm all media assets continue to load and play properly with zero network calls.

---

## Verification Journey 3: Practice Mode Inline Presentation & Audio Playback

### Objective
Verify that practice mode renders attached images and audio players responsively in all 5 Objective Question Types, supporting play, pause, scrubbing, and unrestricted replay.

### Steps
1. Navigate to **Practice** (练习) mode and start a quiz using the paper created or `manual-qa/media-sample/quiz-studio-media-sample-paper.json`.
2. Observe question media layout:
   - On image-attached questions: verify the image is centered, responsive, crisp, and displays the `🔍 Click to zoom` overlay badge.
   - On audio-attached questions: verify the audio player bar renders with standard browser controls (play/pause, timeline scrub bar, time display).
   - On dual image + audio questions: verify image and audio stack cleanly without overflowing.
3. Test audio playback:
   - Click Play: verify sound plays cleanly.
   - Scrub the timeline to the middle: verify playback jumps correctly.
   - Replay the audio multiple times: confirm unrestricted replay in V1.
4. Complete and submit the quiz.

---

## Verification Journey 4: Interactive Image Viewer & Modal Zoom Controls

### Objective
Verify the modal Image Viewer dialog (`#imageViewerDialog`), click-to-zoom interaction, zoom level scaling (25% to 400%), reset, and keyboard navigation.

### Steps
1. In Practice mode, navigate to an image-attached question.
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

## Verification Journey 5: Single-Paper Portability & Backward Compatibility

### Objective
Verify that single-paper export creates a self-contained portable package with bundled base64 assets (`documentType: "quiz-studio.quiz-paper"`), imports cleanly into a fresh environment, and retains backward compatibility with legacy plain JSON papers.

### Steps
1. In Edit mode sidebar Level 3, click **Export** (导出).
2. Open the downloaded `.json` file in a text editor:
   - Verify schema: `schemaVersion: 2`, `documentType: "quiz-studio.quiz-paper"`, `paper: { ... }`, `assets: [ { id, mimeType, name, size, data } ]`.
   - Verify binary media assets are bundled as base64 strings in the `assets` array.
3. Clear application storage or open a private browsing window.
4. In Edit mode, click **Import** (导入) and select the exported paper JSON.
5. Verify:
   - The paper is imported successfully into the library.
   - Media assets are extracted and stored into IndexedDB.
   - Question Editor and Practice mode display and play all media assets immediately.
6. **Legacy Compatibility Test**:
   - Import a legacy text-only paper JSON (e.g. `manual-qa/samples/quiz-normal-sample.json`).
   - Verify the legacy paper imports smoothly without errors, normalizing missing media fields to undefined.

---

## Verification Journey 6: Full Library Backup & Restore with Media Assets

### Objective
Verify that full library backup bundles all referenced media assets across live papers, active sessions, and historical learner responses, and restores both library state and IndexedDB cleanly.

### Steps
1. In Edit mode sidebar Level 1, click **Backup** (备份).
2. Inspect the downloaded `quiz-studio-backup-*.json`:
   - Verify `documentType: "quiz-studio.library-backup"`.
   - Verify the top-level `mediaAssets` array contains all referenced images and audio files across all papers.
3. Open a clean browser profile or clear storage (`localStorage.clear()` and delete IndexedDB databases).
4. In Edit mode sidebar Level 1, click **Import backup** (导入备份) and choose the backup JSON.
5. Verify:
   - Library papers and categories are fully restored.
   - IndexedDB `quiz-studio-media-db` is populated with all restored media assets.
   - All multimedia questions in the restored library display image previews and play audio immediately.

---

## Verification Journey 7: Evidence Immutability & Historical Snapshot Safety

### Objective
Verify that active practice sessions and finalized Learner Responses retain independent media snapshots, historical review screens display media thumbnails with zoom, and editing or deleting live papers never corrupts historical evidence.

### Steps
1. Start a practice session on a multimedia paper and complete the quiz.
2. In the **Results & Review** screen:
   - Verify questions with images display clickable thumbnail previews (`.review-thumb-img`).
   - Clicking a thumbnail opens the Image Viewer modal.
   - Verify questions with audio display inline audio players (`.review-audio-inline`) that play sound.
3. Return to Edit mode and modify the original paper:
   - Remove the image and change the prompt of Question 1.
4. Check Answer History:
   - Export the Learner Response from history.
   - Verify the snapshot items inside the Learner Response JSON retain the original `image.id` and original prompt without mutation.

---

## Sign-Off Checklist

| Journey | Focus | Result | Notes |
| :--- | :--- | :---: | :--- |
| **Journey 1** | Authoring across all 5 question types | **[ ] PASS / [ ] FAIL** | |
| **Journey 2** | Local IndexedDB Media Asset Store | **[ ] PASS / [ ] FAIL** | |
| **Journey 3** | Practice mode inline rendering & audio | **[ ] PASS / [ ] FAIL** | |
| **Journey 4** | Image Viewer modal & keyboard zoom | **[ ] PASS / [ ] FAIL** | |
| **Journey 5** | Single-paper portability & legacy import | **[ ] PASS / [ ] FAIL** | |
| **Journey 6** | Full backup / restore with media assets | **[ ] PASS / [ ] FAIL** | |
| **Journey 7** | Evidence immutability & review list | **[ ] PASS / [ ] FAIL** | |

**Final Verdict**: **PENDING HUMAN EVALUATION**
