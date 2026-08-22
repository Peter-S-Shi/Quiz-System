import { normalizeQuestion } from "./question-registry.js";
import { normalizeProvenance } from "./interchange.js";
import { normalizeCategoryList } from "./categories.js";
import { makeId, parseTags } from "./utils.js";

export const CURRENT_SCHEMA_VERSION = 1;

export function normalizeLibrary(value = {}, options = {}) {
  const papers = (value.papers || []).map((paper) => normalizePaper(paper));
  const defaultPaper = options.createDefaultPaper ? options.createDefaultPaper() : { questions: [] };
  const finalPapers = papers.length ? papers : [normalizePaper(defaultPaper)];
  const categories = normalizeCategoryList(value.categories, finalPapers);
  const normalized = {
    schemaVersion: value.schemaVersion || CURRENT_SCHEMA_VERSION,
    papers: finalPapers,
    categories,
  };
  return migrateLibrary(normalized);
}

export function normalizePaper(value = {}) {
  const now = new Date().toISOString();
  const provenance = normalizeProvenance(value.provenance);
  return {
    schemaVersion: value.schemaVersion || CURRENT_SCHEMA_VERSION,
    id: value.id || makeId(),
    title: value.title || "",
    description: value.description || "",
    category: typeof value.category === "string" ? value.category.trim() : "",
    tags: Array.isArray(value.tags) ? value.tags : parseTags(value.tags || ""),
    createdAt: value.createdAt || now,
    updatedAt: value.updatedAt || now,
    lastOpenedAt: value.lastOpenedAt || now,
    questions: Array.isArray(value.questions) ? value.questions.map(normalizeQuestion) : [],
    ...(provenance ? { provenance } : {}),
  };
}

export function migrateLibrary(library) {
  if (!library.schemaVersion) {
    return {
      ...library,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      papers: library.papers.map((paper) => normalizePaper(paper)),
      categories: normalizeCategoryList(library.categories, library.papers),
    };
  }
  return library;
}
