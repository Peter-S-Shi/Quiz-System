import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";

import { createLibraryBackup, parseLibraryBackup } from "../src/core/backup.js";
import {
  createQuizLearnerResponse,
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
  addTranslationAnnotation,
  changeTranslationAnnotationKind,
  createTranslationSession,
  goToTranslationIndex,
  isTranslationSessionForDocument,
  normalizeTranslationSession,
  removeTranslationAnnotation,
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

test("normalizeTranslationSession rejects a session with a missing or empty startedAt", () => {
  const { document } = createSyntheticDocument();
  const session = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });

  const missingStartedAt = { ...session };
  delete missingStartedAt.startedAt;
  assert.equal(normalizeTranslationSession(missingStartedAt), null);

  assert.equal(normalizeTranslationSession({ ...session, startedAt: "" }), null);
  assert.equal(normalizeTranslationSession({ ...session, startedAt: "   " }), null);

  // A valid, otherwise-identical session is still accepted (backward compatibility).
  assert.notEqual(normalizeTranslationSession(session), null);
});

test("normalizeTranslationSession rejects item snapshots missing the minimum recovery evidence", () => {
  const { document } = createSyntheticDocument();
  const session = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });

  const missingSourceText = { ...session, items: [{ id: "item-1" }, session.items[1]] };
  assert.equal(normalizeTranslationSession(missingSourceText), null);

  const emptySourceText = {
    ...session,
    items: [{ ...session.items[0], sourceText: "   " }, session.items[1]],
  };
  assert.equal(normalizeTranslationSession(emptySourceText), null);

  const missingId = { ...session, items: [{ sourceText: "Bonjour" }, session.items[1]] };
  assert.equal(normalizeTranslationSession(missingId), null);

  // A valid, otherwise-identical session is still accepted (backward compatibility).
  assert.notEqual(normalizeTranslationSession(session), null);
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

test("finalized Translation Learner Response retains source and target language context", async () => {
  const { document } = createSyntheticDocument();
  let session = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });
  session = setTranslationAnswer(session, "item-1", "Hello");
  session = { ...session, completed: true, completedAt: "2026-03-01T09:10:00.000Z" };

  const response = createTranslationLearnerResponse({ id: "response-1", session });

  // The language context lives in the response's own snapshot, so the evidence
  // stays self-contained even if the original Translation Document is later deleted.
  assert.equal(response.material.snapshot.sourceLanguage, "fr");
  assert.equal(response.material.snapshot.targetLanguage, "en");
  assert.deepEqual(validateLearnerResponse(response), { valid: true, errors: [] });

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

test("annotations can be added, changed, removed through the session and rejected for unknown items", () => {
  const { document } = createSyntheticDocument();
  let session = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });
  session = setTranslationAnswer(session, "item-1", "Hello there");

  session = addTranslationAnnotation(session, "item-1", { kind: "unknown", start: 0, end: 5, text: "Hello" });
  assert.equal(session.annotations["item-1"].length, 1);
  assert.equal(session.annotations["item-1"][0].kind, "unknown");

  session = changeTranslationAnnotationKind(session, "item-1", session.annotations["item-1"][0].id, "should_know");
  assert.equal(session.annotations["item-1"][0].kind, "should_know");

  const annotationId = session.annotations["item-1"][0].id;
  session = removeTranslationAnnotation(session, "item-1", annotationId);
  assert.equal(Object.hasOwn(session.annotations, "item-1"), false);

  assert.throws(() => addTranslationAnnotation(session, "missing-item", { kind: "unknown", start: 0, end: 5, text: "Hello" }), /Translation Item not found/);
});

test("navigation between items does not lose annotations", () => {
  const { document } = createSyntheticDocument();
  let session = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });
  session = setTranslationAnswer(session, "item-1", "Hello there");
  session = addTranslationAnnotation(session, "item-1", { kind: "unknown", start: 0, end: 5, text: "Hello" });

  session = goToTranslationIndex(session, 1);
  session = goToTranslationIndex(session, 0);

  assert.equal(session.annotations["item-1"].length, 1);
  assert.equal(session.annotations["item-1"][0].text, "Hello");
});

test("editing an answer automatically invalidates annotations whose anchored text no longer matches", () => {
  const { document } = createSyntheticDocument();
  let session = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });
  session = setTranslationAnswer(session, "item-1", "Hello there");
  session = addTranslationAnnotation(session, "item-1", { kind: "unknown", start: 0, end: 5, text: "Hello" });
  session = addTranslationAnnotation(session, "item-1", { kind: "uncertain", start: 6, end: 11, text: "there" });
  assert.equal(session.annotations["item-1"].length, 2);

  session = setTranslationAnswer(session, "item-1", "Hello world");
  assert.equal(session.annotations["item-1"].length, 1);
  assert.equal(session.annotations["item-1"][0].text, "Hello");

  session = setTranslationAnswer(session, "item-1", "Completely different");
  assert.equal(Object.hasOwn(session.annotations, "item-1"), false);
});

test("annotations survive session serialization and recovery", () => {
  const { document } = createSyntheticDocument();
  let session = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });
  session = setTranslationAnswer(session, "item-1", "Hello there");
  session = addTranslationAnnotation(session, "item-1", { kind: "unknown", start: 0, end: 5, text: "Hello" });

  const reloaded = normalizeTranslationSession(JSON.parse(JSON.stringify(session)));
  assert.equal(reloaded.annotations["item-1"].length, 1);
  assert.equal(reloaded.annotations["item-1"][0].kind, "unknown");
  assert.equal(reloaded.annotations["item-1"][0].text, "Hello");
});

test("malformed persisted annotations are dropped without corrupting session recovery", () => {
  const { document } = createSyntheticDocument();
  let session = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });
  session = setTranslationAnswer(session, "item-1", "Hello there");
  session = addTranslationAnnotation(session, "item-1", { kind: "unknown", start: 0, end: 5, text: "Hello" });

  const corrupted = JSON.parse(JSON.stringify(session));
  corrupted.annotations["item-1"].push({ id: "bad", kind: "not-a-kind", start: 0, end: 5, text: "Hello", createdAt: "t" });
  corrupted.annotations["item-2"] = [{ id: "orphan", kind: "unknown", start: 0, end: 3, text: "xyz", createdAt: "t" }];

  const reloaded = normalizeTranslationSession(corrupted);
  assert.notEqual(reloaded, null);
  assert.equal(reloaded.annotations["item-1"].length, 1);
  assert.equal(Object.hasOwn(reloaded.annotations, "item-2"), false);
});

test("finalization preserves annotations as learnerAnnotations without modifying the learner answer", async () => {
  const { document } = createSyntheticDocument();
  let session = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });
  session = setTranslationAnswer(session, "item-1", "Hello there");
  session = addTranslationAnnotation(session, "item-1", { kind: "unknown", start: 0, end: 5, text: "Hello" });
  session = addTranslationAnnotation(session, "item-1", { kind: "uncertain", start: 6, end: 11, text: "there" });
  session = { ...session, completed: true, completedAt: "2026-03-01T09:10:00.000Z" };

  const response = createTranslationLearnerResponse({ id: "response-1", session });

  assert.equal(response.responses.find((item) => item.itemId === "item-1").answer, "Hello there");
  assert.equal(response.learnerAnnotations.length, 2);
  assert.deepEqual(response.learnerAnnotations.map((item) => item.kind).sort(), ["uncertain", "unknown"]);
  response.learnerAnnotations.forEach((annotation) => assert.equal(annotation.itemId, "item-1"));

  assert.deepEqual(validateLearnerResponse(response), { valid: true, errors: [] });

  const schema = JSON.parse(await readFile(new URL("../schemas/learner-response.schema.json", import.meta.url), "utf8"));
  const validateSchema = new Ajv2020({ strict: false }).compile(schema);
  assert.equal(validateSchema(response), true, JSON.stringify(validateSchema.errors));
});

test("older Translation and Objective Quiz Learner Responses without annotations remain valid", async () => {
  const { document } = createSyntheticDocument();
  let session = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });
  session = setTranslationAnswer(session, "item-1", "Hello");
  session = { ...session, completed: true, completedAt: "2026-03-01T09:10:00.000Z" };
  const unannotatedResponse = createTranslationLearnerResponse({ id: "response-1", session });
  assert.equal(Object.hasOwn(unannotatedResponse, "learnerAnnotations"), false);
  assert.deepEqual(validateLearnerResponse(unannotatedResponse), { valid: true, errors: [] });

  const quizResponse = createQuizLearnerResponse({
    id: "quiz-response-1",
    session: {
      id: "quiz-session-1",
      paperId: "paper-1",
      paperTitle: "Synthetic Quiz",
      startedAt: CREATED_AT,
      completedAt: "2026-03-01T09:10:00.000Z",
      questions: [{ id: "question-1", type: "blank", prompt: "Type A", answers: ["A"] }],
      answers: { "question-1": "A" },
      results: [{ questionId: "question-1", correct: true, correctAnswer: "A" }],
      correctCount: 1,
      percent: 100,
    },
  });
  assert.equal(Object.hasOwn(quizResponse, "learnerAnnotations"), false);
  assert.deepEqual(validateLearnerResponse(quizResponse), { valid: true, errors: [] });

  const schema = JSON.parse(await readFile(new URL("../schemas/learner-response.schema.json", import.meta.url), "utf8"));
  const validateSchema = new Ajv2020({ strict: false }).compile(schema);
  assert.equal(validateSchema(unannotatedResponse), true, JSON.stringify(validateSchema.errors));
  assert.equal(validateSchema(quizResponse), true, JSON.stringify(validateSchema.errors));
});

test("finalized annotated evidence remains immutable and full backup/restore stays compatible", () => {
  const { document } = createSyntheticDocument();
  let session = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });
  session = setTranslationAnswer(session, "item-1", "Hello there");
  session = addTranslationAnnotation(session, "item-1", { kind: "unknown", start: 0, end: 5, text: "Hello" });
  session = { ...session, completed: true, completedAt: "2026-03-01T09:10:00.000Z" };
  const response = createTranslationLearnerResponse({ id: "response-1", session });

  let collection = upsertLearnerResponse([], response);
  collection = upsertLearnerResponse(collection, response);
  assert.equal(collection.length, 1);

  const tampered = { ...response, learnerAnnotations: [] };
  assert.throws(() => upsertLearnerResponse(collection, tampered), /cannot be replaced/);

  const quizLibrary = { schemaVersion: 1, papers: [{ id: "paper-1", title: "Synthetic Quiz", questions: [] }] };
  const backup = createLibraryBackup({
    library: quizLibrary,
    history: [],
    learnerResponses: [response],
    translationLibrary: createTranslationLibrary(),
    exportedAt: "2026-03-01T09:20:00.000Z",
  });
  const restored = parseLibraryBackup(JSON.parse(JSON.stringify(backup)));
  assert.deepEqual(restored.learnerResponses, parseLearnerResponseCollection([response]));
  assert.equal(restored.learnerResponses[0].learnerAnnotations.length, 1);
});
