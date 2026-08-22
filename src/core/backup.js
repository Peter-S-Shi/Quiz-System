import { parseLearnerResponseCollection } from "./learning-records.js";
import { CURRENT_SCHEMA_VERSION, normalizeLibrary } from "./migrations.js";
import { parseTeacherReviewCollection } from "./review-records.js";
import { validateRemediationProvenance } from "./review-transport.js";
import { parseTranslationLibrary } from "./translation-domain.js";
import { validateItemsMediaIntegrity, validateMediaAssetsMap } from "./media-references.js";

export function createLibraryBackup({
  library,
  history,
  learnerResponses,
  teacherReviews,
  translationLibrary,
  mediaAssets = [],
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
    mediaAssets: Array.isArray(mediaAssets) ? structuredClone(mediaAssets) : [],
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
  const teacherReviews = hasTeacherReviews ? parseTeacherReviewCollection(value.teacherReviews, { learnerResponses }) : [];
  const translationLibrary = hasTranslationLibrary ? parseTranslationLibrary(value.translationLibrary) : parseTranslationLibrary(null);
  const mediaAssets = Array.isArray(value.mediaAssets) ? structuredClone(value.mediaAssets) : (Array.isArray(value.assets) ? structuredClone(value.assets) : []);

  // Cross-record integrity check: a remediation Translation Document's provenance must resolve
  // against this same backup's Learner Response/Teacher Review collections before any state is
  // replaced. A response whose own (retry/remediation) provenance points at a source that is not in
  // this backup is not rejected here -- that is historical evidence that may legitimately outlive
  // its source, not a canonical relationship the backup contract requires to resolve.
  translationLibrary.documents.forEach((document) => {
    const validation = validateRemediationProvenance(document, { learnerResponses, teacherReviews });
    if (!validation.valid) {
      throw new TypeError(`Invalid remediation provenance for Translation Document ${document.id}: ${validation.errors.join(" ")}`);
    }
  });

  // Media referential integrity validation (same contract as single-paper portability)
  const assetMap = validateMediaAssetsMap(mediaAssets);

  const normalizedLib = normalizeLibrary(value.library, options);
  for (const paper of normalizedLib.papers) {
    validateItemsMediaIntegrity(paper.questions || [], assetMap, `Paper "${paper.title || paper.id}"`);
  }

  for (const response of learnerResponses) {
    const items = response.material?.snapshot?.items || [];
    validateItemsMediaIntegrity(items, assetMap, `Learner Response "${response.id}"`);
  }

  return {
    library: normalizedLib,
    history: Array.isArray(value.history) ? structuredClone(value.history) : [],
    hasLearnerResponses,
    learnerResponses,
    hasTeacherReviews,
    teacherReviews,
    hasTranslationLibrary,
    translationLibrary,
    mediaAssets,
  };
}
