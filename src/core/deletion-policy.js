// Pure dependency analysis for M6 deletion safety. These functions never mutate or delete anything
// themselves -- callers use the result to decide whether to block, warn, or cascade, and to render a
// plain-language warning before an irreversible action.

// A live Translation Document carries no canonical evidence itself; deleting it never removes
// Learner Responses (they hold their own material snapshot). This only reports how many exist so the
// deletion warning can mention them.
export function analyzeTranslationDocumentDeletion(documentId, { learnerResponses = [] } = {}) {
  const dependentResponseIds = (Array.isArray(learnerResponses) ? learnerResponses : [])
    .filter((response) => response.material?.id === documentId)
    .map((response) => response.id);
  return { documentId, dependentResponseIds, hasDependents: dependentResponseIds.length > 0 };
}

// Deleting a Learner Response is high impact: Teacher Reviews are protected by a responseId link
// that must always resolve, so they cannot be left pointing at nothing and must be cascade-deleted
// together with the response. Responses derived from it (retry/remediation) are independent evidence
// with their own value, so they are never deleted; their sourceResponseId simply becomes a safe,
// explicitly-represented "unavailable" historical reference afterward.
export function analyzeLearnerResponseDeletion(responseId, { teacherReviews = [], learnerResponses = [] } = {}) {
  const dependentReviewIds = (Array.isArray(teacherReviews) ? teacherReviews : [])
    .filter((review) => review.responseId === responseId)
    .map((review) => review.id);
  const dependentResponseIds = (Array.isArray(learnerResponses) ? learnerResponses : [])
    .filter((response) => response.provenance?.sourceResponseId === responseId)
    .map((response) => response.id);
  return {
    responseId,
    dependentReviewIds,
    dependentResponseIds,
    hasDependents: dependentReviewIds.length > 0 || dependentResponseIds.length > 0,
  };
}

// Deleting a Teacher Review never mutates its Learner Response. A retry/remediation response may
// carry sourceReviewId pointing at it; that reference is historical (not a canonical link the review
// must satisfy), so it is reported here only so the UI can warn the user, not to block the deletion.
export function analyzeTeacherReviewDeletion(reviewId, { learnerResponses = [] } = {}) {
  const dependentResponseIds = (Array.isArray(learnerResponses) ? learnerResponses : [])
    .filter((response) => response.provenance?.sourceReviewId === reviewId)
    .map((response) => response.id);
  return { reviewId, dependentResponseIds, hasDependents: dependentResponseIds.length > 0 };
}
