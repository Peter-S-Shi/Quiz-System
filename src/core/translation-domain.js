import { makeId } from "./utils.js";
import { normalizeProvenance } from "./interchange.js";

export const TRANSLATION_SCHEMA_VERSION = 1;
export const TRANSLATION_DOCUMENT_TYPE = "quiz-studio.translation-document";

export function createTranslationLibrary() {
  return {
    schemaVersion: TRANSLATION_SCHEMA_VERSION,
    folders: [],
    documents: [],
  };
}

export function parseTranslationLibrary(value) {
  if (value == null) return createTranslationLibrary();
  if (!isPlainObject(value)) throw new TypeError("Translation library must be an object.");
  if (!Array.isArray(value.folders) || !Array.isArray(value.documents)) {
    throw new TypeError("Translation library folders and documents must be arrays.");
  }

  const library = {
    schemaVersion: Number(value.schemaVersion) || TRANSLATION_SCHEMA_VERSION,
    folders: value.folders.map(normalizeTranslationFolder),
    documents: value.documents.map(normalizeTranslationDocument),
  };
  const validation = validateTranslationLibrary(library);
  if (!validation.valid) throw new TypeError(validation.errors.join(" "));
  return library;
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

export function validateTranslationLibrary(value) {
  const errors = [];
  if (!isPlainObject(value)) return invalid("Translation library must be an object.");
  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1) errors.push("Invalid Translation library schemaVersion.");
  if (!Array.isArray(value.folders)) errors.push("Translation library folders must be an array.");
  if (!Array.isArray(value.documents)) errors.push("Translation library documents must be an array.");

  const folderIds = new Set();
  (Array.isArray(value.folders) ? value.folders : []).forEach((folder, index) => {
    if (!nonEmptyString(folder?.id)) errors.push(`Translation Folder ${index} requires an id.`);
    else if (folderIds.has(folder.id)) errors.push(`Duplicate Translation Folder id: ${folder.id}`);
    else folderIds.add(folder.id);
    if (!nonEmptyString(folder?.name)) errors.push(`Translation Folder ${folder?.id || index} requires a name.`);
    if (!nonEmptyString(folder?.createdAt) || !nonEmptyString(folder?.updatedAt)) {
      errors.push(`Translation Folder ${folder?.id || index} requires timestamps.`);
    }
  });

  const documentIds = new Set();
  (Array.isArray(value.documents) ? value.documents : []).forEach((document) => {
    const validation = validateTranslationDocument(document);
    errors.push(...validation.errors);
    if (documentIds.has(document.id)) errors.push(`Duplicate Translation Document id: ${document.id}`);
    else documentIds.add(document.id);
    if (nonEmptyString(document.folderId) && !folderIds.has(document.folderId)) {
      errors.push(`Translation Document ${document.id} references unknown folderId: ${document.folderId}`);
    }
  });
  return { valid: errors.length === 0, errors };
}

export function listTranslationFolders(library) {
  return structuredClone(parseTranslationLibrary(library).folders);
}

export function getTranslationFolder(library, folderId) {
  const folder = parseTranslationLibrary(library).folders.find((item) => item.id === folderId);
  return folder ? structuredClone(folder) : null;
}

export function createTranslationFolder(library, value = {}) {
  const current = parseTranslationLibrary(library);
  const now = value.updatedAt || value.createdAt || new Date().toISOString();
  const folder = normalizeTranslationFolder({
    id: value.id || makeId(),
    name: value.name,
    createdAt: value.createdAt || now,
    updatedAt: now,
  });
  if (!nonEmptyString(folder.id) || !nonEmptyString(folder.name)) throw new TypeError("Translation Folder id and name are required.");
  if (current.folders.some((item) => item.id === folder.id)) throw new TypeError(`Translation Folder already exists: ${folder.id}`);
  return { ...current, folders: [...current.folders, folder] };
}

export function updateTranslationFolder(library, folderId, changes = {}) {
  const current = parseTranslationLibrary(library);
  const folder = current.folders.find((item) => item.id === folderId);
  if (!folder) throw new TypeError(`Translation Folder not found: ${folderId}`);
  const updated = normalizeTranslationFolder({
    ...folder,
    name: changes.name ?? folder.name,
    updatedAt: changes.updatedAt || new Date().toISOString(),
  });
  if (!nonEmptyString(updated.name)) throw new TypeError("Translation Folder name is required.");
  return { ...current, folders: current.folders.map((item) => (item.id === folderId ? updated : item)) };
}

export function deleteTranslationFolder(library, folderId, options = {}) {
  const current = parseTranslationLibrary(library);
  if (!current.folders.some((item) => item.id === folderId)) throw new TypeError(`Translation Folder not found: ${folderId}`);
  const linkedDocuments = current.documents.filter((item) => item.folderId === folderId);
  if (linkedDocuments.length && options.cascade !== true) {
    throw new TypeError(`Translation Folder ${folderId} contains documents; explicit cascade is required.`);
  }
  return {
    ...current,
    folders: current.folders.filter((item) => item.id !== folderId),
    documents: current.documents.filter((item) => item.folderId !== folderId),
  };
}

export function listTranslationDocuments(library, options = {}) {
  const documents = parseTranslationLibrary(library).documents;
  return structuredClone(options.folderId ? documents.filter((item) => item.folderId === options.folderId) : documents);
}

export function getTranslationDocument(library, documentId) {
  const document = parseTranslationLibrary(library).documents.find((item) => item.id === documentId);
  return document ? structuredClone(document) : null;
}

export function createTranslationDocument(library, value = {}) {
  const current = parseTranslationLibrary(library);
  const now = value.updatedAt || value.createdAt || new Date().toISOString();
  const document = normalizeTranslationDocument({
    ...value,
    id: value.id || makeId(),
    createdAt: value.createdAt || now,
    updatedAt: now,
    items: Array.isArray(value.items)
      ? value.items.map((item) => ({ ...item, id: item?.id || makeId() }))
      : [],
  });
  assertDocumentCanBeStored(current, document);
  return { ...current, documents: [...current.documents, document] };
}

export function updateTranslationDocument(library, documentId, changes = {}) {
  const current = parseTranslationLibrary(library);
  const document = current.documents.find((item) => item.id === documentId);
  if (!document) throw new TypeError(`Translation Document not found: ${documentId}`);
  const updated = normalizeTranslationDocument({
    ...document,
    ...changes,
    id: document.id,
    createdAt: document.createdAt,
    updatedAt: changes.updatedAt || new Date().toISOString(),
    items: document.items,
  });
  assertDocumentCanBeStored(current, updated, documentId);
  return { ...current, documents: replaceDocument(current.documents, updated) };
}

export function deleteTranslationDocument(library, documentId) {
  const current = parseTranslationLibrary(library);
  if (!current.documents.some((item) => item.id === documentId)) throw new TypeError(`Translation Document not found: ${documentId}`);
  return { ...current, documents: current.documents.filter((item) => item.id !== documentId) };
}

export function addTranslationItem(library, documentId, value = {}) {
  return updateDocumentItems(library, documentId, (document) => [
    ...document.items,
    normalizeTranslationItem({ ...value, id: value.id || makeId(), position: document.items.length }, document.items.length),
  ], value.updatedAt);
}

export function updateTranslationItem(library, documentId, itemId, changes = {}) {
  return updateDocumentItems(library, documentId, (document) => {
    if (!document.items.some((item) => item.id === itemId)) throw new TypeError(`Translation Item not found: ${itemId}`);
    return document.items.map((item) => (item.id === itemId
      ? normalizeTranslationItem({ ...item, ...changes, id: item.id, position: item.position }, item.position)
      : item));
  }, changes.updatedAt);
}

export function removeTranslationItem(library, documentId, itemId, options = {}) {
  return updateDocumentItems(library, documentId, (document) => {
    if (!document.items.some((item) => item.id === itemId)) throw new TypeError(`Translation Item not found: ${itemId}`);
    return document.items.filter((item) => item.id !== itemId);
  }, options.updatedAt);
}

export function reorderTranslationItems(library, documentId, orderedItemIds, options = {}) {
  return updateDocumentItems(library, documentId, (document) => {
    if (!Array.isArray(orderedItemIds) || orderedItemIds.length !== document.items.length) {
      throw new TypeError("Translation Item order must include every item exactly once.");
    }
    const itemsById = new Map(document.items.map((item) => [item.id, item]));
    if (new Set(orderedItemIds).size !== orderedItemIds.length || orderedItemIds.some((id) => !itemsById.has(id))) {
      throw new TypeError("Translation Item order must include every item exactly once.");
    }
    return orderedItemIds.map((id) => itemsById.get(id));
  }, options.updatedAt);
}

function normalizeTranslationFolder(value = {}) {
  return {
    id: String(value.id || ""),
    name: String(value.name || "").trim(),
    createdAt: String(value.createdAt || ""),
    updatedAt: String(value.updatedAt || ""),
  };
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

function updateDocumentItems(library, documentId, updater, updatedAt) {
  const current = parseTranslationLibrary(library);
  const document = current.documents.find((item) => item.id === documentId);
  if (!document) throw new TypeError(`Translation Document not found: ${documentId}`);
  const items = updater(document).map((item, position) => ({ ...item, position }));
  const updated = normalizeTranslationDocument({
    ...document,
    updatedAt: updatedAt || new Date().toISOString(),
    items,
  });
  assertDocumentCanBeStored(current, updated, documentId);
  return { ...current, documents: replaceDocument(current.documents, updated) };
}

function assertDocumentCanBeStored(library, document, currentDocumentId = null) {
  const validation = validateTranslationDocument(document);
  if (!validation.valid) throw new TypeError(validation.errors.join(" "));
  if (!library.folders.some((item) => item.id === document.folderId)) {
    throw new TypeError(`Translation Document references unknown folderId: ${document.folderId}`);
  }
  if (library.documents.some((item) => item.id === document.id && item.id !== currentDocumentId)) {
    throw new TypeError(`Translation Document already exists: ${document.id}`);
  }
}

function replaceDocument(documents, updated) {
  return documents.map((item) => (item.id === updated.id ? updated : item));
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
