import { makeId } from "./utils.js";

export const INTERCHANGE_SCHEMA_VERSION = 1;

export const DOCUMENT_TYPES = Object.freeze({
  LEARNER_RESPONSE: "quiz-studio.learner-response",
  TEACHER_REVIEW: "quiz-studio.teacher-review",
});

const ACTOR_TYPES = new Set(["anonymous", "human", "external-ai", "agent", "system"]);
const REVIEW_JUDGMENTS = new Set(["correct", "incorrect", "partial", "needs-review"]);
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
  "extensions",
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

export function normalizeProvenance(value) {
  if (!isPlainObject(value)) return undefined;

  const normalized = {};
  copyOptionalString(value, normalized, "purpose");
  copyOptionalString(value, normalized, "sourceResponseId");
  copyOptionalString(value, normalized, "sourceReviewId");
  copyOptionalString(value, normalized, "sourceMaterialId");
  copyOptionalString(value, normalized, "createdAt");
  if (isPlainObject(value.author)) normalized.author = normalizeActor(value.author);
  if (isPlainObject(value.extensions)) normalized.extensions = cloneValue(value.extensions);
  return Object.keys(normalized).length ? normalized : undefined;
}

export function createQuizLearnerResponse({ id = makeId(), session }) {
  if (!isPlainObject(session) || !Array.isArray(session.questions)) {
    throw new TypeError("A quiz session with question snapshots is required.");
  }

  const items = cloneValue(session.questions);
  const responses = items.map((item, index) => ({
    itemId: item.id,
    answer: cloneValue(Object.prototype.hasOwnProperty.call(session.answers || {}, item.id)
      ? session.answers[item.id]
      : null),
    result: cloneValue(session.results?.[index] || null),
  }));

  return {
    schemaVersion: INTERCHANGE_SCHEMA_VERSION,
    documentType: DOCUMENT_TYPES.LEARNER_RESPONSE,
    id,
    status: "finalized",
    finalizedAt: session.completedAt || new Date().toISOString(),
    material: {
      type: "quiz-paper",
      id: session.paperId,
      title: session.paperTitle || "",
      snapshot: {
        items,
      },
    },
    session: {
      id: session.id,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    },
    responses,
    summary: {
      itemCount: items.length,
      correctCount: Number(session.correctCount || 0),
      percent: Number(session.percent || 0),
    },
    provenance: {
      purpose: "practice",
    },
  };
}

export function createTranslationLearnerResponse({ id = makeId(), session }) {
  if (!isPlainObject(session) || !Array.isArray(session.items) || !session.items.length) {
    throw new TypeError("A Translation session with item snapshots is required.");
  }

  const items = cloneValue(session.items);
  const responses = items.map((item) => ({
    itemId: item.id,
    answer: String(session.answers?.[item.id] ?? ""),
  }));

  return {
    schemaVersion: INTERCHANGE_SCHEMA_VERSION,
    documentType: DOCUMENT_TYPES.LEARNER_RESPONSE,
    id,
    status: "finalized",
    finalizedAt: session.completedAt || new Date().toISOString(),
    material: {
      type: "translation-document",
      id: session.documentId,
      title: session.documentTitle || "",
      snapshot: {
        items,
        sourceLanguage: session.sourceLanguage || "",
        targetLanguage: session.targetLanguage || "",
      },
    },
    session: {
      id: session.id,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    },
    responses,
    summary: {
      itemCount: items.length,
    },
    provenance: {
      purpose: "practice",
    },
  };
}

export function normalizeLearnerResponse(value = {}) {
  const provenance = normalizeProvenance(value.provenance);
  return {
    schemaVersion: Number(value.schemaVersion) || INTERCHANGE_SCHEMA_VERSION,
    documentType: value.documentType || DOCUMENT_TYPES.LEARNER_RESPONSE,
    id: String(value.id || ""),
    status: value.status || "finalized",
    finalizedAt: String(value.finalizedAt || ""),
    material: {
      type: String(value.material?.type || ""),
      id: String(value.material?.id || ""),
      title: String(value.material?.title || ""),
      snapshot: cloneValue(value.material?.snapshot || { items: [] }),
    },
    session: {
      id: String(value.session?.id || ""),
      startedAt: String(value.session?.startedAt || ""),
      completedAt: String(value.session?.completedAt || ""),
    },
    responses: Array.isArray(value.responses)
      ? value.responses.map((item) => ({
        itemId: String(item?.itemId || ""),
        answer: cloneValue(item?.answer ?? null),
        ...(Object.prototype.hasOwnProperty.call(item || {}, "result")
          ? { result: cloneValue(item.result) }
          : {}),
      }))
      : [],
    summary: {
      itemCount: Number(value.summary?.itemCount || 0),
      ...(Object.prototype.hasOwnProperty.call(value.summary || {}, "correctCount")
        ? { correctCount: Number(value.summary.correctCount) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(value.summary || {}, "percent")
        ? { percent: Number(value.summary.percent) }
        : {}),
    },
    ...(provenance ? { provenance } : {}),
    ...(isPlainObject(value.extensions) ? { extensions: cloneValue(value.extensions) } : {}),
  };
}

export function validateLearnerResponse(value) {
  const errors = [];
  if (!isPlainObject(value)) return invalid("Learner Response must be an object.");
  if (value.documentType !== DOCUMENT_TYPES.LEARNER_RESPONSE) errors.push("Invalid Learner Response documentType.");
  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1) errors.push("Invalid Learner Response schemaVersion.");
  if (!nonEmptyString(value.id)) errors.push("Learner Response id is required.");
  if (value.status !== "finalized") errors.push("Learner Response status must be finalized.");
  if (!nonEmptyString(value.finalizedAt)) errors.push("Learner Response finalizedAt is required.");
  if (!isPlainObject(value.material) || !nonEmptyString(value.material.id) || !nonEmptyString(value.material.type)) {
    errors.push("Learner Response material identity is required.");
  }
  const items = value.material?.snapshot?.items;
  if (!Array.isArray(items) || !items.length) errors.push("Learner Response material item snapshots are required.");
  if (!isPlainObject(value.session) || !nonEmptyString(value.session.id)) errors.push("Learner Response session identity is required.");
  if (!nonEmptyString(value.session?.startedAt)) errors.push("Learner Response session startedAt is required.");
  if (!nonEmptyString(value.session?.completedAt)) errors.push("Learner Response session completedAt is required.");
  if (!Array.isArray(value.responses) || !value.responses.length) errors.push("Learner Response responses are required.");

  const itemIds = new Set();
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!nonEmptyString(item?.id)) errors.push("Each material item snapshot requires an id.");
    else if (itemIds.has(item.id)) errors.push(`Duplicate material item id: ${item.id}`);
    else itemIds.add(item.id);
  });
  const responseIds = new Set();
  (Array.isArray(value.responses) ? value.responses : []).forEach((response) => {
    if (!nonEmptyString(response?.itemId)) {
      errors.push("Each learner response item requires an itemId.");
      return;
    }
    if (responseIds.has(response.itemId)) errors.push(`Duplicate learner response itemId: ${response.itemId}`);
    responseIds.add(response.itemId);
    if (!itemIds.has(response.itemId)) errors.push(`Learner response references unknown itemId: ${response.itemId}`);
  });
  itemIds.forEach((itemId) => {
    if (!responseIds.has(itemId)) errors.push(`Learner Response is missing response for itemId: ${itemId}`);
  });
  if (value.summary?.itemCount !== value.responses?.length) {
    errors.push("Learner Response summary itemCount must match the response count.");
  }
  if (value.material?.type === "quiz-paper") {
    (Array.isArray(value.responses) ? value.responses : []).forEach((response) => {
      if (!Object.prototype.hasOwnProperty.call(response, "result")) {
        errors.push(`Objective Quiz response ${response.itemId || "item"} requires a grading result.`);
      }
    });
    if (!Number.isInteger(value.summary?.correctCount) || value.summary.correctCount < 0) {
      errors.push("Objective Quiz Learner Response summary correctCount is required.");
    }
    if (typeof value.summary?.percent !== "number" || !Number.isFinite(value.summary.percent)
      || value.summary.percent < 0 || value.summary.percent > 100) {
      errors.push("Objective Quiz Learner Response summary percent is required.");
    }
  }

  return { valid: errors.length === 0, errors };
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
  const reviewedItemIds = new Set();
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
  });

  return { valid: errors.length === 0, errors };
}

export function toPortableLearnerResponse(value) {
  const normalized = normalizeLearnerResponse(value);
  const validation = validateLearnerResponse(normalized);
  if (!validation.valid) throw new TypeError(validation.errors.join(" "));
  return cloneValue(normalized);
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

function copyOptionalString(source, target, key) {
  if (typeof source[key] === "string" && source[key].trim()) target[key] = source[key].trim();
}
