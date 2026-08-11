// Translation history is a derived/index layer over canonical Learner Response and Teacher Review
// records. It never becomes a second source of truth: every entry is recomputed from those
// collections, so it stays reconstructible and safely refreshable, and it remains usable even after
// the originating live Translation Document has been deleted (evidence lives in the response
// snapshot, not in a live document lookup).

const NEEDS_WORK_JUDGMENTS = new Set(["incorrect", "partial", "needs-review"]);

export function isTranslationLearnerResponse(response) {
  return Boolean(response) && response.material?.type === "translation-document";
}

// Every learner-annotation kind and every review signal that can mark an item "needs work",
// unioned across every review for the response (not just the newest one) so the result is
// deterministic regardless of how many reviews exist or in what order they were imported.
export function deriveNeedsWorkItemIds(response, teacherReviews = []) {
  const items = response?.material?.snapshot?.items;
  if (!Array.isArray(items) || !items.length) return [];
  const itemIds = new Set(items.map((item) => item.id));
  const reasonsByItemId = new Map();

  const addReason = (itemId, reason) => {
    if (!itemIds.has(itemId)) return;
    if (!reasonsByItemId.has(itemId)) reasonsByItemId.set(itemId, new Set());
    reasonsByItemId.get(itemId).add(reason);
  };

  (Array.isArray(response.learnerAnnotations) ? response.learnerAnnotations : []).forEach((annotation) => {
    addReason(annotation.itemId, `annotation:${annotation.kind}`);
  });

  (Array.isArray(teacherReviews) ? teacherReviews : [])
    .filter((review) => review?.responseId === response.id)
    .forEach((review) => {
      (Array.isArray(review.itemReviews) ? review.itemReviews : []).forEach((itemReview) => {
        if (NEEDS_WORK_JUDGMENTS.has(itemReview.judgment)) addReason(itemReview.itemId, `judgment:${itemReview.judgment}`);
        if (Array.isArray(itemReview.corrections) && itemReview.corrections.length) addReason(itemReview.itemId, "hasCorrections");
      });
    });

  return items
    .filter((item) => reasonsByItemId.has(item.id))
    .map((item) => ({ itemId: item.id, reasons: Array.from(reasonsByItemId.get(item.id)) }));
}

// A single history entry, derived entirely from the response's own durable evidence plus whichever
// Teacher Reviews currently target it and whichever other responses were derived from it. Nothing
// here is persisted; it is safe to recompute on every render.
export function buildHistoryEntry(response, { teacherReviews = [], learnerResponses = [] } = {}) {
  const reviews = (Array.isArray(teacherReviews) ? teacherReviews : []).filter((review) => review.responseId === response.id);
  const needsWork = deriveNeedsWorkItemIds(response, teacherReviews);
  const derived = (Array.isArray(learnerResponses) ? learnerResponses : [])
    .filter((item) => item.provenance?.sourceResponseId === response.id);
  const purpose = response.provenance?.purpose || "practice";
  const hasRemediationChild = derived.some((item) => item.provenance?.purpose === "remediation");
  const hasRetryChild = derived.some((item) => item.provenance?.purpose === "retry");

  return {
    responseId: response.id,
    materialId: response.material.id,
    materialTitle: response.material.title,
    sourceLanguage: response.material.snapshot?.sourceLanguage || "",
    targetLanguage: response.material.snapshot?.targetLanguage || "",
    completedAt: response.finalizedAt || response.session?.completedAt || "",
    itemCount: response.summary?.itemCount || response.responses.length,
    learnerAnnotationCount: Array.isArray(response.learnerAnnotations) ? response.learnerAnnotations.length : 0,
    reviewCount: reviews.length,
    reviewSummaries: reviews.map((review) => ({ id: review.id, reviewer: review.reviewer, createdAt: review.createdAt })),
    needsWorkCount: needsWork.length,
    purpose,
    sourceResponseId: response.provenance?.sourceResponseId || null,
    sourceReviewId: response.provenance?.sourceReviewId || null,
    sourceMaterialId: response.provenance?.sourceMaterialId || null,
    hasRemediationChild,
    hasRetryChild,
  };
}

export function buildHistoryIndex(learnerResponses = [], teacherReviews = []) {
  const translationResponses = (Array.isArray(learnerResponses) ? learnerResponses : []).filter(isTranslationLearnerResponse);
  return translationResponses
    .map((response) => buildHistoryEntry(response, { teacherReviews, learnerResponses: translationResponses }))
    .sort((left, right) => new Date(right.completedAt) - new Date(left.completedAt));
}

// Derives a display status without persisting a second mutable flag: everything here is computed
// fresh from the entry's own fields on every call.
export function deriveEntryStatus(entry) {
  if (entry.reviewCount === 0) return "unreviewed";
  if (entry.reviewCount > 1) return "multiple-reviews";
  return "reviewed";
}

export function filterHistoryEntries(entries, filters = {}) {
  const purpose = filters.purpose || "all";
  const status = filters.status || "all";
  const sort = filters.sort || "newest";

  const filtered = entries.filter((entry) => {
    if (purpose !== "all" && entry.purpose !== purpose) return false;
    if (status === "unreviewed" && entry.reviewCount !== 0) return false;
    if (status === "reviewed" && entry.reviewCount === 0) return false;
    if (status === "needs-work" && entry.needsWorkCount === 0) return false;
    return true;
  });

  const sorted = filtered.slice().sort((left, right) => new Date(right.completedAt) - new Date(left.completedAt));
  if (sort === "oldest") sorted.reverse();
  return sorted;
}

// Walks a response's ancestry (source response -> optional source review, repeated) and finds any
// responses derived directly from it. A missing ancestor record is represented as unavailable
// rather than treated as an error: historical provenance may legitimately point to a record that
// was later deleted, unlike a Teacher Review's protected responseId link which must always resolve.
export function resolveResponseLineage(response, { learnerResponses = [], teacherReviews = [] } = {}) {
  const responseById = new Map(learnerResponses.map((item) => [item.id, item]));
  const reviewById = new Map(teacherReviews.map((item) => [item.id, item]));

  const ancestors = [];
  let current = response;
  const seen = new Set([response.id]);
  while (current?.provenance?.sourceResponseId) {
    const sourceResponseId = current.provenance.sourceResponseId;
    if (seen.has(sourceResponseId)) break;
    seen.add(sourceResponseId);
    const sourceResponse = responseById.get(sourceResponseId) || null;
    const sourceReviewId = current.provenance.sourceReviewId || null;
    const sourceReview = sourceReviewId ? reviewById.get(sourceReviewId) || null : null;
    ancestors.unshift({
      purpose: current.provenance.purpose || null,
      sourceResponseId,
      sourceResponseAvailable: Boolean(sourceResponse),
      sourceResponseTitle: sourceResponse?.material?.title || null,
      sourceReviewId,
      sourceReviewAvailable: sourceReviewId ? Boolean(sourceReview) : null,
      sourceReviewer: sourceReview?.reviewer || null,
      sourceMaterialId: current.provenance.sourceMaterialId || null,
    });
    if (!sourceResponse) break;
    current = sourceResponse;
  }

  const descendants = (Array.isArray(learnerResponses) ? learnerResponses : [])
    .filter((item) => item.provenance?.sourceResponseId === response.id)
    .map((item) => ({
      responseId: item.id,
      purpose: item.provenance?.purpose || null,
      materialTitle: item.material?.title || "",
      sourceReviewId: item.provenance?.sourceReviewId || null,
      completedAt: item.finalizedAt || item.session?.completedAt || "",
    }));

  return { ancestors, descendants };
}
