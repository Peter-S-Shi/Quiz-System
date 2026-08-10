import { makeId } from "./utils.js";
import {
  TRANSLATION_DOCUMENT_TYPE,
  normalizeTranslationDocument,
  validateTranslationDocument,
} from "./translation-domain.js";

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

export function findDocumentIdCollision(library, documentId) {
  return library.documents.some((item) => item.id === documentId);
}

export function remapDocumentForCopy(document) {
  return {
    ...document,
    id: makeId(),
    items: document.items.map((item) => ({ ...item, id: makeId() })),
  };
}
