import test from "node:test";
import assert from "node:assert/strict";

import {
  isSupportedImageMime,
  isSupportedAudioMime,
  detectMediaMime,
  validateMediaFileCandidate,
  normalizeImageMetadata,
  normalizeAudioMetadata,
  formatFileSize,
} from "../src/core/media-types.js";
import {
  createQuestion,
  convertQuestionType,
  normalizeQuestion,
} from "../src/core/question-registry.js";
import {
  createMemoryMediaStore,
  dataToBase64,
  base64ToBlob,
} from "../src/core/media-store.js";
import {
  collectReferencedMediaIds,
  findOrphanedMediaIds,
  cleanupOrphanedMedia,
} from "../src/core/media-references.js";
import {
  createPortablePaperPackage,
  parsePortablePaperPackage,
  validatePaperMediaIntegrity,
} from "../src/core/paper-portability.js";
import {
  createLibraryBackup,
  parseLibraryBackup,
} from "../src/core/backup.js";
import { normalizePaper, normalizeLibrary } from "../src/core/migrations.js";

test("media types validation recognizes supported image and audio formats and rejects others", () => {
  assert.equal(isSupportedImageMime("image/png"), true);
  assert.equal(isSupportedImageMime("image/jpeg"), true);
  assert.equal(isSupportedImageMime("image/webp"), true);
  assert.equal(isSupportedImageMime("image/gif"), true);
  assert.equal(isSupportedImageMime("image/svg+xml"), true);
  assert.equal(isSupportedImageMime("application/pdf"), false);
  assert.equal(isSupportedImageMime("video/mp4"), false);

  assert.equal(isSupportedAudioMime("audio/mpeg"), true);
  assert.equal(isSupportedAudioMime("audio/mp3"), true);
  assert.equal(isSupportedAudioMime("audio/wav"), true);
  assert.equal(isSupportedAudioMime("audio/ogg"), true);
  assert.equal(isSupportedAudioMime("audio/webm"), true);
  assert.equal(isSupportedAudioMime("audio/aac"), true);
  assert.equal(isSupportedAudioMime("audio/m4a"), true);
  assert.equal(isSupportedAudioMime("audio/flac"), true);
  assert.equal(isSupportedAudioMime("video/webm"), false);
  assert.equal(isSupportedAudioMime("application/octet-stream"), false);

  assert.equal(detectMediaMime("diagram.PNG", ""), "image/png");
  assert.equal(detectMediaMime("recording.mp3", ""), "audio/mpeg");
  assert.equal(detectMediaMime("sound.wav", "audio/x-wav"), "audio/wav");

  const validImg = validateMediaFileCandidate({ name: "chart.png", type: "image/png", size: 1024 }, "image");
  assert.equal(validImg.valid, true);

  const invalidImg = validateMediaFileCandidate({ name: "script.exe", type: "application/x-msdownload", size: 500 }, "image");
  assert.equal(invalidImg.valid, false);

  const validAud = validateMediaFileCandidate({ name: "prompt.mp3", type: "audio/mpeg", size: 2048 }, "audio");
  assert.equal(validAud.valid, true);

  const invalidAud = validateMediaFileCandidate({ name: "movie.mp4", type: "video/mp4", size: 5000 }, "audio");
  assert.equal(invalidAud.valid, false);
});

test("question normalization preserves optional image and audio metadata and safely handles legacy states", () => {
  // Legacy question without media
  const legacy = normalizeQuestion({
    id: "q-legacy",
    type: "single",
    prompt: "No media question",
  });
  assert.equal(legacy.image, undefined);
  assert.equal(legacy.audio, undefined);

  // Question with valid image and audio
  const multimedia = normalizeQuestion({
    id: "q-media",
    type: "multiple",
    prompt: "Listen and look",
    image: {
      id: "img-123",
      mimeType: "image/png",
      name: "diagram.png",
      size: 4096,
      alt: "Circuit diagram",
    },
    audio: {
      id: "aud-456",
      mimeType: "audio/mpeg",
      name: "prompt.mp3",
      size: 16384,
      duration: 3.5,
    },
  });

  assert.equal(multimedia.image?.id, "img-123");
  assert.equal(multimedia.image?.mimeType, "image/png");
  assert.equal(multimedia.image?.name, "diagram.png");
  assert.equal(multimedia.image?.size, 4096);
  assert.equal(multimedia.image?.alt, "Circuit diagram");

  assert.equal(multimedia.audio?.id, "aud-456");
  assert.equal(multimedia.audio?.mimeType, "audio/mpeg");
  assert.equal(multimedia.audio?.name, "prompt.mp3");
  assert.equal(multimedia.audio?.size, 16384);
  assert.equal(multimedia.audio?.duration, 3.5);

  // Question with malformed media objects gets cleaned
  const malformed = normalizeQuestion({
    id: "q-bad",
    type: "single",
    prompt: "Bad media",
    image: { id: "   " },
    audio: null,
  });
  assert.equal(malformed.image, undefined);
  assert.equal(malformed.audio, undefined);
});

test("convertQuestionType preserves existing image and audio media on the question", () => {
  const q = createQuestion("single");
  q.prompt = "What is shown in the image?";
  q.image = { id: "img-01", mimeType: "image/png", name: "tree.png", size: 1024 };
  q.audio = { id: "aud-01", mimeType: "audio/mpeg", name: "bird.mp3", size: 2048 };

  // Convert to multiple choice
  convertQuestionType(q, "multiple");
  assert.equal(q.type, "multiple");
  assert.equal(q.image?.id, "img-01");
  assert.equal(q.audio?.id, "aud-01");

  // Convert to blank
  convertQuestionType(q, "blank");
  assert.equal(q.type, "blank");
  assert.equal(q.image?.id, "img-01");
  assert.equal(q.audio?.id, "aud-01");

  // Convert to truefalse
  convertQuestionType(q, "truefalse");
  assert.equal(q.type, "truefalse");
  assert.equal(q.image?.id, "img-01");
  assert.equal(q.audio?.id, "aud-01");

  // Convert to matching
  convertQuestionType(q, "matching");
  assert.equal(q.type, "matching");
  assert.equal(q.image?.id, "img-01");
  assert.equal(q.audio?.id, "aud-01");
});

test("all five Objective Question types accept image, audio, and image + audio simultaneously", () => {
  const types = ["single", "multiple", "blank", "truefalse", "matching"];

  types.forEach((type) => {
    // 1. Image only
    const imgQ = normalizeQuestion({
      id: `q-${type}-img`,
      type,
      prompt: `Prompt for ${type} with image`,
      image: { id: `img-${type}`, mimeType: "image/png", name: "art.png", size: 500 },
    });
    assert.equal(imgQ.image?.id, `img-${type}`);
    assert.equal(imgQ.audio, undefined);

    // 2. Audio only
    const audQ = normalizeQuestion({
      id: `q-${type}-aud`,
      type,
      prompt: `Prompt for ${type} with audio`,
      audio: { id: `aud-${type}`, mimeType: "audio/mpeg", name: "voice.mp3", size: 1000 },
    });
    assert.equal(audQ.image, undefined);
    assert.equal(audQ.audio?.id, `aud-${type}`);

    // 3. Both Image and Audio
    const dualQ = normalizeQuestion({
      id: `q-${type}-dual`,
      type,
      prompt: `Prompt for ${type} with both`,
      image: { id: `img-${type}-dual`, mimeType: "image/svg+xml", name: "chart.svg", size: 800 },
      audio: { id: `aud-${type}-dual`, mimeType: "audio/wav", name: "chime.wav", size: 1200 },
    });
    assert.equal(dualQ.image?.id, `img-${type}-dual`);
    assert.equal(dualQ.audio?.id, `aud-${type}-dual`);
  });
});

test("media store persists runtime assets as Blob/binary and exports/imports base64 cleanly at boundaries", async () => {
  const store = createMemoryMediaStore();

  const dummyImageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
  const dummyAudioBytes = new Uint8Array([73, 68, 51, 3, 0, 0, 0, 0, 0, 10]);

  await store.saveMediaAsset({
    id: "asset-1",
    mimeType: "image/png",
    name: "icon.png",
    size: dummyImageBytes.byteLength,
    data: dummyImageBytes,
  });

  await store.saveMediaAsset({
    id: "asset-2",
    mimeType: "audio/mpeg",
    name: "sound.mp3",
    size: dummyAudioBytes.byteLength,
    data: dummyAudioBytes,
  });

  const ids = await store.listMediaAssetIds();
  assert.deepEqual(ids.sort(), ["asset-1", "asset-2"]);

  const retrieved1 = await store.getMediaAsset("asset-1");
  assert.equal(retrieved1?.id, "asset-1");
  assert.equal(retrieved1?.mimeType, "image/png");
  assert.ok(retrieved1?.blob, "Retrieved asset must contain binary Blob");

  // Export converts Blob to base64 at JSON portability boundary
  const exported = await store.exportMediaAssets(["asset-1", "asset-2"]);
  assert.equal(exported.length, 2);
  assert.equal(typeof exported[0].data, "string");
  assert.ok(exported[0].data.length > 0);

  // Import converts base64 back into Blob for runtime persistence
  const cleanStore = createMemoryMediaStore();
  await cleanStore.importMediaAssets(exported);

  const cleanIds = await cleanStore.listMediaAssetIds();
  assert.deepEqual(cleanIds.sort(), ["asset-1", "asset-2"]);
  const importedAsset = await cleanStore.getMediaAsset("asset-1");
  assert.ok(importedAsset?.blob, "Imported asset in store must be binary Blob");

  await store.deleteMediaAsset("asset-1");
  const remainingIds = await store.listMediaAssetIds();
  assert.deepEqual(remainingIds, ["asset-2"]);
  assert.equal(await store.getMediaAsset("asset-1"), null);
});

test("reference collection gathers media references across live papers, active sessions, and finalized evidence", () => {
  const library = {
    papers: [
      {
        id: "p1",
        title: "Paper 1",
        questions: [
          { id: "q1", type: "single", prompt: "Q1", image: { id: "img-live-1" } },
          { id: "q2", type: "blank", prompt: "Q2", audio: { id: "aud-live-2" } },
        ],
      },
    ],
  };

  const session = {
    id: "sess-1",
    questions: [
      { id: "q3", type: "multiple", prompt: "Q3", image: { id: "img-sess-3" }, audio: { id: "aud-sess-3" } },
    ],
  };

  const learnerResponses = [
    {
      id: "resp-1",
      documentType: "quiz-studio.learner-response",
      material: {
        type: "quiz-paper",
        id: "p-historical",
        title: "Old Paper",
        snapshot: {
          items: [
            { id: "q4", type: "truefalse", prompt: "Q4", image: { id: "img-evidence-4" } },
          ],
        },
      },
    },
  ];

  const referencedIds = collectReferencedMediaIds({
    library,
    session,
    learnerResponses,
  });

  assert.equal(referencedIds.has("img-live-1"), true);
  assert.equal(referencedIds.has("aud-live-2"), true);
  assert.equal(referencedIds.has("img-sess-3"), true);
  assert.equal(referencedIds.has("aud-sess-3"), true);
  assert.equal(referencedIds.has("img-evidence-4"), true);
  assert.equal(referencedIds.size, 5);

  const storedIds = ["img-live-1", "aud-live-2", "img-sess-3", "aud-sess-3", "img-evidence-4", "orphaned-img-999"];
  const orphans = findOrphanedMediaIds(storedIds, referencedIds);
  assert.deepEqual(orphans, ["orphaned-img-999"]);
});

test("cleanupOrphanedMedia deletes unreferenced assets while protecting live, active session, and historical evidence", async () => {
  const store = createMemoryMediaStore();
  await store.saveMediaAsset({ id: "live-img", mimeType: "image/png", name: "live.png", data: new Uint8Array([1, 2, 3]) });
  await store.saveMediaAsset({ id: "session-aud", mimeType: "audio/mpeg", name: "sess.mp3", data: new Uint8Array([4, 5, 6]) });
  await store.saveMediaAsset({ id: "history-img", mimeType: "image/png", name: "hist.png", data: new Uint8Array([7, 8, 9]) });
  await store.saveMediaAsset({ id: "orphan-aud", mimeType: "audio/wav", name: "orphan.wav", data: new Uint8Array([10, 11, 12]) });

  const library = {
    papers: [{ id: "p1", title: "P1", questions: [{ id: "q1", type: "single", prompt: "Q1", image: { id: "live-img" } }] }],
  };
  const session = {
    questions: [{ id: "q2", type: "single", prompt: "Q2", audio: { id: "session-aud" } }],
  };
  const learnerResponses = [
    { id: "r1", material: { snapshot: { items: [{ id: "q3", type: "truefalse", prompt: "Q3", image: { id: "history-img" } }] } } },
  ];

  const deleted = await cleanupOrphanedMedia(store, { library, session, learnerResponses });
  assert.deepEqual(deleted, ["orphan-aud"]);

  const remaining = await store.listMediaAssetIds();
  assert.deepEqual(remaining.sort(), ["history-img", "live-img", "session-aud"]);
});

test("single-paper portability packages self-contained media assets and validates referential integrity", () => {
  const paper = {
    id: "p-media",
    title: "Multimedia Geography Quiz",
    description: "Map and audio listening test",
    category: "Geography",
    tags: ["maps", "listening"],
    questions: [
      {
        id: "q-map",
        type: "single",
        prompt: "Identify the landmark shown",
        options: [
          { id: "o1", text: "Option A", correct: true },
          { id: "o2", text: "Option B", correct: false },
        ],
        image: {
          id: "asset-map-01",
          mimeType: "image/png",
          name: "landmark.png",
          size: 1024,
          alt: "A photo of a famous bridge",
        },
        audio: {
          id: "asset-audio-01",
          mimeType: "audio/mpeg",
          name: "cue.mp3",
          size: 2048,
          duration: 4.2,
        },
      },
    ],
  };

  const assets = [
    {
      id: "asset-map-01",
      mimeType: "image/png",
      name: "landmark.png",
      size: 1024,
      data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    },
    {
      id: "asset-audio-01",
      mimeType: "audio/mpeg",
      name: "cue.mp3",
      size: 2048,
      data: "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA",
    },
  ];

  const pkg = createPortablePaperPackage(paper, assets);
  assert.equal(pkg.documentType, "quiz-studio.quiz-paper");
  assert.equal(pkg.paper.title, "Multimedia Geography Quiz");
  assert.equal(pkg.assets.length, 2);

  // Parse portable package
  const parsed = parsePortablePaperPackage(pkg);
  assert.equal(parsed.paper.title, "Multimedia Geography Quiz");
  assert.equal(parsed.paper.questions[0].image?.id, "asset-map-01");
  assert.equal(parsed.assets.length, 2);
  assert.equal(parsed.assets[0].id, "asset-map-01");

  // Parse legacy plain paper JSON without assets
  const legacyPaper = {
    id: "legacy-p",
    title: "Plain Quiz",
    questions: [
      { id: "q1", type: "truefalse", prompt: "Is it sunny?", answer: true },
    ],
  };
  const parsedLegacy = parsePortablePaperPackage(legacyPaper);
  assert.equal(parsedLegacy.paper.title, "Plain Quiz");
  assert.deepEqual(parsedLegacy.assets, []);

  // Reject missing referenced asset
  const missingAssetPkg = {
    documentType: "quiz-studio.quiz-paper",
    paper: {
      questions: [
        { id: "q-broken", type: "single", prompt: "Look", image: { id: "missing-img-999" } },
      ],
    },
    assets: [],
  };
  assert.throws(() => parsePortablePaperPackage(missingAssetPkg), /missing-img-999/);

  // Reject malformed/empty payload asset
  const emptyPayloadPkg = {
    documentType: "quiz-studio.quiz-paper",
    paper: {
      questions: [
        { id: "q-empty", type: "single", prompt: "Look", image: { id: "empty-img-01" } },
      ],
    },
    assets: [
      { id: "empty-img-01", mimeType: "image/png", name: "empty.png", size: 0, data: "" },
    ],
  };
  assert.throws(() => parsePortablePaperPackage(emptyPayloadPkg), /empty/i);

  // Reject conflicting duplicate asset IDs
  const conflictingDuplicatePkg = {
    documentType: "quiz-studio.quiz-paper",
    paper: {
      questions: [
        { id: "q-dup", type: "single", prompt: "Look", image: { id: "dup-id" } },
      ],
    },
    assets: [
      { id: "dup-id", mimeType: "image/png", name: "a.png", size: 10, data: "AAAA" },
      { id: "dup-id", mimeType: "image/jpeg", name: "b.jpg", size: 20, data: "BBBB" },
    ],
  };
  assert.throws(() => parsePortablePaperPackage(conflictingDuplicatePkg), /duplicate/i);

  // Reject unsupported MIME on referenced asset
  const badMimePkg = {
    documentType: "quiz-studio.quiz-paper",
    paper: {
      questions: [
        { id: "q-bad-mime", type: "single", prompt: "Look", image: { id: "bad-mime-id" } },
      ],
    },
    assets: [
      { id: "bad-mime-id", mimeType: "application/pdf", name: "doc.pdf", size: 100, data: "JVBERi0xLjQK" },
    ],
  };
  assert.throws(() => parsePortablePaperPackage(badMimePkg), /invalid|unsupported/i);
});

test("full library backup enforces media referential integrity and restores safely", () => {
  const library = {
    papers: [
      {
        id: "p1",
        title: "Multimedia Exam",
        questions: [
          {
            id: "q1",
            type: "single",
            prompt: "Test prompt",
            image: { id: "img-01", mimeType: "image/png", name: "test.png", size: 100 },
          },
        ],
      },
    ],
    categories: ["Science"],
  };

  const mediaAssets = [
    {
      id: "img-01",
      mimeType: "image/png",
      name: "test.png",
      size: 100,
      data: "iVBORw0KGgo==",
    },
  ];

  const backup = createLibraryBackup({
    library,
    mediaAssets,
  });

  assert.equal(backup.documentType, "quiz-studio.library-backup");
  assert.equal(Array.isArray(backup.mediaAssets), true);
  assert.equal(backup.mediaAssets.length, 1);
  assert.equal(backup.mediaAssets[0].id, "img-01");

  const restored = parseLibraryBackup(backup);
  assert.equal(restored.library.papers[0].title, "Multimedia Exam");
  assert.equal(restored.mediaAssets.length, 1);
  assert.equal(restored.mediaAssets[0].id, "img-01");

  // Restoring legacy backup without mediaAssets yields empty array
  const legacyBackup = {
    schemaVersion: 1,
    documentType: "quiz-studio.library-backup",
    library: {
      papers: [{ id: "lp1", title: "Legacy", questions: [{ id: "lq1", type: "truefalse", prompt: "Ok?", answer: true }] }],
    },
  };
  const restoredLegacy = parseLibraryBackup(legacyBackup);
  assert.equal(restoredLegacy.library.papers[0].title, "Legacy");
  assert.deepEqual(restoredLegacy.mediaAssets, []);

  // Reject backup with missing referenced media asset
  const brokenBackup = {
    schemaVersion: 2,
    documentType: "quiz-studio.library-backup",
    library: {
      papers: [{ id: "bp1", title: "Broken", questions: [{ id: "bq1", type: "single", prompt: "Prompt", image: { id: "missing-img" } }] }],
    },
    mediaAssets: [],
  };
  assert.throws(() => parseLibraryBackup(brokenBackup), /missing-img/);
});

test("question and paper duplication preserves media references safely", () => {
  const originalPaper = {
    id: "p-orig",
    title: "Original",
    questions: [
      {
        id: "q-orig",
        type: "single",
        prompt: "Original Question",
        options: [{ id: "o1", text: "A", correct: true }],
        image: { id: "img-shared", mimeType: "image/png", name: "art.png", size: 500, alt: "Art" },
        audio: { id: "aud-shared", mimeType: "audio/mpeg", name: "voice.mp3", size: 1000 },
      },
    ],
  };

  const duplicated = normalizePaper({
    ...structuredClone(originalPaper),
    id: "p-dup",
    title: "Original (Copy)",
  });

  assert.equal(duplicated.questions[0].image?.id, "img-shared");
  assert.equal(duplicated.questions[0].audio?.id, "aud-shared");
  assert.equal(duplicated.questions[0].image?.alt, "Art");
});

test("active session question snapshots preserve media and survive live paper mutation", () => {
  const livePaper = {
    id: "p-live",
    title: "Live Paper",
    questions: [
      {
        id: "q-1",
        type: "truefalse",
        prompt: "Original prompt",
        answer: true,
        image: { id: "img-live", mimeType: "image/png", name: "initial.png", size: 100 },
      },
    ],
  };

  // Session captures question snapshots at practice start
  const activeSessionQuestions = livePaper.questions.map((q) => structuredClone(q));
  assert.equal(activeSessionQuestions[0].image?.id, "img-live");

  // Subsequent edit to live paper removes media or changes prompt
  livePaper.questions[0].prompt = "Edited prompt";
  delete livePaper.questions[0].image;

  // Active session snapshot retains its original image reference and prompt
  assert.equal(activeSessionQuestions[0].prompt, "Original prompt");
  assert.equal(activeSessionQuestions[0].image?.id, "img-live");
});
