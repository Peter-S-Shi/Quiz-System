import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHistoryEntry,
  buildHistoryIndex,
  deriveEntryStatus,
  deriveNeedsWorkItemIds,
  filterHistoryEntries,
  isTranslationLearnerResponse,
  resolveResponseLineage,
} from "../src/core/translation-history.js";
import { DOCUMENT_TYPES, createTranslationLearnerResponse, normalizeTeacherReview } from "../src/core/interchange.js";
import { createTranslationDocument, createTranslationFolder, createTranslationLibrary, getTranslationDocument } from "../src/core/translation-domain.js";
import { addTranslationAnnotation, createTranslationSession, setTranslationAnswer } from "../src/core/translation-session.js";
import { buildRetryMaterial } from "../src/core/translation-retry.js";

const CREATED_AT = "2026-06-01T09:00:00.000Z";

function makeDocument({ id = "document-1", items } = {}) {
  let library = createTranslationFolder(createTranslationLibrary(), { id: "folder-1", name: "Practice", createdAt: CREATED_AT });
  library = createTranslationDocument(library, {
    id,
    title: "Travel Notes",
    folderId: "folder-1",
    sourceLanguage: "fr",
    targetLanguage: "en",
    createdAt: CREATED_AT,
    items: items || [
      { id: "item-1", sourceText: "Bonjour", position: 0 },
      { id: "item-2", sourceText: "Au revoir", position: 1 },
    ],
  });
  return getTranslationDocument(library, id);
}

function finalizeResponse({ document, responseId = "response-1", answers = {}, annotate } = {}) {
  let session = createTranslationSession({ id: `${responseId}-session`, document, startedAt: CREATED_AT });
  Object.entries(answers).forEach(([itemId, answer]) => {
    session = setTranslationAnswer(session, itemId, answer);
  });
  if (annotate) session = annotate(session);
  session = { ...session, completed: true, completedAt: "2026-06-01T09:10:00.000Z" };
  return createTranslationLearnerResponse({ id: responseId, session });
}

function makeReview({ id, responseId, judgment, corrections, reviewer = { type: "human" } }) {
  return normalizeTeacherReview({
    schemaVersion: 1,
    documentType: DOCUMENT_TYPES.TEACHER_REVIEW,
    id,
    responseId,
    createdAt: CREATED_AT,
    reviewer,
    itemReviews: [{
      itemId: "item-1",
      ...(judgment ? { judgment } : {}),
      ...(corrections ? { corrections } : {}),
    }],
    remediationRecommendations: [],
  });
}

test("isTranslationLearnerResponse distinguishes Translation from Objective Quiz responses", () => {
  const document = makeDocument();
  const response = finalizeResponse({ document, answers: { "item-1": "Hello" } });
  assert.equal(isTranslationLearnerResponse(response), true);
  assert.equal(isTranslationLearnerResponse({ material: { type: "quiz-paper" } }), false);
});

test("history entry derives from a Learner Response snapshot, independent of the live document", () => {
  const document = makeDocument();
  const response = finalizeResponse({ document, answers: { "item-1": "Hello there", "item-2": "Goodbye" } });
  const entry = buildHistoryEntry(response, { teacherReviews: [], learnerResponses: [response] });
  assert.equal(entry.responseId, "response-1");
  assert.equal(entry.materialTitle, "Travel Notes");
  assert.equal(entry.sourceLanguage, "fr");
  assert.equal(entry.targetLanguage, "en");
  assert.equal(entry.itemCount, 2);
  assert.equal(entry.reviewCount, 0);
  assert.equal(entry.purpose, "practice");
});

test("history survives deletion of the live Translation Document (entry built from snapshot only)", () => {
  const document = makeDocument();
  const response = finalizeResponse({ document, answers: { "item-1": "Hello" } });
  // No reference to `document` or any live library lookup after this point.
  const entry = buildHistoryEntry(response, { teacherReviews: [], learnerResponses: [response] });
  assert.equal(entry.itemCount, 2);
  assert.equal(entry.materialTitle, "Travel Notes");
});

test("buildHistoryIndex only includes Translation responses, newest first", () => {
  const document = makeDocument();
  const older = finalizeResponse({ document, responseId: "response-older", answers: { "item-1": "A" } });
  const newer = { ...finalizeResponse({ document, responseId: "response-newer", answers: { "item-1": "B" } }), finalizedAt: "2026-06-02T09:10:00.000Z" };
  const quizResponse = { id: "quiz-response-1", material: { type: "quiz-paper", id: "paper-1", title: "Quiz" } };
  const index = buildHistoryIndex([older, newer, quizResponse], []);
  assert.deepEqual(index.map((entry) => entry.responseId), ["response-newer", "response-older"]);
});

test("multiple Teacher Reviews are all associated with one response", () => {
  const document = makeDocument();
  const response = finalizeResponse({ document, answers: { "item-1": "Hello" } });
  const reviewA = makeReview({ id: "review-a", responseId: response.id, judgment: "correct" });
  const reviewB = makeReview({ id: "review-b", responseId: response.id, judgment: "partial" });
  const entry = buildHistoryEntry(response, { teacherReviews: [reviewA, reviewB], learnerResponses: [response] });
  assert.equal(entry.reviewCount, 2);
  assert.equal(deriveEntryStatus(entry), "multiple-reviews");
});

test("reviews for multiple responses remain correctly separated in history entries", () => {
  const document = makeDocument();
  const responseA = finalizeResponse({ document, responseId: "response-a", answers: { "item-1": "A" } });
  const responseB = finalizeResponse({ document, responseId: "response-b", answers: { "item-1": "B" } });
  const reviewForA = makeReview({ id: "review-for-a", responseId: "response-a", judgment: "correct" });
  const reviews = [reviewForA];
  const entryA = buildHistoryEntry(responseA, { teacherReviews: reviews, learnerResponses: [responseA, responseB] });
  const entryB = buildHistoryEntry(responseB, { teacherReviews: reviews, learnerResponses: [responseA, responseB] });
  assert.equal(entryA.reviewCount, 1);
  assert.equal(entryB.reviewCount, 0);
});

test("needs-work selection includes each supported learner-annotation signal", () => {
  const document = makeDocument();
  ["unknown", "uncertain", "should_know"].forEach((kind) => {
    const response = finalizeResponse({
      document,
      responseId: `response-${kind}`,
      answers: { "item-1": "Hello there" },
      annotate: (session) => addTranslationAnnotation(session, "item-1", { kind, start: 0, end: 5, text: "Hello" }),
    });
    const needsWork = deriveNeedsWorkItemIds(response, []);
    assert.equal(needsWork.length, 1, kind);
    assert.equal(needsWork[0].itemId, "item-1");
    assert.ok(needsWork[0].reasons.includes(`annotation:${kind}`), kind);
  });
});

test("needs-work selection includes supported review judgments and corrections per the documented rule", () => {
  const document = makeDocument();
  const response = finalizeResponse({ document, answers: { "item-1": "Hello there" } });

  ["incorrect", "partial", "needs-review"].forEach((judgment) => {
    const review = makeReview({ id: `review-${judgment}`, responseId: response.id, judgment });
    const needsWork = deriveNeedsWorkItemIds(response, [review]);
    assert.equal(needsWork.length, 1, judgment);
    assert.ok(needsWork[0].reasons.includes(`judgment:${judgment}`), judgment);
  });

  const correctReview = makeReview({ id: "review-correct", responseId: response.id, judgment: "correct" });
  assert.equal(deriveNeedsWorkItemIds(response, [correctReview]).length, 0);

  const correctionReview = makeReview({
    id: "review-corrections",
    responseId: response.id,
    corrections: [{ id: "c1", operation: "style", start: 0, end: 5, anchoredText: "Hello", styleType: "bold", createdAt: CREATED_AT }],
  });
  const needsWorkFromCorrections = deriveNeedsWorkItemIds(response, [correctionReview]);
  assert.equal(needsWorkFromCorrections.length, 1);
  assert.ok(needsWorkFromCorrections[0].reasons.includes("hasCorrections"));
});

test("needs-work derivation is deterministic when multiple reviews disagree", () => {
  const document = makeDocument();
  const response = finalizeResponse({ document, answers: { "item-1": "Hello there" } });
  const reviewGood = makeReview({ id: "review-good", responseId: response.id, judgment: "correct" });
  const reviewBad = makeReview({ id: "review-bad", responseId: response.id, judgment: "incorrect" });

  const firstOrder = deriveNeedsWorkItemIds(response, [reviewGood, reviewBad]);
  const secondOrder = deriveNeedsWorkItemIds(response, [reviewBad, reviewGood]);
  assert.deepEqual(firstOrder, secondOrder);
  assert.equal(firstOrder.length, 1);
});

test("filterHistoryEntries filters by purpose, review status, and needs-work; sorts by completion date", () => {
  const document = makeDocument();
  const practiceResponse = finalizeResponse({ document, responseId: "practice-response", answers: { "item-1": "Hello" } });
  const retryMaterial = buildRetryMaterial({ response: practiceResponse });
  const retryResponse = finalizeResponse({ document: retryMaterial, responseId: "retry-response", answers: { [retryMaterial.items[0].id]: "Hello again" } });

  const entries = buildHistoryIndex([practiceResponse, retryResponse], []);
  const onlyRetry = filterHistoryEntries(entries, { purpose: "retry" });
  assert.deepEqual(onlyRetry.map((entry) => entry.responseId), ["retry-response"]);

  const onlyPractice = filterHistoryEntries(entries, { purpose: "practice" });
  assert.deepEqual(onlyPractice.map((entry) => entry.responseId), ["practice-response"]);

  const unreviewed = filterHistoryEntries(entries, { status: "unreviewed" });
  assert.equal(unreviewed.length, 2);
});

test("history status derives from canonical records rather than a persisted mutable flag", () => {
  const document = makeDocument();
  const response = finalizeResponse({ document, answers: { "item-1": "Hello" } });
  const entryBefore = buildHistoryEntry(response, { teacherReviews: [], learnerResponses: [response] });
  assert.equal(deriveEntryStatus(entryBefore), "unreviewed");

  const review = makeReview({ id: "review-1", responseId: response.id, judgment: "correct" });
  const entryAfter = buildHistoryEntry(response, { teacherReviews: [review], learnerResponses: [response] });
  assert.equal(deriveEntryStatus(entryAfter), "reviewed");
});

test("remediation lineage resolves response -> review -> remediation material -> remediation response", () => {
  const document = makeDocument();
  const originalResponse = finalizeResponse({ document, responseId: "original-response", answers: { "item-1": "Hello" } });
  const review = makeReview({ id: "review-1", responseId: originalResponse.id, judgment: "partial" });

  const remediationDocData = {
    id: "remediation-doc-1",
    title: "Remediation Material",
    sourceLanguage: "fr",
    targetLanguage: "en",
    items: [{ id: "rem-item-1", sourceText: "Salut", position: 0 }],
    provenance: {
      purpose: "remediation",
      sourceResponseId: originalResponse.id,
      sourceReviewId: review.id,
      sourceMaterialId: originalResponse.material.id,
      createdAt: CREATED_AT,
      author: { type: "external-ai" },
    },
  };
  const remediationSession = createTranslationSession({ id: "remediation-session", document: remediationDocData, startedAt: CREATED_AT });
  const finalizedRemediationSession = { ...setTranslationAnswer(remediationSession, "rem-item-1", "Hi"), completed: true, completedAt: "2026-06-02T09:00:00.000Z" };
  const remediationResponse = createTranslationLearnerResponse({ id: "remediation-response-1", session: finalizedRemediationSession });

  const lineage = resolveResponseLineage(remediationResponse, {
    learnerResponses: [originalResponse, remediationResponse],
    teacherReviews: [review],
  });
  assert.equal(lineage.ancestors.length, 1);
  assert.equal(lineage.ancestors[0].purpose, "remediation");
  assert.equal(lineage.ancestors[0].sourceResponseId, originalResponse.id);
  assert.equal(lineage.ancestors[0].sourceResponseAvailable, true);
  assert.equal(lineage.ancestors[0].sourceReviewId, review.id);
  assert.equal(lineage.ancestors[0].sourceReviewAvailable, true);

  const forwardLineage = resolveResponseLineage(originalResponse, {
    learnerResponses: [originalResponse, remediationResponse],
    teacherReviews: [review],
  });
  assert.equal(forwardLineage.descendants.length, 1);
  assert.equal(forwardLineage.descendants[0].responseId, remediationResponse.id);
  assert.equal(forwardLineage.descendants[0].purpose, "remediation");
});

test("a missing historical source record is represented safely rather than crashing", () => {
  const document = makeDocument();
  const response = finalizeResponse({ document, answers: { "item-1": "Hello" } });
  const orphanedRetryMaterial = buildRetryMaterial({ response });
  const orphanedRetrySession = { ...createTranslationSession({ id: "orphan-session", document: orphanedRetryMaterial, startedAt: CREATED_AT }), completed: true, completedAt: CREATED_AT };
  const orphanedRetryResponse = createTranslationLearnerResponse({ id: "orphan-retry-response", session: orphanedRetrySession });

  // Deliberately omit `response` from the known collection to simulate it having been deleted.
  const lineage = resolveResponseLineage(orphanedRetryResponse, { learnerResponses: [orphanedRetryResponse], teacherReviews: [] });
  assert.equal(lineage.ancestors.length, 1);
  assert.equal(lineage.ancestors[0].sourceResponseAvailable, false);
  assert.equal(lineage.ancestors[0].sourceResponseTitle, null);
});

test("retry and remediation provenance remain distinguishable in history entries", () => {
  const document = makeDocument();
  const response = finalizeResponse({ document, answers: { "item-1": "Hello" } });
  const retryMaterial = buildRetryMaterial({ response });
  const retrySession = { ...createTranslationSession({ id: "retry-session", document: retryMaterial, startedAt: CREATED_AT }), completed: true, completedAt: CREATED_AT };
  const retryResponse = createTranslationLearnerResponse({ id: "retry-response", session: retrySession });

  const entry = buildHistoryEntry(retryResponse, { teacherReviews: [], learnerResponses: [response, retryResponse] });
  assert.equal(entry.purpose, "retry");
  assert.notEqual(entry.purpose, "remediation");
});
