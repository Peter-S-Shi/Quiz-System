# Quiz Studio — Multimedia Sample Paper & QA Assets

This directory provides permanent, human-visible verification assets for **Pre-Freeze V1 Scope Closure · Batch C (Objective Question Media — Image & Audio)**.

---

## 1. Directory Contents

```
manual-qa/media-sample/
├── README.md                              # This reference guide
├── quiz-studio-media-sample-paper.json    # Self-contained portable paper package with bundled assets
└── assets/                                # Source multimedia files for manual authoring QA
    ├── geometry-angles.svg                # Geometric diagram (image/svg+xml)
    ├── data-structure.svg                 # Linked list data structure diagram (image/svg+xml)
    ├── chime-440hz.wav                    # Standard concert pitch A4 tone (audio/wav)
    └── beep-880hz.wav                     # High octave A5 tone (audio/wav)
```

---

## 2. Sample Paper Structure (`quiz-studio-media-sample-paper.json`)

The bundled paper demonstrates all **5 Objective Question Types** with diverse media attachments:

| Question # | Type | Media Attachment | Focus / Verification Check |
| :--- | :--- | :--- | :--- |
| **Q1** | **Single Choice** (`single`) | **Image only** (`geometry-angles.svg`) | Inline image rendering, zoom viewer overlay button, complementary angle calculation. |
| **Q2** | **Multiple Choice** (`multiple`) | **Audio only** (`chime-440hz.wav`) | Inline audio player with play/pause, seek/scrub, listening comprehension. |
| **Q3** | **Fill-in-the-Blank** (`blank`) | **Dual Media (Image + Audio)** | Coexistence of diagram (`data-structure.svg`) and audio prompt (`beep-880hz.wav`). |
| **Q4** | **True / False** (`truefalse`) | **Image only** (`data-structure.svg`) | Diagram examination, Alt text description verification, terminal node validation. |
| **Q5** | **Matching** (`matching`) | **Audio only** (`chime-440hz.wav`) | Audio player within matching question, pitch and structure property mapping. |

---

## 3. How to Use for Verification

### A. Testing Single-Paper Portability Import
1. Open Quiz Studio in the browser.
2. In the Edit mode sidebar, click **Import** (导入) and choose `manual-qa/media-sample/quiz-studio-media-sample-paper.json`.
3. Verify that the paper is created under the Category `Multimedia QA`.
4. Check that all questions display their attached image thumbnail previews (with file name, size, alt text) and audio players in the editor.

### B. Testing Quiz Practice & Image Viewer
1. Switch to **Practice Mode** (练习) and start a quiz with the imported paper.
2. In Q1, click on the geometric diagram:
   - The **Image Viewer Dialog** opens.
   - Test zoom controls: Click `+` or press `+`/`=` to zoom in (up to 400%).
   - Click `-` or press `-`/`_` to zoom out (down to 25%).
   - Click `1:1` or press `0` to reset zoom to 100%.
   - Press `Escape` or click `✕` to close the viewer.
3. In Q2, play the audio clip and adjust volume/seeking.
4. In Q3, observe that both the data structure diagram and the audio player render cleanly together without layout distortion.
5. Finish and submit the quiz; verify that the review list displays image thumbnails (with click-to-zoom) and inline audio players.

### C. Testing Authoring Upload / Replace / Remove
1. Select any question in Edit mode.
2. In the **Question Image** panel:
   - Click `+ Add Image` (or `Replace Image`) and select `manual-qa/media-sample/assets/geometry-angles.svg`.
   - Update the Alt text input.
   - Click `Remove Image` and confirm the image is removed.
3. In the **Question Audio** panel:
   - Click `+ Add Audio` and select `manual-qa/media-sample/assets/chime-440hz.wav`.
   - Play the audio preview in the editor.
   - Click `Remove Audio` and confirm the audio is removed.

### D. Testing Full Backup & Restore
1. Click **Backup** (备份) in the sidebar to download a full library backup.
2. Open the downloaded backup JSON and verify the top-level `mediaAssets` array contains the base64-encoded payloads.
3. Clear application data or open in an incognito window, then click **Import Backup** (导入备份).
4. Verify that all papers and media assets load cleanly into IndexedDB and render immediately.
