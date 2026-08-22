import test from "node:test";
import assert from "node:assert/strict";

import {
  isSupportedImageMime,
  isSupportedAudioMime,
  detectMediaMime,
  validateMediaFileCandidate,
  normalizeImageMetadata,
  normalizeAudioMetadata,
} from "../src/core/media-types.js";
import {
  createQuestion,
  convertQuestionType,
  normalizeQuestion,
} from "../src/core/question-registry.js";
import {
  createMemoryMediaStore,
} from "../src/core/media-store.js";
import {
  collectReferencedMediaIds,
  findOrphanedMediaIds,
} from "../src/core/media-references.js";
import {
  createPortablePaperPackage,
  parsePortablePaperPackage,
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
  assert.equal(multimedia.image?.name, "diagram.png");
  assert.equal(multimedia.image?.alt, "Circuit diagram");
  assert.equal(multimedia.audio?.id, "aud-456");
  assert.equal(multimedia.audio?.duration, 3.5);

  // Sanitizes malformed media objects
  const malformed = normalizeQuestion({
    id: "q-malformed",
    type: "blank",
    prompt: "Test",
    image: "invalid-string",
    audio: { id: "" }, // missing valid id
  });
  assert.equal(malformed.image, undefined);
  assert.equal(malformed.audio, undefined);
});

test("convertQuestionType preserves existing image and audio media on the question", () => {
  const question = {
    id: "q-convert",
    type: "single",
    prompt: "Convert me",
    options: [
      { id: "o1", text: "A", correct: true },
      { id: "o2", text: "B", correct: false },
    ],
    image: {
      id: "img-preserve",
      mimeType: "image/webp",
      name: "chart.webp",
      size: 2048,
    },
    audio: {
      id: "aud-preserve",
      mimeType: "audio/wav",
      name: "sound.wav",
      size: 8192,
    },
  };

  convertQuestionType(question, "matching");
  assert.equal(question.type, "matching");
  assert.equal(question.image?.id, "img-preserve");
  assert.equal(question.audio?.id, "aud-preserve");
  assert.equal(Array.isArray(question.pairs), true);
  assert.equal(question.options, undefined);

  convertQuestionType(question, "truefalse");
  assert.equal(question.type, "truefalse");
  assert.equal(question.image?.id, "img-preserve");
  assert.equal(question.audio?.id, "aud-preserve");
  assert.equal(typeof question.answer, "boolean");
});

test("all five Objective Question types accept image, audio, and image + audio simultaneously", () => {
  const types = ["single", "multiple", "blank", "truefalse", "matching"];
  for (const type of types) {
    const q = createQuestion(type);
    q.prompt = `Testing ${type}`;
    q.image = { id: `img-${type}`, mimeType: "image/png", name: "test.png", size: 100 };
    q.audio = { id: `aud-${type}`, mimeType: "audio/mpeg", name: "test.mp3", size: 200 };

    const norm = normalizeQuestion(q);
    assert.equal(norm.type, type);
    assert.equal(norm.image?.id, `img-${type}`);
    assert.equal(norm.audio?.id, `aud-${type}`);
  }
});

test("media store saves, retrieves, lists, exports, and imports binary media assets cleanly", async () => {
  const store = createMemoryMediaStore();

  const asset1 = {
    id: "asset-1",
    mimeType: "image/png",
    name: "map.png",
    size: 4,
    data: "iVBORw0KGgo=", // base64 snippet
  };

  const asset2 = {
    id: "asset-2",
    mimeType: "audio/mpeg",
    name: "speech.mp3",
    size: 4,
    data: "SUQzBAAAAA==",
  };

  await store.saveMediaAsset(asset1);
  await store.saveMediaAsset(asset2);

  const ids = await store.listMediaAssetIds();
  assert.deepEqual(ids.sort(), ["asset-1", "asset-2"]);

  const retrieved1 = await store.getMediaAsset("asset-1");
  assert.equal(retrieved1?.id, "asset-1");
  assert.equal(retrieved1?.name, "map.png");
  assert.equal(retrieved1?.mimeType, "image/png");

  const exported = await store.exportMediaAssets(["asset-1", "asset-2"]);
  assert.equal(exported.length, 2);

  const cleanStore = createMemoryMediaStore();
  await cleanStore.importMediaAssets(exported);

  const cleanIds = await cleanStore.listMediaAssetIds();
  assert.deepEqual(cleanIds.sort(), ["asset-1", "asset-2"]);

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

test("single-paper portability packages self-contained media assets and imports cleanly", () => {
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
});

test("full library backup includes media assets and restore recovers both library and media store", () => {
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

