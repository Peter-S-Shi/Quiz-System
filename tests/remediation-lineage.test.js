import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createLibraryBackup, parseLibraryBackup } from "../src/core/backup.js";
import {
  DOCUMENT_TYPES,
  createTranslationLearnerResponse,
  normalizeTeacherReview,
} from "../src/core/interchange.js";
import { upsertTeacherReview } from "../src/core/review-records.js";
import { parseRemediationTranslationDocumentText, validateRemediationProvenance } from "../src/core/review-transport.js";
import {
  createTranslationDocument,
  createTranslationFolder,
  createTranslationLibrary,
  deleteTranslationDocument,
  getTranslationDocument,
} from "../src/core/translation-domain.js";
import { findDocumentIdCollision, remapDocumentForCopy } from "../src/core/translation-import.js";
import { createTranslationSession, setTranslationAnswer } from "../src/core/translation-session.js";

const CREATED_AT = "2026-05-01T09:00:00.000Z";

function makeOriginalResponseAndReview() {
  let library = createTranslationFolder(createTranslationLibrary(), { id: "folder-1", name: "Practice", createdAt: CREATED_AT });
  library = createTranslationDocument(library, {
    id: "document-1",
    title: "Travel Notes",
    folderId: "folder-1",
    sourceLanguage: "fr",
    targetLanguage: "en",
    createdAt: CREATED_AT,
    items: [{ id: "item-1", sourceText: "Bonjour", position: 0 }],
  });
  const document = getTranslationDocument(library, "document-1");
  let session = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });
  session = setTranslationAnswer(session, "item-1", "Hello there");
  session = { ...session, completed: true, completedAt: "2026-05-01T09:10:00.000Z" };
  const response = createTranslationLearnerResponse({ id: "response-1", session });

  const review = normalizeTeacherReview({
    schemaVersion: 1,
    documentType: DOCUMENT_TYPES.TEACHER_REVIEW,
    id: "review-1",
    responseId: response.id,
    createdAt: CREATED_AT,
    reviewer: { type: "external-ai" },
    itemReviews: [{ itemId: "item-1", judgment: "partial" }],
    remediationRecommendations: [],
  });

  return { library, response, review };
}

function makeRemediationDocumentData(response, review) {
  return {
    schemaVersion: 1,
    documentType: "quiz-studio.translation-document",
    id: "remediation-document-1",
    title: "Remediation Practice",
    folderId: "unbound-folder",
    sourceLanguage: "fr",
    targetLanguage: "en",
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z",
    items: [{ id: "remediation-item-1", sourceText: "Au revoir", position: 0 }],
    provenance: {
      purpose: "remediation",
      sourceResponseId: response.id,
      sourceReviewId: review.id,
      sourceMaterialId: response.material.id,
      createdAt: "2026-05-01T10:00:00.000Z",
      author: { type: "external-ai", displayLabel: "Synthetic Remediation Author" },
    },
  };
}

test("local-folder rebinding preserves remediation provenance", () => {
  const { response, review } = makeOriginalResponseAndReview();
  const remediationData = makeRemediationDocumentData(response, review);

  let library = createTranslationLibrary();
  library = createTranslationFolder(library, { id: "destination-folder", name: "Remediation", createdAt: CREATED_AT });
  library = createTranslationDocument(library, { ...remediationData, folderId: "destination-folder" });

  const bound = getTranslationDocument(library, "remediation-document-1");
  assert.equal(bound.folderId, "destination-folder");
  assert.equal(bound.provenance.purpose, "remediation");
  assert.equal(bound.provenance.sourceResponseId, response.id);
  assert.equal(bound.provenance.sourceReviewId, review.id);
});

test("remediation Translation Document ID collision is never silently overwritten", () => {
  const { response, review } = makeOriginalResponseAndReview();
  const remediationData = makeRemediationDocumentData(response, review);

  let library = createTranslationFolder(createTranslationLibrary(), { id: "destination-folder", name: "Remediation", createdAt: CREATED_AT });
  library = createTranslationDocument(library, { ...remediationData, folderId: "destination-folder" });

  assert.equal(findDocumentIdCollision(library, remediationData.id), true);
  assert.throws(() => createTranslationDocument(library, { ...remediationData, folderId: "destination-folder" }));

  const remapped = remapDocumentForCopy(remediationData);
  assert.notEqual(remapped.id, remediationData.id);
  assert.equal(findDocumentIdCollision(library, remapped.id), false);
  assert.equal(remapped.provenance.sourceResponseId, response.id);
  assert.equal(remapped.provenance.sourceReviewId, review.id);

  library = createTranslationDocument(library, { ...remapped, folderId: "destination-folder" });
  assert.equal(library.documents.length, 2);
});

test("an imported remediation document is a valid normal Translation Document that can start practice and finalize with recoverable lineage", () => {
  const { response, review } = makeOriginalResponseAndReview();
  const remediationData = makeRemediationDocumentData(response, review);

  let library = createTranslationFolder(createTranslationLibrary(), { id: "destination-folder", name: "Remediation", createdAt: CREATED_AT });
  library = createTranslationDocument(library, { ...remediationData, folderId: "destination-folder" });
  const remediationDoc = getTranslationDocument(library, remediationData.id);

  let session = createTranslationSession({ id: "remediation-session-1", document: remediationDoc, startedAt: "2026-05-01T11:00:00.000Z" });
  assert.equal(session.materialProvenance.purpose, "remediation");
  session = setTranslationAnswer(session, "remediation-item-1", "Goodbye");
  session = { ...session, completed: true, completedAt: "2026-05-01T11:05:00.000Z" };

  const remediationResponse = createTranslationLearnerResponse({ id: "remediation-response-1", session });
  assert.equal(remediationResponse.provenance.purpose, "remediation");
  assert.equal(remediationResponse.provenance.sourceResponseId, response.id);
  assert.equal(remediationResponse.provenance.sourceReviewId, review.id);
  assert.equal(remediationResponse.provenance.sourceMaterialId, response.material.id);

  // Even if the live remediation document is later deleted, the finalized response is self-contained.
  const withoutRemediationDoc = deleteTranslationDocument(library, remediationData.id);
  assert.equal(withoutRemediationDoc.documents.some((doc) => doc.id === remediationData.id), false);
  assert.equal(remediationResponse.provenance.sourceResponseId, response.id);
  assert.equal(remediationResponse.provenance.sourceReviewId, review.id);
});

test("a normal (non-remediation) practice session carries no materialProvenance field", () => {
  let library = createTranslationFolder(createTranslationLibrary(), { id: "folder-1", name: "Practice", createdAt: CREATED_AT });
  library = createTranslationDocument(library, {
    id: "document-2",
    title: "Ordinary Notes",
    folderId: "folder-1",
    sourceLanguage: "fr",
    targetLanguage: "en",
    createdAt: CREATED_AT,
    items: [{ id: "item-1", sourceText: "Bonjour", position: 0 }],
  });
  const document = getTranslationDocument(library, "document-2");
  const session = createTranslationSession({ id: "session-2", document, startedAt: CREATED_AT });
  assert.equal(Object.hasOwn(session, "materialProvenance"), false);
});

test("full backup preserves multiple reviews and a remediation document/provenance together", () => {
  const { response, review } = makeOriginalResponseAndReview();
  const remediationData = makeRemediationDocumentData(response, review);
  let translationLibrary = createTranslationFolder(createTranslationLibrary(), { id: "destination-folder", name: "Remediation", createdAt: CREATED_AT });
  translationLibrary = createTranslationDocument(translationLibrary, { ...remediationData, folderId: "destination-folder" });

  const secondReview = normalizeTeacherReview({
    schemaVersion: 1,
    documentType: DOCUMENT_TYPES.TEACHER_REVIEW,
    id: "review-2",
    responseId: response.id,
    createdAt: CREATED_AT,
    reviewer: { type: "human" },
    itemReviews: [{ itemId: "item-1", judgment: "correct" }],
    remediationRecommendations: [],
  });
  let teacherReviews = upsertTeacherReview([], review, { learnerResponse: response });
  teacherReviews = upsertTeacherReview(teacherReviews, secondReview, { learnerResponse: response });

  const quizLibrary = { schemaVersion: 1, papers: [{ id: "paper-1", title: "Synthetic Quiz", questions: [] }] };
  const backup = createLibraryBackup({
    library: quizLibrary,
    history: [],
    learnerResponses: [response],
    teacherReviews,
    translationLibrary,
    exportedAt: "2026-05-01T12:00:00.000Z",
  });
  const restored = parseLibraryBackup(JSON.parse(JSON.stringify(backup)));

  assert.equal(restored.teacherReviews.length, 2);
  const restoredRemediationDoc = restored.translationLibrary.documents.find((doc) => doc.id === remediationData.id);
  assert.ok(restoredRemediationDoc);
  assert.equal(restoredRemediationDoc.provenance.purpose, "remediation");
  assert.equal(restoredRemediationDoc.provenance.sourceReviewId, review.id);
});

test("the remediation Translation Document example validates provenance against its matching fixtures", async () => {
  const responseText = await readFile(new URL("../examples/sample-translation-learner-response.json", import.meta.url), "utf8");
  const reviewText = await readFile(new URL("../examples/sample-external-teacher-review.json", import.meta.url), "utf8");
  const docText = await readFile(new URL("../examples/sample-remediation-translation-document.json", import.meta.url), "utf8");

  const response = JSON.parse(responseText);
  const review = JSON.parse(reviewText);
  const { document } = parseRemediationTranslationDocumentText(docText);

  const result = validateRemediationProvenance(document, { learnerResponses: [response], teacherReviews: [review] });
  assert.deepEqual(result, { valid: true, errors: [] });
});
