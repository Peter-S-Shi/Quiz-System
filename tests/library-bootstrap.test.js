import test from "node:test";
import assert from "node:assert/strict";

import { bootstrapQuizLibrary } from "../src/core/library-bootstrap.js";
import { createLibraryBackup, parseLibraryBackup } from "../src/core/backup.js";
import { STORAGE_KEYS } from "../src/storage/local-storage.js";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    snapshot() {
      return Object.fromEntries(values);
    },
  };
}

function createDefaultPaper() {
  return {
    id: "default-paper",
    title: "Synthetic default",
    description: "",
    questions: [],
  };
}

test("malformed canonical Library remains byte-for-byte recoverable and is not overwritten during bootstrap", () => {
  const malformed = '{"schemaVersion":1,"papers":[';
  const storage = createStorage({ [STORAGE_KEYS.LIBRARY]: malformed });

  const result = bootstrapQuizLibrary({
    storage,
    createDefaultPaper,
    now: () => "2026-08-22T12:00:00.000Z",
  });

  assert.equal(storage.getItem(STORAGE_KEYS.LIBRARY), malformed);
  assert.equal(result.source, "canonical-invalid");
  assert.equal(result.canPersist, true);
  assert.equal(result.library.papers[0].id, "default-paper");
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.LIBRARY_RECOVERY)), {
    schemaVersion: 1,
    sourceKey: STORAGE_KEYS.LIBRARY,
    rawValue: malformed,
    reason: "malformed-json",
    preservedAt: "2026-08-22T12:00:00.000Z",
  });
});

test("unsupported canonical shapes and future schema versions are quarantined instead of normalized", () => {
  const unsupportedValues = [
    { schemaVersion: 2, papers: [{ id: "future", questions: [] }] },
    { schemaVersion: "future", papers: [{ id: "invalid-schema", questions: [] }] },
    { schemaVersion: 1, papers: [{ id: "missing-questions" }] },
  ];

  unsupportedValues.forEach((value) => {
    const rawValue = JSON.stringify(value);
    const storage = createStorage({ [STORAGE_KEYS.LIBRARY]: rawValue });
    const result = bootstrapQuizLibrary({ storage, createDefaultPaper });

    assert.equal(result.source, "canonical-invalid");
    assert.equal(storage.getItem(STORAGE_KEYS.LIBRARY), rawValue);
    assert.equal(JSON.parse(storage.getItem(STORAGE_KEYS.LIBRARY_RECOVERY)).rawValue, rawValue);
  });
});

test("M1 single-Paper storage migrates through bootstrap while preserving the legacy source", () => {
  const legacyPaper = {
    title: "Synthetic M1 Paper",
    description: "Historical single-Paper shape",
    questions: [{ id: "m1-q1", type: "truefalse", prompt: "Synthetic?", answer: true }],
  };
  const rawLegacy = JSON.stringify(legacyPaper);
  const storage = createStorage({ [STORAGE_KEYS.LEGACY_PAPER]: rawLegacy });

  const result = bootstrapQuizLibrary({ storage, createDefaultPaper });

  assert.equal(result.source, "legacy-paper");
  assert.equal(storage.getItem(STORAGE_KEYS.LEGACY_PAPER), rawLegacy);
  assert.equal(result.library.papers[0].title, "Synthetic M1 Paper");
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEYS.LIBRARY)).papers[0].questions[0].id, "m1-q1");
});

test("M2-M3 canonical Library wins over legacy, preserves its pre-migration raw value, and is idempotent", () => {
  const historicalLibrary = {
    papers: [{
      id: "m3-paper",
      title: "Synthetic M3 Library Paper",
      tags: "history,synthetic",
      questions: [{ id: "m3-q1", type: "blank", prompt: "Term", answers: ["value"] }],
    }],
  };
  const rawCanonical = JSON.stringify(historicalLibrary);
  const storage = createStorage({
    [STORAGE_KEYS.LIBRARY]: rawCanonical,
    [STORAGE_KEYS.LEGACY_PAPER]: JSON.stringify({
      title: "Must not win",
      questions: [{ id: "legacy-q", type: "truefalse", prompt: "Legacy", answer: true }],
    }),
  });

  const first = bootstrapQuizLibrary({
    storage,
    createDefaultPaper,
    now: () => "2026-08-22T13:00:00.000Z",
  });
  const canonicalAfterFirstLoad = storage.getItem(STORAGE_KEYS.LIBRARY);
  const second = bootstrapQuizLibrary({ storage, createDefaultPaper });

  assert.equal(first.source, "canonical");
  assert.equal(first.library.papers[0].id, "m3-paper");
  assert.deepEqual(first.library.papers[0].tags, ["history", "synthetic"]);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEYS.LIBRARY_RECOVERY)).rawValue, rawCanonical);
  assert.equal(storage.getItem(STORAGE_KEYS.LIBRARY), canonicalAfterFirstLoad);
  assert.deepEqual(second.library, first.library);
});

test("an unrelated existing recovery record does not authorize later writes over a newly invalid canonical value", () => {
  const currentRaw = "{new-invalid";
  const storage = createStorage({
    [STORAGE_KEYS.LIBRARY]: currentRaw,
    [STORAGE_KEYS.LIBRARY_RECOVERY]: JSON.stringify({
      schemaVersion: 1,
      sourceKey: STORAGE_KEYS.LIBRARY,
      rawValue: "{older-invalid",
      reason: "malformed-json",
      preservedAt: "2026-08-21T12:00:00.000Z",
    }),
  });

  const result = bootstrapQuizLibrary({ storage, createDefaultPaper });

  assert.equal(result.canPersist, false);
  assert.equal(storage.getItem(STORAGE_KEYS.LIBRARY), currentRaw);
});

test("interrupted upgrade never lets a legacy Paper outrank an invalid canonical Library", () => {
  const invalidCanonical = "{interrupted-upgrade";
  const storage = createStorage({
    [STORAGE_KEYS.LIBRARY]: invalidCanonical,
    [STORAGE_KEYS.LEGACY_PAPER]: JSON.stringify({
      title: "Older valid Paper",
      questions: [{ id: "legacy-q", type: "truefalse", prompt: "Legacy", answer: true }],
    }),
  });

  const result = bootstrapQuizLibrary({ storage, createDefaultPaper });

  assert.equal(result.source, "canonical-invalid");
  assert.equal(storage.getItem(STORAGE_KEYS.LIBRARY), invalidCanonical);
  assert.equal(result.library.papers[0].id, "default-paper");
});

test("M4-M5 modular Library and additive M6-absent state load without requiring newer keys", () => {
  const m5Library = {
    schemaVersion: 1,
    papers: [{
      schemaVersion: 1,
      id: "m5-paper",
      title: "Synthetic modular Paper",
      description: "Schema-bearing historical state",
      tags: ["synthetic"],
      questions: [{ id: "m5-q1", type: "truefalse", prompt: "Modular?", answer: true }],
    }],
  };
  const storage = createStorage({ [STORAGE_KEYS.LIBRARY]: JSON.stringify(m5Library) });

  const result = bootstrapQuizLibrary({ storage, createDefaultPaper });

  assert.equal(result.source, "canonical");
  assert.equal(result.library.papers[0].id, "m5-paper");
  assert.equal(storage.getItem(STORAGE_KEYS.LEARNER_RESPONSES), null);
  assert.equal(storage.getItem(STORAGE_KEYS.TRANSLATION_LIBRARY), null);
  assert.equal(storage.getItem(STORAGE_KEYS.TEACHER_REVIEWS), null);
});

test("backup/export immediately after media-aware M1 migration validates and round-trips", () => {
  const mediaAsset = {
    id: "img-migrated",
    mimeType: "image/png",
    name: "synthetic.png",
    size: 1,
    data: "AAAA",
  };
  const storage = createStorage({
    [STORAGE_KEYS.LEGACY_PAPER]: JSON.stringify({
      title: "Synthetic media migration",
      questions: [{
        id: "media-q",
        type: "truefalse",
        prompt: "Media survives?",
        answer: true,
        image: { id: mediaAsset.id, mimeType: mediaAsset.mimeType, name: mediaAsset.name, size: mediaAsset.size },
      }],
    }),
  });
  const migrated = bootstrapQuizLibrary({ storage, createDefaultPaper }).library;

  const backup = createLibraryBackup({
    library: migrated,
    history: [],
    learnerResponses: [],
    teacherReviews: [],
    translationLibrary: null,
    mediaAssets: [mediaAsset],
    exportedAt: "2026-08-22T14:00:00.000Z",
  });
  const restored = parseLibraryBackup(JSON.parse(JSON.stringify(backup)));

  assert.equal(restored.library.papers[0].questions[0].image.id, "img-migrated");
  assert.equal(restored.mediaAssets[0].id, "img-migrated");
});

test("recovery write failure leaves canonical source untouched and blocks later persistence", () => {
  const rawCanonical = "{cannot-quarantine";
  const storage = createStorage({ [STORAGE_KEYS.LIBRARY]: rawCanonical });
  const originalSetItem = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === STORAGE_KEYS.LIBRARY_RECOVERY) throw new Error("Synthetic quota failure");
    originalSetItem.call(storage, key, value);
  };

  const result = bootstrapQuizLibrary({ storage, createDefaultPaper });

  assert.equal(result.canPersist, false);
  assert.equal(storage.getItem(STORAGE_KEYS.LIBRARY), rawCanonical);
  assert.equal(storage.getItem(STORAGE_KEYS.LIBRARY_RECOVERY), null);
});
