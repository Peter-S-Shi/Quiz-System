// The Translation practice session engine (Scope Freeze Rev.1 section 11; ADR 0004 section 7). Mirrors the V1 behavior
// (src/core/translation-session.js, translation-annotations.js, translation-retry.js): the learner PRODUCES a translation
// per item, may reveal the reference, may mark spans of their OWN answer and whole items with one of three distinct
// metacognitive kinds, and may later retry from a finalized snapshot. Translation is never graded: the evidence carries
// no `result`, `correctCount` or `percent`; marks are learner signals, not judgments.
//
// Annotation offsets are UTF-16 code units (declared in the session facts when present) and are snapped outward to
// extended-grapheme boundaries of the pinned Unicode tables, so a selection can never split a character.
import { withSessionFacts } from '../task-domains/adapters.js';
import { graphemeBoundaries } from '../task-domains/unicode/graphemes.js';

export const ANNOTATION_KINDS = Object.freeze(['unknown', 'uncertain', 'should_know']);
const INTENTS = ['practice', 'test'];
const SCHEMA_VERSION = 1;

export class TranslationSessionError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'TranslationSessionError';
    this.code = code;
  }
}
const fail = (code, message) => { throw new TranslationSessionError(code, message); };
const clone = (v) => structuredClone(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
const defaultIds = () => globalThis.crypto.randomUUID();

/** Only the provenance fields the public contract knows are carried (V1's normalizeProvenance). */
function cleanProvenance(p) {
  if (!isObj(p)) return { purpose: 'practice' };
  const out = {};
  for (const k of ['purpose', 'sourceResponseId', 'sourceReviewId', 'sourceMaterialId', 'createdAt']) if (nonEmpty(p[k])) out[k] = p[k].trim();
  if (isObj(p.author) && typeof p.author.type === 'string') out.author = clone(p.author);
  return out.purpose ? out : { ...out, purpose: 'practice' };
}

function snapToGraphemes(text, start, end) {
  const b = graphemeBoundaries(text);
  let s = 0;
  for (const x of b) if (x <= start) s = x; else break;
  let e = text.length;
  for (const x of b) if (x >= end) { e = x; break; }
  return [s, e];
}
const overlaps = (a, b) => a.start < b.end && b.start < a.end;
const validAnchor = (a, answer) => Number.isInteger(a.start) && Number.isInteger(a.end) && a.start >= 0 && a.end > a.start && a.end <= answer.length && answer.slice(a.start, a.end) === a.text && ANNOTATION_KINDS.includes(a.kind);

export class TranslationSession {
  #s;
  #ids;

  constructor(state, ids = defaultIds) {
    this.#s = state;
    this.#ids = ids;
  }

  static start({ document, sessionId, evidenceId, startedAt, intent, ids = defaultIds }) {
    if (!INTENTS.includes(intent)) fail('BAD_INPUT', `intent must be one of ${INTENTS.join(', ')}`);
    if (!nonEmpty(sessionId) || !nonEmpty(evidenceId) || !nonEmpty(startedAt)) fail('BAD_INPUT', 'session id, evidence id and start time are required');
    if (!isObj(document) || !nonEmpty(document.id) || !Array.isArray(document.items) || !document.items.length) fail('BAD_INPUT', 'a Translation document with items is required');
    const items = clone(document.items);
    if (items.some((i) => !isObj(i) || !nonEmpty(i.id) || !nonEmpty(i.sourceText)) || new Set(items.map((i) => i.id)).size !== items.length) fail('BAD_INPUT', 'every item needs a unique id and source text');
    return new TranslationSession({
      schemaVersion: SCHEMA_VERSION, domain: 'translation', evidenceId,
      session: { id: sessionId, startedAt }, intent,
      material: { id: document.id, title: typeof document.title === 'string' ? document.title : '', sourceLanguage: String(document.sourceLanguage || ''), targetLanguage: String(document.targetLanguage || '') },
      provenance: cleanProvenance(document.provenance),
      items, index: 0, answers: {}, revealed: {}, annotations: {}, marks: {}, finished: false,
    }, ids);
  }

  static restore(snap, ids = defaultIds) {
    if (!isObj(snap) || snap.domain !== 'translation' || snap.schemaVersion !== SCHEMA_VERSION || !Array.isArray(snap.items) || !snap.items.length) fail('BAD_SNAPSHOT', 'not a Translation session snapshot');
    const s = clone(snap);
    const known = new Set(s.items.map((i) => i.id));
    for (const k of ['answers', 'revealed', 'annotations', 'marks']) if (!isObj(s[k])) s[k] = {};
    // a corrupt anchor degrades gracefully instead of blocking recovery (V1): invalid or overlapping entries are dropped
    for (const id of Object.keys(s.annotations)) {
      const answer = typeof s.answers[id] === 'string' ? s.answers[id] : '';
      const kept = [];
      for (const a of Array.isArray(s.annotations[id]) ? s.annotations[id] : []) if (known.has(id) && isObj(a) && nonEmpty(a.id) && validAnchor(a, answer) && !kept.some((k) => overlaps(k, a))) kept.push(a);
      if (kept.length) s.annotations[id] = kept; else delete s.annotations[id];
    }
    for (const id of Object.keys(s.marks)) if (!known.has(id) || !ANNOTATION_KINDS.includes(s.marks[id])) delete s.marks[id];
    if (!Number.isInteger(s.index) || s.index < 0 || s.index >= s.items.length) s.index = 0;
    return new TranslationSession(s, ids);
  }

  snapshot() {
    return clone(this.#s);
  }

  get #item() {
    return this.#s.items[this.#s.index];
  }

  #open() {
    if (this.#s.finished) fail('LOCKED', 'the session is finished');
  }

  view() {
    const s = this.#s;
    const item = this.#item;
    const view = {
      phase: s.finished ? 'finished' : 'answering',
      sessionId: s.session.id, intent: s.intent, title: s.material.title,
      sourceLanguage: s.material.sourceLanguage, targetLanguage: s.material.targetLanguage,
      index: s.index, total: s.items.length,
      progress: { answered: s.items.filter((i) => (s.answers[i.id] ?? '').trim().length > 0).length, total: s.items.length },
      items: s.items.map((i) => ({ id: i.id, answered: (s.answers[i.id] ?? '').trim().length > 0, marked: i.id in s.marks || (s.annotations[i.id]?.length ?? 0) > 0 })),
      item: { id: item.id, sourceText: item.sourceText, ...(typeof item.notes === 'string' && item.notes ? { notes: item.notes } : {}) },
      answer: s.answers[item.id] ?? '',
      annotations: (s.annotations[item.id] ?? []).map((a) => ({ id: a.id, kind: a.kind, start: a.start, end: a.end, text: a.text })),
      mark: s.marks[item.id] ?? null,
      revealed: s.revealed[item.id] === true,
      hasReference: typeof item.referenceTranslation === 'string' && item.referenceTranslation.length > 0,
    };
    if (view.revealed && view.hasReference) view.reference = item.referenceTranslation;
    return view;
  }

  go(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.#s.items.length) throw new RangeError(`no item at index ${index}`);
    this.#s.index = index;
  }

  setAnswer(text) {
    this.#open();
    const s = this.#s;
    const id = this.#item.id;
    const next = String(text ?? '');
    s.answers[id] = next;
    const kept = (s.annotations[id] ?? []).filter((a) => validAnchor(a, next));
    if (kept.length) s.annotations[id] = kept; else delete s.annotations[id];
  }

  reveal(flag) {
    this.#open();
    if (flag) this.#s.revealed[this.#item.id] = true; else delete this.#s.revealed[this.#item.id];
  }

  /** Marks a span of the learner's own answer. Returns the stored annotation. */
  addAnnotation({ start, end, kind }, { now, id } = {}) {
    this.#open();
    const s = this.#s;
    const itemId = this.#item.id;
    const answer = s.answers[itemId] ?? '';
    if (!ANNOTATION_KINDS.includes(kind)) fail('BAD_ANNOTATION', `kind must be one of ${ANNOTATION_KINDS.join(', ')}`);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > answer.length) fail('BAD_ANNOTATION', 'the range is empty, inverted or outside the answer');
    if (!nonEmpty(now)) fail('BAD_INPUT', 'a creation time is required');
    const [a, b] = snapToGraphemes(answer, start, end);
    const candidate = { id: id ?? this.#ids(), kind, start: a, end: b, text: answer.slice(a, b), createdAt: now };
    const list = s.annotations[itemId] ?? [];
    const same = list.find((x) => x.start === a && x.end === b);
    if (same) {
      const replaced = { ...same, kind, text: candidate.text, createdAt: now };
      s.annotations[itemId] = list.map((x) => (x === same ? replaced : x));
      return clone(replaced);
    }
    if (list.some((x) => overlaps(x, candidate))) fail('ANNOTATION_OVERLAP', 'this span overlaps an existing mark; remove or adjust that mark first');
    s.annotations[itemId] = [...list, candidate];
    return clone(candidate);
  }

  removeAnnotation(annotationId) {
    this.#open();
    const id = this.#item.id;
    const kept = (this.#s.annotations[id] ?? []).filter((a) => a.id !== annotationId);
    if (kept.length) this.#s.annotations[id] = kept; else delete this.#s.annotations[id];
  }

  changeAnnotationKind(annotationId, kind) {
    this.#open();
    if (!ANNOTATION_KINDS.includes(kind)) fail('BAD_ANNOTATION', `kind must be one of ${ANNOTATION_KINDS.join(', ')}`);
    const id = this.#item.id;
    this.#s.annotations[id] = (this.#s.annotations[id] ?? []).map((a) => (a.id === annotationId ? { ...a, kind } : a));
  }

  /** The whole-item metacognitive mark; `null` clears it. */
  setMark(kind) {
    this.#open();
    if (kind === null || kind === undefined) { delete this.#s.marks[this.#item.id]; return; }
    if (!ANNOTATION_KINDS.includes(kind)) fail('BAD_MARK', `kind must be one of ${ANNOTATION_KINDS.join(', ')}`);
    this.#s.marks[this.#item.id] = kind;
  }

  /** Idempotent: the completion time is fixed by the first call. */
  finalize({ now }) {
    const s = this.#s;
    if (!s.finished) {
      if (!nonEmpty(now)) fail('BAD_INPUT', 'a completion time is required');
      s.finished = true;
      s.completedAt = now;
    }
    const items = clone(s.items);
    const learnerAnnotations = s.items.flatMap((i) => (s.annotations[i.id] ?? []).map((a) => ({ itemId: i.id, id: a.id, kind: a.kind, start: a.start, end: a.end, text: a.text, createdAt: a.createdAt })));
    const learnerItemMarks = s.items.filter((i) => i.id in s.marks).map((i) => ({ itemId: i.id, kind: s.marks[i.id] }));
    const response = {
      schemaVersion: 1,
      documentType: 'quiz-studio.learner-response',
      id: s.evidenceId,
      status: 'finalized',
      finalizedAt: s.completedAt,
      material: { type: 'translation-document', id: s.material.id, title: s.material.title, snapshot: { items, sourceLanguage: s.material.sourceLanguage, targetLanguage: s.material.targetLanguage } },
      session: { id: s.session.id, startedAt: s.session.startedAt, completedAt: s.completedAt },
      responses: s.items.map((i) => ({ itemId: i.id, answer: String(s.answers[i.id] ?? '') })),
      summary: { itemCount: items.length },
      provenance: clone(s.provenance),
      ...(learnerAnnotations.length ? { learnerAnnotations } : {}),
      ...(learnerItemMarks.length ? { learnerItemMarks } : {}),
    };
    return withSessionFacts(response, { intent: s.intent, ...(learnerAnnotations.length ? { offsetEncoding: 'utf16-code-unit' } : {}) });
  }
}

/**
 * An ephemeral, document-shaped retry material built ONLY from a finalized response snapshot (V1's buildRetryMaterial):
 * fresh item/material identities, by-value lineage in `provenance`. It is never persisted as a library document.
 */
export function buildRetryMaterial({ response, itemIds, sourceReviewId, createdAt, ids = defaultIds }) {
  const snapshot = response?.material?.snapshot;
  if (!isObj(response) || !isObj(response.material) || !isObj(snapshot) || !Array.isArray(snapshot.items) || !snapshot.items.length) fail('BAD_INPUT', 'a finalized response with a material snapshot is required to retry');
  const chosen = Array.isArray(itemIds) ? itemIds : snapshot.items.map((i) => i.id);
  for (const id of chosen) if (!snapshot.items.some((i) => i.id === id)) fail('BAD_INPUT', `unknown item ${JSON.stringify(id)}`);
  const selected = snapshot.items.filter((i) => chosen.includes(i.id));
  if (!selected.length) fail('BAD_INPUT', 'at least one item is required to retry');
  return {
    id: ids(),
    title: response.material.title || '',
    sourceLanguage: snapshot.sourceLanguage || '',
    targetLanguage: snapshot.targetLanguage || '',
    items: selected.map((i) => ({
      id: ids(), sourceText: String(i.sourceText || ''),
      ...(typeof i.referenceTranslation === 'string' ? { referenceTranslation: i.referenceTranslation } : {}),
      ...(typeof i.notes === 'string' ? { notes: i.notes } : {}),
    })),
    provenance: { purpose: 'retry', sourceResponseId: response.id, ...(sourceReviewId ? { sourceReviewId } : {}), sourceMaterialId: response.material.id, createdAt },
  };
}
