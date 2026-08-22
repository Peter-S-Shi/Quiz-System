import { normalizePaper } from "./migrations.js";
import { isSupportedAudioMime, isSupportedImageMime } from "./media-types.js";

export const PORTABLE_PAPER_SCHEMA_VERSION = 2;
export const PORTABLE_PAPER_DOCUMENT_TYPE = "quiz-studio.quiz-paper";

/**
 * Validates media referential integrity for a paper and its bundled assets.
 */
export function validatePaperMediaIntegrity(paper, assets = []) {
  if (!paper || typeof paper !== "object" || !Array.isArray(paper.questions)) {
    throw new TypeError("Invalid paper structure: expected questions array.");
  }
  if (!Array.isArray(assets)) {
    throw new TypeError("Invalid assets structure: expected an array.");
  }

  const assetMap = new Map();
  for (const asset of assets) {
    if (!asset || typeof asset !== "object" || typeof asset.id !== "string" || !asset.id.trim()) {
      throw new TypeError("Invalid media asset: missing or empty asset ID.");
    }
    const assetId = asset.id.trim();

    if (assetMap.has(assetId)) {
      const existing = assetMap.get(assetId);
      if (existing.mimeType !== asset.mimeType || existing.data !== asset.data) {
        throw new TypeError(`Conflicting duplicate asset ID "${assetId}" found with different metadata or payload.`);
      }
    }

    if (typeof asset.mimeType !== "string" || !asset.mimeType.trim()) {
      throw new TypeError(`Media asset "${assetId}" is missing a valid mimeType.`);
    }

    if (asset.data !== undefined) {
      if (typeof asset.data === "string" && !asset.data.trim()) {
        throw new TypeError(`Media asset "${assetId}" has an empty payload.`);
      }
    } else if (asset.blob !== undefined) {
      if (asset.blob.size === 0 || asset.blob.byteLength === 0) {
        throw new TypeError(`Media asset "${assetId}" has an empty blob.`);
      }
    }

    assetMap.set(assetId, asset);
  }

  for (const question of paper.questions) {
    if (question.image?.id) {
      const imageId = question.image.id.trim();
      const asset = assetMap.get(imageId);
      if (!asset) {
        throw new TypeError(`Referenced image asset "${imageId}" on Question "${question.id || question.prompt}" is missing from the package.`);
      }
      if (!isSupportedImageMime(asset.mimeType)) {
        throw new TypeError(`Referenced image asset "${imageId}" has invalid or unsupported image MIME type "${asset.mimeType}".`);
      }
    }

    if (question.audio?.id) {
      const audioId = question.audio.id.trim();
      const asset = assetMap.get(audioId);
      if (!asset) {
        throw new TypeError(`Referenced audio asset "${audioId}" on Question "${question.id || question.prompt}" is missing from the package.`);
      }
      if (!isSupportedAudioMime(asset.mimeType)) {
        throw new TypeError(`Referenced audio asset "${audioId}" has invalid or unsupported audio MIME type "${asset.mimeType}".`);
      }
    }
  }

  return { valid: true };
}

/**
 * Creates a self-contained portable paper export envelope with bundled media assets.
 */
export function createPortablePaperPackage(paper, assets = [], options = {}) {
  const normalizedPaper = normalizePaper(paper);
  const exportedAt = options.exportedAt || new Date().toISOString();
  const safeAssets = Array.isArray(assets) ? structuredClone(assets) : [];

  validatePaperMediaIntegrity(normalizedPaper, safeAssets);

  return {
    schemaVersion: PORTABLE_PAPER_SCHEMA_VERSION,
    documentType: PORTABLE_PAPER_DOCUMENT_TYPE,
    exportedAt,
    paper: normalizedPaper,
    assets: safeAssets,
  };
}

/**
 * Parses a portable paper package, supporting both new self-contained media envelopes
 * and legacy plain paper JSON files.
 */
export function parsePortablePaperPackage(input) {
  if (!input || typeof input !== "object") {
    throw new TypeError("Invalid paper package: expected an object.");
  }

  let paper = null;
  let assets = [];

  // 1. Envelope format: { documentType: "quiz-studio.quiz-paper", paper: { ... }, assets: [...] }
  if (input.documentType === PORTABLE_PAPER_DOCUMENT_TYPE && input.paper && Array.isArray(input.paper.questions)) {
    paper = normalizePaper(input.paper);
    assets = Array.isArray(input.assets) ? input.assets : [];
  } else if (Array.isArray(input.questions)) {
    // 2. Direct paper object with optional embedded assets array
    paper = normalizePaper(input);
    assets = Array.isArray(input.assets) ? input.assets : (Array.isArray(input.mediaAssets) ? input.mediaAssets : []);
  } else if (input.paper && Array.isArray(input.paper.questions)) {
    // 3. Fallback for nested paper without explicit documentType
    paper = normalizePaper(input.paper);
    assets = Array.isArray(input.assets) ? input.assets : [];
  } else {
    throw new TypeError("Could not parse paper: missing valid questions array.");
  }

  validatePaperMediaIntegrity(paper, assets);

  return {
    paper,
    assets,
  };
}
