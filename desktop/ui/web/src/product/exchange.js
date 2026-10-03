// Content exchange: portable quiz papers (with their media inline), and Translation Document import from JSON or plain
// text. Everything is a two-step flow: PREVIEW parses and validates and stores nothing; COMMIT stores what the preview
// showed. Imported files are untrusted data: they are validated, never trusted for identity (a colliding id becomes a copy,
// never an overwrite), and media is re-stored through the media pipeline by content.
import { fetchMedia, storeMedia, mimeMatchesKind, base64ToBytes, bytesToBase64 } from '../media/media-source.js';
import { mediaRefs, normalizeQuestion } from '../objective/questions.js';
import { newId as defaultId } from '../ids.js';
import { parseBilingualText, parseSourceOnlyText, parseTranslationDocumentJsonText, remapDocumentForCopy, TRANSLATION_DOCUMENT_TYPE } from '../exchange/translation-import.js';
import { validatePaper } from './library.js';

export const PORTABLE_PAPER_SCHEMA_VERSION = 2;
export const PORTABLE_PAPER_DOCUMENT_TYPE = 'quiz-studio.quiz-paper';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function decodeAssetData(data) {
  if (typeof data !== 'string') return null;
  const clean = data.startsWith('data:') ? data.split(',')[1] ?? '' : data.trim();
  if (!clean || clean.length % 4 !== 0 || !BASE64.test(clean)) return null;
  try { return base64ToBytes(clean); } catch { return null; }
}

/**
 * @param {object} deps
 * @param {object} deps.port
 * @param {() => string} deps.now
 * @param {() => string} [deps.ids]
 * @param {object} deps.library
 */
export function createExchange({ port, now, ids = defaultId, library }) {
  const ex = {
    // ----------------------------------------------------------------------------------------------- papers
    /** A self-contained portable paper: the paper as stored plus every media object it references, inline. */
    async exportPaper(paperId) {
      const row = await library.get('paper', paperId);
      if (!row) throw new Error('the paper no longer exists');
      const paper = row.payload;
      const assets = [];
      const seen = new Set();
      for (const q of paper.questions) {
        for (const ref of mediaRefs(q)) {
          if (ref.id === null || seen.has(ref.id)) continue;
          seen.add(ref.id);
          const media = await fetchMedia(port, ref.id);
          const [rec] = await port.read('media_object', { id: ref.id });
          assets.push({ id: ref.id, name: rec?.payload?.name ?? ref.id, mimeType: media.mimeType, data: bytesToBase64(media.bytes) });
        }
      }
      const pkg = { schemaVersion: PORTABLE_PAPER_SCHEMA_VERSION, documentType: PORTABLE_PAPER_DOCUMENT_TYPE, exportedAt: now(), paper, assets };
      return { name: `quiz-paper-${paper.id.slice(0, 8)}.json`, text: `${JSON.stringify(pkg, null, 2)}\n` };
    },

    /** Parse and validate a portable paper (envelope, or a bare paper object). Stores nothing. */
    async previewPaperImport(text) {
      let raw;
      try { raw = JSON.parse(text); } catch { return { ok: false, errors: ['The file is not valid JSON.'] }; }
      if (!isObj(raw)) return { ok: false, errors: ['The file must contain a JSON object.'] };
      let paper = null;
      let assets = [];
      if (raw.documentType === PORTABLE_PAPER_DOCUMENT_TYPE && isObj(raw.paper) && Array.isArray(raw.paper.questions)) { paper = raw.paper; assets = raw.assets; }
      else if (Array.isArray(raw.questions)) { paper = raw; assets = raw.assets ?? raw.mediaAssets; }
      else if (isObj(raw.paper) && Array.isArray(raw.paper.questions)) { paper = raw.paper; assets = raw.assets; }
      else return { ok: false, errors: ['Could not find a paper (a questions array) in this file.'] };
      assets = Array.isArray(assets) ? assets : [];

      const errors = [];
      const decoded = new Map();
      for (const a of assets) {
        if (!isObj(a) || typeof a.id !== 'string' || !a.id.trim()) { errors.push('A media asset has no id.'); continue; }
        const bytes = decodeAssetData(a.data);
        if (!bytes || bytes.length === 0) { errors.push(`Media asset ${a.id} has no readable data.`); continue; }
        if (!mimeMatchesKind('image', a.mimeType) && !mimeMatchesKind('audio', a.mimeType)) { errors.push(`Media asset ${a.id} has an unsupported type.`); continue; }
        decoded.set(a.id.trim(), { id: a.id.trim(), name: typeof a.name === 'string' ? a.name : a.id, mimeType: a.mimeType, bytes });
      }
      const draft = { ...paper, id: typeof paper.id === 'string' && paper.id.trim() ? paper.id : ids(), questions: (paper.questions ?? []).map((q) => normalizeQuestion(q)) };
      for (const q of draft.questions) {
        for (const ref of mediaRefs(q)) {
          if (ref.id === null) errors.push(`Question "${q.prompt.slice(0, 30)}" has ${ref.kind} without an id.`);
          else if (!decoded.has(ref.id)) errors.push(`The ${ref.kind} ${ref.id} is not included in the file.`);
          else if (!mimeMatchesKind(ref.kind, decoded.get(ref.id).mimeType)) errors.push(`The ${ref.kind} ${ref.id} has a ${decoded.get(ref.id).mimeType} payload.`);
        }
      }
      for (const p of validatePaper(draft, { strict: true })) errors.push(p.message);
      if (errors.length) return { ok: false, errors: [...new Set(errors)] };
      const collision = Boolean(await library.get('paper', draft.id));
      return { ok: true, errors: [], paper: draft, assets: decoded, collision, summary: { title: draft.title, questionCount: draft.questions.length, mediaCount: decoded.size } };
    },

    /** Store a previewed paper: media first (content-addressed, idempotent), then the paper in one Unit of Work. */
    async commitPaperImport(preview) {
      if (!preview?.ok) throw new Error('this paper cannot be imported');
      const idMap = new Map();
      for (const a of preview.assets.values()) {
        const stored = await storeMedia(port, { name: a.name, mimeType: a.mimeType, bytes: a.bytes });
        idMap.set(a.id, stored.id);
      }
      const paper = structuredClone(preview.paper);
      for (const q of paper.questions) {
        for (const kind of ['image', 'audio']) if (q[kind]?.id) q[kind] = { ...q[kind], id: idMap.get(q[kind].id) };
      }
      if (preview.collision) {
        paper.id = ids();
        paper.title = `${paper.title} (copy)`;
        paper.questions = paper.questions.map((q) => ({ ...q, id: ids() }));
      }
      delete paper.assets;
      delete paper.mediaAssets;
      return library.savePaper(paper);
    },

    // --------------------------------------------------------------------------------------- translation documents
    /** `kind`: 'json' (a Translation Document file), 'source-only' (one sentence per line) or 'bilingual' (source TAB reference). */
    async previewDocumentImport(text, kind, { title = '', sourceLanguage = '', targetLanguage = '' } = {}) {
      if (kind === 'json') {
        const r = parseTranslationDocumentJsonText(text);
        if (!r.document) return { ok: false, errors: r.errors };
        const collision = Boolean(await library.get('document', r.document.id));
        return { ok: true, errors: [], document: r.document, collision, summary: { title: r.document.title, itemCount: r.document.items.length } };
      }
      const parsed = kind === 'bilingual' ? parseBilingualText(text) : parseSourceOnlyText(text);
      const errors = [...parsed.errors];
      if (!title.trim()) errors.push('A title is required.');
      if (!sourceLanguage.trim() || !targetLanguage.trim()) errors.push('Source and target languages are required.');
      if (errors.length) return { ok: false, errors };
      const document = { ...library.newDocument(), title: title.trim(), sourceLanguage: sourceLanguage.trim(), targetLanguage: targetLanguage.trim(), items: parsed.items };
      return { ok: true, errors: [], document, collision: false, summary: { title: document.title, itemCount: document.items.length } };
    },

    async commitDocumentImport(preview, { folderId = '' } = {}) {
      if (!preview?.ok) throw new Error('this document cannot be imported');
      let doc = preview.document;
      if (preview.collision) doc = { ...remapDocumentForCopy(doc), title: `${doc.title} (copy)` };
      const folders = (await library.list()).folders.map((f) => f.id);
      const target = [folderId, doc.folderId].find((f) => f && folders.includes(f)) ?? (await library.ensureFolder('Imported')).id;
      return library.saveDocument({ ...doc, folderId: target });
    },

    /** The Translation Document of a stored document as a portable file. */
    async exportDocument(documentId) {
      const row = await library.get('document', documentId);
      if (!row) throw new Error('the document no longer exists');
      return { name: `translation-document-${documentId.slice(0, 8)}.json`, text: `${JSON.stringify({ ...row.payload, documentType: TRANSLATION_DOCUMENT_TYPE }, null, 2)}\n` };
    },
  };
  return ex;
}
