import test from "node:test";
import assert from "node:assert/strict";

import { buildRetryMaterial } from "../src/core/translation-retry.js";
import { createTranslationLearnerResponse } from "../src/core/interchange.js";
import { createTranslationDocument, createTranslationFolder, createTranslationLibrary, deleteTranslationDocument, getTranslationDocument, updateTranslationItem } from "../src/core/translation-domain.js";
import { createTranslationSession, setTranslationAnswer } from "../src/core/translation-session.js";

const CREATED_AT = "2026-06-01T09:00:00.000Z";

function makeOriginalResponse() {
  let library = createTranslationFolder(createTranslationLibrary(), { id: "folder-1", name: "Practice", createdAt: CREATED_AT });
  library = createTranslationDocument(library, {
    id: "document-1",
    title: "Travel Notes",
    folderId: "folder-1",
    sourceLanguage: "fr",
    targetLanguage: "en",
    createdAt: CREATED_AT,
    items: [
      { id: "item-1", sourceText: "Bonjour", referenceTranslation: "Hello", position: 0 },
      { id: "item-2", sourceText: "Au revoir", notes: "farewell", position: 1 },
    ],
  });
  const document = getTranslationDocument(library, "document-1");
  let session = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });
  session = setTranslationAnswer(session, "item-1", "Hi there");
  session = setTranslationAnswer(session, "item-2", "Bye");
  session = { ...session, completed: true, completedAt: "2026-06-01T09:10:00.000Z" };
  const response = createTranslationLearnerResponse({ id: "response-1", session });
  return { library, document, response };
}

test("retry-entire creates a new material/session identity distinct from the source", () => {
  const { response } = makeOriginalResponse();
  const material = buildRetryMaterial({ response });
  assert.notEqual(material.id, response.material.id);
  assert.equal(material.items.length, 2);
  material.items.forEach((item, index) => {
    assert.notEqual(item.id, response.material.snapshot.items[index].id);
    assert.equal(item.sourceText, response.material.snapshot.items[index].sourceText);
  });
  assert.equal(material.items[0].referenceTranslation, "Hello");
  assert.equal(material.items[1].notes, "farewell");
});

test("retry-entire uses the historical snapshot, not edited live material", () => {
  const { library, response } = makeOriginalResponse();
  const editedLibrary = updateTranslationItem(library, "document-1", "item-1", { sourceText: "Changed after the response was finalized" });
  assert.equal(getTranslationDocument(editedLibrary, "document-1").items[0].sourceText, "Changed after the response was finalized");

  const material = buildRetryMaterial({ response });
  assert.equal(material.items[0].sourceText, "Bonjour");
  assert.equal(material.title, "Travel Notes");
});

test("retry-entire works when the original live Translation Document has been deleted", () => {
  const { library, response } = makeOriginalResponse();
  const withoutDocument = deleteTranslationDocument(library, "document-1");
  assert.equal(withoutDocument.documents.some((doc) => doc.id === "document-1"), false);
  const material = buildRetryMaterial({ response });
  assert.equal(material.items.length, 2);
});

test("retry-selected contains only the selected items and preserves source-response provenance", () => {
  const { response } = makeOriginalResponse();
  const material = buildRetryMaterial({ response, itemIds: ["item-2"] });
  assert.equal(material.items.length, 1);
  assert.equal(material.items[0].sourceText, "Au revoir");
  assert.equal(material.provenance.purpose, "retry");
  assert.equal(material.provenance.sourceResponseId, response.id);
  assert.equal(material.provenance.sourceMaterialId, response.material.id);
  assert.equal(Object.hasOwn(material.provenance, "sourceReviewId"), false);
});

test("buildRetryMaterial rejects an empty item selection", () => {
  const { response } = makeOriginalResponse();
  assert.throws(() => buildRetryMaterial({ response, itemIds: [] }));
  assert.throws(() => buildRetryMaterial({ response, itemIds: ["not-a-real-item"] }));
});

test("buildRetryMaterial can carry an explicit sourceReviewId when a retry is review-specific", () => {
  const { response } = makeOriginalResponse();
  const material = buildRetryMaterial({ response, sourceReviewId: "review-1" });
  assert.equal(material.provenance.sourceReviewId, "review-1");
});

test("retry lineage survives finalization and never mutates the original response", () => {
  const { response: original } = makeOriginalResponse();
  const originalSnapshot = JSON.parse(JSON.stringify(original));
  const material = buildRetryMaterial({ response: original, itemIds: ["item-1"] });
  let session = createTranslationSession({ id: "retry-session-1", document: material, startedAt: "2026-06-02T09:00:00.000Z" });
  assert.equal(session.materialProvenance.purpose, "retry");
  session = setTranslationAnswer(session, material.items[0].id, "Hi again");
  session = { ...session, completed: true, completedAt: "2026-06-02T09:05:00.000Z" };
  const retryResponse = createTranslationLearnerResponse({ id: "retry-response-1", session });

  assert.notEqual(retryResponse.id, original.id);
  assert.equal(retryResponse.provenance.purpose, "retry");
  assert.equal(retryResponse.provenance.sourceResponseId, original.id);
  assert.equal(retryResponse.provenance.sourceMaterialId, original.material.id);
  assert.deepEqual(original, originalSnapshot);
});
