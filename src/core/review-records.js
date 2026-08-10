import { normalizeTeacherReview, validateTeacherReview } from "./interchange.js";

export function parseTeacherReviewCollection(value, options = {}) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new TypeError("Teacher Review collection must be an array.");

  return value.map((item, index) => {
    const normalized = normalizeTeacherReview(item);
    const learnerResponse = findResponseForReview(options.learnerResponses, normalized.responseId);
    const validation = validateTeacherReview(normalized, { learnerResponse });
    if (!validation.valid) {
      throw new TypeError(`Invalid Teacher Review at index ${index}: ${validation.errors.join(" ")}`);
    }
    return normalized;
  });
}

export function upsertTeacherReview(collection, review, options = {}) {
  const normalized = normalizeTeacherReview(review);
  const learnerResponse = options.learnerResponse
    || findResponseForReview(options.learnerResponses, normalized.responseId);
  const validation = validateTeacherReview(normalized, { learnerResponse });
  if (!validation.valid) throw new TypeError(validation.errors.join(" "));

  const existing = parseTeacherReviewCollection(collection, options);
  const previous = existing.find((item) => item.id === normalized.id);
  if (previous && previous.responseId !== normalized.responseId) {
    throw new TypeError(`Teacher Review ${normalized.id} cannot be reassigned to a different response.`);
  }

  return [normalized, ...existing.filter((item) => item.id !== normalized.id)];
}

export function findTeacherReviewForResponse(collection, responseId) {
  return parseTeacherReviewCollection(collection).find((item) => item.responseId === responseId) || null;
}

function findResponseForReview(learnerResponses, responseId) {
  if (!Array.isArray(learnerResponses)) return undefined;
  return learnerResponses.find((item) => item?.id === responseId);
}
