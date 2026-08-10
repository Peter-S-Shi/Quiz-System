import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";

import {
  createTranslationDocument,
  createTranslationFolder,
  createTranslationLibrary,
  getTranslationDocument,
} from "../src/core/translation-domain.js";
import { createTranslationSession, setTranslationAnswer } from "../src/core/translation-session.js";
import {
  DOCUMENT_TYPES,
  createTranslationLearnerResponse,
  normalizeLearnerResponse,
  normalizeTeacherReview,
  toPortableTeacherReview,
  validateLearnerResponse,
  validateTeacherReview,
} from "../src/core/interchange.js";
import { findTeacherReviewForResponse, findTeacherReviewsForResponse, upsertTeacherReview } from "../src/core/review-records.js";
import {
  REMEDIATION_REQUEST_DOCUMENT_TYPE,
  REVIEW_REQUEST_DOCUMENT_TYPE,
  classifyTeacherReviewImport,
  createRemediationRequestPackage,
  createReviewRequestPackage,
  parseExternalTeacherReview,
  parseExternalTeacherReviewText,
  parseRemediationTranslationDocumentText,
  validateRemediationImportProvenance,
  validateRemediationProvenance,
  validateRemediationRequestPackage,
  validateReviewRequestPackage,
} from "../src/core/review-transport.js";

const CREATED_AT = "2026-05-01T09:00:00.000Z";

function makeTranslationResponse() {
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
    ],
  });
  const document = getTranslationDocument(library, "document-1");
  let session = createTranslationSession({ id: "session-1", document, startedAt: CREATED_AT });
  session = setTranslationAnswer(session, "item-1", "Hello there");
  session = setTranslationAnswer(session, "item-2", "Thanks");
  session = { ...session, completed: true, completedAt: "2026-05-01T09:10:00.000Z" };
  return createTranslationLearnerResponse({ id: "response-1", session });
}

function makeExternalReview(response, overrides = {}) {
  return normalizeTeacherReview({
    schemaVersion: 1,
    documentType: DOCUMENT_TYPES.TEACHER_REVIEW,
    id: "external-review-1",
    responseId: response.id,
    createdAt: CREATED_AT,
    reviewer: { type: "external-ai", displayLabel: "Synthetic Reviewer" },
    itemReviews: [
      { itemId: "item-1", judgment: "correct" },
      { itemId: "item-2", judgment: "partial", comment: "Consider a fuller sentence." },
    ],
    remediationRecommendations: [],
    ...overrides,
  });
}

// --- Review request export ------------------------------------------------------------------

test("createReviewRequestPackage embeds a faithful portable Learner Response and target-output metadata", () => {
  const response = makeTranslationResponse();
  const pkg = createReviewRequestPackage({ id: "request-1", learnerResponse: response, exportedAt: CREATED_AT });

  assert.equal(pkg.documentType, REVIEW_REQUEST_DOCUMENT_TYPE);
  assert.deepEqual(pkg.learnerResponse.responses, response.responses);
  assert.equal(pkg.learnerResponse.id, response.id);
  assert.equal(pkg.requestedOutput.documentType, DOCUMENT_TYPES.TEACHER_REVIEW);
  assert.equal(typeof pkg.requestedOutput.schemaVersion, "number");
  assert.deepEqual(validateReviewRequestPackage(pkg), { valid: true, errors: [] });
});

test("a review request package survives a JSON round trip", () => {
  const response = makeTranslationResponse();
  const pkg = createReviewRequestPackage({ id: "request-1", learnerResponse: response, exportedAt: CREATED_AT });
  const roundTripped = JSON.parse(JSON.stringify(pkg));
  assert.deepEqual(roundTripped, pkg);
  assert.deepEqual(validateReviewRequestPackage(roundTripped), { valid: true, errors: [] });
});

test("public review-request schema accepts a valid package and rejects a malformed one", async () => {
  const schema = JSON.parse(await readFile(new URL("../schemas/review-request.schema.json", import.meta.url), "utf8"));
  const validateSchema = new Ajv2020({ strict: false }).compile(schema);
  const response = makeTranslationResponse();
  const pkg = createReviewRequestPackage({ id: "request-1", learnerResponse: response, exportedAt: CREATED_AT });
  assert.equal(validateSchema(pkg), true, JSON.stringify(validateSchema.errors));

  const missingTask = { ...pkg };
  delete missingTask.task;
  assert.equal(validateSchema(missingTask), false);
});

test("validateReviewRequestPackage rejects a malformed package", () => {
  const response = makeTranslationResponse();
  const pkg = createReviewRequestPackage({ id: "request-1", learnerResponse: response, exportedAt: CREATED_AT });

  assert.equal(validateReviewRequestPackage({ ...pkg, documentType: "quiz-studio.something-else" }).valid, false);
  assert.equal(validateReviewRequestPackage({ ...pkg, learnerResponse: { schemaVersion: 1 } }).valid, false);
  assert.equal(validateReviewRequestPackage({ ...pkg, requestedOutput: { documentType: "quiz-studio.learner-response", schemaVersion: 1 } }).valid, false);
});

test("review-request runtime and public schema reject unsupported transport/output versions and an empty task", async () => {
  const response = makeTranslationResponse();
  const pkg = createReviewRequestPackage({ id: "request-1", learnerResponse: response, exportedAt: CREATED_AT });
  const invalidPackages = [
    { ...pkg, schemaVersion: 2 },
    { ...pkg, task: "   " },
    { ...pkg, requestedOutput: { ...pkg.requestedOutput, schemaVersion: 2 } },
  ];
  invalidPackages.forEach((candidate) => assert.equal(validateReviewRequestPackage(candidate).valid, false));

  const schema = JSON.parse(await readFile(new URL("../schemas/review-request.schema.json", import.meta.url), "utf8"));
  const validateSchema = new Ajv2020({ strict: false }).compile(schema);
  assert.equal(validateSchema(invalidPackages[0]), false);
  assert.equal(validateSchema(invalidPackages[1]), false);
  assert.equal(validateSchema(invalidPackages[2]), false);
});

// --- Teacher Review external import ------------------------------------------------------------

test("parseExternalTeacherReview accepts a valid rich review targeting the response", () => {
  const response = makeTranslationResponse();
  const external = makeExternalReview(response);
  const result = parseExternalTeacherReview(external, { learnerResponse: response });
  assert.equal(result.errors.length, 0);
  assert.ok(result.review);
  assert.equal(result.review.responseId, response.id);
});

test("parseExternalTeacherReviewText rejects malformed JSON text", () => {
  const result = parseExternalTeacherReviewText("{not json", {});
  assert.equal(result.review, null);
  assert.match(result.errors.join(" "), /not valid JSON/);
});

test("parseExternalTeacherReview rejects the wrong documentType", () => {
  const response = makeTranslationResponse();
  const wrongType = { ...makeExternalReview(response), documentType: "quiz-studio.learner-response" };
  const result = parseExternalTeacherReview(wrongType, { learnerResponse: response });
  assert.equal(result.review, null);
  assert.match(result.errors.join(" "), /Invalid Teacher Review documentType/);
});

test("parseExternalTeacherReview rejects an unsupported schema version at the external-import boundary", () => {
  const response = makeTranslationResponse();
  const futureVersion = { ...makeExternalReview(response), schemaVersion: 99 };
  const result = parseExternalTeacherReview(futureVersion, { learnerResponse: response });
  assert.equal(result.review, null);
  assert.match(result.errors.join(" "), /Unsupported Teacher Review schema version/);
});

test("parseExternalTeacherReview rejects an orphan responseId", () => {
  const response = makeTranslationResponse();
  const orphan = makeExternalReview(response, { responseId: "no-such-response" });
  const result = parseExternalTeacherReview(orphan, { learnerResponse: response });
  assert.equal(result.review, null);
  assert.match(result.errors.join(" "), /does not match the protected Learner Response/);
});

test("parseExternalTeacherReview rejects an unknown item id", () => {
  const response = makeTranslationResponse();
  const unknownItem = makeExternalReview(response, { itemReviews: [{ itemId: "missing-item", judgment: "correct" }] });
  const result = parseExternalTeacherReview(unknownItem, { learnerResponse: response });
  assert.equal(result.review, null);
  assert.match(result.errors.join(" "), /unknown itemId/);
});

test("parseExternalTeacherReview rejects an anchored-text mismatch in a correction", () => {
  const response = makeTranslationResponse();
  const badAnchor = makeExternalReview(response, {
    itemReviews: [{
      itemId: "item-1",
      corrections: [{ id: "c1", operation: "style", styleType: "bold", start: 0, end: 5, anchoredText: "WRONG", createdAt: CREATED_AT }],
    }],
  });
  const result = parseExternalTeacherReview(badAnchor, { learnerResponse: response });
  assert.equal(result.review, null);
  assert.match(result.errors.join(" "), /anchoredText does not match/);
});

test("parseExternalTeacherReview rejects conflicting content-changing corrections", () => {
  const response = makeTranslationResponse();
  const conflicting = makeExternalReview(response, {
    itemReviews: [{
      itemId: "item-1",
      corrections: [
        { id: "c1", operation: "replace", start: 0, end: 11, anchoredText: "Hello there", text: "Hi", createdAt: CREATED_AT },
        { id: "c2", operation: "delete", start: 6, end: 11, anchoredText: "there", createdAt: CREATED_AT },
      ],
    }],
  });
  const result = parseExternalTeacherReview(conflicting, { learnerResponse: response });
  assert.equal(result.review, null);
  assert.match(result.errors.join(" "), /conflict on overlapping content-changing operations/);
});

test("parseExternalTeacherReview rejects an invalid operation/style/color", () => {
  const response = makeTranslationResponse();
  const badStyle = makeExternalReview(response, {
    itemReviews: [{
      itemId: "item-1",
      corrections: [{ id: "c1", operation: "style", styleType: "sparkle", start: 0, end: 5, anchoredText: "Hello", createdAt: CREATED_AT }],
    }],
  });
  const result = parseExternalTeacherReview(badStyle, { learnerResponse: response });
  assert.equal(result.review, null);
  assert.match(result.errors.join(" "), /Invalid correction styleType/);
});

test("parseExternalTeacherReview rejects unsupported fields before normalization can discard them", () => {
  const response = makeTranslationResponse();
  const topLevel = { ...makeExternalReview(response), learnerResponse: response };
  assert.match(parseExternalTeacherReview(topLevel, { learnerResponse: response }).errors.join(" "), /Unsupported Teacher Review field/);

  const itemField = makeExternalReview(response);
  itemField.itemReviews[0].confidence = 0.9;
  assert.match(parseExternalTeacherReview(itemField, { learnerResponse: response }).errors.join(" "), /Unsupported Teacher Review item field/);

  const correctionField = makeExternalReview(response, {
    itemReviews: [{
      itemId: "item-1",
      corrections: [{ id: "c1", operation: "style", styleType: "bold", start: 0, end: 5, anchoredText: "Hello", createdAt: CREATED_AT }],
    }],
  });
  correctionField.itemReviews[0].corrections[0].replacementResponse = "protected";
  assert.match(parseExternalTeacherReview(correctionField, { learnerResponse: response }).errors.join(" "), /Unsupported correction field/);
});

test("parseExternalTeacherReview rejects malformed reviewer metadata before normalization", () => {
  const response = makeTranslationResponse();
  const external = makeExternalReview(response);
  external.reviewer = { type: "unknown-tool", displayLabel: 42, accountId: "private" };
  const result = parseExternalTeacherReview(external, { learnerResponse: response });
  assert.equal(result.review, null);
  assert.match(result.errors.join(" "), /reviewer type is invalid|Unsupported Teacher Review reviewer field|displayLabel must be a string/);
});

test("parseExternalTeacherReview rejects a missing required canonical field instead of filling a default", () => {
  const response = makeTranslationResponse();
  const external = makeExternalReview(response);
  delete external.remediationRecommendations;
  const result = parseExternalTeacherReview(external, { learnerResponse: response });
  assert.equal(result.review, null);
  assert.match(result.errors.join(" "), /requires canonical field: remediationRecommendations/);
});

// --- Import planning / collision classification ------------------------------------------------

test("classifyTeacherReviewImport never mutates the existing collection while planning", () => {
  const response = makeTranslationResponse();
  const external = makeExternalReview(response);
  const collection = upsertTeacherReview([], external, { learnerResponse: response });
  const before = structuredClone(collection);

  classifyTeacherReviewImport(external, collection);
  assert.deepEqual(collection, before);
});

test("classifyTeacherReviewImport classifies new, idempotent, update, and reassigned-reject", () => {
  const response = makeTranslationResponse();
  const external = makeExternalReview(response);

  assert.equal(classifyTeacherReviewImport(external, []).kind, "new");

  const collection = upsertTeacherReview([], external, { learnerResponse: response });
  assert.equal(classifyTeacherReviewImport(external, collection).kind, "idempotent");

  const changed = { ...external, summary: "Updated summary." };
  assert.equal(classifyTeacherReviewImport(changed, collection).kind, "update");

  const reassigned = { ...external, responseId: "some-other-response" };
  assert.equal(classifyTeacherReviewImport(reassigned, collection).kind, "reassigned-reject");
});

test("a new review import persists and a same-ID changed review updates only after confirmation is applied", () => {
  const response = makeTranslationResponse();
  const external = makeExternalReview(response);
  let collection = upsertTeacherReview([], external, { learnerResponse: response });
  assert.equal(collection.length, 1);

  const changed = normalizeTeacherReview({ ...external, summary: "Revised after a second pass." });
  assert.equal(classifyTeacherReviewImport(changed, collection).kind, "update");
  collection = upsertTeacherReview(collection, changed, { learnerResponse: response });
  assert.equal(collection.length, 1);
  assert.equal(collection[0].summary, "Revised after a second pass.");
});

test("a same review ID with a different response ID is rejected, never silently reassigned", () => {
  const response = makeTranslationResponse();
  const external = makeExternalReview(response);
  const collection = upsertTeacherReview([], external, { learnerResponse: response });
  const reassigned = { ...external, responseId: "some-other-response" };
  assert.throws(() => upsertTeacherReview(collection, reassigned), /cannot be reassigned to a different response/);
});

test("multiple reviews for the same response coexist and reviews for multiple responses coexist", () => {
  const response = makeTranslationResponse();
  const reviewA = makeExternalReview(response, { id: "review-a", reviewer: { type: "human", displayLabel: "Teacher A" } });
  const reviewB = makeExternalReview(response, { id: "review-b", reviewer: { type: "external-ai", displayLabel: "Reviewer B" } });
  let collection = upsertTeacherReview([], reviewA, { learnerResponse: response });
  collection = upsertTeacherReview(collection, reviewB, { learnerResponse: response });

  const forResponse = findTeacherReviewsForResponse(collection, response.id);
  assert.equal(forResponse.length, 2);
  assert.deepEqual(new Set(forResponse.map((item) => item.id)), new Set(["review-a", "review-b"]));

  const otherResponse = { ...response, id: "response-2" };
  const reviewC = makeExternalReview(otherResponse, { id: "review-c" });
  collection = upsertTeacherReview(collection, reviewC, { learnerResponse: otherResponse });
  assert.equal(findTeacherReviewsForResponse(collection, response.id).length, 2);
  assert.equal(findTeacherReviewsForResponse(collection, otherResponse.id).length, 1);
});

test("a specific review can be reopened deterministically by id", () => {
  const response = makeTranslationResponse();
  const reviewA = makeExternalReview(response, { id: "review-a" });
  const reviewB = makeExternalReview(response, { id: "review-b" });
  let collection = upsertTeacherReview([], reviewA, { learnerResponse: response });
  collection = upsertTeacherReview(collection, reviewB, { learnerResponse: response });

  const reopened = collection.find((item) => item.id === "review-b");
  assert.ok(reopened);
  assert.equal(reopened.id, "review-b");
});

test("importing a review never alters the Learner Response or its learnerAnnotations", () => {
  const response = makeTranslationResponse();
  const before = structuredClone(response);
  const external = makeExternalReview(response);
  parseExternalTeacherReview(external, { learnerResponse: response });
  upsertTeacherReview([], external, { learnerResponse: response });

  assert.deepEqual(response, before);
});

test("a stored Teacher Review exports and re-imports without fidelity loss", () => {
  const response = makeTranslationResponse();
  const external = makeExternalReview(response);
  const collection = upsertTeacherReview([], external, { learnerResponse: response });
  const stored = findTeacherReviewForResponse(collection, response.id);

  const exported = toPortableTeacherReview(stored, { learnerResponse: response });
  const reimported = parseExternalTeacherReview(JSON.parse(JSON.stringify(exported)), { learnerResponse: response });
  assert.equal(reimported.errors.length, 0);
  assert.deepEqual(reimported.review, stored);
});

// --- Remediation request export -----------------------------------------------------------------

test("createRemediationRequestPackage embeds the intended Learner Response and Teacher Review", () => {
  const response = makeTranslationResponse();
  const review = makeExternalReview(response);
  const pkg = createRemediationRequestPackage({ id: "remediation-request-1", learnerResponse: response, teacherReview: review, exportedAt: CREATED_AT });

  assert.equal(pkg.documentType, REMEDIATION_REQUEST_DOCUMENT_TYPE);
  assert.equal(pkg.learnerResponse.id, response.id);
  assert.equal(pkg.teacherReview.id, review.id);
  assert.equal(pkg.requestedOutput.documentType, "quiz-studio.translation-document");
  assert.deepEqual(validateRemediationRequestPackage(pkg), { valid: true, errors: [] });
});

test("public remediation-request schema accepts a valid package", async () => {
  const schema = JSON.parse(await readFile(new URL("../schemas/remediation-request.schema.json", import.meta.url), "utf8"));
  const validateSchema = new Ajv2020({ strict: false }).compile(schema);
  const response = makeTranslationResponse();
  const review = makeExternalReview(response);
  const pkg = createRemediationRequestPackage({ id: "remediation-request-1", learnerResponse: response, teacherReview: review, exportedAt: CREATED_AT });
  assert.equal(validateSchema(pkg), true, JSON.stringify(validateSchema.errors));
});

test("validateRemediationRequestPackage rejects a mismatched teacherReview/learnerResponse pairing", () => {
  const response = makeTranslationResponse();
  const otherResponse = { ...response, id: "response-2" };
  const review = makeExternalReview(otherResponse);
  const pkg = {
    schemaVersion: 1,
    documentType: REMEDIATION_REQUEST_DOCUMENT_TYPE,
    id: "remediation-request-1",
    exportedAt: CREATED_AT,
    task: "task",
    learnerResponse: response,
    teacherReview: review,
    requestedOutput: { documentType: "quiz-studio.translation-document", schemaVersion: 1 },
  };
  const result = validateRemediationRequestPackage(pkg);
  assert.equal(result.valid, false);
});

test("remediation-request runtime and public schema reject unsupported transport/output versions and an empty task", async () => {
  const response = makeTranslationResponse();
  const review = makeExternalReview(response);
  const pkg = createRemediationRequestPackage({ id: "remediation-request-1", learnerResponse: response, teacherReview: review, exportedAt: CREATED_AT });
  const invalidPackages = [
    { ...pkg, schemaVersion: 2 },
    { ...pkg, task: "" },
    { ...pkg, requestedOutput: { ...pkg.requestedOutput, schemaVersion: 2 } },
  ];
  invalidPackages.forEach((candidate) => assert.equal(validateRemediationRequestPackage(candidate).valid, false));

  const schema = JSON.parse(await readFile(new URL("../schemas/remediation-request.schema.json", import.meta.url), "utf8"));
  const validateSchema = new Ajv2020({ strict: false }).compile(schema);
  assert.equal(validateSchema(invalidPackages[0]), false);
  assert.equal(validateSchema(invalidPackages[1]), false);
  assert.equal(validateSchema(invalidPackages[2]), false);
});

// --- Remediation provenance ------------------------------------------------------------------

test("validateRemediationProvenance accepts a document whose provenance correctly resolves", () => {
  const response = makeTranslationResponse();
  const review = makeExternalReview(response);
  const remediationDoc = {
    provenance: {
      purpose: "remediation",
      sourceResponseId: response.id,
      sourceReviewId: review.id,
      sourceMaterialId: response.material.id,
    },
  };
  const result = validateRemediationProvenance(remediationDoc, { learnerResponses: [response], teacherReviews: [review] });
  assert.deepEqual(result, { valid: true, errors: [] });
});

test("validateRemediationProvenance ignores documents that do not claim to be remediation material", () => {
  const result = validateRemediationProvenance({ provenance: { purpose: "practice" } }, { learnerResponses: [], teacherReviews: [] });
  assert.deepEqual(result, { valid: true, errors: [] });
  assert.deepEqual(validateRemediationProvenance({}, {}), { valid: true, errors: [] });
});

test("dedicated remediation import rejects missing provenance and a non-remediation purpose", () => {
  assert.equal(validateRemediationImportProvenance({}, {}).valid, false);
  assert.match(validateRemediationImportProvenance({}, {}).errors.join(" "), /requires provenance/);
  const wrongPurpose = validateRemediationImportProvenance({ provenance: { purpose: "practice" } }, {});
  assert.equal(wrongPurpose.valid, false);
  assert.match(wrongPurpose.errors.join(" "), /purpose must be "remediation"/);
});

test("dedicated remediation import accepts complete canonical provenance that resolves locally", () => {
  const response = makeTranslationResponse();
  const review = makeExternalReview(response);
  const document = {
    provenance: {
      purpose: "remediation",
      sourceResponseId: response.id,
      sourceReviewId: review.id,
      sourceMaterialId: response.material.id,
      createdAt: CREATED_AT,
      author: { type: "external-ai", displayLabel: "Synthetic Author" },
    },
  };
  assert.deepEqual(
    validateRemediationImportProvenance(document, { learnerResponses: [response], teacherReviews: [review] }),
    { valid: true, errors: [] },
  );
});

test("dedicated remediation import validates required timestamp and author metadata", () => {
  const response = makeTranslationResponse();
  const review = makeExternalReview(response);
  const document = {
    provenance: {
      purpose: "remediation",
      sourceResponseId: response.id,
      sourceReviewId: review.id,
      createdAt: "",
      author: { type: "external-ai", displayLabel: 7 },
    },
  };
  const result = validateRemediationImportProvenance(document, { learnerResponses: [response], teacherReviews: [review] });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /requires createdAt/);
  assert.match(result.errors.join(" "), /displayLabel must be a string/);
});

test("validateRemediationProvenance rejects an unknown sourceResponseId", () => {
  const review = makeExternalReview(makeTranslationResponse());
  const result = validateRemediationProvenance(
    { provenance: { purpose: "remediation", sourceResponseId: "no-such-response", sourceReviewId: review.id } },
    { learnerResponses: [], teacherReviews: [review] },
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /sourceResponseId does not match any known Learner Response/);
});

test("validateRemediationProvenance rejects an unknown sourceReviewId", () => {
  const response = makeTranslationResponse();
  const result = validateRemediationProvenance(
    { provenance: { purpose: "remediation", sourceResponseId: response.id, sourceReviewId: "no-such-review" } },
    { learnerResponses: [response], teacherReviews: [] },
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /sourceReviewId does not match any known Teacher Review/);
});

test("validateRemediationProvenance rejects a sourceReviewId belonging to a different response", () => {
  const response = makeTranslationResponse();
  const otherResponse = { ...response, id: "response-2" };
  const reviewForOther = makeExternalReview(otherResponse, { id: "review-for-other" });
  const result = validateRemediationProvenance(
    { provenance: { purpose: "remediation", sourceResponseId: response.id, sourceReviewId: reviewForOther.id } },
    { learnerResponses: [response, otherResponse], teacherReviews: [reviewForOther] },
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /belongs to a different Learner Response/);
});

test("validateRemediationProvenance rejects a mismatched sourceMaterialId when present", () => {
  const response = makeTranslationResponse();
  const review = makeExternalReview(response);
  const result = validateRemediationProvenance(
    { provenance: { purpose: "remediation", sourceResponseId: response.id, sourceReviewId: review.id, sourceMaterialId: "wrong-material" } },
    { learnerResponses: [response], teacherReviews: [review] },
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /sourceMaterialId does not match/);
});

test("parseRemediationTranslationDocumentText rejects an unsupported Translation Document schema version", () => {
  const doc = {
    schemaVersion: 99,
    documentType: "quiz-studio.translation-document",
    id: "doc-1",
    title: "T",
    folderId: "folder-1",
    sourceLanguage: "fr",
    targetLanguage: "en",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    items: [{ id: "item-1", sourceText: "Bonjour", position: 0 }],
  };
  const result = parseRemediationTranslationDocumentText(JSON.stringify(doc));
  assert.equal(result.document, null);
  assert.match(result.errors.join(" "), /Unsupported Translation Document schema version/);
});

test("parseRemediationTranslationDocumentText accepts a supported version and preserves provenance", async () => {
  const text = await readFile(new URL("../examples/sample-remediation-translation-document.json", import.meta.url), "utf8");
  const result = parseRemediationTranslationDocumentText(text);
  assert.equal(result.errors.length, 0);
  assert.ok(result.document);
  assert.equal(result.document.provenance.purpose, "remediation");
});

test("dedicated remediation parser rejects ordinary documents and malformed raw author metadata", async () => {
  const ordinary = JSON.parse(await readFile(new URL("../examples/sample-translation-document.json", import.meta.url), "utf8"));
  const ordinaryResult = parseRemediationTranslationDocumentText(JSON.stringify(ordinary));
  assert.equal(ordinaryResult.document, null);
  assert.match(ordinaryResult.errors.join(" "), /purpose must be "remediation"/);

  const remediation = JSON.parse(await readFile(new URL("../examples/sample-remediation-translation-document.json", import.meta.url), "utf8"));
  remediation.provenance.author = { type: "unsupported", displayLabel: 42 };
  const malformedResult = parseRemediationTranslationDocumentText(JSON.stringify(remediation));
  assert.equal(malformedResult.document, null);
  assert.match(malformedResult.errors.join(" "), /author type is invalid|displayLabel must be a string/);
});

// --- End-to-end fixture set: public schema + runtime boundary agreement -------------------------

test("the sample Translation Learner Response fixture passes the runtime and public schema boundary", async () => {
  const response = JSON.parse(await readFile(new URL("../examples/sample-translation-learner-response.json", import.meta.url), "utf8"));
  assert.deepEqual(validateLearnerResponse(response), { valid: true, errors: [] });

  const schema = JSON.parse(await readFile(new URL("../schemas/learner-response.schema.json", import.meta.url), "utf8"));
  const validateSchema = new Ajv2020({ strict: false }).compile(schema);
  assert.equal(validateSchema(response), true, JSON.stringify(validateSchema.errors));
});

test("the sample external Teacher Review fixture passes the runtime and public schema boundary against the sample response", async () => {
  const response = JSON.parse(await readFile(new URL("../examples/sample-translation-learner-response.json", import.meta.url), "utf8"));
  const review = JSON.parse(await readFile(new URL("../examples/sample-external-teacher-review.json", import.meta.url), "utf8"));
  assert.deepEqual(validateTeacherReview(review, { learnerResponse: response }), { valid: true, errors: [] });

  const schema = JSON.parse(await readFile(new URL("../schemas/teacher-review.schema.json", import.meta.url), "utf8"));
  const validateSchema = new Ajv2020({ strict: false }).compile(schema);
  assert.equal(validateSchema(review), true, JSON.stringify(validateSchema.errors));
});

test("the sample review-request fixture passes the runtime and public schema boundary", async () => {
  const pkg = JSON.parse(await readFile(new URL("../examples/sample-review-request.json", import.meta.url), "utf8"));
  assert.deepEqual(validateReviewRequestPackage(pkg), { valid: true, errors: [] });

  const schema = JSON.parse(await readFile(new URL("../schemas/review-request.schema.json", import.meta.url), "utf8"));
  const validateSchema = new Ajv2020({ strict: false }).compile(schema);
  assert.equal(validateSchema(pkg), true, JSON.stringify(validateSchema.errors));
});

test("the sample remediation-request fixture passes the runtime and public schema boundary", async () => {
  const pkg = JSON.parse(await readFile(new URL("../examples/sample-remediation-request.json", import.meta.url), "utf8"));
  assert.deepEqual(validateRemediationRequestPackage(pkg), { valid: true, errors: [] });

  const schema = JSON.parse(await readFile(new URL("../schemas/remediation-request.schema.json", import.meta.url), "utf8"));
  const validateSchema = new Ajv2020({ strict: false }).compile(schema);
  assert.equal(validateSchema(pkg), true, JSON.stringify(validateSchema.errors));
});

test("the sample remediation Translation Document fixture resolves against the sample response and review", async () => {
  const response = JSON.parse(await readFile(new URL("../examples/sample-translation-learner-response.json", import.meta.url), "utf8"));
  const review = JSON.parse(await readFile(new URL("../examples/sample-external-teacher-review.json", import.meta.url), "utf8"));
  const text = await readFile(new URL("../examples/sample-remediation-translation-document.json", import.meta.url), "utf8");
  const { document, errors } = parseRemediationTranslationDocumentText(text);
  assert.equal(errors.length, 0);

  const result = validateRemediationProvenance(document, { learnerResponses: [response], teacherReviews: [review] });
  assert.deepEqual(result, { valid: true, errors: [] });
});

test("the full sample fixture chain demonstrates the round trip without contradicting normalizeLearnerResponse", async () => {
  const response = JSON.parse(await readFile(new URL("../examples/sample-translation-learner-response.json", import.meta.url), "utf8"));
  assert.deepEqual(normalizeLearnerResponse(response), response);
});
