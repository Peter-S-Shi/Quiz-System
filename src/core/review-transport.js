import { makeId } from "./utils.js";
import {
  DOCUMENT_TYPES,
  INTERCHANGE_SCHEMA_VERSION,
  normalizeTeacherReview,
  toPortableLearnerResponse,
  validateLearnerResponse,
  validateTeacherReview,
} from "./interchange.js";
import { TRANSLATION_DOCUMENT_TYPE, TRANSLATION_SCHEMA_VERSION } from "./translation-domain.js";
import { parseTranslationDocumentJsonText } from "./translation-import.js";

export const TRANSPORT_SCHEMA_VERSION = 1;
export const REVIEW_REQUEST_DOCUMENT_TYPE = "quiz-studio.review-request";
export const REMEDIATION_REQUEST_DOCUMENT_TYPE = "quiz-studio.remediation-request";

// Explicit external-interchange version gates. These are intentionally stricter than the generic
// runtime validators (which stay forward-tolerant for local/internal use): a schemaVersion the
// generic validator would accept can still be rejected here if this build does not know how to
// safely consume it from an untrusted external source.
export const SUPPORTED_TEACHER_REVIEW_IMPORT_VERSIONS = [1];
export const SUPPORTED_REVIEW_REQUEST_VERSIONS = [1];
export const SUPPORTED_REMEDIATION_REQUEST_VERSIONS = [1];
export const SUPPORTED_REMEDIATION_DOCUMENT_VERSIONS = [1];

const DEFAULT_REVIEW_TASK = "Read this Quiz Studio review-request JSON. Return exactly one JSON object conforming to the Quiz Studio Teacher Review contract (documentType \"quiz-studio.teacher-review\"). Preserve responseId and itemId values exactly. Do not rewrite the learnerResponse.";
const DEFAULT_REMEDIATION_TASK = "Read this Quiz Studio remediation-request JSON. Using the learner's answers, marks, and the teacher review, return exactly one JSON object conforming to the Quiz Studio Translation Document contract (documentType \"quiz-studio.translation-document\") for targeted follow-up practice. Include a provenance object with purpose \"remediation\", sourceResponseId, and sourceReviewId set to the values from this request.";

// --- Review request (Learner Response -> external reviewer) -------------------------------------

export function createReviewRequestPackage({ id = makeId(), learnerResponse, exportedAt = new Date().toISOString(), task = DEFAULT_REVIEW_TASK }) {
  const portableResponse = toPortableLearnerResponse(learnerResponse);
  return {
    schemaVersion: TRANSPORT_SCHEMA_VERSION,
    documentType: REVIEW_REQUEST_DOCUMENT_TYPE,
    id,
    exportedAt,
    task,
    learnerResponse: portableResponse,
    requestedOutput: {
      documentType: DOCUMENT_TYPES.TEACHER_REVIEW,
      schemaVersion: INTERCHANGE_SCHEMA_VERSION,
    },
  };
}

export function validateReviewRequestPackage(value) {
  const errors = [];
  if (!isPlainObject(value)) return invalid("Review request package must be an object.");
  if (value.documentType !== REVIEW_REQUEST_DOCUMENT_TYPE) errors.push("Invalid review request documentType.");
  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1) errors.push("Invalid review request schemaVersion.");
  if (!nonEmptyString(value.id)) errors.push("Review request id is required.");
  if (!nonEmptyString(value.exportedAt)) errors.push("Review request exportedAt is required.");
  if (!isPlainObject(value.requestedOutput) || value.requestedOutput.documentType !== DOCUMENT_TYPES.TEACHER_REVIEW) {
    errors.push("Review request requestedOutput must target a Teacher Review.");
  }
  const responseValidation = validateLearnerResponse(value.learnerResponse);
  if (!responseValidation.valid) {
    responseValidation.errors.forEach((message) => errors.push(`Embedded learnerResponse: ${message}`));
  }
  return { valid: errors.length === 0, errors };
}

// --- Teacher Review external import --------------------------------------------------------------

export function parseExternalTeacherReviewText(text, options = {}) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { review: null, errors: ["The file is not valid JSON."] };
  }
  return parseExternalTeacherReview(raw, options);
}

export function parseExternalTeacherReview(raw, { learnerResponse } = {}) {
  if (!isPlainObject(raw)) return { review: null, errors: ["The Teacher Review must be a JSON object."] };
  if (raw.documentType !== DOCUMENT_TYPES.TEACHER_REVIEW) return { review: null, errors: ["Invalid Teacher Review documentType."] };
  const schemaVersion = Number(raw.schemaVersion);
  if (!SUPPORTED_TEACHER_REVIEW_IMPORT_VERSIONS.includes(schemaVersion)) {
    return { review: null, errors: [`Unsupported Teacher Review schema version: ${raw.schemaVersion ?? "missing"}`] };
  }

  const normalized = normalizeTeacherReview(raw);
  const validation = validateTeacherReview(normalized, { learnerResponse });
  return { review: validation.valid ? normalized : null, errors: validation.valid ? [] : validation.errors };
}

// A response may legitimately receive more than one Teacher Review, and a review may legitimately
// be re-imported unchanged (idempotent) or resubmitted with edits (an explicit update). This never
// mutates anything -- it only classifies what persisting `candidate` would do, so the caller can
// show a preview before the user confirms.
export function classifyTeacherReviewImport(candidate, existingCollection) {
  const existing = (Array.isArray(existingCollection) ? existingCollection : []).find((item) => item.id === candidate.id);
  if (!existing) return { kind: "new", existing: null };
  if (existing.responseId !== candidate.responseId) return { kind: "reassigned-reject", existing };
  if (isDeepEqual(existing, candidate)) return { kind: "idempotent", existing };
  return { kind: "update", existing };
}

// --- Remediation request (Learner Response + Teacher Review -> external remediation author) ------

export function createRemediationRequestPackage({
  id = makeId(),
  learnerResponse,
  teacherReview,
  exportedAt = new Date().toISOString(),
  task = DEFAULT_REMEDIATION_TASK,
}) {
  const portableResponse = toPortableLearnerResponse(learnerResponse);
  const reviewValidation = validateTeacherReview(teacherReview, { learnerResponse: portableResponse });
  if (!reviewValidation.valid) throw new TypeError(reviewValidation.errors.join(" "));

  return {
    schemaVersion: TRANSPORT_SCHEMA_VERSION,
    documentType: REMEDIATION_REQUEST_DOCUMENT_TYPE,
    id,
    exportedAt,
    task,
    learnerResponse: portableResponse,
    teacherReview: structuredClone(teacherReview),
    requestedOutput: {
      documentType: TRANSLATION_DOCUMENT_TYPE,
      schemaVersion: TRANSLATION_SCHEMA_VERSION,
    },
  };
}

export function validateRemediationRequestPackage(value) {
  const errors = [];
  if (!isPlainObject(value)) return invalid("Remediation request package must be an object.");
  if (value.documentType !== REMEDIATION_REQUEST_DOCUMENT_TYPE) errors.push("Invalid remediation request documentType.");
  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1) errors.push("Invalid remediation request schemaVersion.");
  if (!nonEmptyString(value.id)) errors.push("Remediation request id is required.");
  if (!nonEmptyString(value.exportedAt)) errors.push("Remediation request exportedAt is required.");
  if (!isPlainObject(value.requestedOutput) || value.requestedOutput.documentType !== TRANSLATION_DOCUMENT_TYPE) {
    errors.push("Remediation request requestedOutput must target a Translation Document.");
  }

  const responseValidation = validateLearnerResponse(value.learnerResponse);
  if (!responseValidation.valid) {
    responseValidation.errors.forEach((message) => errors.push(`Embedded learnerResponse: ${message}`));
  }
  const reviewValidation = validateTeacherReview(value.teacherReview, { learnerResponse: value.learnerResponse });
  if (!reviewValidation.valid) {
    reviewValidation.errors.forEach((message) => errors.push(`Embedded teacherReview: ${message}`));
  }
  if (isPlainObject(value.teacherReview) && isPlainObject(value.learnerResponse)
    && value.teacherReview.responseId !== value.learnerResponse.id) {
    errors.push("Embedded teacherReview responseId does not match the embedded learnerResponse id.");
  }

  return { valid: errors.length === 0, errors };
}

// --- Remediation Translation Document provenance --------------------------------------------------

// A Translation Document only needs this check when it claims to be remediation material
// (provenance.purpose === "remediation"). Ordinary documents are untouched. This never trusts the
// provenance fields at face value: sourceResponseId/sourceReviewId must resolve to real local
// records, and the review must actually belong to that response.
export function validateRemediationProvenance(document, { learnerResponses = [], teacherReviews = [] } = {}) {
  const provenance = document?.provenance;
  if (!isPlainObject(provenance) || provenance.purpose !== "remediation") {
    return { valid: true, errors: [] };
  }

  const errors = [];
  if (!nonEmptyString(provenance.sourceResponseId)) errors.push("Remediation provenance requires sourceResponseId.");
  if (!nonEmptyString(provenance.sourceReviewId)) errors.push("Remediation provenance requires sourceReviewId.");

  const sourceResponse = nonEmptyString(provenance.sourceResponseId)
    ? learnerResponses.find((item) => item?.id === provenance.sourceResponseId)
    : undefined;
  if (nonEmptyString(provenance.sourceResponseId) && !sourceResponse) {
    errors.push(`Remediation provenance sourceResponseId does not match any known Learner Response: ${provenance.sourceResponseId}`);
  }

  const sourceReview = nonEmptyString(provenance.sourceReviewId)
    ? teacherReviews.find((item) => item?.id === provenance.sourceReviewId)
    : undefined;
  if (nonEmptyString(provenance.sourceReviewId) && !sourceReview) {
    errors.push(`Remediation provenance sourceReviewId does not match any known Teacher Review: ${provenance.sourceReviewId}`);
  }

  if (sourceReview && nonEmptyString(provenance.sourceResponseId) && sourceReview.responseId !== provenance.sourceResponseId) {
    errors.push("Remediation provenance sourceReviewId belongs to a different Learner Response than sourceResponseId.");
  }
  if (nonEmptyString(provenance.sourceMaterialId) && sourceResponse
    && provenance.sourceMaterialId !== sourceResponse.material?.id) {
    errors.push("Remediation provenance sourceMaterialId does not match the source Learner Response material identity.");
  }

  return { valid: errors.length === 0, errors };
}

// Reuses the existing M6.2 Translation Document JSON parser/validator (kept forward-tolerant for
// ordinary local import/export), adding the stricter version gate that the external interchange
// boundary requires. Ordinary (non-remediation) Translation Document import is unaffected.
export function parseRemediationTranslationDocumentText(text) {
  const { document, errors } = parseTranslationDocumentJsonText(text);
  if (!document) return { document: null, errors };
  if (!SUPPORTED_REMEDIATION_DOCUMENT_VERSIONS.includes(document.schemaVersion)) {
    return { document: null, errors: [`Unsupported Translation Document schema version: ${document.schemaVersion}`] };
  }
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

function isDeepEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => isDeepEqual(item, right[index]));
  }
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (!isDeepEqual(leftKeys, rightKeys)) return false;
  return leftKeys.every((key) => isDeepEqual(left[key], right[key]));
}
