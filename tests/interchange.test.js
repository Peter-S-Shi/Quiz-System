import test from "node:test";
import assert from "node:assert/strict";

import {
  DOCUMENT_TYPES,
  createQuizLearnerResponse,
  normalizeProvenance,
  normalizeTeacherReview,
  toPortableLearnerResponse,
  validateLearnerResponse,
  validateTeacherReview,
} from "../src/core/interchange.js";
import { normalizePaper } from "../src/core/migrations.js";

function makeCompletedSession() {
  return {
    id: "session-1",
    paperId: "paper-1",
    paperTitle: "Synthetic Quiz",
    startedAt: "2026-01-01T10:00:00.000Z",
    completedAt: "2026-01-01T10:02:00.000Z",
    questions: [
      {
        id: "question-1",
        type: "single",
        prompt: "Choose A",
        options: [
          { id: "option-a", text: "A", correct: true },
          { id: "option-b", text: "B", correct: false },
        ],
      },
    ],
    answers: { "question-1": "option-a" },
    results: [{ questionId: "question-1", correct: true, correctAnswer: "A" }],
    correctCount: 1,
    percent: 100,
  };
}

test("quiz learner responses preserve submitted answers and material snapshots", () => {
  const session = makeCompletedSession();
  const response = createQuizLearnerResponse({ id: "response-1", session });

  session.answers["question-1"] = "option-b";
  session.questions[0].prompt = "Changed later";

  assert.equal(response.documentType, DOCUMENT_TYPES.LEARNER_RESPONSE);
  assert.equal(response.responses[0].answer, "option-a");
  assert.equal(response.material.snapshot.items[0].prompt, "Choose A");
  assert.deepEqual(validateLearnerResponse(response), { valid: true, errors: [] });
});

test("portable learner responses round-trip without losing protected evidence", () => {
  const original = createQuizLearnerResponse({ id: "response-1", session: makeCompletedSession() });
  const portable = toPortableLearnerResponse(JSON.parse(JSON.stringify(original)));

  assert.deepEqual(portable, original);
  assert.notEqual(portable, original);
});

test("teacher review validation rejects mismatched and protected response data", () => {
  const response = createQuizLearnerResponse({ id: "response-1", session: makeCompletedSession() });
  const validReview = normalizeTeacherReview({
    schemaVersion: 1,
    documentType: DOCUMENT_TYPES.TEACHER_REVIEW,
    id: "review-1",
    responseId: response.id,
    createdAt: "2026-01-01T11:00:00.000Z",
    reviewer: { type: "anonymous" },
    itemReviews: [{ itemId: "question-1", judgment: "correct" }],
    remediationRecommendations: [],
  });

  assert.deepEqual(validateTeacherReview(validReview, { learnerResponse: response }), { valid: true, errors: [] });

  const mismatched = { ...validReview, responseId: "response-other" };
  assert.equal(validateTeacherReview(mismatched, { learnerResponse: response }).valid, false);

  const overwriteAttempt = { ...validReview, originalResponse: { answers: [] } };
  assert.equal(validateTeacherReview(overwriteAttempt, { learnerResponse: response }).valid, false);
});

test("teacher review validation rejects unknown item references", () => {
  const response = createQuizLearnerResponse({ id: "response-1", session: makeCompletedSession() });
  const review = normalizeTeacherReview({
    id: "review-1",
    responseId: response.id,
    createdAt: "2026-01-01T11:00:00.000Z",
    reviewer: { type: "agent", displayLabel: "Synthetic Agent" },
    itemReviews: [{ itemId: "missing-question", judgment: "needs-review" }],
  });

  assert.equal(validateTeacherReview(review, { learnerResponse: response }).valid, false);
});

test("quiz paper provenance survives normalization without personal identifiers", () => {
  const provenance = normalizeProvenance({
    purpose: "remediation",
    sourceResponseId: "response-1",
    sourceReviewId: "review-1",
    author: { type: "external-ai", displayLabel: "Synthetic Generator" },
  });
  const paper = normalizePaper({ id: "paper-2", title: "Follow-up", questions: [], provenance });

  assert.deepEqual(paper.provenance, provenance);
});
