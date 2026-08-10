import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";

import { createLibraryBackup, parseLibraryBackup } from "../src/core/backup.js";
import { addCorrection, validateCorrection } from "../src/core/corrections.js";
import {
  DOCUMENT_TYPES,
  createQuizLearnerResponse,
  createTranslationLearnerResponse,
  normalizeTeacherReview,
  validateLearnerResponse,
  validateTeacherReview,
} from "../src/core/interchange.js";
import { findTeacherReviewForResponse, parseTeacherReviewCollection, upsertTeacherReview } from "../src/core/review-records.js";
import {
  createTranslationDocument,
  createTranslationFolder,
  createTranslationLibrary,
  getTranslationDocument,
} from "../src/core/translation-domain.js";
import { addTranslationAnnotation, createTranslationSession, setTranslationAnswer } from "../src/core/translation-session.js";

const CREATED_AT = "2026-04-01T09:00:00.000Z";

function makeTranslationResponse({ annotate = false } = {}) {
  let library = createTranslationFolder(createTranslationLibrary(), { id: "folder-1", name: "Practice", createdAt: CREATED_AT });
  library = createTranslationDocument(library, {
    id: "document-1",
    title: "Travel Notes",
    folderId: "folder-1",
    sourceLanguage: "fr",
    targetLanguage: "en",
    createdAt: CREATED_AT,
    items: [
      { id: "item-1", sourceText: "Bonjour", position: 0 },
      { id: "item-2", sourceText: "Merci", position: 1 },
      { id: "item-3", sourceText: "Au revoir", position: 2 },
    ],
  });
  const document = getTranslationDocument(library, "document-1");
  let session = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });
  session = setTranslationAnswer(session, "item-1", "Hello there");
  session = setTranslationAnswer(session, "item-2", "Thanks");
  session = setTranslationAnswer(session, "item-3", "Bye now");
  if (annotate) {
    session = addTranslationAnnotation(session, "item-1", { kind: "unknown", start: 0, end: 5, text: "Hello" });
  }
  session = { ...session, completed: true, completedAt: "2026-04-01T09:10:00.000Z" };
  return createTranslationLearnerResponse({ id: "response-1", session });
}

function buildItem1Corrections() {
  const answer = "Hello there";
  let list = addCorrection([], { id: "c-bold", operation: "style", styleType: "bold", start: 0, end: 5, anchoredText: "Hello" }, answer);
  list = addCorrection(list, { id: "c-underline", operation: "style", styleType: "underline", start: 0, end: 5, anchoredText: "Hello" }, answer);
  list = addCorrection(list, { id: "c-italic", operation: "style", styleType: "italic", start: 6, end: 11, anchoredText: "there" }, answer);
  list = addCorrection(list, { id: "c-strike", operation: "style", styleType: "strikethrough", start: 6, end: 11, anchoredText: "there" }, answer);
  list = addCorrection(list, { id: "c-highlight", operation: "style", styleType: "highlight", start: 6, end: 11, anchoredText: "there" }, answer);
  list = addCorrection(list, { id: "c-bracket", operation: "style", styleType: "bracket", start: 0, end: 5, anchoredText: "Hello" }, answer);
  list = addCorrection(list, { id: "c-color", operation: "style", styleType: "color", color: "red", start: 6, end: 11, anchoredText: "there" }, answer);
  list = addCorrection(list, { id: "c-insert", operation: "insert", start: 11, end: 11, anchoredText: "", text: "!", color: "blue" }, answer);
  list = addCorrection(list, { id: "c-comment", operation: "comment", start: 0, end: 5, anchoredText: "Hello", text: "Good opener." }, answer);
  return list;
}

function buildItem2Corrections() {
  return addCorrection([], { id: "c-replace", operation: "replace", start: 0, end: 6, anchoredText: "Thanks", text: "Thank you", color: "green" }, "Thanks");
}

function buildItem3Corrections() {
  return addCorrection([], { id: "c-delete", operation: "delete", start: 0, end: 3, anchoredText: "Bye" }, "Bye now");
}

function buildRichReview(response, { reviewId = "review-1" } = {}) {
  return normalizeTeacherReview({
    schemaVersion: 1,
    documentType: DOCUMENT_TYPES.TEACHER_REVIEW,
    id: reviewId,
    responseId: response.id,
    createdAt: CREATED_AT,
    reviewer: { type: "human" },
    itemReviews: [
      { itemId: "item-1", corrections: buildItem1Corrections() },
      {
        itemId: "item-2",
        judgment: "partial",
        comment: "Consider more natural phrasing.",
        suggestedRevision: "Thank you so much.",
        corrections: buildItem2Corrections(),
      },
      { itemId: "item-3", corrections: buildItem3Corrections() },
    ],
    remediationRecommendations: [],
  });
}

test("a rich Teacher Review linked to a Translation Learner Response validates against runtime and public schema", async () => {
  const response = makeTranslationResponse();
  const review = buildRichReview(response);
  const result = validateTeacherReview(review, { learnerResponse: response });
  assert.deepEqual(result, { valid: true, errors: [] });

  const schema = JSON.parse(await readFile(new URL("../schemas/teacher-review.schema.json", import.meta.url), "utf8"));
  const validateSchema = new Ajv2020({ strict: false }).compile(schema);
  assert.equal(validateSchema(review), true, JSON.stringify(validateSchema.errors));
});

test("creating and validating a rich review never mutates the original learner answer or annotations", () => {
  const response = makeTranslationResponse({ annotate: true });
  const before = structuredClone(response);
  const review = buildRichReview(response);
  validateTeacherReview(review, { learnerResponse: response });

  assert.deepEqual(response, before);
  assert.equal(response.responses.find((item) => item.itemId === "item-1").answer, "Hello there");
  assert.equal(response.learnerAnnotations.length, 1);
});

test("suggestedRevision coexists with rich correction on the same item", () => {
  const response = makeTranslationResponse();
  const review = buildRichReview(response);
  const item2 = review.itemReviews.find((item) => item.itemId === "item-2");
  assert.equal(item2.suggestedRevision, "Thank you so much.");
  assert.equal(item2.corrections[0].text, "Thank you");
  assert.deepEqual(validateTeacherReview(review, { learnerResponse: response }), { valid: true, errors: [] });
});

test("validateTeacherReview rejects a correction referencing an unknown item", () => {
  const response = makeTranslationResponse();
  const review = normalizeTeacherReview({
    schemaVersion: 1,
    documentType: DOCUMENT_TYPES.TEACHER_REVIEW,
    id: "review-1",
    responseId: response.id,
    createdAt: CREATED_AT,
    reviewer: { type: "human" },
    itemReviews: [{ itemId: "missing-item", corrections: buildItem3Corrections() }],
    remediationRecommendations: [],
  });
  const result = validateTeacherReview(review, { learnerResponse: response });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /unknown itemId/);
});

test("validateTeacherReview rejects a correction anchor range outside the learner answer", () => {
  const response = makeTranslationResponse();
  const review = buildRichReview(response);
  review.itemReviews.find((item) => item.itemId === "item-3").corrections[0].end = 999;
  const result = validateTeacherReview(review, { learnerResponse: response });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /range is outside the learner answer/);
});

test("validateTeacherReview rejects a correction whose anchoredText no longer matches the learner answer", () => {
  const response = makeTranslationResponse();
  const review = buildRichReview(response);
  review.itemReviews.find((item) => item.itemId === "item-3").corrections[0].anchoredText = "WRONG";
  const result = validateTeacherReview(review, { learnerResponse: response });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /anchoredText does not match the learner answer/);
});

test("validateTeacherReview rejects a duplicate correction id across the review", () => {
  const response = makeTranslationResponse();
  const review = buildRichReview(response);
  review.itemReviews.find((item) => item.itemId === "item-3").corrections[0].id = "c-comment";
  const result = validateTeacherReview(review, { learnerResponse: response });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Duplicate correction id/);
});

test("validateTeacherReview deterministically rejects conflicting structural edit operations on the same item", () => {
  const response = makeTranslationResponse();
  const review = buildRichReview(response);
  const item2 = review.itemReviews.find((item) => item.itemId === "item-2");
  item2.corrections.push({
    id: "c-conflict",
    operation: "delete",
    start: 2,
    end: 6,
    anchoredText: "Thanks".slice(2, 6),
    createdAt: CREATED_AT,
  });
  const result = validateTeacherReview(review, { learnerResponse: response });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /conflict on overlapping content-changing operations/);
});

test("validateTeacherReview accepts legitimate overlapping orthogonal styles", () => {
  const response = makeTranslationResponse();
  const review = buildRichReview(response);
  const item1 = review.itemReviews.find((item) => item.itemId === "item-1");
  assert.ok(item1.corrections.some((c) => c.id === "c-bold" && c.start === 0 && c.end === 5));
  assert.ok(item1.corrections.some((c) => c.id === "c-underline" && c.start === 0 && c.end === 5));
  assert.deepEqual(validateTeacherReview(review, { learnerResponse: response }), { valid: true, errors: [] });
});

test("validateTeacherReview rejects malformed correction style and color values", () => {
  const response = makeTranslationResponse();
  const review = buildRichReview(response);
  const item1 = review.itemReviews.find((item) => item.itemId === "item-1");
  item1.corrections.find((c) => c.id === "c-bold").styleType = "sparkle";
  item1.corrections.find((c) => c.id === "c-color").color = "not-a-real-color";
  const result = validateTeacherReview(review, { learnerResponse: response });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Invalid correction styleType/);
  assert.match(result.errors.join(" "), /Invalid correction color/);
});

test("HTML-like reviewer text round-trips as plain data through normalizeTeacherReview", () => {
  const response = makeTranslationResponse();
  const dangerous = "<img src=x onerror=alert(1)> & \" '";
  const review = normalizeTeacherReview({
    schemaVersion: 1,
    documentType: DOCUMENT_TYPES.TEACHER_REVIEW,
    id: "review-1",
    responseId: response.id,
    createdAt: CREATED_AT,
    reviewer: { type: "human" },
    itemReviews: [{
      itemId: "item-1",
      comment: dangerous,
      corrections: [{ id: "c1", operation: "comment", start: 0, end: 5, anchoredText: "Hello", text: dangerous, createdAt: CREATED_AT }],
    }],
    remediationRecommendations: [],
  });
  assert.equal(review.itemReviews[0].comment, dangerous);
  assert.equal(review.itemReviews[0].corrections[0].text, dangerous);
  assert.deepEqual(validateTeacherReview(review, { learnerResponse: response }), { valid: true, errors: [] });
});

test("Teacher Review persistence survives reload and reopening by responseId", () => {
  const response = makeTranslationResponse();
  const review = buildRichReview(response);
  let collection = upsertTeacherReview([], review, { learnerResponse: response });
  collection = JSON.parse(JSON.stringify(collection));

  const reopened = findTeacherReviewForResponse(collection, response.id);
  assert.ok(reopened);
  assert.equal(reopened.itemReviews.length, 3);

  const updated = { ...reopened, summary: "Updated after a second look." };
  collection = upsertTeacherReview(collection, updated, { learnerResponse: response });
  assert.equal(collection.length, 1);
  assert.equal(findTeacherReviewForResponse(collection, response.id).summary, "Updated after a second look.");
});

test("upsertTeacherReview never silently reassigns a review id to a different response", () => {
  const response = makeTranslationResponse();
  const review = buildRichReview(response);
  const collection = upsertTeacherReview([], review, { learnerResponse: response });

  const hijacked = { ...review, responseId: "some-other-response" };
  assert.throws(() => upsertTeacherReview(collection, hijacked), /cannot be reassigned to a different response/);
});

test("full backup preserves Teacher Reviews and legacy backups without reviews remain valid", () => {
  const response = makeTranslationResponse();
  const review = buildRichReview(response);
  const quizLibrary = { schemaVersion: 1, papers: [{ id: "paper-1", title: "Synthetic Quiz", questions: [] }] };

  const backup = createLibraryBackup({
    library: quizLibrary,
    history: [],
    learnerResponses: [response],
    teacherReviews: [review],
    translationLibrary: createTranslationLibrary(),
    exportedAt: "2026-04-01T09:20:00.000Z",
  });
  const restored = parseLibraryBackup(JSON.parse(JSON.stringify(backup)));
  assert.equal(restored.hasTeacherReviews, true);
  assert.equal(restored.teacherReviews.length, 1);
  assert.equal(restored.teacherReviews[0].itemReviews.length, 3);
  assert.equal(restored.learnerResponses[0].responses.find((item) => item.itemId === "item-1").answer, "Hello there");

  const legacy = parseLibraryBackup({ schemaVersion: 1, library: quizLibrary, history: [] });
  assert.equal(legacy.hasTeacherReviews, false);
  assert.deepEqual(legacy.teacherReviews, []);
});

test("malformed Teacher Review data in a backup fails safely before any state is applied", () => {
  const response = makeTranslationResponse();
  const quizLibrary = { schemaVersion: 1, papers: [{ id: "paper-1", title: "Synthetic Quiz", questions: [] }] };
  assert.throws(() => parseLibraryBackup({
    library: quizLibrary,
    history: [],
    learnerResponses: [response],
    teacherReviews: [{ id: "broken" }],
  }));
  assert.throws(() => parseTeacherReviewCollection([{ id: "broken" }]));
});

test("existing simple M6.0 Teacher Review without corrections remains valid", async () => {
  const sample = JSON.parse(await readFile(new URL("../examples/sample-teacher-review.json", import.meta.url), "utf8"));
  assert.deepEqual(validateTeacherReview(sample), { valid: true, errors: [] });

  const schema = JSON.parse(await readFile(new URL("../schemas/teacher-review.schema.json", import.meta.url), "utf8"));
  const validateSchema = new Ajv2020({ strict: false }).compile(schema);
  assert.equal(validateSchema(sample), true, JSON.stringify(validateSchema.errors));
});

test("a Teacher Review remains valid against an older unannotated Translation Learner Response", () => {
  const response = makeTranslationResponse({ annotate: false });
  assert.equal(Object.hasOwn(response, "learnerAnnotations"), false);
  const review = buildRichReview(response);
  assert.deepEqual(validateTeacherReview(review, { learnerResponse: response }), { valid: true, errors: [] });
});

test("a Teacher Review remains valid against an M6.4 annotated Translation Learner Response", () => {
  const response = makeTranslationResponse({ annotate: true });
  assert.equal(response.learnerAnnotations.length, 1);
  const review = buildRichReview(response);
  assert.deepEqual(validateTeacherReview(review, { learnerResponse: response }), { valid: true, errors: [] });
});

test("Teacher Review validation and Objective Quiz Learner Responses show no regression", () => {
  const quizResponse = createQuizLearnerResponse({
    id: "quiz-response-1",
    session: {
      id: "quiz-session-1",
      paperId: "paper-1",
      paperTitle: "Synthetic Quiz",
      startedAt: CREATED_AT,
      completedAt: "2026-04-01T09:10:00.000Z",
      questions: [{ id: "question-1", type: "blank", prompt: "Type A", answers: ["A"] }],
      answers: { "question-1": "A" },
      results: [{ questionId: "question-1", correct: true, correctAnswer: "A" }],
      correctCount: 1,
      percent: 100,
    },
  });
  assert.deepEqual(validateLearnerResponse(quizResponse), { valid: true, errors: [] });

  const review = normalizeTeacherReview({
    schemaVersion: 1,
    documentType: DOCUMENT_TYPES.TEACHER_REVIEW,
    id: "review-quiz-1",
    responseId: quizResponse.id,
    createdAt: CREATED_AT,
    reviewer: { type: "human" },
    itemReviews: [{ itemId: "question-1", judgment: "correct" }],
    remediationRecommendations: [],
  });
  assert.deepEqual(validateTeacherReview(review, { learnerResponse: quizResponse }), { valid: true, errors: [] });
});

test("parseTeacherReviewCollection rejects an orphan Teacher Review when learnerResponses context is supplied", () => {
  const response = makeTranslationResponse();
  const review = buildRichReview(response);
  const orphan = { ...review, id: "orphan-review", responseId: "no-such-response" };
  assert.throws(
    () => parseTeacherReviewCollection([review, orphan], { learnerResponses: [response] }),
    /does not match any known Learner Response/,
  );
});

test("parseTeacherReviewCollection performs structural-only validation when no learnerResponses context is supplied", () => {
  const orphan = normalizeTeacherReview({
    schemaVersion: 1,
    documentType: DOCUMENT_TYPES.TEACHER_REVIEW,
    id: "orphan-review",
    responseId: "no-such-response",
    createdAt: CREATED_AT,
    reviewer: { type: "human" },
    itemReviews: [],
    remediationRecommendations: [],
  });
  const parsed = parseTeacherReviewCollection([orphan]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].responseId, "no-such-response");
});

test("upsertTeacherReview rejects an orphan responseId when learnerResponses context is supplied", () => {
  const response = makeTranslationResponse();
  const review = buildRichReview(response);
  assert.throws(
    () => upsertTeacherReview([], { ...review, responseId: "no-such-response" }, { learnerResponses: [response] }),
    /does not match any known Learner Response/,
  );
});

test("full backup restore rejects an orphan Teacher Review", () => {
  const response = makeTranslationResponse();
  const quizLibrary = { schemaVersion: 1, papers: [{ id: "paper-1", title: "Synthetic Quiz", questions: [] }] };
  const orphanReview = normalizeTeacherReview({
    schemaVersion: 1,
    documentType: DOCUMENT_TYPES.TEACHER_REVIEW,
    id: "orphan-review",
    responseId: "no-such-response",
    createdAt: CREATED_AT,
    reviewer: { type: "human" },
    itemReviews: [],
    remediationRecommendations: [],
  });
  assert.throws(
    () => parseLibraryBackup({
      library: quizLibrary,
      history: [],
      learnerResponses: [response],
      teacherReviews: [orphanReview],
    }),
    /does not match any known Learner Response/,
  );
});

test("validateTeacherReview rejects an insert correction with non-empty anchoredText, matching validateCorrection()", () => {
  const response = makeTranslationResponse();
  const review = buildRichReview(response);
  const item1 = review.itemReviews.find((item) => item.itemId === "item-1");
  const badInsert = { id: "bad-insert", operation: "insert", start: 0, end: 0, anchoredText: "Hello", text: "!", createdAt: CREATED_AT };
  item1.corrections.push(badInsert);

  assert.equal(validateCorrection(badInsert, "Hello there").valid, false);
  const result = validateTeacherReview(review, { learnerResponse: response });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /empty anchoredText/);
});

test("validateTeacherReview rejects a zero-length replace correction, matching validateCorrection()", () => {
  const response = makeTranslationResponse();
  const review = buildRichReview(response);
  const item1 = review.itemReviews.find((item) => item.itemId === "item-1");
  const zeroLengthReplace = { id: "bad-replace", operation: "replace", start: 2, end: 2, anchoredText: "", text: "x", createdAt: CREATED_AT };
  item1.corrections.push(zeroLengthReplace);

  assert.equal(validateCorrection(zeroLengthReplace, "Hello there").valid, false);
  const result = validateTeacherReview(review, { learnerResponse: response });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /zero-length position/);
});

test("validateTeacherReview rejects a style correction missing styleType, matching validateCorrection()", () => {
  const response = makeTranslationResponse();
  const review = buildRichReview(response);
  const item1 = review.itemReviews.find((item) => item.itemId === "item-1");
  const badStyle = { id: "bad-style", operation: "style", start: 0, end: 5, anchoredText: "Hello", createdAt: CREATED_AT };
  item1.corrections.push(badStyle);

  assert.equal(validateCorrection(badStyle, "Hello there").valid, false);
  const result = validateTeacherReview(review, { learnerResponse: response });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Invalid correction styleType/);
});

test("public Teacher Review schema rejects an insert correction with non-empty anchoredText or missing text", async () => {
  const schema = JSON.parse(await readFile(new URL("../schemas/teacher-review.schema.json", import.meta.url), "utf8"));
  const validateSchema = new Ajv2020({ strict: false }).compile(schema);
  const response = makeTranslationResponse();
  const baseReview = buildRichReview(response);

  const nonEmptyAnchor = structuredClone(baseReview);
  nonEmptyAnchor.itemReviews[0].corrections.push({
    id: "bad-insert", operation: "insert", start: 0, end: 0, anchoredText: "Hello", text: "!", createdAt: CREATED_AT,
  });
  assert.equal(validateSchema(nonEmptyAnchor), false);

  const missingText = structuredClone(baseReview);
  missingText.itemReviews[0].corrections.push({
    id: "bad-insert-2", operation: "insert", start: 0, end: 0, anchoredText: "", createdAt: CREATED_AT,
  });
  assert.equal(validateSchema(missingText), false);
});

test("public Teacher Review schema rejects a style=color correction missing color, and a replace/comment missing text", async () => {
  const schema = JSON.parse(await readFile(new URL("../schemas/teacher-review.schema.json", import.meta.url), "utf8"));
  const validateSchema = new Ajv2020({ strict: false }).compile(schema);
  const response = makeTranslationResponse();

  const missingColor = structuredClone(buildRichReview(response));
  missingColor.itemReviews[0].corrections.push({
    id: "bad-color", operation: "style", styleType: "color", start: 0, end: 5, anchoredText: "Hello", createdAt: CREATED_AT,
  });
  assert.equal(validateSchema(missingColor), false);

  const missingReplaceText = structuredClone(buildRichReview(response));
  missingReplaceText.itemReviews[1].corrections.push({
    id: "bad-replace", operation: "replace", start: 0, end: 6, anchoredText: "Thanks", createdAt: CREATED_AT,
  });
  assert.equal(validateSchema(missingReplaceText), false);

  const missingCommentText = structuredClone(buildRichReview(response));
  missingCommentText.itemReviews[2].corrections.push({
    id: "bad-comment", operation: "comment", start: 0, end: 3, anchoredText: "Bye", createdAt: CREATED_AT,
  });
  assert.equal(validateSchema(missingCommentText), false);
});

test("public Teacher Review schema still accepts the valid rich review with the new operation-specific rules", async () => {
  const schema = JSON.parse(await readFile(new URL("../schemas/teacher-review.schema.json", import.meta.url), "utf8"));
  const validateSchema = new Ajv2020({ strict: false }).compile(schema);
  const response = makeTranslationResponse();
  const review = buildRichReview(response);
  assert.equal(validateSchema(review), true, JSON.stringify(validateSchema.errors));
});

test("applying an insert or replace correction with a reviewer color persists it through save/reload", () => {
  const answer = "Hello there";
  let corrections = addCorrection([], { operation: "insert", start: 0, end: 0, anchoredText: "", text: "Well, ", color: "blue" }, answer);
  corrections = addCorrection(corrections, { operation: "replace", start: 6, end: 11, anchoredText: "there", text: "friend", color: "purple" }, answer);

  const response = makeTranslationResponse();
  const review = normalizeTeacherReview({
    schemaVersion: 1,
    documentType: DOCUMENT_TYPES.TEACHER_REVIEW,
    id: "review-color",
    responseId: response.id,
    createdAt: CREATED_AT,
    reviewer: { type: "human" },
    itemReviews: [{ itemId: "item-1", corrections }],
    remediationRecommendations: [],
  });

  assert.deepEqual(validateTeacherReview(review, { learnerResponse: response }), { valid: true, errors: [] });
  const collection = upsertTeacherReview([], review, { learnerResponse: response });
  const reloaded = JSON.parse(JSON.stringify(collection));
  const reopened = findTeacherReviewForResponse(reloaded, response.id);
  const savedCorrections = reopened.itemReviews[0].corrections;
  assert.equal(savedCorrections.find((c) => c.operation === "insert").color, "blue");
  assert.equal(savedCorrections.find((c) => c.operation === "replace").color, "purple");
});
