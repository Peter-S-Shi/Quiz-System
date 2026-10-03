// The Library service: the formal content workflow of the three domains (Objective papers, Translation documents with
// folders, Typing texts). It lists, reads, validates, creates, edits and deletes CONTENT only. Content is never Evidence:
// deleting a paper, document or text never touches a recorded attempt, and editing content never rewrites a finalized
// snapshot (Scope 10.3). Every write is one Store Port Unit of Work with a revision precondition, so a stale editor can
// never overwrite a newer version silently.
import { putOp, deleteOp } from '../projection.js';
import { newId as defaultId } from '../ids.js';
import { mediaRefs, normalizeQuestion, validateQuestion } from '../objective/questions.js';

export class LibraryError extends Error {
  constructor(code, message, detail = {}) {
    super(`${code}: ${message}`);
    this.name = 'LibraryError';
    this.code = code;
    this.detail = detail;
  }
}

export const PAPER_SCHEMA_VERSION = 2;
export const TEXT_MAX_CHARS = 200_000;

const str = (v) => typeof v === 'string' && v.trim().length > 0;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Validation problems of a paper (empty = ok). Each problem is `{ code, questionId?, message }`. `strict` (saving a
 * draft) validates what the author wrote, so a single-choice question with no correct option or a non-text explanation is
 * reported instead of being silently repaired; the lenient form (listing stored papers) mirrors what a session accepts,
 * since sessions normalize first (V1 behavior).
 */
export function validatePaper(paper, { strict = false } = {}) {
  const errs = [];
  if (!str(paper?.title)) errs.push({ code: 'TITLE_REQUIRED', message: 'a paper needs a title' });
  const qs = Array.isArray(paper?.questions) ? paper.questions : [];
  if (!qs.length) errs.push({ code: 'NO_QUESTIONS', message: 'a paper needs at least one question' });
  const seen = new Set();
  for (const raw of qs) {
    const q = strict ? raw : normalizeQuestion(raw);
    if (seen.has(q.id)) errs.push({ code: 'DUPLICATE_QUESTION', questionId: q.id, message: 'question ids must be unique' });
    seen.add(q.id);
    for (const m of validateQuestion(q)) errs.push({ code: 'QUESTION_INVALID', questionId: q.id, message: m });
    for (const ref of mediaRefs(q)) if (ref.id === null) errs.push({ code: 'MEDIA_ID_MISSING', questionId: q.id, message: `the ${ref.kind} has no media id` });
  }
  return errs;
}

export function validateDocument(doc) {
  const errs = [];
  if (!str(doc?.title)) errs.push({ code: 'TITLE_REQUIRED', message: 'a document needs a title' });
  if (!str(doc?.sourceLanguage)) errs.push({ code: 'SOURCE_LANGUAGE_REQUIRED', message: 'a source language is required' });
  if (!str(doc?.targetLanguage)) errs.push({ code: 'TARGET_LANGUAGE_REQUIRED', message: 'a target language is required' });
  const items = Array.isArray(doc?.items) ? doc.items : [];
  if (!items.length) errs.push({ code: 'NO_ITEMS', message: 'a document needs at least one sentence' });
  const seen = new Set();
  items.forEach((it, i) => {
    if (!str(it?.id)) errs.push({ code: 'ITEM_ID', message: `sentence ${i + 1} needs an id` });
    else if (seen.has(it.id)) errs.push({ code: 'ITEM_DUPLICATE', message: `duplicate sentence id ${it.id}` });
    else seen.add(it.id);
    if (!str(it?.sourceText)) errs.push({ code: 'SOURCE_TEXT_REQUIRED', message: `sentence ${i + 1} needs source text` });
    if (it && 'referenceTranslation' in it && typeof it.referenceTranslation !== 'string') errs.push({ code: 'REFERENCE_TYPE', message: `sentence ${i + 1}: the reference must be text` });
  });
  return errs;
}

export function validateTypingText(text) {
  const errs = [];
  if (!str(text?.title)) errs.push({ code: 'TITLE_REQUIRED', message: 'a typing text needs a title' });
  if (typeof text?.text !== 'string' || !text.text.trim()) errs.push({ code: 'TEXT_REQUIRED', message: 'the text is empty' });
  else if ([...text.text].length > TEXT_MAX_CHARS) errs.push({ code: 'TEXT_TOO_LONG', message: `a typing text may have at most ${TEXT_MAX_CHARS} characters` });
  return errs;
}

/**
 * @param {object} deps
 * @param {object} deps.port the Store Port
 * @param {() => string} deps.now ISO instant
 * @param {() => string} [deps.ids]
 */
export async function createLibrary({ port, now, ids = defaultId }) {
  const info = await port.schemaInfo();
  const spec = (name) => info.collections.find((c) => c.name === name);

  async function current(collection, id) {
    return (await port.read(collection, { id }))[0] ?? null;
  }

  /** Create or replace one Content record in a single Unit of Work, guarded by the revision the editor started from. */
  async function save(collection, payload, expectedRev) {
    const existing = await current(collection, payload.id);
    if (expectedRev === null || expectedRev === undefined) {
      if (existing) throw new LibraryError('EXISTS', `${collection}/${payload.id} already exists`);
    } else if (!existing) throw new LibraryError('GONE', `${collection}/${payload.id} no longer exists`);
    else if (existing.rev !== expectedRev) throw new LibraryError('STALE', 'this item was changed elsewhere since you opened it; reload it and apply your edit again');
    const pre = existing ? { kind: 'rev', collection, id: payload.id, equals: existing.rev } : { kind: 'absent', collection, id: payload.id };
    try {
      await port.commit({ preconditions: [pre], ops: [putOp(spec(collection), payload.id, payload)] });
    } catch (e) {
      if (e?.code === 'REJECT_PRECONDITION') throw new LibraryError('STALE', 'this item was changed elsewhere since you opened it; reload it and apply your edit again');
      throw e;
    }
    return { payload, rev: (await current(collection, payload.id)).rev };
  }

  const lib = {
    validatePaper, validateDocument, validateTypingText,

    /** Summary rows for the three domains plus translation folders. Newest first. */
    async list() {
      const [papers, docs, texts, folders] = await Promise.all([port.read('paper'), port.read('translation_document'), port.read('typing_text'), port.read('translation_folder')]);
      const byUpdated = (a, b) => cmp(b.updatedAt ?? '', a.updatedAt ?? '') || cmp(a.title, b.title) || cmp(a.id, b.id);
      return {
        papers: papers.map(({ payload: p, rev }) => ({
          domain: 'objective', kind: 'paper', id: p.id, rev, title: p.title || '', category: p.category || '', tags: Array.isArray(p.tags) ? p.tags : [], count: p.questions?.length ?? 0,
          hasMedia: (p.questions ?? []).some((q) => mediaRefs(q).length > 0), updatedAt: p.updatedAt ?? p.createdAt ?? '',
          ready: validatePaper(p).length === 0,
        })).sort(byUpdated),
        documents: docs.map(({ payload: d, rev }) => ({
          domain: 'translation', kind: 'document', id: d.id, rev, title: d.title || '', folderId: d.folderId, count: d.items?.length ?? 0,
          sourceLanguage: d.sourceLanguage || '', targetLanguage: d.targetLanguage || '', updatedAt: d.updatedAt ?? d.createdAt ?? '', ready: validateDocument(d).length === 0,
        })).sort(byUpdated),
        texts: texts.map(({ payload: t, rev }) => ({
          domain: 'typing', kind: 'text', id: t.id, rev, title: t.title || '', language: t.language || '', count: [...(t.text ?? '')].length, updatedAt: t.updatedAt ?? t.createdAt ?? '', ready: validateTypingText(t).length === 0,
        })).sort(byUpdated),
        folders: folders.map(({ payload: f }) => ({ id: f.id, name: f.name || '' })).sort((a, b) => cmp(a.name, b.name) || cmp(a.id, b.id)),
      };
    },

    /** The full record with the revision an editor must hand back to save. */
    async get(kind, id) {
      const collection = { paper: 'paper', document: 'translation_document', text: 'typing_text' }[kind];
      if (!collection) throw new LibraryError('BAD_KIND', `unknown kind ${kind}`);
      const row = await current(collection, id);
      return row ? { payload: row.payload, rev: row.rev } : null;
    },

    // ----------------------------------------------------------------------------------------------- papers
    /** A blank paper draft for the editor (not stored until saved). */
    newPaper: () => ({ schemaVersion: PAPER_SCHEMA_VERSION, id: ids(), title: '', description: '', category: '', tags: [], questions: [] }),

    async savePaper(draft, expectedRev = null) {
      const problems = validatePaper(draft, { strict: true });
      if (problems.length) throw new LibraryError('INVALID', problems.map((p) => p.message).join('; '), { problems });
      const at = now();
      const prior = expectedRev === null ? null : await current('paper', draft.id);
      const payload = {
        ...draft,
        schemaVersion: PAPER_SCHEMA_VERSION,
        id: String(draft.id),
        title: draft.title.trim(),
        description: typeof draft.description === 'string' ? draft.description : '',
        category: typeof draft.category === 'string' ? draft.category.trim() : '',
        tags: (Array.isArray(draft.tags) ? draft.tags : []).map((x) => String(x).trim()).filter(Boolean),
        questions: draft.questions.map((q) => normalizeQuestion(q)),
        createdAt: prior?.payload.createdAt ?? draft.createdAt ?? at,
        updatedAt: at,
      };
      return save('paper', payload, expectedRev);
    },

    // ------------------------------------------------------------------------------------ translation documents
    newDocument: (folderId = '') => ({ schemaVersion: 1, documentType: 'quiz-studio.translation-document', id: ids(), title: '', folderId, sourceLanguage: '', targetLanguage: '', items: [] }),

    /** Folders are required by the store; the first document creates the default folder when none exists. */
    async ensureFolder(name = 'Documents') {
      const rows = await port.read('translation_folder');
      if (rows.length) return rows.map((r) => r.payload).sort((a, b) => cmp(a.name, b.name) || cmp(a.id, b.id))[0];
      return lib.createFolder(name);
    },

    async createFolder(name) {
      if (!str(name)) throw new LibraryError('INVALID', 'a folder needs a name');
      const at = now();
      const payload = { schemaVersion: 1, id: ids(), name: name.trim(), createdAt: at, updatedAt: at };
      await port.commit({ preconditions: [{ kind: 'absent', collection: 'translation_folder', id: payload.id }], ops: [putOp(spec('translation_folder'), payload.id, payload)] });
      return payload;
    },

    async renameFolder(id, name) {
      if (!str(name)) throw new LibraryError('INVALID', 'a folder needs a name');
      const row = await current('translation_folder', id);
      if (!row) throw new LibraryError('GONE', 'the folder no longer exists');
      const payload = { ...row.payload, name: name.trim(), updatedAt: now() };
      await port.commit({ preconditions: [{ kind: 'rev', collection: 'translation_folder', id, equals: row.rev }], ops: [putOp(spec('translation_folder'), id, payload)] });
      return payload;
    },

    async deleteFolder(id) {
      const docs = await port.read('translation_document', { where: [{ column: 'folder_id', op: 'eq', value: id }] });
      if (docs.length) throw new LibraryError('NOT_EMPTY', 'move or delete the documents in this folder first', { documents: docs.length });
      await port.commit({ ops: [deleteOp('translation_folder', id)] });
    },

    async saveDocument(draft, expectedRev = null) {
      let folderId = draft.folderId;
      if (!str(folderId)) folderId = (await lib.ensureFolder()).id;
      const items = (Array.isArray(draft.items) ? draft.items : []).map((it, position) => ({ ...it, id: str(it.id) ? it.id : ids(), position }));
      const full = { ...draft, folderId, items };
      const problems = validateDocument(full);
      if (problems.length) throw new LibraryError('INVALID', problems.map((p) => p.message).join('; '), { problems });
      const at = now();
      const prior = expectedRev === null ? null : await current('translation_document', draft.id);
      const payload = {
        ...full,
        schemaVersion: Number.isInteger(draft.schemaVersion) ? draft.schemaVersion : 1,
        documentType: 'quiz-studio.translation-document',
        id: String(draft.id),
        title: draft.title.trim(),
        sourceLanguage: draft.sourceLanguage.trim(),
        targetLanguage: draft.targetLanguage.trim(),
        createdAt: prior?.payload.createdAt ?? draft.createdAt ?? at,
        updatedAt: at,
      };
      return save('translation_document', payload, expectedRev);
    },

    // ------------------------------------------------------------------------------------------ typing texts
    newTypingText: () => ({ schemaVersion: 1, id: ids(), title: '', text: '', language: '' }),

    async saveTypingText(draft, expectedRev = null) {
      const problems = validateTypingText(draft);
      if (problems.length) throw new LibraryError('INVALID', problems.map((p) => p.message).join('; '), { problems });
      const at = now();
      const prior = expectedRev === null ? null : await current('typing_text', draft.id);
      const payload = {
        ...draft,
        schemaVersion: 1,
        id: String(draft.id),
        title: draft.title.trim(),
        text: draft.text, // verbatim: the characters the learner will copy are exactly the characters that were written
        ...(str(draft.language) ? { language: draft.language.trim() } : {}),
        createdAt: prior?.payload.createdAt ?? draft.createdAt ?? at,
        updatedAt: at,
      };
      if (!str(draft.language)) delete payload.language;
      return save('typing_text', payload, expectedRev);
    },

    // -------------------------------------------------------------------------------------------- deletion
    /**
     * Delete one Content record. Evidence that refers to it is untouched (it keeps its own snapshot); schedules and
     * suggestions keep their soft reference, and the engine retires its own schedules of removed material on the next
     * sweep. The caller confirms with the learner first.
     */
    async remove(kind, id) {
      const collection = { paper: 'paper', document: 'translation_document', text: 'typing_text' }[kind];
      if (!collection) throw new LibraryError('BAD_KIND', `unknown kind ${kind}`);
      await port.commit({ ops: [deleteOp(collection, id)] });
    },
  };
  return lib;
}
