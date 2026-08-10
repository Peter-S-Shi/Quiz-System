import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";

import { createLibraryBackup, parseLibraryBackup } from "../src/core/backup.js";
import {
  createTranslationLearnerResponse,
  validateLearnerResponse,
} from "../src/core/interchange.js";
import {
  findLearnerResponse,
  parseLearnerResponseCollection,
  upsertLearnerResponse,
} from "../src/core/learning-records.js";
import {
  createTranslationDocument,
  createTranslationFolder,
  createTranslationLibrary,
  getTranslationDocument,
  updateTranslationItem,
} from "../src/core/translation-domain.js";
import {
  createTranslationSession,
  goToTranslationIndex,
  isTranslationSessionForDocument,
  normalizeTranslationSession,
  setTranslationAnswer,
  setTranslationRevealed,
} from "../src/core/translation-session.js";
import { STORAGE_KEYS } from "../src/storage/local-storage.js";

const CREATED_AT = "2026-03-01T09:00:00.000Z";

function createSyntheticDocument() {
  let library = createTranslationFolder(createTranslationLibrary(), {
    id: "folder-1",
    name: "Practice Material",
    createdAt: CREATED_AT,
  });
  library = createTranslationDocument(library, {
    id: "document-1",
    title: "Travel Notes",
    folderId: "folder-1",
    sourceLanguage: "fr",
    targetLanguage: "en",
    createdAt: CREATED_AT,
    items: [
      { id: "item-1", sourceText: "Bonjour", position: 0 },
      { id: "item-2", sourceText: "Merci", referenceTranslation: "Thank you", position: 1 },
    ],
  });
  return { library, document: getTranslationDocument(library, "document-1") };
}

test("creating a session snapshots the document items independently", () => {
  const { document } = createSyntheticDocument();
  const session = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });

  assert.equal(session.documentId, "document-1");
  assert.equal(session.documentTitle, "Travel Notes");
  assert.equal(session.sourceLanguage, "fr");
  assert.equal(session.index, 0);
  assert.deepEqual(session.answers, {});
  assert.equal(session.items.length, 2);

  document.items[0].sourceText = "Mutated after session start";
  assert.equal(session.items[0].sourceText, "Bonjour");
});

test("later document edits do not mutate an already-created session snapshot", () => {
  const { library, document } = createSyntheticDocument();
  const session = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });

  updateTranslationItem(library, "document-1", "item-1", { sourceText: "Edited later", updatedAt: CREATED_AT });

  assert.equal(session.items[0].sourceText, "Bonjour");
});

test("answers persist by item ID across navigation without loss", () => {
  const { document } = createSyntheticDocument();
  let session = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });

  session = setTranslationAnswer(session, "item-1", "Hello");
  session = goToTranslationIndex(session, 1);
  session = setTranslationAnswer(session, "item-2", "Thanks");
  session = goToTranslationIndex(session, 0);

  assert.equal(session.index, 0);
  assert.equal(session.answers["item-1"], "Hello");
  assert.equal(session.answers["item-2"], "Thanks");

  assert.throws(() => setTranslationAnswer(session, "missing-item", "x"), /Translation Item not found/);
});

test("navigation index is clamped to the valid item range", () => {
  const { document } = createSyntheticDocument();
  let session = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });

  session = goToTranslationIndex(session, 99);
  assert.equal(session.index, 1);
  session = goToTranslationIndex(session, -5);
  assert.equal(session.index, 0);
});

test("reveal state can be toggled per item without affecting answers", () => {
  const { document } = createSyntheticDocument();
  let session = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });

  session = setTranslationRevealed(session, "item-2", true);
  assert.deepEqual(session.revealed, { "item-2": true });
  session = setTranslationRevealed(session, "item-2", false);
  assert.deepEqual(session.revealed, {});
});

test("reload/parse recovery preserves answers and current position", () => {
  const { document } = createSyntheticDocument();
  let session = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });
  session = setTranslationAnswer(session, "item-1", "Hello");
  session = goToTranslationIndex(session, 1);
  session = setTranslationRevealed(session, "item-2", true);

  const reloaded = normalizeTranslationSession(JSON.parse(JSON.stringify(session)));
  assert.deepEqual(reloaded.answers, { "item-1": "Hello" });
  assert.equal(reloaded.index, 1);
  assert.deepEqual(reloaded.revealed, { "item-2": true });
  assert.equal(isTranslationSessionForDocument(reloaded, "document-1"), true);
  assert.equal(isTranslationSessionForDocument(reloaded, "some-other-document"), false);
});

test("a malformed active Translation session is safely rejected rather than crashing recovery", () => {
  assert.equal(normalizeTranslationSession(null), null);
  assert.equal(normalizeTranslationSession({}), null);
  assert.equal(normalizeTranslationSession({ schemaVersion: 1, id: "s1", documentId: "d1", items: [] }), null);
  assert.equal(
    normalizeTranslationSession({
      schemaVersion: 1,
      id: "s1",
      documentId: "d1",
      items: [{ id: "item-1" }, { id: "item-1" }],
    }),
    null,
  );
  assert.equal(normalizeTranslationSession("not an object"), null);
});

test("finalization creates a valid non-objective Learner Response with full item coverage", async () => {
  const { document } = createSyntheticDocument();
  let session = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });
  session = setTranslationAnswer(session, "item-1", "Hello");
  session = { ...session, completed: true, completedAt: "2026-03-01T09:10:00.000Z" };

  const response = createTranslationLearnerResponse({ id: "response-1", session });
  const validation = validateLearnerResponse(response);
  assert.deepEqual(validation, { valid: true, errors: [] });

  assert.equal(response.material.type, "translation-document");
  assert.equal(response.responses.length, 2);
  assert.deepEqual(response.responses.map((item) => item.answer), ["Hello", ""]);
  assert.equal(Object.hasOwn(response, "correctCount"), false);
  response.responses.forEach((item) => {
    assert.equal(Object.hasOwn(item, "result"), false);
  });
  assert.equal(Object.hasOwn(response.summary, "correctCount"), false);
  assert.equal(Object.hasOwn(response.summary, "percent"), false);
  assert.equal(response.summary.itemCount, 2);

  const schema = JSON.parse(await readFile(new URL("../schemas/learner-response.schema.json", import.meta.url), "utf8"));
  const validateSchema = new Ajv2020({ strict: false }).compile(schema);
  assert.equal(validateSchema(response), true, JSON.stringify(validateSchema.errors));
});

test("finalized evidence follows the existing immutability rules", () => {
  const { document } = createSyntheticDocument();
  let session = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });
  session = setTranslationAnswer(session, "item-1", "Hello");
  session = { ...session, completed: true, completedAt: "2026-03-01T09:10:00.000Z" };

  const response = createTranslationLearnerResponse({ id: "response-1", session });
  let collection = upsertLearnerResponse([], response);
  collection = upsertLearnerResponse(collection, response);
  assert.equal(collection.length, 1);

  const tampered = { ...response, responses: [{ itemId: "item-1", answer: "Tampered" }, { itemId: "item-2", answer: "" }] };
  assert.throws(() => upsertLearnerResponse(collection, tampered), /cannot be replaced/);
});

test("cancelling and restarting practice does not alter previously finalized evidence", () => {
  const { document } = createSyntheticDocument();
  let firstSession = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });
  firstSession = setTranslationAnswer(firstSession, "item-1", "Hello");
  firstSession = { ...firstSession, completed: true, completedAt: "2026-03-01T09:10:00.000Z" };
  const firstResponse = createTranslationLearnerResponse({ id: "response-1", session: firstSession });
  let collection = upsertLearnerResponse([], firstResponse);

  const abandonedSession = createTranslationSession({ id: "session-2", document, startedAt: "2026-03-01T10:00:00.000Z" });
  void abandonedSession;

  assert.equal(collection.length, 1);
  assert.deepEqual(findLearnerResponse(collection, "response-1"), firstResponse);
});

test("repeated practice creates distinct Learner Response IDs without overwriting prior evidence", () => {
  const { document } = createSyntheticDocument();

  let sessionOne = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });
  sessionOne = setTranslationAnswer(sessionOne, "item-1", "First attempt");
  sessionOne = { ...sessionOne, completed: true, completedAt: "2026-03-01T09:10:00.000Z" };
  const responseOne = createTranslationLearnerResponse({ id: "response-1", session: sessionOne });

  let sessionTwo = createTranslationSession({ id: "session-2", document, startedAt: "2026-03-02T09:00:00.000Z" });
  sessionTwo = setTranslationAnswer(sessionTwo, "item-1", "Second attempt");
  sessionTwo = { ...sessionTwo, completed: true, completedAt: "2026-03-02T09:10:00.000Z" };
  const responseTwo = createTranslationLearnerResponse({ id: "response-2", session: sessionTwo });

  let collection = upsertLearnerResponse([], responseOne);
  collection = upsertLearnerResponse(collection, responseTwo);

  assert.equal(collection.length, 2);
  assert.equal(findLearnerResponse(collection, "response-1").responses[0].answer, "First attempt");
  assert.equal(findLearnerResponse(collection, "response-2").responses[0].answer, "Second attempt");
});

test("Objective Quiz and Translation active sessions use isolated, non-colliding storage keys", () => {
  assert.notEqual(STORAGE_KEYS.ACTIVE_SESSION, STORAGE_KEYS.TRANSLATION_ACTIVE_SESSION);
  assert.match(STORAGE_KEYS.TRANSLATION_ACTIVE_SESSION, /translation/);
});

test("full backup and parseLearnerResponseCollection remain compatible with Translation Learner Responses", () => {
  const { document } = createSyntheticDocument();
  let session = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });
  session = setTranslationAnswer(session, "item-1", "Hello");
  session = { ...session, completed: true, completedAt: "2026-03-01T09:10:00.000Z" };
  const response = createTranslationLearnerResponse({ id: "response-1", session });

  const quizLibrary = { schemaVersion: 1, papers: [{ id: "paper-1", title: "Synthetic Quiz", questions: [] }] };
  const backup = createLibraryBackup({
    library: quizLibrary,
    history: [],
    learnerResponses: [response],
    translationLibrary: createTranslationLibrary(),
    exportedAt: "2026-03-01T09:20:00.000Z",
  });
  const restored = parseLibraryBackup(JSON.parse(JSON.stringify(backup)));

  assert.equal(restored.hasLearnerResponses, true);
  assert.deepEqual(restored.learnerResponses, parseLearnerResponseCollection([response]));
});
