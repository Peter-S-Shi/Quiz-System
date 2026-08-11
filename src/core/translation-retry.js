import { makeId } from "./utils.js";

// Builds an ephemeral, document-shaped object from a historical Learner Response snapshot so it can
// be handed directly to createTranslationSession() -- retry never reads or depends on the live
// Translation Library, so it keeps working even if the original document was edited or deleted.
// The result is never persisted as a library document; it exists only long enough to start a new
// practice session with a stable new material/session/response identity of its own.
export function buildRetryMaterial({ response, itemIds, sourceReviewId, createdAt = new Date().toISOString() } = {}) {
  if (!isPlainObject(response) || !isPlainObject(response.material) || !isPlainObject(response.material.snapshot)) {
    throw new TypeError("A finalized Learner Response with a material snapshot is required to retry.");
  }
  const snapshotItems = Array.isArray(response.material.snapshot.items) ? response.material.snapshot.items : [];
  if (!snapshotItems.length) throw new TypeError("The source response has no item snapshots to retry.");

  const selectedIds = Array.isArray(itemIds) ? itemIds : snapshotItems.map((item) => item.id);
  const selectedIdSet = new Set(selectedIds);
  const sourceItems = snapshotItems.filter((item) => selectedIdSet.has(item.id));
  if (!sourceItems.length) throw new TypeError("At least one item is required to retry.");

  const items = sourceItems.map((item) => {
    const next = { id: makeId(), sourceText: String(item.sourceText || "") };
    if (typeof item.referenceTranslation === "string") next.referenceTranslation = item.referenceTranslation;
    if (typeof item.notes === "string") next.notes = item.notes;
    return next;
  });

  return {
    id: makeId(),
    title: response.material.title || "",
    sourceLanguage: response.material.snapshot.sourceLanguage || "",
    targetLanguage: response.material.snapshot.targetLanguage || "",
    items,
    provenance: {
      purpose: "retry",
      sourceResponseId: response.id,
      ...(sourceReviewId ? { sourceReviewId } : {}),
      sourceMaterialId: response.material.id,
      createdAt,
    },
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
