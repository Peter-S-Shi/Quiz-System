import { isSupportedAudioMime, isSupportedImageMime } from "./media-types.js";

/**
 * Validates a base64 transport string.
 */
export function isValidBase64TransportString(str) {
  if (typeof str !== "string" || !str.trim()) return false;
  const clean = str.startsWith("data:") ? str.split(",")[1] || "" : str.trim();
  if (!clean) return false;
  const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
  if (!base64Regex.test(clean)) return false;
  try {
    if (typeof atob === "function") {
      atob(clean);
      return true;
    }
    if (typeof Buffer !== "undefined") {
      Buffer.from(clean, "base64");
      return true;
    }
  } catch {
    return false;
  }
  return true;
}

/**
 * Validates an array of media asset records, ensuring non-empty decodable payloads,
 * supported MIME types, and non-conflicting IDs. Returns a Map of validated assets by ID.
 */
export function validateMediaAssetsMap(assets = []) {
  if (!Array.isArray(assets)) {
    throw new TypeError("Invalid media assets: expected an array.");
  }

  const assetMap = new Map();
  for (const asset of assets) {
    if (!asset || typeof asset !== "object" || typeof asset.id !== "string" || !asset.id.trim()) {
      throw new TypeError("Invalid media asset: missing or empty asset ID.");
    }
    const assetId = asset.id.trim();

    if (typeof asset.mimeType !== "string" || !asset.mimeType.trim()) {
      throw new TypeError(`Media asset "${assetId}" is missing a valid mimeType.`);
    }
    const mimeType = asset.mimeType.trim();
    if (!isSupportedImageMime(mimeType) && !isSupportedAudioMime(mimeType)) {
      throw new TypeError(`Media asset "${assetId}" has unsupported mimeType "${mimeType}".`);
    }

    // Payload verification
    const hasData = asset.data !== undefined;
    const hasBlob = asset.blob !== undefined;

    if (!hasData && !hasBlob) {
      throw new TypeError(`Media asset "${assetId}" is missing payload (must provide non-empty data or blob).`);
    }

    if (hasData) {
      if (typeof asset.data === "string") {
        if (!isValidBase64TransportString(asset.data)) {
          throw new TypeError(`Media asset "${assetId}" has an invalid or empty transport data payload.`);
        }
      } else if (asset.data instanceof Uint8Array || asset.data instanceof ArrayBuffer) {
        if (asset.data.byteLength === 0) {
          throw new TypeError(`Media asset "${assetId}" has an empty binary payload.`);
        }
      } else if (typeof Blob !== "undefined" && asset.data instanceof Blob) {
        if (asset.data.size === 0) {
          throw new TypeError(`Media asset "${assetId}" has an empty blob payload.`);
        }
      } else {
        throw new TypeError(`Media asset "${assetId}" has an unsupported data payload type.`);
      }
    }

    if (hasBlob) {
      if (asset.blob instanceof Uint8Array || asset.blob instanceof ArrayBuffer) {
        if (asset.blob.byteLength === 0) {
          throw new TypeError(`Media asset "${assetId}" has an empty blob payload.`);
        }
      } else if (typeof Blob !== "undefined" && asset.blob instanceof Blob) {
        if (asset.blob.size === 0) {
          throw new TypeError(`Media asset "${assetId}" has an empty blob payload.`);
        }
      } else if (!hasData) {
        throw new TypeError(`Media asset "${assetId}" has an invalid blob object.`);
      }
    }

    if (assetMap.has(assetId)) {
      const existing = assetMap.get(assetId);
      if (existing.mimeType !== mimeType || existing.data !== asset.data) {
        throw new TypeError(`Conflicting duplicate asset ID "${assetId}" found with different metadata or payload.`);
      }
    }

    assetMap.set(assetId, asset);
  }

  return assetMap;
}

/**
 * Validates that all question/item media references resolve to compatible assets in assetMap.
 */
export function validateItemsMediaIntegrity(items = [], assetMap = new Map(), contextLabel = "Item") {
  if (!Array.isArray(items)) return;

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    if (typeof item.image?.id === "string" && item.image.id.trim()) {
      const imageId = item.image.id.trim();
      const asset = assetMap.get(imageId);
      if (!asset) {
        throw new TypeError(`Referenced image asset "${imageId}" in ${contextLabel} is missing from the package.`);
      }
      if (!isSupportedImageMime(asset.mimeType)) {
        throw new TypeError(`Referenced image asset "${imageId}" in ${contextLabel} has incompatible image MIME type "${asset.mimeType}".`);
      }
    }

    if (typeof item.audio?.id === "string" && item.audio.id.trim()) {
      const audioId = item.audio.id.trim();
      const asset = assetMap.get(audioId);
      if (!asset) {
        throw new TypeError(`Referenced audio asset "${audioId}" in ${contextLabel} is missing from the package.`);
      }
      if (!isSupportedAudioMime(asset.mimeType)) {
        throw new TypeError(`Referenced audio asset "${audioId}" in ${contextLabel} has incompatible audio MIME type "${asset.mimeType}".`);
      }
    }
  }
}

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
