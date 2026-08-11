import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeLearnerResponseDeletion,
  analyzeTeacherReviewDeletion,
  analyzeTranslationDocumentDeletion,
} from "../src/core/deletion-policy.js";
import { createLibraryBackup, parseLibraryBackup } from "../src/core/backup.js";
import { removeLearnerResponse } from "../src/core/learning-records.js";
import { removeTeacherReview, removeTeacherReviewsForResponse, upsertTeacherReview } from "../src/core/review-records.js";
import { DOCUMENT_TYPES, createTranslationLearnerResponse, normalizeTeacherReview } from "../src/core/interchange.js";
import {
  createTranslationDocument,
  createTranslationFolder,
  createTranslationLibrary,
  deleteTranslationDocument,
  getTranslationDocument,
} from "../src/core/translation-domain.js";
import { createTranslationSession, setTranslationAnswer } from "../src/core/translation-session.js";
import { buildRetryMaterial } from "../src/core/translation-retry.js";

const CREATED_AT = "2026-06-01T09:00:00.000Z";

function makeResponse(responseId = "response-1") {
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
  let session = createTranslationSession({ id: `${responseId}-session`, document, startedAt: CREATED_AT });
  session = setTranslationAnswer(session, "item-1", "Hello");
  session = { ...session, completed: true, completedAt: "2026-06-01T09:10:00.000Z" };
  return createTranslationLearnerResponse({ id: responseId, session });
}

function makeReview(id, responseId) {
  return normalizeTeacherReview({
    schemaVersion: 1,
    documentType: DOCUMENT_TYPES.TEACHER_REVIEW,
    id,
    responseId,
    createdAt: CREATED_AT,
    reviewer: { type: "human" },
    itemReviews: [],
    remediationRecommendations: [],
  });
}

// Builds a library containing a single live remediation Translation Document claiming
// sourceResponseId/sourceReviewId -- the canonical (not historical) claim that must keep resolving
// for as long as the document remains in the live Translation Library.
function makeLibraryWithLiveRemediationDocument({ sourceResponseId, sourceReviewId, id = "remediation-doc-1" }) {
  let library = createTranslationFolder(createTranslationLibrary(), { id: "rem-folder", name: "Remediation", createdAt: CREATED_AT });
  library = createTranslationDocument(library, {
    id,
    title: "Remediation Practice",
    folderId: "rem-folder",
    sourceLanguage: "fr",
    targetLanguage: "en",
    createdAt: CREATED_AT,
    items: [{ id: "rem-item-1", sourceText: "Salut", position: 0 }],
    provenance: {
      purpose: "remediation",
      sourceResponseId,
      sourceReviewId,
      sourceMaterialId: "document-1",
      createdAt: CREATED_AT,
      author: { type: "external-ai" },
    },
  });
  return library;
}

test("deleting a Translation Document does not delete Learner Responses", () => {
  const response = makeResponse();
  const analysis = analyzeTranslationDocumentDeletion("document-1", { learnerResponses: [response] });
  assert.equal(analysis.hasDependents, true);
  assert.deepEqual(analysis.dependentResponseIds, [response.id]);
  // The analysis is informational only -- it never removes anything itself.
});

test("deleting a Learner Response with no dependents reports no dependents", () => {
  const response = makeResponse();
  const analysis = analyzeLearnerResponseDeletion(response.id, { teacherReviews: [], learnerResponses: [response] });
  assert.equal(analysis.hasDependents, false);
});

test("deleting a Learner Response with dependent reviews requires the documented cascade", () => {
  const response = makeResponse();
  const review = makeReview("review-1", response.id);
  const analysis = analyzeLearnerResponseDeletion(response.id, { teacherReviews: [review], learnerResponses: [response] });
  assert.equal(analysis.hasDependents, true);
  assert.deepEqual(analysis.dependentReviewIds, ["review-1"]);

  // Applying the documented cascade: the response and its reviews are removed together.
  const remainingResponses = removeLearnerResponse([response], response.id);
  const remainingReviews = removeTeacherReviewsForResponse([review], response.id);
  assert.equal(remainingResponses.length, 0);
  assert.equal(remainingReviews.length, 0);
});

test("deleting a Learner Response with descendant retry/remediation responses never silently orphans them", () => {
  const original = makeResponse("original-response");
  const retryMaterial = buildRetryMaterial({ response: original });
  const retrySession = { ...createTranslationSession({ id: "retry-session", document: retryMaterial, startedAt: CREATED_AT }), completed: true, completedAt: CREATED_AT };
  const retryResponse = createTranslationLearnerResponse({ id: "retry-response", session: retrySession });

  const analysis = analyzeLearnerResponseDeletion(original.id, { teacherReviews: [], learnerResponses: [original, retryResponse] });
  assert.equal(analysis.hasDependents, true);
  assert.deepEqual(analysis.dependentResponseIds, [retryResponse.id]);

  // The documented policy never deletes descendant responses; only the target response is removed.
  const remaining = removeLearnerResponse([original, retryResponse], original.id);
  assert.deepEqual(remaining.map((item) => item.id), [retryResponse.id]);
  // The descendant's provenance now safely references a response that no longer resolves locally.
  assert.equal(remaining[0].provenance.sourceResponseId, original.id);
});

test("deleting a Teacher Review does not mutate Learner Response evidence", () => {
  const response = makeResponse();
  const review = makeReview("review-1", response.id);
  const responseSnapshot = JSON.parse(JSON.stringify(response));
  const remainingReviews = removeTeacherReview([review], review.id);
  assert.equal(remainingReviews.length, 0);
  assert.deepEqual(response, responseSnapshot);
});

test("deleting a Teacher Review with dependent remediation/retry lineage reports it without blocking", () => {
  const response = makeResponse();
  const review = makeReview("review-1", response.id);
  const remediationResponse = createTranslationLearnerResponse({
    id: "remediation-response",
    session: {
      id: "remediation-session",
      documentId: "remediation-doc",
      documentTitle: "Remediation Practice",
      sourceLanguage: "fr",
      targetLanguage: "en",
      startedAt: CREATED_AT,
      completedAt: CREATED_AT,
      items: [{ id: "rem-item-1", sourceText: "Salut" }],
      answers: { "rem-item-1": "Hi" },
      annotations: {},
      materialProvenance: {
        purpose: "remediation",
        sourceResponseId: response.id,
        sourceReviewId: review.id,
        sourceMaterialId: response.material.id,
        createdAt: CREATED_AT,
      },
    },
  });

  const analysis = analyzeTeacherReviewDeletion(review.id, { learnerResponses: [response, remediationResponse] });
  assert.equal(analysis.hasDependents, true);
  assert.deepEqual(analysis.dependentResponseIds, [remediationResponse.id]);

  // Deleting the review proceeds; it never mutates the dependent response, whose reference simply
  // becomes unresolved lineage afterward.
  const remainingReviews = removeTeacherReview([review], review.id);
  assert.equal(remainingReviews.length, 0);
  assert.equal(remediationResponse.provenance.sourceReviewId, review.id);
});

test("no silent orphaning: parseTeacherReviewCollection still enforces the review-to-response canonical link", () => {
  const response = makeResponse();
  const review = makeReview("review-1", response.id);
  let collection = upsertTeacherReview([], review, { learnerResponse: response });
  assert.equal(collection.length, 1);
  collection = removeTeacherReview(collection, "review-1");
  assert.equal(collection.length, 0);
});

// --- M6.7 deletion-integrity closure patch -------------------------------------------------------
// A live remediation Translation Document is canonical, not historical: unlike a finalized
// response's own provenance (which may safely reference an already-deleted source), a *live*
// remediation document's claimed sourceResponseId/sourceReviewId must keep resolving for as long as
// the document exists locally, because parseLibraryBackup() cross-validates it on every restore.

test("analyzeLearnerResponseDeletion detects a live remediation document referencing it as sourceResponseId", () => {
  const response = makeResponse();
  const review = makeReview("review-1", response.id);
  const library = makeLibraryWithLiveRemediationDocument({ sourceResponseId: response.id, sourceReviewId: review.id });

  const analysis = analyzeLearnerResponseDeletion(response.id, {
    teacherReviews: [review],
    learnerResponses: [response],
    translationDocuments: library.documents,
  });
  assert.equal(analysis.hasBlockingDependents, true);
  assert.deepEqual(analysis.dependentRemediationDocumentIds, ["remediation-doc-1"]);
});

test("analyzeTeacherReviewDeletion detects a live remediation document referencing it as sourceReviewId", () => {
  const response = makeResponse();
  const review = makeReview("review-1", response.id);
  const library = makeLibraryWithLiveRemediationDocument({ sourceResponseId: response.id, sourceReviewId: review.id });

  const analysis = analyzeTeacherReviewDeletion(review.id, {
    learnerResponses: [response],
    translationDocuments: library.documents,
  });
  assert.equal(analysis.hasBlockingDependents, true);
  assert.deepEqual(analysis.dependentRemediationDocumentIds, ["remediation-doc-1"]);
});

test("deletion must not proceed while a live remediation document blocks it (documented gate contract)", () => {
  const response = makeResponse();
  const review = makeReview("review-1", response.id);
  const library = makeLibraryWithLiveRemediationDocument({ sourceResponseId: response.id, sourceReviewId: review.id });

  const responseAnalysis = analyzeLearnerResponseDeletion(response.id, {
    teacherReviews: [review],
    learnerResponses: [response],
    translationDocuments: library.documents,
  });
  const reviewAnalysis = analyzeTeacherReviewDeletion(review.id, {
    learnerResponses: [response],
    translationDocuments: library.documents,
  });

  // The documented contract: a caller must check hasBlockingDependents and refuse to remove
  // anything when it is true, rather than proceeding with a cascade or a plain confirmation.
  function applyDeletionIfAllowed(analysis, collection, removeFn, id) {
    if (analysis.hasBlockingDependents) return collection;
    return removeFn(collection, id);
  }

  const responsesAfter = applyDeletionIfAllowed(responseAnalysis, [response], removeLearnerResponse, response.id);
  const reviewsAfter = applyDeletionIfAllowed(reviewAnalysis, [review], removeTeacherReview, review.id);
  assert.equal(responsesAfter.length, 1);
  assert.equal(reviewsAfter.length, 1);
});

test("once the live remediation document is removed, the existing deletion behavior proceeds normally", () => {
  const response = makeResponse();
  const review = makeReview("review-1", response.id);
  let library = makeLibraryWithLiveRemediationDocument({ sourceResponseId: response.id, sourceReviewId: review.id });

  let analysis = analyzeLearnerResponseDeletion(response.id, {
    teacherReviews: [review],
    learnerResponses: [response],
    translationDocuments: library.documents,
  });
  assert.equal(analysis.hasBlockingDependents, true);

  library = deleteTranslationDocument(library, "remediation-doc-1");
  analysis = analyzeLearnerResponseDeletion(response.id, {
    teacherReviews: [review],
    learnerResponses: [response],
    translationDocuments: library.documents,
  });
  assert.equal(analysis.hasBlockingDependents, false);
  assert.equal(analysis.hasDependents, true);

  const remainingResponses = removeLearnerResponse([response], response.id);
  const remainingReviews = removeTeacherReviewsForResponse([review], response.id);
  assert.equal(remainingResponses.length, 0);
  assert.equal(remainingReviews.length, 0);
});

test("finalized descendant retry/remediation responses never block deletion; only a live remediation document does", () => {
  const original = makeResponse("original-response");
  const retryMaterial = buildRetryMaterial({ response: original });
  const retrySession = { ...createTranslationSession({ id: "retry-session", document: retryMaterial, startedAt: CREATED_AT }), completed: true, completedAt: CREATED_AT };
  const retryResponse = createTranslationLearnerResponse({ id: "retry-response", session: retrySession });

  const analysis = analyzeLearnerResponseDeletion(original.id, {
    teacherReviews: [],
    learnerResponses: [original, retryResponse],
    translationDocuments: [],
  });
  assert.equal(analysis.hasDependents, true);
  assert.equal(analysis.hasBlockingDependents, false);

  // The deletion proceeds; the descendant's historical lineage becomes unresolved as designed.
  const remaining = removeLearnerResponse([original, retryResponse], original.id);
  assert.deepEqual(remaining.map((item) => item.id), [retryResponse.id]);
  assert.equal(remaining[0].provenance.sourceResponseId, original.id);
});

test("after a permitted deletion (remediation document removed first), a full backup still parses and restores", () => {
  const response = makeResponse();
  const review = makeReview("review-1", response.id);
  let library = makeLibraryWithLiveRemediationDocument({ sourceResponseId: response.id, sourceReviewId: review.id });

  library = deleteTranslationDocument(library, "remediation-doc-1");
  const teacherReviews = removeTeacherReviewsForResponse([review], response.id);
  const learnerResponses = removeLearnerResponse([response], response.id);

  const quizLibrary = { schemaVersion: 1, papers: [{ id: "paper-1", title: "Synthetic Quiz", questions: [] }] };
  const backup = createLibraryBackup({
    library: quizLibrary,
    history: [],
    learnerResponses,
    teacherReviews,
    translationLibrary: library,
    exportedAt: CREATED_AT,
  });
  const restored = parseLibraryBackup(JSON.parse(JSON.stringify(backup)));
  assert.equal(restored.learnerResponses.length, 0);
  assert.equal(restored.teacherReviews.length, 0);
  assert.equal(restored.translationLibrary.documents.length, 0);
});

test("regression guard: deleting evidence while a live remediation document still references it breaks backup restore", () => {
  const response = makeResponse();
  const review = makeReview("review-1", response.id);
  const library = makeLibraryWithLiveRemediationDocument({ sourceResponseId: response.id, sourceReviewId: review.id });

  // Simulate the bug the closure patch prevents: deleting the response/review WITHOUT first
  // removing the live remediation document that depends on them.
  const teacherReviews = removeTeacherReviewsForResponse([review], response.id);
  const learnerResponses = removeLearnerResponse([response], response.id);

  const quizLibrary = { schemaVersion: 1, papers: [{ id: "paper-1", title: "Synthetic Quiz", questions: [] }] };
  const backup = createLibraryBackup({
    library: quizLibrary,
    history: [],
    learnerResponses,
    teacherReviews,
    translationLibrary: library,
    exportedAt: CREATED_AT,
  });
  assert.throws(() => parseLibraryBackup(JSON.parse(JSON.stringify(backup))));
});
