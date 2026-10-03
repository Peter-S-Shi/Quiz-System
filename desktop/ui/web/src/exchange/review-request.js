// Review-request / remediation-request packages and remediation provenance validation: the files exchanged with an
// external reviewer (a teacher or any AI tool). A faithful port of the V1 transport (src/core/review-transport.js) over
// the V2 Learner Response validators; pinned to the unchanged V1 code by a differential test.
import { newId as makeId } from "../ids.js";
import { ADAPTERS } from "../task-domains/adapters.js";
import { DOCUMENT_TYPES, INTERCHANGE_SCHEMA_VERSION, validateTeacherReview } from "./teacher-review.js";
import { TRANSLATION_DOCUMENT_TYPE, TRANSLATION_SCHEMA_VERSION, parseTranslationDocumentJsonText } from "./translation-import.js";

export const TRANSPORT_SCHEMA_VERSION = 1;
export const REVIEW_REQUEST_DOCUMENT_TYPE = "quiz-studio.review-request";
export const REMEDIATION_REQUEST_DOCUMENT_TYPE = "quiz-studio.remediation-request";
export const SUPPORTED_REVIEW_REQUEST_VERSIONS = [1];
export const SUPPORTED_REMEDIATION_REQUEST_VERSIONS = [1];
export const SUPPORTED_REMEDIATION_DOCUMENT_VERSIONS = [1];
export const SUPPORTED_TEACHER_REVIEW_IMPORT_VERSIONS = [1];

export const DEFAULT_REVIEW_TASK = "Read this Quiz Studio review-request JSON. Return exactly one JSON object conforming to the Quiz Studio Teacher Review contract (documentType \"quiz-studio.teacher-review\"). Preserve responseId and itemId values exactly. Do not rewrite the learnerResponse.";
export const DEFAULT_REMEDIATION_TASK = "Read this Quiz Studio remediation-request JSON. Using the learner's answers, marks, and the teacher review, return exactly one JSON object conforming to the Quiz Studio Translation Document contract (documentType \"quiz-studio.translation-document\") for targeted follow-up practice. Include a provenance object with purpose \"remediation\", sourceResponseId, and sourceReviewId set to the values from this request, plus createdAt and author metadata.";

/** The V1 Learner Response contract as the V2 adapter for that material enforces it. */
export function validateLearnerResponse(response) {
  const adapter = Object.values(ADAPTERS).find((a) => a.collection === "learner_response" && a.materialType === response?.material?.type);
  if (!adapter) return { valid: false, errors: ["Learner Response material type is not supported."] };
  const errors = adapter.validate(response);
  return { valid: errors.length === 0, errors };
}

function portableResponse(learnerResponse) {
  const v = validateLearnerResponse(learnerResponse);
  if (!v.valid) throw new TypeError(v.errors.join(" "));
  return structuredClone(learnerResponse);
}

export function createReviewRequestPackage({ id = makeId(), learnerResponse, exportedAt = new Date().toISOString(), task = DEFAULT_REVIEW_TASK }) {
  return {
    schemaVersion: TRANSPORT_SCHEMA_VERSION,
    documentType: REVIEW_REQUEST_DOCUMENT_TYPE,
    id,
    exportedAt,
    task,
    learnerResponse: portableResponse(learnerResponse),
    requestedOutput: { documentType: DOCUMENT_TYPES.TEACHER_REVIEW, schemaVersion: INTERCHANGE_SCHEMA_VERSION },
  };
}

export function validateReviewRequestPackage(value) {
  const errors = [];
  if (!isPlainObject(value)) return invalid("Review request package must be an object.");
  if (value.documentType !== REVIEW_REQUEST_DOCUMENT_TYPE) errors.push("Invalid review request documentType.");
  if (!SUPPORTED_REVIEW_REQUEST_VERSIONS.includes(value.schemaVersion)) errors.push("Unsupported review request schemaVersion.");
  if (!nonEmptyString(value.id)) errors.push("Review request id is required.");
  if (!nonEmptyString(value.exportedAt)) errors.push("Review request exportedAt is required.");
  if (!nonEmptyString(value.task)) errors.push("Review request task is required.");
  if (!isPlainObject(value.requestedOutput) || value.requestedOutput.documentType !== DOCUMENT_TYPES.TEACHER_REVIEW) {
    errors.push("Review request requestedOutput must target a Teacher Review.");
  } else if (!SUPPORTED_TEACHER_REVIEW_IMPORT_VERSIONS.includes(value.requestedOutput.schemaVersion)) {
    errors.push("Review request requestedOutput schemaVersion is unsupported.");
  }
  const responseValidation = validateLearnerResponse(value.learnerResponse);
  if (!responseValidation.valid) responseValidation.errors.forEach((message) => errors.push(`Embedded learnerResponse: ${message}`));
  return { valid: errors.length === 0, errors };
}

export function createRemediationRequestPackage({ id = makeId(), learnerResponse, teacherReview, exportedAt = new Date().toISOString(), task = DEFAULT_REMEDIATION_TASK }) {
  const portable = portableResponse(learnerResponse);
  const reviewValidation = validateTeacherReview(teacherReview, { learnerResponse: portable });
  if (!reviewValidation.valid) throw new TypeError(reviewValidation.errors.join(" "));
  return {
    schemaVersion: TRANSPORT_SCHEMA_VERSION,
    documentType: REMEDIATION_REQUEST_DOCUMENT_TYPE,
    id,
    exportedAt,
    task,
    learnerResponse: portable,
    teacherReview: structuredClone(teacherReview),
    requestedOutput: { documentType: TRANSLATION_DOCUMENT_TYPE, schemaVersion: TRANSLATION_SCHEMA_VERSION },
  };
}

export function validateRemediationRequestPackage(value) {
  const errors = [];
  if (!isPlainObject(value)) return invalid("Remediation request package must be an object.");
  if (value.documentType !== REMEDIATION_REQUEST_DOCUMENT_TYPE) errors.push("Invalid remediation request documentType.");
  if (!SUPPORTED_REMEDIATION_REQUEST_VERSIONS.includes(value.schemaVersion)) errors.push("Unsupported remediation request schemaVersion.");
  if (!nonEmptyString(value.id)) errors.push("Remediation request id is required.");
  if (!nonEmptyString(value.exportedAt)) errors.push("Remediation request exportedAt is required.");
  if (!nonEmptyString(value.task)) errors.push("Remediation request task is required.");
  if (!isPlainObject(value.requestedOutput) || value.requestedOutput.documentType !== TRANSLATION_DOCUMENT_TYPE) {
    errors.push("Remediation request requestedOutput must target a Translation Document.");
  } else if (!SUPPORTED_REMEDIATION_DOCUMENT_VERSIONS.includes(value.requestedOutput.schemaVersion)) {
    errors.push("Remediation request requestedOutput schemaVersion is unsupported.");
  }
  const responseValidation = validateLearnerResponse(value.learnerResponse);
  if (!responseValidation.valid) responseValidation.errors.forEach((message) => errors.push(`Embedded learnerResponse: ${message}`));
  const reviewValidation = validateTeacherReview(value.teacherReview, { learnerResponse: value.learnerResponse });
  if (!reviewValidation.valid) reviewValidation.errors.forEach((message) => errors.push(`Embedded teacherReview: ${message}`));
  if (isPlainObject(value.teacherReview) && isPlainObject(value.learnerResponse) && value.teacherReview.responseId !== value.learnerResponse.id) {
    errors.push("Embedded teacherReview responseId does not match the embedded learnerResponse id.");
  }
  return { valid: errors.length === 0, errors };
}

// A Translation Document only needs this check when it claims to be remediation material (provenance.purpose ===
// "remediation"). It never trusts the provenance at face value: sourceResponseId / sourceReviewId must resolve to real
// local records, and the review must actually belong to that response.
export function validateRemediationProvenance(document, { learnerResponses = [], teacherReviews = [] } = {}) {
  const provenance = document?.provenance;
  if (!isPlainObject(provenance) || provenance.purpose !== "remediation") return { valid: true, errors: [] };
  const errors = [];
  if (!nonEmptyString(provenance.sourceResponseId)) errors.push("Remediation provenance requires sourceResponseId.");
  if (!nonEmptyString(provenance.sourceReviewId)) errors.push("Remediation provenance requires sourceReviewId.");
  const sourceResponse = nonEmptyString(provenance.sourceResponseId) ? learnerResponses.find((item) => item?.id === provenance.sourceResponseId) : undefined;
  if (nonEmptyString(provenance.sourceResponseId) && !sourceResponse) {
    errors.push(`Remediation provenance sourceResponseId does not match any known Learner Response: ${provenance.sourceResponseId}`);
  }
  const sourceReview = nonEmptyString(provenance.sourceReviewId) ? teacherReviews.find((item) => item?.id === provenance.sourceReviewId) : undefined;
  if (nonEmptyString(provenance.sourceReviewId) && !sourceReview) {
    errors.push(`Remediation provenance sourceReviewId does not match any known Teacher Review: ${provenance.sourceReviewId}`);
  }
  if (sourceReview && nonEmptyString(provenance.sourceResponseId) && sourceReview.responseId !== provenance.sourceResponseId) {
    errors.push("Remediation provenance sourceReviewId belongs to a different Learner Response than sourceResponseId.");
  }
  if (nonEmptyString(provenance.sourceMaterialId) && sourceResponse && provenance.sourceMaterialId !== sourceResponse.material?.id) {
    errors.push("Remediation provenance sourceMaterialId does not match the source Learner Response material identity.");
  }
  return { valid: errors.length === 0, errors };
}

export function validateRemediationImportProvenance(document, context = {}) {
  const provenance = document?.provenance;
  if (!isPlainObject(provenance)) return invalid("Remediation import requires provenance.");
  if (provenance.purpose !== "remediation") return invalid('Remediation import provenance purpose must be "remediation".');
  const errors = validateRemediationMetadata(provenance);
  const lineage = validateRemediationProvenance(document, context);
  return { valid: errors.length === 0 && lineage.valid, errors: [...errors, ...lineage.errors] };
}

export function parseRemediationTranslationDocumentText(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { document: null, errors: ["The file is not valid JSON."] };
  }
  if (raw?.documentType !== TRANSLATION_DOCUMENT_TYPE) return { document: null, errors: ["Invalid Translation Document documentType."] };
  if (!SUPPORTED_REMEDIATION_DOCUMENT_VERSIONS.includes(raw.schemaVersion)) {
    return { document: null, errors: [`Unsupported Translation Document schema version: ${raw.schemaVersion ?? "missing"}`] };
  }
  if (!isPlainObject(raw.provenance)) return { document: null, errors: ["Remediation import requires provenance."] };
  if (raw.provenance.purpose !== "remediation") return { document: null, errors: ['Remediation import provenance purpose must be "remediation".'] };
  const metadataErrors = validateRemediationMetadata(raw.provenance);
  if (metadataErrors.length) return { document: null, errors: metadataErrors };
  const { document, errors } = parseTranslationDocumentJsonText(text);
  if (!document) return { document: null, errors };
  return { document, errors: [] };
}

function invalid(message) {
  return { valid: false, errors: [message] };
}
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateActor(value, label, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${label} is required.`);
    return;
  }
  const allowedKeys = new Set(["type", "displayLabel", "toolName"]);
  const actorTypes = new Set(["anonymous", "human", "external-ai", "agent", "system"]);
  Object.keys(value).forEach((key) => {
    if (!allowedKeys.has(key)) errors.push(`Unsupported ${label} field: ${key}`);
  });
  if (!actorTypes.has(value.type)) errors.push(`${label} type is invalid.`);
  ["displayLabel", "toolName"].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(value, key) && typeof value[key] !== "string") errors.push(`${label} ${key} must be a string.`);
  });
}

function validateRemediationMetadata(provenance) {
  const errors = [];
  const allowedKeys = new Set(["purpose", "sourceResponseId", "sourceReviewId", "sourceMaterialId", "createdAt", "author", "extensions"]);
  Object.keys(provenance).forEach((key) => {
    if (!allowedKeys.has(key)) errors.push(`Unsupported remediation provenance field: ${key}`);
  });
  if (!nonEmptyString(provenance.createdAt)) errors.push("Remediation provenance requires createdAt.");
  validateActor(provenance.author, "Remediation provenance author", errors);
  if (Object.prototype.hasOwnProperty.call(provenance, "sourceMaterialId") && !nonEmptyString(provenance.sourceMaterialId)) {
    errors.push("Remediation provenance sourceMaterialId must be a non-empty string when provided.");
  }
  if (Object.prototype.hasOwnProperty.call(provenance, "extensions") && !isPlainObject(provenance.extensions)) {
    errors.push("Remediation provenance extensions must be an object.");
  }
  return errors;
}
