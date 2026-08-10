import { normalizeLearnerResponse, validateLearnerResponse } from "./interchange.js";

export function parseLearnerResponseCollection(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new TypeError("Learner Response collection must be an array.");

  return value.map((item, index) => {
    const normalized = normalizeLearnerResponse(item);
    const validation = validateLearnerResponse(normalized);
    if (!validation.valid) {
      throw new TypeError(`Invalid Learner Response at index ${index}: ${validation.errors.join(" ")}`);
    }
    return normalized;
  });
}

export function upsertLearnerResponse(collection, response) {
  const normalized = normalizeLearnerResponse(response);
  const validation = validateLearnerResponse(normalized);
  if (!validation.valid) throw new TypeError(validation.errors.join(" "));

  const existing = parseLearnerResponseCollection(collection);
  return [normalized, ...existing.filter((item) => item.id !== normalized.id)];
}

export function removeLearnerResponsesForMaterial(collection, materialId) {
  return parseLearnerResponseCollection(collection).filter((item) => item.material.id !== materialId);
}

export function findLearnerResponse(collection, responseId) {
  return parseLearnerResponseCollection(collection).find((item) => item.id === responseId) || null;
}
