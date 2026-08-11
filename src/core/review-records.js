import { normalizeTeacherReview, validateTeacherReview } from "./interchange.js";

export function parseTeacherReviewCollection(value, options = {}) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new TypeError("Teacher Review collection must be an array.");

  const seenIds = new Set();
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
    // A response may legitimately hold multiple reviews, but each review id is its own stable
    // identity and must be unique within the collection (mirrors upsertTeacherReview()'s live
    // dedupe-by-id behavior for the bulk/backup-restore parsing path).
    if (seenIds.has(normalized.id)) throw new TypeError(`Duplicate Teacher Review id: ${normalized.id}`);
    seenIds.add(normalized.id);
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

  // Re-parse the existing collection structurally only (not against `options`'s response context):
  // that context describes the review being upserted, and the collection may legitimately hold
  // reviews for other responses too. Entries already went through full validation when they were
  // first persisted, so a structural re-check here is sufficient and avoids rejecting valid
  // unrelated reviews just because they don't match this call's single response context.
  const existing = parseTeacherReviewCollection(collection);
  const previous = existing.find((item) => item.id === normalized.id);
  if (previous && previous.responseId !== normalized.responseId) {
    throw new TypeError(`Teacher Review ${normalized.id} cannot be reassigned to a different response.`);
  }

  return [normalized, ...existing.filter((item) => item.id !== normalized.id)];
}

// Deletes exactly one Teacher Review by its stable id. Never mutates the Learner Response it
// targets; a retry/remediation response that carried this review's id as sourceReviewId simply
// becomes an unresolved (but safely represented) historical reference afterward.
export function removeTeacherReview(collection, reviewId) {
  return parseTeacherReviewCollection(collection).filter((item) => item.id !== reviewId);
}

// Cascade-delete helper for when the target Learner Response itself is being removed: every review
// pointing at that response is deleted alongside it, since a Teacher Review's responseId is a
// protected link that must always resolve to a real response.
export function removeTeacherReviewsForResponse(collection, responseId) {
  return parseTeacherReviewCollection(collection).filter((item) => item.responseId !== responseId);
}

export function findTeacherReviewForResponse(collection, responseId) {
  return parseTeacherReviewCollection(collection).find((item) => item.responseId === responseId) || null;
}

// A response may legitimately receive more than one Teacher Review (e.g. from different
// reviewers/tools). This returns every review for a response, newest first, so the UI can offer a
// deterministic picker instead of silently hiding all but one.
export function findTeacherReviewsForResponse(collection, responseId) {
  return parseTeacherReviewCollection(collection).filter((item) => item.responseId === responseId);
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
