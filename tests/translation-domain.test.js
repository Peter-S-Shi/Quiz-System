import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";

import { createLibraryBackup, parseLibraryBackup } from "../src/core/backup.js";
import {
  createQuizLearnerResponse,
  normalizeLearnerResponse,
  validateLearnerResponse,
} from "../src/core/interchange.js";
import {
  addTranslationItem,
  createTranslationDocument,
  createTranslationFolder,
  createTranslationLibrary,
  deleteTranslationDocument,
  deleteTranslationFolder,
  getTranslationDocument,
  parseTranslationLibrary,
  removeTranslationItem,
  reorderTranslationItems,
  updateTranslationDocument,
  updateTranslationFolder,
  updateTranslationItem,
  validateTranslationDocument,
} from "../src/core/translation-domain.js";

const CREATED_AT = "2026-01-01T10:00:00.000Z";
const UPDATED_AT = "2026-01-01T11:00:00.000Z";

function createSyntheticTranslationLibrary() {
  let library = createTranslationLibrary();
  library = createTranslationFolder(library, {
    id: "folder-1",
    name: "Synthetic Materials",
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
      { id: "item-1", sourceText: "Premier texte", position: 0 },
      {
        id: "item-2",
        sourceText: "Deuxieme texte",
        referenceTranslation: "Second text",
        position: 1,
      },
    ],
  });
  return library;
}

function makeCompletedQuizSession() {
  return {
    id: "quiz-session-1",
    paperId: "paper-1",
    paperTitle: "Synthetic Quiz",
    startedAt: CREATED_AT,
    completedAt: UPDATED_AT,
    questions: [{ id: "question-1", type: "blank", prompt: "Type A", answers: ["A"] }],
    answers: { "question-1": "A" },
    results: [{ questionId: "question-1", correct: true, correctAnswer: "A" }],
    correctCount: 1,
    percent: 100,
  };
}

test("translation folders documents and items survive persistence with stable order and languages", () => {
  const library = createSyntheticTranslationLibrary();
  const reloaded = parseTranslationLibrary(JSON.parse(JSON.stringify(library)));
  const document = getTranslationDocument(reloaded, "document-1");

  assert.equal(document.id, "document-1");
  assert.equal(document.folderId, "folder-1");
  assert.equal(document.sourceLanguage, "fr");
  assert.equal(document.targetLanguage, "en");
  assert.deepEqual(document.items.map((item) => item.id), ["item-1", "item-2"]);
  assert.deepEqual(document.items.map((item) => item.position), [0, 1]);
  assert.equal(Object.hasOwn(document.items[0], "referenceTranslation"), false);
  assert.equal(document.items[1].referenceTranslation, "Second text");
});

test("translation core operations preserve relationships and require explicit cascading deletion", () => {
  let library = createSyntheticTranslationLibrary();
  library = updateTranslationFolder(library, "folder-1", { name: "Updated Materials", updatedAt: UPDATED_AT });
  library = updateTranslationDocument(library, "document-1", { title: "Updated Notes", updatedAt: UPDATED_AT });
  library = addTranslationItem(library, "document-1", {
    id: "item-3",
    sourceText: "Troisieme texte",
    updatedAt: UPDATED_AT,
  });
  library = updateTranslationItem(library, "document-1", "item-3", {
    notes: "Synthetic note",
    updatedAt: UPDATED_AT,
  });
  library = reorderTranslationItems(library, "document-1", ["item-3", "item-1", "item-2"], { updatedAt: UPDATED_AT });
  library = removeTranslationItem(library, "document-1", "item-1", { updatedAt: UPDATED_AT });

  assert.deepEqual(getTranslationDocument(library, "document-1").items.map((item) => item.id), ["item-3", "item-2"]);
  assert.throws(() => deleteTranslationFolder(library, "folder-1"), /explicit cascade is required/);

  const cascaded = deleteTranslationFolder(library, "folder-1", { cascade: true });
  assert.deepEqual(cascaded.folders, []);
  assert.deepEqual(cascaded.documents, []);

  const documentDeleted = deleteTranslationDocument(createSyntheticTranslationLibrary(), "document-1");
  assert.equal(deleteTranslationFolder(documentDeleted, "folder-1").folders.length, 0);
});

test("translation library rejects malformed material and orphaned relationships", () => {
  const library = createSyntheticTranslationLibrary();
  const orphaned = structuredClone(library);
  orphaned.documents[0].folderId = "missing-folder";
  assert.throws(() => parseTranslationLibrary(orphaned), /unknown folderId/);

  const malformed = structuredClone(library);
  malformed.documents[0].items[1].id = "item-1";
  assert.throws(() => parseTranslationLibrary(malformed), /Duplicate Translation Item id/);

  assert.throws(
    () => createTranslationDocument(library, {
      id: "document-2",
      title: "Invalid",
      folderId: "folder-1",
      sourceLanguage: "fr",
      targetLanguage: "en",
      createdAt: CREATED_AT,
      items: [{ id: "item-empty", sourceText: "" }],
    }),
    /requires sourceText/,
  );
});

test("Translation Learner Response passes runtime and public schema without objective grading", async () => {
  const document = getTranslationDocument(createSyntheticTranslationLibrary(), "document-1");
  const response = normalizeLearnerResponse({
    schemaVersion: 1,
    documentType: "quiz-studio.learner-response",
    id: "translation-response-1",
    status: "finalized",
    finalizedAt: UPDATED_AT,
    material: {
      type: "translation-document",
      id: document.id,
      title: document.title,
      snapshot: { items: document.items },
    },
    session: { id: "translation-session-1", startedAt: CREATED_AT, completedAt: UPDATED_AT },
    responses: document.items.map((item) => ({ itemId: item.id, answer: `Answer for ${item.id}` })),
    summary: { itemCount: document.items.length },
  });

  assert.deepEqual(validateLearnerResponse(response), { valid: true, errors: [] });
  assert.equal(Object.hasOwn(response.responses[0], "result"), false);
  assert.equal(Object.hasOwn(response.summary, "correctCount"), false);
  assert.equal(Object.hasOwn(response.summary, "percent"), false);

  const schema = JSON.parse(await readFile(new URL("../schemas/learner-response.schema.json", import.meta.url), "utf8"));
  const validateSchema = new Ajv2020({ strict: false }).compile(schema);
  assert.equal(validateSchema(response), true, JSON.stringify(validateSchema.errors));

  const quizResponse = createQuizLearnerResponse({ id: "quiz-response-1", session: makeCompletedQuizSession() });
  assert.deepEqual(validateLearnerResponse(quizResponse), { valid: true, errors: [] });
  assert.equal(quizResponse.summary.percent, 100);
  assert.equal(validateSchema(quizResponse), true, JSON.stringify(validateSchema.errors));

  const quizWithoutItemType = structuredClone(quizResponse);
  delete quizWithoutItemType.material.snapshot.items[0].type;
  assert.equal(validateSchema(quizWithoutItemType), false);
});

test("full backup preserves Translation data and legacy backups remain readable", () => {
  const translationLibrary = createSyntheticTranslationLibrary();
  const quizLibrary = { schemaVersion: 1, papers: [{ id: "paper-1", title: "Synthetic Quiz", questions: [] }] };
  const backup = createLibraryBackup({
    library: quizLibrary,
    history: [],
    learnerResponses: [],
    translationLibrary,
    exportedAt: UPDATED_AT,
  });
  const restored = parseLibraryBackup(JSON.parse(JSON.stringify(backup)));

  assert.equal(restored.hasTranslationLibrary, true);
  assert.deepEqual(restored.translationLibrary, translationLibrary);

  const legacy = parseLibraryBackup({ schemaVersion: 1, library: quizLibrary, history: [] });
  assert.equal(legacy.hasTranslationLibrary, false);
  assert.deepEqual(legacy.translationLibrary, createTranslationLibrary());
});

test("public Translation Document example matches the runtime and schema contract", async () => {
  const example = JSON.parse(await readFile(new URL("../examples/sample-translation-document.json", import.meta.url), "utf8"));
  const schema = JSON.parse(await readFile(new URL("../schemas/translation-document.schema.json", import.meta.url), "utf8"));
  const normalized = parseTranslationLibrary({
    schemaVersion: 1,
    folders: [{ id: example.folderId, name: "Synthetic Folder", createdAt: CREATED_AT, updatedAt: CREATED_AT }],
    documents: [example],
  }).documents[0];

  assert.deepEqual(validateTranslationDocument(normalized), { valid: true, errors: [] });
  assert.equal(schema.properties.documentType.const, example.documentType);
  assert.equal(schema.properties.items.items.required.includes("referenceTranslation"), false);
});
