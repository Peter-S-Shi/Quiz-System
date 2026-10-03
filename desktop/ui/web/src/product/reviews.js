// Review / Correction service: independent Teacher Reviews of recorded Learner Responses. A review is its own record
// (the response is never touched, Scope Freeze Rev.1 section 11), created by the local learner-as-reviewer or imported
// from an external reviewer. This module builds, validates, stores and exchanges reviews through the Teacher Review
// contract ported from V1 (exchange/teacher-review.js); it never writes a mastery or grade and never edits a response.
import { putOp } from '../projection.js';
import { newId as defaultId } from '../ids.js';
import { normalizeTeacherReview, validateTeacherReview, validateCanonicalTeacherReview, classifyTeacherReviewImport, parseExternalTeacherReviewText } from '../exchange/teacher-review.js';
import { createReviewRequestPackage, createRemediationRequestPackage, parseRemediationTranslationDocumentText, validateRemediationImportProvenance } from '../exchange/review-request.js';
import { remapDocumentForCopy } from '../exchange/translation-import.js';

export class ReviewError extends Error {
  constructor(code, message, detail = {}) {
    super(`${code}: ${message}`);
    this.name = 'ReviewError';
    this.code = code;
    this.detail = detail;
  }
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const hasContent = (x) => Boolean(x.judgment) || (x.comment ?? '').trim() !== '' || (x.suggestedRevision ?? '').trim() !== '' || (x.tags?.length ?? 0) > 0 || (x.corrections?.length ?? 0) > 0;

/** The items of a response a reviewer can look at, with the learner's text where it is text. */
export function reviewableItems(response) {
  const snapshot = response?.material?.snapshot?.items ?? [];
  return (response?.responses ?? []).map((r) => {
    const item = snapshot.find((x) => x.id === r.itemId) ?? {};
    return {
      itemId: r.itemId,
      prompt: item.prompt ?? item.sourceText ?? '',
      answerText: typeof r.answer === 'string' ? r.answer : null, // corrections anchor to text only
      referenceTranslation: typeof item.referenceTranslation === 'string' ? item.referenceTranslation : null,
    };
  });
}

/**
 * @param {object} deps
 * @param {object} deps.port
 * @param {() => string} deps.now
 * @param {() => string} [deps.ids]
 * @param {object} deps.library the Library service (imported remediation documents are stored as Content through it)
 */
export async function createReviews({ port, now, ids = defaultId, library }) {
  const info = await port.schemaInfo();
  const spec = (name) => info.collections.find((c) => c.name === name);
  const responseRow = async (id) => (await port.read('learner_response', { id }))[0] ?? null;

  const svc = {
    reviewableItems,

    /** Every Learner Response with the number of reviews it has, newest first (undated last). */
    async list() {
      const [responses, reviews] = await Promise.all([port.read('learner_response'), port.read('teacher_review')]);
      const counts = new Map();
      for (const r of reviews) counts.set(r.payload.responseId, (counts.get(r.payload.responseId) ?? 0) + 1);
      return responses.map((r) => ({
        id: r.id, title: r.payload.material?.title ?? '', domain: r.payload.material?.type === 'translation-document' ? 'translation' : 'objective',
        completedAt: r.payload.session?.completedAt ?? r.payload.finalizedAt ?? null, itemCount: r.payload.responses?.length ?? 0, reviewCount: counts.get(r.id) ?? 0,
      })).sort((a, b) => (a.completedAt && b.completedAt ? cmp(b.completedAt, a.completedAt) : a.completedAt ? -1 : b.completedAt ? 1 : 0) || cmp(a.id, b.id));
    },

    async reviewsOf(responseId) {
      return (await port.read('teacher_review', { where: [{ column: 'response_id', op: 'eq', value: responseId }] }))
        .map((r) => ({ id: r.id, rev: r.rev, payload: r.payload })).sort((a, b) => cmp(a.payload.createdAt ?? '', b.payload.createdAt ?? '') || cmp(a.id, b.id));
    },

    /** A blank draft for one response (not stored). `items[itemId]` holds what the reviewer has entered. */
    newDraft(response, reviewer = { type: 'human', displayLabel: '' }) {
      return { responseId: response.id, reviewer: { ...reviewer }, summary: '', items: Object.fromEntries((response.responses ?? []).map((r) => [r.itemId, { judgment: '', comment: '', tags: [], suggestedRevision: '', corrections: [] }])), remediationRecommendations: [] };
    },

    /** The canonical Teacher Review a draft stands for (items with no content are left out). */
    build(draft, response) {
      const itemReviews = Object.entries(draft.items ?? {}).filter(([, x]) => hasContent(x)).map(([itemId, x]) => ({
        itemId,
        ...(x.judgment ? { judgment: x.judgment } : {}),
        ...((x.comment ?? '').trim() ? { comment: x.comment } : {}),
        ...(x.tags?.length ? { tags: x.tags.map(String) } : {}),
        ...((x.suggestedRevision ?? '').trim() ? { suggestedRevision: x.suggestedRevision } : {}),
        ...(x.corrections?.length ? { corrections: x.corrections.map((c) => ({ ...c })) } : {}),
      }));
      const order = new Map((response.responses ?? []).map((r, i) => [r.itemId, i]));
      itemReviews.sort((a, b) => (order.get(a.itemId) ?? 0) - (order.get(b.itemId) ?? 0));
      return normalizeTeacherReview({
        schemaVersion: 1, documentType: 'quiz-studio.teacher-review', id: draft.id ?? ids(), responseId: response.id, createdAt: draft.createdAt ?? now(),
        reviewer: draft.reviewer, ...((draft.summary ?? '').trim() ? { summary: draft.summary } : {}), itemReviews, remediationRecommendations: draft.remediationRecommendations ?? [],
      });
    },

    /** Validate a draft against its response (the Teacher Review contract). Returns the review and the problems. */
    check(draft, response) {
      const review = svc.build(draft, response);
      const v = validateTeacherReview(review, { learnerResponse: response });
      const empty = review.itemReviews.length === 0 && !review.summary;
      return { review, errors: empty ? ['There is nothing to save yet: judge an item, add a correction or write a comment.', ...v.errors] : v.errors };
    },

    /** Store a new review. Create-only: a review is a separate record, the response and earlier reviews are untouched. */
    async save(draft) {
      const row = await responseRow(draft.responseId);
      if (!row) throw new ReviewError('RESPONSE_GONE', 'the recorded response no longer exists');
      const { review, errors } = svc.check(draft, row.payload);
      if (errors.length) throw new ReviewError('INVALID', errors.join(' '), { errors });
      await port.commit({ preconditions: [{ kind: 'absent', collection: 'teacher_review', id: review.id }], ops: [putOp(spec('teacher_review'), review.id, review)] });
      return review;
    },

    // --------------------------------------------------------------------------------------------- exchange
    /** The portable Teacher Review document of a stored review (as stored: it already is the public contract). */
    async exportReview(id) {
      const [row] = await port.read('teacher_review', { id });
      if (!row) throw new ReviewError('NOT_FOUND', 'the review no longer exists');
      return { name: `teacher-review-${id.slice(0, 8)}.json`, text: `${JSON.stringify(row.payload, null, 2)}\n` };
    },

    async exportReviewRequest(responseId) {
      const row = await responseRow(responseId);
      if (!row) throw new ReviewError('NOT_FOUND', 'the response no longer exists');
      const pkg = createReviewRequestPackage({ id: ids(), learnerResponse: row.payload, exportedAt: now() });
      return { name: `review-request-${responseId.slice(0, 8)}.json`, text: `${JSON.stringify(pkg, null, 2)}\n` };
    },

    async exportRemediationRequest(responseId, reviewId) {
      const row = await responseRow(responseId);
      const [rv] = await port.read('teacher_review', { id: reviewId });
      if (!row || !rv) throw new ReviewError('NOT_FOUND', 'the response or review no longer exists');
      if (rv.payload.responseId !== responseId) throw new ReviewError('MISMATCH', 'that review belongs to a different response');
      const pkg = createRemediationRequestPackage({ id: ids(), learnerResponse: row.payload, teacherReview: rv.payload, exportedAt: now() });
      return { name: `remediation-request-${responseId.slice(0, 8)}.json`, text: `${JSON.stringify(pkg, null, 2)}\n` };
    },

    /**
     * Import step 1 (nothing is stored): parse and validate an external Teacher Review against the response it names, and
     * classify it - a new review, the same review again (nothing to do), an explicit update, or a refusal.
     */
    async previewReviewImport(text) {
      let raw = null;
      try { raw = JSON.parse(text); } catch { /* reported below */ }
      const responseId = typeof raw?.responseId === 'string' ? raw.responseId : null;
      const target = responseId ? await responseRow(responseId) : null;
      const parsed = parseExternalTeacherReviewText(text, { learnerResponse: target?.payload });
      if (!parsed.review) return { ok: false, errors: parsed.errors, kind: 'invalid' };
      if (!target) return { ok: false, errors: [`The response this review is about (${responseId}) is not in this library.`], kind: 'no-response', review: parsed.review };
      // validated against the real response
      const strict = validateCanonicalTeacherReview(parsed.review, { learnerResponse: target.payload });
      if (!strict.valid) return { ok: false, errors: strict.errors, kind: 'invalid' };
      const existing = (await port.read('teacher_review', { id: parsed.review.id }))[0] ?? null;
      const klass = classifyTeacherReviewImport(parsed.review, existing ? [existing.payload] : []);
      return {
        ok: klass.kind !== 'reassigned-reject', errors: klass.kind === 'reassigned-reject' ? ['A review with this id already belongs to a different response; it will not be moved.'] : [],
        kind: klass.kind, review: parsed.review, existingRev: existing?.rev ?? null,
        summary: { responseTitle: target.payload.material?.title ?? '', reviewer: parsed.review.reviewer, reviewId: parsed.review.id, itemCount: parsed.review.itemReviews.length, correctionCount: parsed.review.itemReviews.reduce((n, i) => n + (i.corrections?.length ?? 0), 0) },
      };
    },

    /** Import step 2: store what the preview showed. Idempotent for an identical review; an update is explicit and guarded. */
    async commitReviewImport(preview) {
      if (!preview?.ok) throw new ReviewError('NOT_ALLOWED', 'this review cannot be imported');
      if (preview.kind === 'idempotent') return { stored: false, review: preview.review };
      const pre = preview.kind === 'update' ? { kind: 'rev', collection: 'teacher_review', id: preview.review.id, equals: preview.existingRev } : { kind: 'absent', collection: 'teacher_review', id: preview.review.id };
      try {
        await port.commit({ preconditions: [pre], ops: [putOp(spec('teacher_review'), preview.review.id, preview.review)] });
      } catch (e) {
        if (e?.code === 'REJECT_PRECONDITION') throw new ReviewError('STALE', 'the library changed since the preview; open the file again');
        throw e;
      }
      return { stored: true, review: preview.review };
    },

    /**
     * Remediation material (a Translation Document that claims `provenance.purpose = remediation`) is accepted only if its
     * provenance really traces back to a response and review in THIS library.
     */
    async previewRemediationImport(text) {
      const parsed = parseRemediationTranslationDocumentText(text);
      if (!parsed.document) return { ok: false, errors: parsed.errors };
      const [responses, reviews] = await Promise.all([port.read('learner_response'), port.read('teacher_review')]);
      const prov = validateRemediationImportProvenance(parsed.document, { learnerResponses: responses.map((r) => r.payload), teacherReviews: reviews.map((r) => r.payload) });
      if (!prov.valid) return { ok: false, errors: prov.errors };
      const collision = (await port.read('translation_document', { id: parsed.document.id })).length > 0;
      return { ok: true, errors: [], document: parsed.document, collision, summary: { title: parsed.document.title, itemCount: parsed.document.items.length, sourceResponseId: parsed.document.provenance.sourceResponseId, sourceReviewId: parsed.document.provenance.sourceReviewId } };
    },

    async commitRemediationImport(preview, { folderId = '' } = {}) {
      if (!preview?.ok) throw new ReviewError('NOT_ALLOWED', 'this document cannot be imported');
      let doc = preview.document;
      if (preview.collision) doc = remapDocumentForCopy(doc);
      // the folder named by an external file means nothing here: use the chosen one, else a folder that exists, else a default
      const folders = (await port.read('translation_folder')).map((f) => f.id);
      const target = [folderId, doc.folderId].find((f) => f && folders.includes(f)) ?? (await library.ensureFolder('Imported')).id;
      return library.saveDocument({ ...doc, folderId: target });
    },
  };
  return svc;
}
