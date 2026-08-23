import { CURRENT_SCHEMA_VERSION, normalizeLibrary } from "./migrations.js";
import { STORAGE_KEYS } from "../storage/local-storage.js";

export function bootstrapQuizLibrary({
  storage,
  createDefaultPaper,
  now = () => new Date().toISOString(),
} = {}) {
  const rawCanonical = storage.getItem(STORAGE_KEYS.LIBRARY);
  if (rawCanonical != null) {
    let candidate;
    try {
      candidate = JSON.parse(rawCanonical);
    } catch {
      const canPersist = preserveRecovery(storage, rawCanonical, "malformed-json", now);
      return {
        library: createSafeDefaultLibrary(createDefaultPaper),
        source: "canonical-invalid",
        canPersist,
      };
    }

    if (isSupportedCanonicalLibrary(candidate)) {
      const library = normalizeLibrary(candidate, { createDefaultPaper });
      const normalizedRaw = JSON.stringify(library);
      if (normalizedRaw !== rawCanonical) {
        const canPersist = preserveRecovery(storage, rawCanonical, "canonical-migration", now);
        if (canPersist) storage.setItem(STORAGE_KEYS.LIBRARY, normalizedRaw);
        return { library, source: "canonical", canPersist };
      }
      return { library, source: "canonical", canPersist: true };
    }

    const canPersist = preserveRecovery(storage, rawCanonical, "unsupported-canonical", now);
    return {
      library: createSafeDefaultLibrary(createDefaultPaper),
      source: "canonical-invalid",
      canPersist,
    };
  }

  const rawLegacy = storage.getItem(STORAGE_KEYS.LEGACY_PAPER);
  if (rawLegacy != null) {
    try {
      const legacyPaper = JSON.parse(rawLegacy);
      if (isSupportedLegacyPaper(legacyPaper)) {
        const library = normalizeLibrary({
          schemaVersion: CURRENT_SCHEMA_VERSION,
          papers: [legacyPaper],
        }, { createDefaultPaper });
        storage.setItem(STORAGE_KEYS.LIBRARY, JSON.stringify(library));
        return { library, source: "legacy-paper", canPersist: true };
      }
    } catch {
      // The legacy key remains untouched; a new canonical default can be created independently.
    }
  }

  const library = createSafeDefaultLibrary(createDefaultPaper);
  storage.setItem(STORAGE_KEYS.LIBRARY, JSON.stringify(library));
  return {
    library,
    source: "default",
    canPersist: true,
  };
}

function isSupportedLegacyPaper(value) {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && Array.isArray(value.questions);
}

function createSafeDefaultLibrary(createDefaultPaper) {
  return normalizeLibrary({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    papers: [createDefaultPaper()],
  }, { createDefaultPaper });
}

function isSupportedCanonicalLibrary(value) {
  const hasSchemaVersion = Object.prototype.hasOwnProperty.call(value || {}, "schemaVersion");
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && Array.isArray(value.papers)
    && value.papers.length > 0
    && value.papers.every((paper) => Boolean(paper)
      && typeof paper === "object"
      && !Array.isArray(paper)
      && Array.isArray(paper.questions))
    && (!hasSchemaVersion || (Number.isInteger(value.schemaVersion)
      && value.schemaVersion >= 1
      && value.schemaVersion <= CURRENT_SCHEMA_VERSION));
}

function preserveRecovery(storage, rawValue, reason, now) {
  try {
    const existing = storage.getItem(STORAGE_KEYS.LIBRARY_RECOVERY);
    if (existing != null) {
      return JSON.parse(existing)?.rawValue === rawValue;
    }
    storage.setItem(STORAGE_KEYS.LIBRARY_RECOVERY, JSON.stringify({
      schemaVersion: 1,
      sourceKey: STORAGE_KEYS.LIBRARY,
      rawValue,
      reason,
      preservedAt: now(),
    }));
    return true;
  } catch {
    return false;
  }
}
