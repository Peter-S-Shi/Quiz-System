import { parseLearnerResponseCollection } from "./learning-records.js";
import { CURRENT_SCHEMA_VERSION, normalizeLibrary } from "./migrations.js";
import { parseTeacherReviewCollection } from "./review-records.js";
import { parseTranslationLibrary } from "./translation-domain.js";

export function createLibraryBackup({
  library,
  history,
  learnerResponses,
  teacherReviews,
  translationLibrary,
  exportedAt = new Date().toISOString(),
}) {
  const parsedLearnerResponses = parseLearnerResponseCollection(learnerResponses);
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    documentType: "quiz-studio.library-backup",
    exportedAt,
    library: structuredClone(library),
    history: Array.isArray(history) ? structuredClone(history) : [],
    learnerResponses: parsedLearnerResponses,
    teacherReviews: parseTeacherReviewCollection(teacherReviews, { learnerResponses: parsedLearnerResponses }),
    translationLibrary: parseTranslationLibrary(translationLibrary),
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
  const hasTeacherReviews = Object.prototype.hasOwnProperty.call(value, "teacherReviews");
  const hasTranslationLibrary = Object.prototype.hasOwnProperty.call(value, "translationLibrary");
  const learnerResponses = hasLearnerResponses ? parseLearnerResponseCollection(value.learnerResponses) : [];
  return {
    library: normalizeLibrary(value.library, options),
    history: Array.isArray(value.history) ? structuredClone(value.history) : [],
    hasLearnerResponses,
    learnerResponses,
    hasTeacherReviews,
    teacherReviews: hasTeacherReviews ? parseTeacherReviewCollection(value.teacherReviews, { learnerResponses }) : [],
    hasTranslationLibrary,
    translationLibrary: hasTranslationLibrary ? parseTranslationLibrary(value.translationLibrary) : parseTranslationLibrary(null),
  };
}
