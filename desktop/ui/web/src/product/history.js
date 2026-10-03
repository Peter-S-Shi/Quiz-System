// Evidence History: a read-only view of what was ACTUALLY recorded - Learner Responses (Objective, Translation), Typing
// attempts, Teacher Reviews and migrated legacy history entries. It derives display facts (counts, formatted answers,
// lineage) from the records and writes nothing. It invents no mastery state, no score beyond the one the Objective
// record itself carries, and no judgment about Translation or Typing (Scope Freeze Rev.1 sections 6, 11, 12).
import { formatAnswer } from '../objective/session.js';
import { recordTime } from '../orchestration/readers.js';

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** The recorded completion instant as an ISO string (null when the record has none or it is unparsable). */
const isoOf = (payload) => {
  const ms = recordTime(payload);
  return ms === null ? null : new Date(ms).toISOString();
};

const domainOfType = (type) => (type === 'quiz-paper' ? 'objective' : type === 'translation-document' ? 'translation' : type === 'typing-text' ? 'typing' : null);

/** Newest first; undated records sort last (unknown is not "oldest"), ties by id. */
const newestFirst = (a, b) => {
  if (a.completedAt && b.completedAt) return cmp(b.completedAt, a.completedAt) || cmp(a.id, b.id);
  if (a.completedAt) return -1;
  if (b.completedAt) return 1;
  return cmp(a.id, b.id);
};

/** The V2 session facts namespace carries intent for new records; migrated records have none (unknown stays unknown). */
function intentOf(p) {
  const v = p?.extensions?.['quiz-studio.v2.session']?.intent;
  return v === 'practice' || v === 'test' ? v : p?.intent === 'practice' || p?.intent === 'test' ? p.intent : null;
}

function responseFacts(p) {
  if (p.material?.type === 'quiz-paper') {
    const s = isObj(p.summary) ? p.summary : {};
    return { kind: 'objective', itemCount: s.itemCount ?? p.responses?.length ?? 0, correctCount: s.correctCount ?? null, percent: s.percent ?? null };
  }
  if (p.material?.type === 'translation-document') {
    const marks = { unknown: 0, uncertain: 0, should_know: 0 };
    for (const m of p.learnerItemMarks ?? []) if (m.kind in marks) marks[m.kind] += 1;
    for (const a of p.learnerAnnotations ?? []) if (a.kind in marks) marks[a.kind] += 1;
    return { kind: 'translation', itemCount: p.summary?.itemCount ?? p.responses?.length ?? 0, answered: (p.responses ?? []).filter((r) => typeof r.answer === 'string' && r.answer.trim()).length, marks };
  }
  return { kind: 'other' };
}

/**
 * Every recorded attempt as a list entry, newest first, plus the Teacher Reviews grouped by the response they review.
 * @param {object} snapshot as built by `loadSnapshot` (responses, reviews, history, typingAttempts)
 */
export function buildHistory(snapshot) {
  const reviews = new Map();
  for (const r of snapshot.reviews) {
    const list = reviews.get(r.payload.responseId) ?? [];
    list.push(r);
    reviews.set(r.payload.responseId, list);
  }
  const entries = [];
  for (const r of snapshot.responses) {
    const p = r.payload;
    const domain = domainOfType(p.material?.type);
    if (!domain) continue;
    entries.push({
      key: `learner_response:${r.id}`, collection: 'learner_response', id: r.id, domain, legacy: false,
      migrated: snapshot.origins.has(`learner_response:${r.id}`),
      title: p.material?.title || '', materialType: p.material.type, materialId: p.material.id,
      completedAt: isoOf(p), intent: intentOf(p), purpose: p.provenance?.purpose ?? null,
      facts: responseFacts(p), reviewCount: (reviews.get(r.id) ?? []).length,
    });
  }
  for (const r of snapshot.typingAttempts) {
    const p = r.payload;
    entries.push({
      key: `typing_attempt:${r.id}`, collection: 'typing_attempt', id: r.id, domain: 'typing', legacy: false, migrated: false,
      title: p.material?.title || '', materialType: 'typing-text', materialId: p.material?.id,
      completedAt: isoOf(p), intent: p.intent ?? null, purpose: p.provenance?.purpose ?? null,
      facts: { kind: 'typing', referenceGraphemes: p.counts?.referenceGraphemes ?? 0, committedGraphemes: p.counts?.committedGraphemes ?? 0, errorCount: p.errors?.length ?? 0 },
      reviewCount: 0,
    });
  }
  // migrated V1 history: only `legacy-only` entries are attempts of their own; a `twin` duplicates a Learner Response and is never listed
  for (const h of snapshot.history) {
    const p = h.payload;
    if (p.role !== 'legacy-only' || !isObj(p.entry)) continue;
    const results = Array.isArray(p.entry.results) ? p.entry.results : [];
    const correct = results.filter((q) => q?.correct === true).length;
    entries.push({
      key: `legacy_history_entry:${h.id}`, collection: 'legacy_history_entry', id: h.id, domain: 'objective', legacy: true, migrated: true,
      title: typeof p.entry.paperTitle === 'string' ? p.entry.paperTitle : '', materialType: 'quiz-paper', materialId: p.entry.paperId ?? null,
      completedAt: isoOf(p.entry), intent: null, purpose: null,
      facts: { kind: 'objective', itemCount: results.length, correctCount: results.length ? correct : null, percent: results.length ? Math.round((100 * correct) / results.length) : null },
      reviewCount: 0,
    });
  }
  entries.sort(newestFirst);
  return { entries, reviews };
}

export function filterHistory(entries, { domain = 'all', query = '' } = {}) {
  const q = query.trim().toLowerCase();
  return entries.filter((e) => (domain === 'all' || e.domain === domain) && (!q || e.title.toLowerCase().includes(q)));
}

// ---------------------------------------------------------------------------------------------------------- details
function objectiveDetail(p) {
  const items = (p.material?.snapshot?.items ?? []).map((q) => {
    const resp = (p.responses ?? []).find((r) => r.itemId === q.id);
    let shown = '';
    try {
      shown = resp && resp.answer !== null && resp.answer !== undefined ? formatAnswer(q, resp.answer) : '';
    } catch {
      shown = '';
    }
    const result = resp?.result;
    return {
      id: q.id, type: q.type, prompt: q.prompt, answer: shown, answered: shown !== '', correct: typeof result?.correct === 'boolean' ? result.correct : null,
      correctLabel: result?.correctLabel ?? null, correctAnswer: result?.correctAnswer ?? null,
      explanation: typeof q.explanation === 'string' ? q.explanation : null, // the explanation of THAT moment, from the snapshot
      image: q.image ?? null, audio: q.audio ?? null,
    };
  });
  return { kind: 'objective', items };
}

function translationDetail(p, reviews) {
  const annotations = p.learnerAnnotations ?? [];
  const marks = new Map((p.learnerItemMarks ?? []).map((m) => [m.itemId, m.kind]));
  const items = (p.material?.snapshot?.items ?? []).map((it) => ({
    id: it.id, sourceText: it.sourceText, referenceTranslation: typeof it.referenceTranslation === 'string' ? it.referenceTranslation : null,
    answer: (p.responses ?? []).find((r) => r.itemId === it.id)?.answer ?? '',
    mark: marks.get(it.id) ?? null,
    annotations: annotations.filter((a) => a.itemId === it.id).map((a) => ({ id: a.id, kind: a.kind, start: a.start, end: a.end, text: a.text })),
    review: reviews.flatMap((rv) => (rv.payload.itemReviews ?? []).filter((x) => x.itemId === it.id).map((x) => ({ reviewId: rv.id, judgment: x.judgment ?? null, comment: x.comment ?? '', suggestedRevision: x.suggestedRevision ?? '', corrections: x.corrections ?? [] }))),
  }));
  return { kind: 'translation', sourceLanguage: p.material?.snapshot?.sourceLanguage ?? '', targetLanguage: p.material?.snapshot?.targetLanguage ?? '', items };
}

function typingDetail(p) {
  const ref = p.material?.snapshot?.text ?? '';
  const com = p.committed?.text ?? '';
  return {
    kind: 'typing', policy: p.policy ?? null, counts: p.counts ?? null, correctedErrorCount: p.correctedErrorCount ?? null,
    errors: (p.errors ?? []).map((e) => ({ kind: e.kind, reference: ref.slice(e.reference.start, e.reference.end), committed: com.slice(e.committed.start, e.committed.end) })),
    referenceText: ref, committedText: com,
  };
}

function legacyDetail(p) {
  const e = p.entry;
  return {
    kind: 'legacy',
    items: (Array.isArray(e.results) ? e.results : []).map((q) => ({ id: q.questionId ?? '', prompt: q.prompt ?? '', correct: typeof q.correct === 'boolean' ? q.correct : null, correctAnswer: q.correctAnswer ?? null })),
  };
}

/** The record behind a list entry shaped for display. `rows` are the same rows `buildHistory` was given. */
export function entryDetail(entry, snapshot, reviewsByResponse) {
  if (entry.collection === 'learner_response') {
    const row = snapshot.responses.find((r) => r.id === entry.id);
    if (!row) return null;
    const reviews = reviewsByResponse.get(entry.id) ?? [];
    return { payload: row.payload, ...(entry.domain === 'objective' ? objectiveDetail(row.payload) : translationDetail(row.payload, reviews)), reviews: reviews.map((r) => ({ id: r.id, reviewer: r.payload.reviewer ?? null, createdAt: r.payload.createdAt ?? null, summary: r.payload.summary ?? '' })) };
  }
  if (entry.collection === 'typing_attempt') {
    const row = snapshot.typingAttempts.find((r) => r.id === entry.id);
    return row ? { payload: row.payload, ...typingDetail(row.payload), reviews: [] } : null;
  }
  const row = snapshot.history.find((r) => r.id === entry.id);
  return row ? { payload: row.payload, ...legacyDetail(row.payload), reviews: [] } : null;
}

/** Lineage of a response: the response it retries / remediates and the responses that retry it (by recorded provenance only). */
export function lineageOf(entry, snapshot) {
  const rows = snapshot.responses;
  const self = rows.find((r) => r.id === entry.id);
  const sourceId = self?.payload.provenance?.sourceResponseId ?? null;
  return {
    source: sourceId && rows.some((r) => r.id === sourceId) ? sourceId : null,
    sourceMissing: sourceId !== null && !rows.some((r) => r.id === sourceId),
    retries: rows.filter((r) => r.payload.provenance?.sourceResponseId === entry.id).map((r) => r.id).sort(),
    purpose: self?.payload.provenance?.purpose ?? null,
  };
}
