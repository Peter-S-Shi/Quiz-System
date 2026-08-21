import { makeId } from "./utils.js";
import {
  addAnnotation,
  changeAnnotationKind,
  normalizeAnnotationList,
  removeAnnotation,
  revalidateAnnotations,
} from "./translation-annotations.js";

export const TRANSLATION_SESSION_SCHEMA_VERSION = 1;

export function createTranslationSession({ id = makeId(), document, startedAt = new Date().toISOString() }) {
  if (!isPlainObject(document) || !Array.isArray(document.items) || !document.items.length) {
    throw new TypeError("A Translation Document with items is required to start practice.");
  }

  return {
    schemaVersion: TRANSLATION_SESSION_SCHEMA_VERSION,
    id,
    documentId: document.id,
    documentTitle: document.title || "",
    sourceLanguage: document.sourceLanguage || "",
    targetLanguage: document.targetLanguage || "",
    startedAt,
    index: 0,
    items: structuredClone(document.items),
    answers: {},
    revealed: {},
    annotations: {},
    itemMarks: {},
    completed: false,
    ...(isPlainObject(document.provenance) ? { materialProvenance: structuredClone(document.provenance) } : {}),
  };
}

export function normalizeTranslationSession(value) {
  if (!isPlainObject(value)) return null;
  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1) return null;
  if (!nonEmptyString(value.id) || !nonEmptyString(value.documentId) || !nonEmptyString(value.startedAt)) return null;
  if (!Array.isArray(value.items) || !value.items.length) return null;
  if (value.items.some((item) => !isPlainObject(item) || !nonEmptyString(item.id) || !nonEmptyString(item.sourceText))) return null;

  const items = value.items.map((item) => ({ ...item }));
  const itemIds = new Set(items.map((item) => item.id));
  if (itemIds.size !== items.length) return null;

  const answers = {};
  if (isPlainObject(value.answers)) {
    Object.entries(value.answers).forEach(([itemId, answer]) => {
      if (itemIds.has(itemId) && typeof answer === "string") answers[itemId] = answer;
    });
  }

  const revealed = {};
  if (isPlainObject(value.revealed)) {
    Object.entries(value.revealed).forEach(([itemId, flag]) => {
      if (itemIds.has(itemId) && flag === true) revealed[itemId] = true;
    });
  }

  const index = Number.isInteger(value.index) && value.index >= 0 && value.index < items.length ? value.index : 0;

  const annotations = {};
  if (isPlainObject(value.annotations)) {
    Object.entries(value.annotations).forEach(([itemId, list]) => {
      if (!itemIds.has(itemId)) return;
      const normalizedList = normalizeAnnotationList(list, answers[itemId] || "");
      if (normalizedList.length) annotations[itemId] = normalizedList;
    });
  }

  const itemMarks = {};
  if (isPlainObject(value.itemMarks)) {
    Object.entries(value.itemMarks).forEach(([itemId, kind]) => {
      if (itemIds.has(itemId) && (kind === "unknown" || kind === "uncertain" || kind === "should_know")) {
        itemMarks[itemId] = kind;
      }
    });
  }

  return {
    schemaVersion: value.schemaVersion,
    id: value.id,
    documentId: value.documentId,
    documentTitle: typeof value.documentTitle === "string" ? value.documentTitle : "",
    sourceLanguage: typeof value.sourceLanguage === "string" ? value.sourceLanguage : "",
    targetLanguage: typeof value.targetLanguage === "string" ? value.targetLanguage : "",
    startedAt: value.startedAt,
    index,
    items,
    answers,
    revealed,
    annotations,
    itemMarks,
    completed: value.completed === true,
    ...(nonEmptyString(value.completedAt) ? { completedAt: value.completedAt } : {}),
    ...(nonEmptyString(value.responseId) ? { responseId: value.responseId } : {}),
    ...(isPlainObject(value.materialProvenance) ? { materialProvenance: structuredClone(value.materialProvenance) } : {}),
  };
}

export function setTranslationAnswer(session, itemId, answer) {
  if (!session.items.some((item) => item.id === itemId)) {
    throw new TypeError(`Translation Item not found in session: ${itemId}`);
  }
  const nextAnswer = String(answer ?? "");
  const existingAnnotations = session.annotations[itemId];
  const next = { ...session, answers: { ...session.answers, [itemId]: nextAnswer } };
  if (existingAnnotations?.length) {
    const revalidated = revalidateAnnotations(existingAnnotations, nextAnswer);
    next.annotations = { ...session.annotations };
    if (revalidated.length) next.annotations[itemId] = revalidated;
    else delete next.annotations[itemId];
  }
  return next;
}

export function addTranslationAnnotation(session, itemId, draft) {
  if (!session.items.some((item) => item.id === itemId)) {
    throw new TypeError(`Translation Item not found in session: ${itemId}`);
  }
  const answerText = session.answers[itemId] || "";
  const nextList = addAnnotation(session.annotations[itemId], draft, answerText);
  return { ...session, annotations: { ...session.annotations, [itemId]: nextList } };
}

export function removeTranslationAnnotation(session, itemId, annotationId) {
  const nextList = removeAnnotation(session.annotations[itemId], annotationId);
  const nextAnnotations = { ...session.annotations };
  if (nextList.length) nextAnnotations[itemId] = nextList;
  else delete nextAnnotations[itemId];
  return { ...session, annotations: nextAnnotations };
}

export function changeTranslationAnnotationKind(session, itemId, annotationId, kind) {
  const nextList = changeAnnotationKind(session.annotations[itemId], annotationId, kind);
  return { ...session, annotations: { ...session.annotations, [itemId]: nextList } };
}

export function setTranslationItemMark(session, itemId, kind) {
  if (!session.items.some((item) => item.id === itemId)) {
    throw new TypeError(`Translation Item not found in session: ${itemId}`);
  }
  const next = { ...session.itemMarks };
  if (kind === "unknown" || kind === "uncertain" || kind === "should_know") {
    next[itemId] = kind;
  } else {
    delete next[itemId];
  }
  return { ...session, itemMarks: next };
}

export function setTranslationRevealed(session, itemId, revealed) {
  const next = { ...session.revealed };
  if (revealed) next[itemId] = true;
  else delete next[itemId];
  return { ...session, revealed: next };
}

export function goToTranslationIndex(session, index) {
  const clamped = Math.min(Math.max(index, 0), session.items.length - 1);
  return { ...session, index: clamped };
}

export function isTranslationSessionForDocument(session, documentId) {
  return Boolean(session) && session.completed !== true && session.documentId === documentId;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
