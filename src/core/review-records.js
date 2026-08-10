import { normalizeTeacherReview, validateTeacherReview } from "./interchange.js";

export function parseTeacherReviewCollection(value, options = {}) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new TypeError("Teacher Review collection must be an array.");

  return value.map((item, index) => {
    const normalized = normalizeTeacherReview(item);
    const { learnerResponse, hasContext } = resolveResponseContext(options, normalized.responseId);
    if (hasContext && !learnerResponse) {
      throw new TypeError(`Invalid Teacher Review at index ${index}: responseId "${normalized.responseId}" does not match any known Learner Response.`);
    }
    const validation = validateTeacherReview(normalized, { learnerResponse });
    if (!validation.valid) {
      throw new TypeError(`Invalid Teacher Review at index ${index}: ${validation.errors.join(" ")}`);
    }
    return normalized;
  });
}

export function upsertTeacherReview(collection, review, options = {}) {
  const normalized = normalizeTeacherReview(review);
  const { learnerResponse, hasContext } = resolveResponseContext(options, normalized.responseId);
  if (hasContext && !learnerResponse) {
    throw new TypeError(`Teacher Review responseId "${normalized.responseId}" does not match any known Learner Response.`);
  }
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

// A Learner Response "context" can be supplied either as one known-correct response
// (options.learnerResponse, used when the caller already resolved the specific response a review
// belongs to) or as a collection to search (options.learnerResponses, used for bulk parsing such as
// backup restore). When either form of context is explicitly supplied, every review must resolve to
// a real response — an orphan responseId is rejected rather than silently falling back to
// structural-only validation. Callers that pass neither (e.g. generic M6.0/public-contract shape
// checks with no Learner Response data available) keep the original context-free behavior.
function resolveResponseContext(options, responseId) {
  if (options.learnerResponse) {
    return { learnerResponse: options.learnerResponse, hasContext: true };
  }
  if (Array.isArray(options.learnerResponses)) {
    return { learnerResponse: findResponseForReview(options.learnerResponses, responseId), hasContext: true };
  }
  return { learnerResponse: undefined, hasContext: false };
}

function findResponseForReview(learnerResponses, responseId) {
  return learnerResponses.find((item) => item?.id === responseId);
}
