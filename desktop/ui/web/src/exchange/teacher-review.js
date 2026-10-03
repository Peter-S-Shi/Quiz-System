// Teacher Review contract: normalization, validation (local and the stricter canonical form used for EXTERNAL imports),
// and the import classification. A faithful port of the V1 modules (src/core/interchange.js, review-transport.js) - the
// rules are the public Teacher Review contract - pinned to the unchanged V1 code by a differential test.
import { CORRECTION_COLORS, STYLE_TYPES, correctionsConflict, validateCorrectionShape } from "./corrections.js";

export const INTERCHANGE_SCHEMA_VERSION = 1;

export const DOCUMENT_TYPES = Object.freeze({
  LEARNER_RESPONSE: "quiz-studio.learner-response",
  TEACHER_REVIEW: "quiz-studio.teacher-review",
});

const ACTOR_TYPES = new Set(["anonymous", "human", "external-ai", "agent", "system"]);
const REVIEW_JUDGMENTS = new Set(["correct", "incorrect", "partial", "needs-review"]);
const LEARNER_ANNOTATION_KINDS = new Set(["unknown", "uncertain", "should_know"]);
const TEACHER_REVIEW_KEYS = new Set([
  "schemaVersion",
  "documentType",
  "id",
  "responseId",
  "createdAt",
  "reviewer",
  "summary",
  "itemReviews",
  "remediationRecommendations",
  "extensions",
]);
const ITEM_REVIEW_KEYS = new Set([
  "itemId",
  "judgment",
  "comment",
  "tags",
  "suggestedRevision",
  "corrections",
  "extensions",
]);
const CORRECTION_KEYS = new Set([
  "id",
  "operation",
  "start",
  "end",
  "anchoredText",
  "text",
  "styleType",
  "color",
  "createdAt",
]);

export function normalizeActor(value = {}) {
  const type = ACTOR_TYPES.has(value?.type) ? value.type : "anonymous";
  const normalized = { type };
  if (typeof value?.displayLabel === "string" && value.displayLabel.trim()) {
    normalized.displayLabel = value.displayLabel.trim();
  }
  if (typeof value?.toolName === "string" && value.toolName.trim()) {
    normalized.toolName = value.toolName.trim();
  }
  return normalized;
}

export function normalizeTeacherReview(value = {}) {
  return {
    schemaVersion: Number(value.schemaVersion) || INTERCHANGE_SCHEMA_VERSION,
    documentType: value.documentType || DOCUMENT_TYPES.TEACHER_REVIEW,
    id: String(value.id || ""),
    responseId: String(value.responseId || ""),
    createdAt: String(value.createdAt || ""),
    reviewer: normalizeActor(value.reviewer),
    ...(typeof value.summary === "string" ? { summary: value.summary } : {}),
    itemReviews: Array.isArray(value.itemReviews)
      ? value.itemReviews.map((item) => ({
        itemId: String(item?.itemId || ""),
        ...(typeof item?.judgment === "string" ? { judgment: item.judgment } : {}),
        ...(typeof item?.comment === "string" ? { comment: item.comment } : {}),
        ...(Array.isArray(item?.tags) ? { tags: item.tags.map(String) } : {}),
        ...(typeof item?.suggestedRevision === "string" ? { suggestedRevision: item.suggestedRevision } : {}),
        ...(Array.isArray(item?.corrections) && item.corrections.length
          ? {
            corrections: item.corrections.map((correction) => ({
              id: String(correction?.id || ""),
              operation: String(correction?.operation || ""),
              start: Number(correction?.start),
              end: Number(correction?.end),
              anchoredText: String(correction?.anchoredText ?? ""),
              ...(typeof correction?.text === "string" ? { text: correction.text } : {}),
              ...(typeof correction?.styleType === "string" ? { styleType: correction.styleType } : {}),
              ...(typeof correction?.color === "string" ? { color: correction.color } : {}),
              createdAt: String(correction?.createdAt || ""),
            })),
          }
          : {}),
        ...(isPlainObject(item?.extensions) ? { extensions: cloneValue(item.extensions) } : {}),
      }))
      : [],
    remediationRecommendations: Array.isArray(value.remediationRecommendations)
      ? cloneValue(value.remediationRecommendations)
      : [],
    ...(isPlainObject(value.extensions) ? { extensions: cloneValue(value.extensions) } : {}),
  };
}

export function validateTeacherReview(value, options = {}) {
  const errors = [];
  if (!isPlainObject(value)) return invalid("Teacher Review must be an object.");

  Object.keys(value).forEach((key) => {
    if (!TEACHER_REVIEW_KEYS.has(key)) errors.push(`Unsupported Teacher Review field: ${key}`);
  });
  if (value.documentType !== DOCUMENT_TYPES.TEACHER_REVIEW) errors.push("Invalid Teacher Review documentType.");
  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1) errors.push("Invalid Teacher Review schemaVersion.");
  if (!nonEmptyString(value.id)) errors.push("Teacher Review id is required.");
  if (!nonEmptyString(value.responseId)) errors.push("Teacher Review responseId is required.");
  if (!nonEmptyString(value.createdAt)) errors.push("Teacher Review createdAt is required.");
  if (!isPlainObject(value.reviewer) || !ACTOR_TYPES.has(value.reviewer.type)) errors.push("Teacher Review reviewer type is invalid.");
  if (!Array.isArray(value.itemReviews)) errors.push("Teacher Review itemReviews must be an array.");

  const response = options.learnerResponse;
  if (response && value.responseId !== response.id) errors.push("Teacher Review responseId does not match the protected Learner Response.");
  const knownItemIds = new Set(response?.responses?.map((item) => item.itemId) || []);
  const answerByItemId = new Map();
  (response?.responses || []).forEach((item) => {
    if (nonEmptyString(item?.itemId) && typeof item.answer === "string") answerByItemId.set(item.itemId, item.answer);
  });
  const reviewedItemIds = new Set();
  const correctionIds = new Set();
  (Array.isArray(value.itemReviews) ? value.itemReviews : []).forEach((item) => {
    if (!isPlainObject(item)) {
      errors.push("Each Teacher Review item must be an object.");
      return;
    }
    Object.keys(item).forEach((key) => {
      if (!ITEM_REVIEW_KEYS.has(key)) errors.push(`Unsupported Teacher Review item field: ${key}`);
    });
    if (!nonEmptyString(item.itemId)) errors.push("Each Teacher Review item requires an itemId.");
    if (reviewedItemIds.has(item.itemId)) errors.push(`Duplicate Teacher Review itemId: ${item.itemId}`);
    reviewedItemIds.add(item.itemId);
    if (response && !knownItemIds.has(item.itemId)) errors.push(`Teacher Review references unknown itemId: ${item.itemId}`);
    if (item.judgment && !REVIEW_JUDGMENTS.has(item.judgment)) errors.push(`Invalid Teacher Review judgment: ${item.judgment}`);

    if (Object.prototype.hasOwnProperty.call(item, "corrections")) {
      if (!Array.isArray(item.corrections)) {
        errors.push(`Teacher Review corrections for itemId ${item.itemId || "unknown"} must be an array.`);
      } else {
        const anchoredCorrections = [];
        const answerText = answerByItemId.get(item.itemId);

        item.corrections.forEach((correction, index) => {
          if (!isPlainObject(correction)) {
            errors.push(`Correction ${index} for itemId ${item.itemId || "unknown"} must be an object.`);
            return;
          }
          Object.keys(correction).forEach((key) => {
            if (!CORRECTION_KEYS.has(key)) errors.push(`Unsupported correction field: ${key}`);
          });
          if (!nonEmptyString(correction.id)) errors.push(`Correction ${index} requires an id.`);
          else if (correctionIds.has(correction.id)) errors.push(`Duplicate correction id: ${correction.id}`);
          else correctionIds.add(correction.id);

          const shape = validateCorrectionShape(correction);
          if (!shape.valid) {
            shape.errors.forEach((message) => errors.push(`Correction ${index}: ${message}`));
            return;
          }

          if (!response) return;
          if (typeof answerText !== "string") {
            errors.push(`Correction ${index} references an item with no learner answer text.`);
            return;
          }
          if (correction.end > answerText.length) {
            errors.push(`Correction ${index} range is outside the learner answer.`);
          } else if (answerText.slice(correction.start, correction.end) !== correction.anchoredText) {
            errors.push(`Correction ${index} anchoredText does not match the learner answer.`);
          } else {
            anchoredCorrections.push(correction);
          }
        });

        for (let i = 0; i < anchoredCorrections.length; i += 1) {
          for (let j = i + 1; j < anchoredCorrections.length; j += 1) {
            if (correctionsConflict(anchoredCorrections[i], anchoredCorrections[j])) {
              errors.push(`Corrections for itemId ${item.itemId} conflict on overlapping content-changing operations.`);
            }
          }
        }
      }
    }
  });

  return { valid: errors.length === 0, errors };
}

// External imports must already conform to the canonical public contract. Local persistence paths
// remain backward-compatible and may continue to normalize older records before validation.
export function validateCanonicalTeacherReview(value, options = {}) {
  const validation = validateTeacherReview(value, options);
  const errors = [...validation.errors];
  if (!isPlainObject(value)) return { valid: false, errors };

  [
    "schemaVersion",
    "documentType",
    "id",
    "responseId",
    "createdAt",
    "reviewer",
    "itemReviews",
    "remediationRecommendations",
  ].forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`Teacher Review requires canonical field: ${key}`);
  });

  validateCanonicalActor(value.reviewer, "Teacher Review reviewer", errors);
  if (Object.prototype.hasOwnProperty.call(value, "summary") && typeof value.summary !== "string") {
    errors.push("Teacher Review summary must be a string.");
  }
  if (Object.prototype.hasOwnProperty.call(value, "extensions") && !isPlainObject(value.extensions)) {
    errors.push("Teacher Review extensions must be an object.");
  }
  if (!Array.isArray(value.remediationRecommendations)) {
    errors.push("Teacher Review remediationRecommendations must be an array.");
  } else {
    value.remediationRecommendations.forEach((item) => {
      if (!isPlainObject(item)) errors.push("Each Teacher Review remediation recommendation must be an object.");
    });
  }

  (Array.isArray(value.itemReviews) ? value.itemReviews : []).forEach((item) => {
    if (!isPlainObject(item)) return;
    if (Object.prototype.hasOwnProperty.call(item, "judgment") && !REVIEW_JUDGMENTS.has(item.judgment)) {
      errors.push(`Invalid Teacher Review judgment: ${item.judgment}`);
    }
    ["comment", "suggestedRevision"].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(item, key) && typeof item[key] !== "string") {
        errors.push(`Teacher Review item ${key} must be a string.`);
      }
    });
    if (Object.prototype.hasOwnProperty.call(item, "tags")
      && (!Array.isArray(item.tags) || item.tags.some((tag) => typeof tag !== "string"))) {
      errors.push("Teacher Review item tags must be an array of strings.");
    }
    if (Object.prototype.hasOwnProperty.call(item, "extensions") && !isPlainObject(item.extensions)) {
      errors.push("Teacher Review item extensions must be an object.");
    }
    (Array.isArray(item.corrections) ? item.corrections : []).forEach((correction) => {
      if (!isPlainObject(correction)) return;
      if (Object.prototype.hasOwnProperty.call(correction, "text") && typeof correction.text !== "string") {
        errors.push("Teacher Review correction text must be a string.");
      }
      if (Object.prototype.hasOwnProperty.call(correction, "styleType") && !STYLE_TYPES.includes(correction.styleType)) {
        errors.push(`Invalid correction styleType: ${correction.styleType}`);
      }
      if (Object.prototype.hasOwnProperty.call(correction, "color") && !CORRECTION_COLORS.includes(correction.color)) {
        errors.push(`Invalid correction color: ${correction.color}`);
      }
    });
  });

  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

function validateCanonicalActor(value, label, errors) {
  if (!isPlainObject(value)) return;
  Object.keys(value).forEach((key) => {
    if (!["type", "displayLabel", "toolName"].includes(key)) errors.push(`Unsupported ${label} field: ${key}`);
  });
  if (!Object.prototype.hasOwnProperty.call(value, "type")) errors.push(`${label} type is required.`);
  ["displayLabel", "toolName"].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(value, key) && typeof value[key] !== "string") {
      errors.push(`${label} ${key} must be a string.`);
    }
  });
}

export const SUPPORTED_TEACHER_REVIEW_IMPORT_VERSIONS = [1];

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

  const validation = validateCanonicalTeacherReview(raw, { learnerResponse });
  if (!validation.valid) return { review: null, errors: validation.errors };
  const normalized = normalizeTeacherReview(raw);
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

function invalid(message) {
  return { valid: false, errors: [message] };
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneValue(value) {
  return value === undefined ? undefined : structuredClone(value);
}
