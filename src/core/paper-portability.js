import { normalizePaper } from "./migrations.js";
import { validateItemsMediaIntegrity, validateMediaAssetsMap } from "./media-references.js";

export const PORTABLE_PAPER_SCHEMA_VERSION = 2;
export const PORTABLE_PAPER_DOCUMENT_TYPE = "quiz-studio.quiz-paper";

/**
 * Validates media referential integrity for a paper and its bundled assets.
 */
export function validatePaperMediaIntegrity(paper, assets = []) {
  if (!paper || typeof paper !== "object" || !Array.isArray(paper.questions)) {
    throw new TypeError("Invalid paper structure: expected questions array.");
  }

  const assetMap = validateMediaAssetsMap(assets);
  validateItemsMediaIntegrity(paper.questions, assetMap, `Question in paper "${paper.title || paper.id || "untitled"}"`);

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
