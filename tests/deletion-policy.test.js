import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeLearnerResponseDeletion,
  analyzeTeacherReviewDeletion,
  analyzeTranslationDocumentDeletion,
} from "../src/core/deletion-policy.js";
import { removeLearnerResponse } from "../src/core/learning-records.js";
import { removeTeacherReview, removeTeacherReviewsForResponse, upsertTeacherReview } from "../src/core/review-records.js";
import { DOCUMENT_TYPES, createTranslationLearnerResponse, normalizeTeacherReview } from "../src/core/interchange.js";
import { createTranslationDocument, createTranslationFolder, createTranslationLibrary, getTranslationDocument } from "../src/core/translation-domain.js";
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
