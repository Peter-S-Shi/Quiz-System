import { makeId } from "./utils.js";

export const ANNOTATION_KINDS = ["unknown", "uncertain", "should_know"];

export function createAnnotation({ id = makeId(), kind, start, end, text, createdAt = new Date().toISOString() }) {
  return { id, kind, start, end, text, createdAt };
}

export function validateAnnotation(annotation, answerText) {
  const errors = [];
  if (!isPlainObject(annotation)) return invalid("Annotation must be an object.");
  if (!nonEmptyString(annotation.id)) errors.push("Annotation id is required.");
  if (!ANNOTATION_KINDS.includes(annotation.kind)) errors.push(`Invalid annotation kind: ${annotation.kind}`);
  if (!Number.isInteger(annotation.start) || annotation.start < 0) errors.push("Annotation start must be a non-negative integer.");
  if (!Number.isInteger(annotation.end) || annotation.end <= annotation.start) errors.push("Annotation end must be an integer greater than start.");
  if (typeof annotation.text !== "string" || !annotation.text.length) errors.push("Annotation text is required.");
  if (!nonEmptyString(annotation.createdAt)) errors.push("Annotation createdAt is required.");

  if (
    typeof answerText === "string"
    && Number.isInteger(annotation.start)
    && Number.isInteger(annotation.end)
    && typeof annotation.text === "string"
  ) {
    if (annotation.end > answerText.length) errors.push("Annotation end exceeds the answer length.");
    else if (answerText.slice(annotation.start, annotation.end) !== annotation.text) {
      errors.push("Annotation text does not match the anchored answer span.");
    }
  }

  return { valid: errors.length === 0, errors };
}

export function addAnnotation(existing, draft, answerText) {
  const annotation = createAnnotation(draft);
  const validation = validateAnnotation(annotation, answerText);
  if (!validation.valid) throw new TypeError(validation.errors.join(" "));

  const list = Array.isArray(existing) ? existing : [];
  const exactMatch = list.find((item) => item.start === annotation.start && item.end === annotation.end);
  if (exactMatch) {
    return list.map((item) => (item.id === exactMatch.id
      ? { ...exactMatch, kind: annotation.kind, text: annotation.text, createdAt: annotation.createdAt }
      : item));
  }
  if (list.some((item) => rangesOverlap(item, annotation))) {
    throw new TypeError("This span overlaps an existing mark. Remove or adjust the existing mark first.");
  }
  return [...list, annotation];
}

export function removeAnnotation(existing, annotationId) {
  return (Array.isArray(existing) ? existing : []).filter((item) => item.id !== annotationId);
}

export function changeAnnotationKind(existing, annotationId, kind) {
  if (!ANNOTATION_KINDS.includes(kind)) throw new TypeError(`Invalid annotation kind: ${kind}`);
  return (Array.isArray(existing) ? existing : []).map((item) => (item.id === annotationId ? { ...item, kind } : item));
}

export function revalidateAnnotations(existing, answerText) {
  return (Array.isArray(existing) ? existing : []).filter((item) => validateAnnotation(item, answerText).valid);
}

export function normalizeAnnotationList(value, answerText) {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set();
  const result = [];
  value.forEach((item) => {
    if (!isPlainObject(item) || !nonEmptyString(item.id) || seenIds.has(item.id)) return;
    const candidate = {
      id: item.id,
      kind: item.kind,
      start: item.start,
      end: item.end,
      text: item.text,
      createdAt: nonEmptyString(item.createdAt) ? item.createdAt : new Date(0).toISOString(),
    };
    if (!validateAnnotation(candidate, answerText).valid) return;
    seenIds.add(candidate.id);
    result.push(candidate);
  });
  return result;
}

function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
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
