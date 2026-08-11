// Pure dependency analysis for M6 deletion safety. These functions never mutate or delete anything
// themselves -- callers use the result to decide whether to block, warn, or cascade, and to render a
// plain-language warning before an irreversible action.

// A live remediation Translation Document is a canonical record that actively claims a lineage
// (provenance.sourceResponseId / sourceReviewId) rather than merely carrying historical evidence of
// one. Unlike a finalized Learner Response's own provenance -- which may safely reference a
// since-deleted source and remain valid, unresolved historical lineage -- a *live* remediation
// document's claimed source must keep resolving for as long as the document exists locally, or
// parseLibraryBackup()'s cross-validation would reject the next backup. Dependency analysis reports
// these separately (`dependentRemediationDocumentIds` / `hasBlockingDependents`) so callers can block
// the deletion outright instead of cascading through it.
function isRemediationDocument(document) {
  return document?.provenance?.purpose === "remediation";
}

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
// explicitly-represented "unavailable" historical reference afterward. A *live* remediation
// Translation Document that still claims this response as its sourceResponseId is different: it is
// canonical, not historical, so its presence blocks the deletion outright rather than merely warning.
export function analyzeLearnerResponseDeletion(responseId, { teacherReviews = [], learnerResponses = [], translationDocuments = [] } = {}) {
  const dependentReviewIds = (Array.isArray(teacherReviews) ? teacherReviews : [])
    .filter((review) => review.responseId === responseId)
    .map((review) => review.id);
  const dependentResponseIds = (Array.isArray(learnerResponses) ? learnerResponses : [])
    .filter((response) => response.provenance?.sourceResponseId === responseId)
    .map((response) => response.id);
  const dependentRemediationDocumentIds = (Array.isArray(translationDocuments) ? translationDocuments : [])
    .filter((document) => isRemediationDocument(document) && document.provenance?.sourceResponseId === responseId)
    .map((document) => document.id);
  return {
    responseId,
    dependentReviewIds,
    dependentResponseIds,
    dependentRemediationDocumentIds,
    hasDependents: dependentReviewIds.length > 0 || dependentResponseIds.length > 0,
    hasBlockingDependents: dependentRemediationDocumentIds.length > 0,
  };
}

// Deleting a Teacher Review never mutates its Learner Response. A retry/remediation *response* may
// carry sourceReviewId pointing at it; that reference is historical (not a canonical link the review
// must satisfy), so it is reported here only so the UI can warn the user, not to block the deletion.
// A *live* remediation Translation Document claiming this review as its sourceReviewId is canonical,
// not historical, and blocks the deletion outright for the same reason as above.
export function analyzeTeacherReviewDeletion(reviewId, { learnerResponses = [], translationDocuments = [] } = {}) {
  const dependentResponseIds = (Array.isArray(learnerResponses) ? learnerResponses : [])
    .filter((response) => response.provenance?.sourceReviewId === reviewId)
    .map((response) => response.id);
  const dependentRemediationDocumentIds = (Array.isArray(translationDocuments) ? translationDocuments : [])
    .filter((document) => isRemediationDocument(document) && document.provenance?.sourceReviewId === reviewId)
    .map((document) => document.id);
  return {
    reviewId,
    dependentResponseIds,
    dependentRemediationDocumentIds,
    hasDependents: dependentResponseIds.length > 0,
    hasBlockingDependents: dependentRemediationDocumentIds.length > 0,
  };
}
