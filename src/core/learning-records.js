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
  const matchingResponses = existing.filter((item) => item.id === normalized.id);
  if (matchingResponses.length) {
    if (matchingResponses.some((item) => !isDeepEqual(item, normalized))) {
      throw new TypeError(`Finalized Learner Response ${normalized.id} cannot be replaced.`);
    }
    return existing;
  }

  return [normalized, ...existing.filter((item) => item.id !== normalized.id)];
}

export function removeLearnerResponsesForMaterial(collection, materialId) {
  return parseLearnerResponseCollection(collection).filter((item) => item.material.id !== materialId);
}

export function findLearnerResponse(collection, responseId) {
  return parseLearnerResponseCollection(collection).find((item) => item.id === responseId) || null;
}

function isDeepEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => isDeepEqual(item, right[index]));
  }
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (!isDeepEqual(leftKeys, rightKeys)) return false;
  return leftKeys.every((key) => isDeepEqual(left[key], right[key]));
}
