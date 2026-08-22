import { normalizePaper } from "./migrations.js";

export const PORTABLE_PAPER_SCHEMA_VERSION = 2;
export const PORTABLE_PAPER_DOCUMENT_TYPE = "quiz-studio.quiz-paper";

/**
 * Creates a self-contained portable paper export envelope with bundled media assets.
 */
export function createPortablePaperPackage(paper, assets = [], options = {}) {
  const normalizedPaper = normalizePaper(paper);
  const exportedAt = options.exportedAt || new Date().toISOString();

  return {
    schemaVersion: PORTABLE_PAPER_SCHEMA_VERSION,
    documentType: PORTABLE_PAPER_DOCUMENT_TYPE,
    exportedAt,
    paper: normalizedPaper,
    assets: Array.isArray(assets) ? structuredClone(assets) : [],
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

  // 1. Envelope format: { documentType: "quiz-studio.quiz-paper", paper: { ... }, assets: [...] }
  if (input.documentType === PORTABLE_PAPER_DOCUMENT_TYPE && input.paper && Array.isArray(input.paper.questions)) {
    return {
      paper: normalizePaper(input.paper),
      assets: Array.isArray(input.assets) ? input.assets : [],
    };
  }

  // 2. Direct paper object with optional embedded assets array
  if (Array.isArray(input.questions)) {
    const assets = Array.isArray(input.assets) ? input.assets : (Array.isArray(input.mediaAssets) ? input.mediaAssets : []);
    return {
      paper: normalizePaper(input),
      assets,
    };
  }

  // 3. Fallback for nested paper without explicit documentType
  if (input.paper && Array.isArray(input.paper.questions)) {
    return {
      paper: normalizePaper(input.paper),
      assets: Array.isArray(input.assets) ? input.assets : [],
    };
  }

  throw new TypeError("Could not parse paper: missing valid questions array.");
}
