import { parseLearnerResponseCollection } from "./learning-records.js";
import { CURRENT_SCHEMA_VERSION, normalizeLibrary } from "./migrations.js";

export function createLibraryBackup({ library, history, learnerResponses, exportedAt = new Date().toISOString() }) {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    documentType: "quiz-studio.library-backup",
    exportedAt,
    library: structuredClone(library),
    history: Array.isArray(history) ? structuredClone(history) : [],
    learnerResponses: parseLearnerResponseCollection(learnerResponses),
  };
}

export function parseLibraryBackup(value, options = {}) {
  if (!value?.library || !Array.isArray(value.library.papers) || !value.library.papers.length) {
    throw new TypeError("Backup must contain a quiz library.");
  }
  if (value.history != null && !Array.isArray(value.history)) {
    throw new TypeError("Backup history must be an array.");
  }

  const hasLearnerResponses = Object.prototype.hasOwnProperty.call(value, "learnerResponses");
  return {
    library: normalizeLibrary(value.library, options),
    history: Array.isArray(value.history) ? structuredClone(value.history) : [],
    hasLearnerResponses,
    learnerResponses: hasLearnerResponses ? parseLearnerResponseCollection(value.learnerResponses) : [],
  };
}
