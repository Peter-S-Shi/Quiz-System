/**
 * Collects all media IDs referenced by live papers, active sessions, and finalized learner responses.
 */
export function collectReferencedMediaIds({
  library = null,
  session = null,
  learnerResponses = [],
  activePaper = null,
} = {}) {
  const referencedIds = new Set();

  function scanQuestion(question) {
    if (!question || typeof question !== "object") return;
    if (typeof question.image?.id === "string" && question.image.id.trim()) {
      referencedIds.add(question.image.id.trim());
    }
    if (typeof question.audio?.id === "string" && question.audio.id.trim()) {
      referencedIds.add(question.audio.id.trim());
    }
  }

  function scanPaper(paper) {
    if (!paper || typeof paper !== "object" || !Array.isArray(paper.questions)) return;
    paper.questions.forEach(scanQuestion);
  }

  // 1. Live Library Papers
  if (library && Array.isArray(library.papers)) {
    library.papers.forEach(scanPaper);
  }

  // 2. Active Paper (if not in library or draft)
  if (activePaper) {
    scanPaper(activePaper);
  }

  // 3. Active Session Snapshots
  if (session && Array.isArray(session.questions)) {
    session.questions.forEach(scanQuestion);
  }

  // 4. Finalized Learner Responses (Historical Evidence Snapshots)
  if (Array.isArray(learnerResponses)) {
    learnerResponses.forEach((response) => {
      const items = response?.material?.snapshot?.items;
      if (Array.isArray(items)) {
        items.forEach(scanQuestion);
      }
    });
  }

  return referencedIds;
}

/**
 * Returns array of media asset IDs that are in storedIds but NOT in referencedIds.
 */
export function findOrphanedMediaIds(storedIds = [], referencedIds = new Set()) {
  const orphans = [];
  for (const id of storedIds) {
    if (!referencedIds.has(id)) {
      orphans.push(id);
    }
  }
  return orphans;
}

/**
 * Conservative reference-aware media cleanup.
 * Removes assets only if they are not referenced in library papers, active session, or finalized evidence.
 */
export async function cleanupOrphanedMedia(mediaStore, {
  library = null,
  session = null,
  learnerResponses = [],
  activePaper = null,
  candidateAssetIds = [],
} = {}) {
  if (!mediaStore) return [];

  const referencedIds = collectReferencedMediaIds({
    library,
    session,
    learnerResponses,
    activePaper,
  });

  const targetsToCheck = candidateAssetIds && candidateAssetIds.length > 0
    ? candidateAssetIds
    : await mediaStore.listMediaAssetIds();

  const deletedIds = [];
  for (const id of targetsToCheck) {
    if (!referencedIds.has(id)) {
      await mediaStore.deleteMediaAsset(id);
      deletedIds.push(id);
    }
  }

  return deletedIds;
}
