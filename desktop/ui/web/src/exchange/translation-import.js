// Translation Document import / normalization / validation and the plain-text import formats. A faithful port of the V1
// modules (src/core/translation-domain.js, translation-import.js, the provenance normalizer in interchange.js), pinned to
// the unchanged V1 code by a differential test, so a document that V1 accepts is accepted here and vice versa.
import { newId as makeId } from "../ids.js";
import { normalizeActor } from "./teacher-review.js";

export const TRANSLATION_SCHEMA_VERSION = 1;
export const TRANSLATION_DOCUMENT_TYPE = "quiz-studio.translation-document";


export function normalizeProvenance(value) {
  if (!isPlainObject(value)) return undefined;

  const normalized = {};
  copyOptionalString(value, normalized, "purpose");
  copyOptionalString(value, normalized, "sourceResponseId");
  copyOptionalString(value, normalized, "sourceReviewId");
  copyOptionalString(value, normalized, "sourceMaterialId");
  copyOptionalString(value, normalized, "createdAt");
  if (isPlainObject(value.author)) normalized.author = normalizeActor(value.author);
  if (isPlainObject(value.extensions)) normalized.extensions = cloneValue(value.extensions);
  return Object.keys(normalized).length ? normalized : undefined;
}

export function normalizeTranslationDocument(value = {}) {
  const provenance = normalizeProvenance(value.provenance);
  const items = Array.isArray(value.items)
    ? value.items
      .map((item, index) => normalizeTranslationItem(item, index))
      .sort((left, right) => left.position - right.position)
      .map((item, position) => ({ ...item, position }))
    : [];

  return {
    schemaVersion: Number(value.schemaVersion) || TRANSLATION_SCHEMA_VERSION,
    documentType: value.documentType || TRANSLATION_DOCUMENT_TYPE,
    id: String(value.id || ""),
    title: String(value.title || "").trim(),
    folderId: String(value.folderId || ""),
    sourceLanguage: String(value.sourceLanguage || "").trim(),
    targetLanguage: String(value.targetLanguage || "").trim(),
    createdAt: String(value.createdAt || ""),
    updatedAt: String(value.updatedAt || ""),
    items,
    ...(provenance ? { provenance } : {}),
    ...(isPlainObject(value.extensions) ? { extensions: structuredClone(value.extensions) } : {}),
  };
}

export function validateTranslationDocument(value) {
  const errors = [];
  if (!isPlainObject(value)) return invalid("Translation Document must be an object.");
  if (value.documentType !== TRANSLATION_DOCUMENT_TYPE) errors.push("Invalid Translation Document documentType.");
  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1) errors.push("Invalid Translation Document schemaVersion.");
  if (!nonEmptyString(value.id)) errors.push("Translation Document id is required.");
  if (!nonEmptyString(value.title)) errors.push("Translation Document title is required.");
  if (!nonEmptyString(value.folderId)) errors.push("Translation Document folderId is required.");
  if (!nonEmptyString(value.sourceLanguage)) errors.push("Translation Document sourceLanguage is required.");
  if (!nonEmptyString(value.targetLanguage)) errors.push("Translation Document targetLanguage is required.");
  if (!nonEmptyString(value.createdAt)) errors.push("Translation Document createdAt is required.");
  if (!nonEmptyString(value.updatedAt)) errors.push("Translation Document updatedAt is required.");
  if (!Array.isArray(value.items)) errors.push("Translation Document items must be an array.");

  const itemIds = new Set();
  (Array.isArray(value.items) ? value.items : []).forEach((item, index) => {
    if (!isPlainObject(item)) {
      errors.push("Each Translation Item must be an object.");
      return;
    }
    if (!nonEmptyString(item.id)) errors.push("Each Translation Item requires an id.");
    else if (itemIds.has(item.id)) errors.push(`Duplicate Translation Item id: ${item.id}`);
    else itemIds.add(item.id);
    if (!nonEmptyString(item.sourceText)) errors.push(`Translation Item ${item.id || index} requires sourceText.`);
    if (item.position !== index) errors.push(`Translation Item ${item.id || index} has an invalid position.`);
    if (Object.prototype.hasOwnProperty.call(item, "referenceTranslation") && typeof item.referenceTranslation !== "string") {
      errors.push(`Translation Item ${item.id || index} referenceTranslation must be a string.`);
    }
    if (Object.prototype.hasOwnProperty.call(item, "notes") && typeof item.notes !== "string") {
      errors.push(`Translation Item ${item.id || index} notes must be a string.`);
    }
  });
  return { valid: errors.length === 0, errors };
}

function normalizeTranslationItem(value = {}, fallbackPosition = 0) {
  const item = {
    id: String(value.id || ""),
    sourceText: String(value.sourceText || ""),
    position: Number.isInteger(value.position) && value.position >= 0 ? value.position : fallbackPosition,
  };
  if (typeof value.referenceTranslation === "string") item.referenceTranslation = value.referenceTranslation;
  if (typeof value.notes === "string") item.notes = value.notes;
  return item;
}

export function parseSourceOnlyText(text) {
  const items = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((sourceText) => ({ sourceText }));
  const errors = items.length ? [] : ["No source lines were found."];
  return { items, errors };
}

export function parseBilingualText(text) {
  const items = [];
  const errors = [];
  String(text ?? "")
    .split(/\r?\n/)
    .forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (!line) return;
      const columns = rawLine.split("\t");
      const source = (columns[0] || "").trim();
      const reference = (columns[1] || "").trim();
      if (columns.length !== 2 || !source || !reference) {
        errors.push(`Line ${index + 1} is not a valid "source<TAB>reference" row.`);
        return;
      }
      items.push({ sourceText: source, referenceTranslation: reference });
    });
  if (!items.length && !errors.length) errors.push("No bilingual rows were found.");
  return { items, errors };
}

export function parseTranslationDocumentJsonText(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { document: null, errors: ["The file is not valid JSON."] };
  }
  if (raw?.documentType !== TRANSLATION_DOCUMENT_TYPE) {
    return { document: null, errors: [`Invalid Translation Document documentType.`] };
  }

  const normalized = normalizeTranslationDocument(raw);
  const validation = validateTranslationDocument(normalized);
  return { document: validation.valid ? normalized : null, errors: validation.errors };
}

export function remapDocumentForCopy(document) {
  return {
    ...document,
    id: makeId(),
    items: document.items.map((item) => ({ ...item, id: makeId() })),
  };
}


function invalid(message) {
  return { valid: false, errors: [message] };
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneValue(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function copyOptionalString(source, target, key) {
  if (typeof source[key] === "string" && source[key].trim()) target[key] = source[key].trim();
}
