// Evidence Readers (ADR 0003 section 12.1). One reader per entry of the Evidence Source Registry; each turns native
// records into SIGNALS of its own domain. There is no universal EvidenceRecord and no flattened confidence: a signal is
// derived, ephemeral and carries provenance pointers (collection, id[, itemId]) - ids, never positions or timestamps.
//
// The unknown-is-not-negative rules (section 12.2) are enforced here, in one place:
//  1. a signal exists only when a RECORDED fact asserts it - no absence produces a signal;
//  2. migration gaps (`migration_origin.gaps`) and origin-absent facts are unknown: no retry/recovery/"confident"/
//     "unscheduled debt" signal is ever derived from them;
//  3. a temporal relation (latest / after) needs recorded, comparable ordering, otherwise it is unknown;
//  4. success is never inferred across domains: a Translation retry recovers only under an all-`correct` Teacher Review;
//  5. Teacher commentary is not remediation;
//  6. `legacy-only` history entries are attempts for (paperId, questionId) only; `twin` entries never create signals.

import { expandOccurrences, isUnresolved } from './occurrences.js';

/** The closed Evidence Source Registry (adding a source needs an ADR amendment). */
export const EVIDENCE_SOURCES = ['learner_response', 'teacher_review', 'legacy_history_entry'];

export const ACTIONABLE_JUDGMENTS = ['incorrect', 'partial', 'needs-review'];
const LEARNER_KINDS = { unknown: 'LEARNER_UNKNOWN', uncertain: 'LEARNER_UNCERTAIN', should_know: 'LEARNER_SHOULD_KNOW' };

export const domainOfMaterialType = (type) => (type === 'quiz-paper' ? 'objective' : type === 'translation-document' ? 'translation' : null);
export const materialKey = (m) => `${m.type}|${m.id}`;
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const refKey = (r) => `${r.collection}|${r.id}|${r.itemId ?? ''}`;

export function recordTime(payload) {
  const raw = payload?.session?.completedAt ?? payload?.finalizedAt ?? payload?.completedAt ?? null;
  const t = typeof raw === 'string' ? Date.parse(raw) : NaN;
  return Number.isFinite(t) ? t : null;
}

/** Records without a `migration_origin` row are native V2 records. */
export function originOf(snapshot, collection, id) {
  return snapshot.origins.get(`${collection}:${id}`) ?? null;
}
export const isNative = (snapshot, collection, id) => originOf(snapshot, collection, id) === null;

/** Latest of `items` (each `{id, time}`) - or `{ unknown: true }` when two or more cannot be ordered. */
function latestOf(items) {
  if (items.length === 1) return { item: items[0] };
  if (items.some((i) => i.time === null)) return { unknown: true };
  const sorted = [...items].sort((a, b) => a.time - b.time || (a.id < b.id ? -1 : 1));
  return { item: sorted[sorted.length - 1] };
}

function sig(code, material, provenance, extra = {}) {
  const prov = [...new Map(provenance.map((p) => [refKey(p), p])).values()].sort((a, b) => (refKey(a) < refKey(b) ? -1 : 1));
  return { code, material: { type: material.type, id: material.id }, provenance: prov, ...extra };
}

// ------------------------------------------------------------------------------------------------ Objective
function objectiveAttempts(snapshot) {
  const out = new Map();
  const add = (m, a) => {
    const k = materialKey(m);
    if (!out.has(k)) out.set(k, { material: m, attempts: [] });
    out.get(k).attempts.push(a);
  };
  for (const r of snapshot.responses) {
    const p = r.payload;
    if (p.material?.type !== 'quiz-paper' || !Array.isArray(p.responses)) continue;
    const items = new Map();
    for (const it of p.responses) if (typeof it?.result?.correct === 'boolean' && typeof it.itemId === 'string') items.set(it.itemId, it.result.correct);
    add({ type: 'quiz-paper', id: p.material.id }, { collection: 'learner_response', id: r.id, time: recordTime(p), items });
  }
  // counting contract (ADR 0002 section 8.2): only `legacy-only` history entries are attempts; twins never are
  for (const h of snapshot.history) {
    const p = h.payload;
    if (p.role !== 'legacy-only' || typeof p.entry?.paperId !== 'string') continue;
    const items = new Map();
    for (const q of Array.isArray(p.entry.results) ? p.entry.results : []) if (typeof q?.correct === 'boolean' && typeof q.questionId === 'string') items.set(q.questionId, q.correct);
    for (const q of Array.isArray(p.entry.missedQuestionIds) ? p.entry.missedQuestionIds : []) if (typeof q === 'string') items.set(q, false);
    add({ type: 'quiz-paper', id: p.entry.paperId }, { collection: 'legacy_history_entry', id: h.id, time: recordTime(p.entry), items });
  }
  return out;
}

export function readObjective(snapshot) {
  const signals = [];
  for (const { material, attempts } of objectiveAttempts(snapshot).values()) {
    const itemIds = [...new Set(attempts.flatMap((a) => [...a.items.keys()]))].sort();
    for (const itemId of itemIds) {
      const having = attempts.filter((a) => a.items.has(itemId));
      const wrong = having.filter((a) => a.items.get(itemId) === false);
      if (wrong.length >= 2) {
        signals.push(sig('OBJECTIVE_INCORRECT_REPEATED', material, wrong.map((a) => ({ collection: a.collection, id: a.id, itemId })), { itemId }));
      }
      const latest = latestOf(having);
      if (!latest.unknown && latest.item.items.get(itemId) === false) {
        signals.push(sig('OBJECTIVE_INCORRECT_LATEST', material, [{ collection: latest.item.collection, id: latest.item.id, itemId }], { itemId }));
      }
    }
  }
  return signals;
}

// ---------------------------------------------------------------------------------------------- Translation
export function readTranslation(snapshot) {
  const signals = [];
  const byMaterial = new Map();
  for (const r of snapshot.responses) {
    const p = r.payload;
    if (p.material?.type !== 'translation-document') continue;
    const k = p.material.id;
    if (!byMaterial.has(k)) byMaterial.set(k, []);
    byMaterial.get(k).push({ id: r.id, time: recordTime(p), payload: p });
  }
  for (const [materialId, list] of byMaterial) {
    const latest = latestOf(list);
    if (latest.unknown) continue; // ordering unknown: no annotation signal (rule 3)
    const p = latest.item.payload;
    const seen = new Set();
    const facts = [...(Array.isArray(p.learnerAnnotations) ? p.learnerAnnotations : []), ...(Array.isArray(p.learnerItemMarks) ? p.learnerItemMarks : [])];
    for (const f of facts) {
      const code = LEARNER_KINDS[f?.kind];
      if (!code || typeof f.itemId !== 'string') continue;
      const k = `${code}|${f.itemId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      signals.push(sig(code, { type: 'translation-document', id: materialId }, [{ collection: 'learner_response', id: latest.item.id, itemId: f.itemId }], { itemId: f.itemId }));
    }
  }
  return signals;
}

// ------------------------------------------------------------------------------- Teacher Review / retry / recovery
function responseById(snapshot) {
  return new Map(snapshot.responses.map((r) => [r.id, r]));
}

function retryOf(snapshot) {
  // recorded lineage only: provenance.purpose === 'retry' with a sourceResponseId
  const out = [];
  for (const r of snapshot.responses) {
    const pr = r.payload.provenance;
    if (pr?.purpose === 'retry' && typeof pr.sourceResponseId === 'string') out.push({ retry: r, sourceId: pr.sourceResponseId });
  }
  return out;
}

export function readTeacherReview(snapshot) {
  const signals = [];
  const responses = responseById(snapshot);
  const retried = new Set(retryOf(snapshot).map((x) => x.sourceId));
  for (const rv of snapshot.reviews) {
    const resp = responses.get(rv.payload.responseId);
    if (!resp?.payload.material) continue; // a dangling review has no material to speak about
    const material = resp.payload.material;
    for (const it of Array.isArray(rv.payload.itemReviews) ? rv.payload.itemReviews : []) {
      if (ACTIONABLE_JUDGMENTS.includes(it?.judgment) && typeof it.itemId === 'string') {
        signals.push(sig('TEACHER_ACTIONABLE_REVIEW', material, [{ collection: 'teacher_review', id: rv.id, itemId: it.itemId }], { itemId: it.itemId }));
      }
    }
    const rem = rv.payload.remediationRecommendations;
    if (Array.isArray(rem) && rem.length > 0 && !retried.has(resp.id)) {
      signals.push(sig('REMEDIATION_UNRESOLVED', material, [{ collection: 'teacher_review', id: rv.id }]));
    }
  }
  return signals;
}

/** Successful recoveries, each with the provenance selectors it supersedes (urgency only; history is never erased). */
export function readRecovery(snapshot) {
  const recoveries = [];
  const responses = responseById(snapshot);
  for (const { retry, sourceId } of retryOf(snapshot)) {
    const source = responses.get(sourceId);
    if (!source?.payload.material) continue; // dangling lineage is carried but proves nothing
    const material = source.payload.material;
    if (material.type === 'quiz-paper') {
      const srcItems = new Map((source.payload.responses ?? []).filter((x) => typeof x?.result?.correct === 'boolean').map((x) => [x.itemId, x.result.correct]));
      const retryItems = new Map((retry.payload.responses ?? []).filter((x) => typeof x?.result?.correct === 'boolean').map((x) => [x.itemId, x.result.correct]));
      for (const [itemId, ok] of [...retryItems].sort()) {
        if (ok === true && srcItems.get(itemId) === false) {
          recoveries.push({
            signal: sig('SUCCESSFUL_RECOVERY', material, [{ collection: 'learner_response', id: retry.id, itemId }, { collection: 'learner_response', id: source.id, itemId }], { itemId }),
            supersedes: [{ collection: 'learner_response', id: source.id, itemId }],
          });
        }
      }
    } else if (material.type === 'translation-document') {
      const reviews = snapshot.reviews.filter((rv) => rv.payload.responseId === retry.id);
      const judged = reviews.flatMap((rv) => (Array.isArray(rv.payload.itemReviews) ? rv.payload.itemReviews : []));
      const retryItemIds = (retry.payload.responses ?? []).map((x) => x.itemId);
      const covered = new Set(judged.map((x) => x.itemId));
      const allCorrect = judged.length > 0 && judged.every((x) => x.judgment === 'correct') && retryItemIds.length > 0 && retryItemIds.every((i) => covered.has(i));
      if (allCorrect) {
        const sourceReviews = snapshot.reviews.filter((rv) => rv.payload.responseId === source.id).map((rv) => ({ collection: 'teacher_review', id: rv.id }));
        recoveries.push({
          signal: sig('SUCCESSFUL_RECOVERY', material, [{ collection: 'learner_response', id: retry.id }, ...reviews.map((rv) => ({ collection: 'teacher_review', id: rv.id }))]),
          supersedes: [{ collection: 'learner_response', id: source.id }, ...sourceReviews],
        });
      }
    }
  }
  return recoveries;
}

// ----------------------------------------------------------------------------------------------- Scheduling
const URGENCY = ['overdue', 'due', 'scheduled'];

/** Scheduling context as seen by the Recommender: derived states only (never evidence of knowledge, E-2). */
export function readScheduling(snapshot, today) {
  const signals = [];
  const notes = new Map();
  for (const s of snapshot.schedules) {
    if (s.payload.status !== 'active') continue;
    const r = expandOccurrences({ schedule: s.payload, exceptions: s.exceptions, fulfillments: s.fulfillments }, { from: today, to: today }, today);
    const open = r.occurrences.filter((o) => isUnresolved(o.state));
    const material = s.payload.slot.material;
    const worst = URGENCY.find((u) => open.some((o) => o.state === u));
    if (worst) notes.set(materialKey(material), { scheduleId: s.payload.id, state: worst });
    if (worst === 'overdue' || worst === 'due') {
      const mine = s.payload.owner === 'engine';
      const code = `${mine ? 'SCHEDULED_REVIEW' : 'LEARNER_SCHEDULED'}_${worst === 'overdue' ? 'OVERDUE' : 'DUE'}`;
      signals.push(sig(code, material, [{ collection: 'schedule', id: s.payload.id }]));
    }
  }
  return { signals, notes };
}

/** Typing is a reserved Task Domain: its Reader arrives with the Typing integration (ADR 0003 section 12.1). */
export function readTyping() {
  return [];
}

/** `(slot) => boolean`: does the slot's material still exist? Unknown material types (Typing, reserved) count as available. */
export function materialAvailability(snapshot) {
  return (slot) => {
    const known = snapshot.materials?.[slot.material.type];
    return known ? known.has(slot.material.id) : true;
  };
}

/** All evidence ids about one material (used for the cancellation `considered` set). */
export function evidenceIdsForMaterial(snapshot, material) {
  const ids = [];
  const responses = responseById(snapshot);
  for (const r of snapshot.responses) if (r.payload.material?.type === material.type && r.payload.material.id === material.id) ids.push({ collection: 'learner_response', id: r.id });
  for (const rv of snapshot.reviews) {
    const resp = responses.get(rv.payload.responseId);
    if (resp?.payload.material?.type === material.type && resp.payload.material.id === material.id) ids.push({ collection: 'teacher_review', id: rv.id });
  }
  if (material.type === 'quiz-paper') {
    for (const h of snapshot.history) if (h.payload.role === 'legacy-only' && h.payload.entry?.paperId === material.id) ids.push({ collection: 'legacy_history_entry', id: h.id });
  }
  return ids.sort((a, b) => (refKey(a) < refKey(b) ? -1 : 1));
}

export function sortById(list) {
  return [...list].sort(byId);
}

// ------------------------------------------------------------------------------------------------ snapshot
const readAll = async (port, collection, query = {}) => (await port.read(collection, query)).map((r) => ({ id: r.id, rev: r.rev, payload: r.payload }));

/** Load everything the Readers need through the Store Port (read-only). */
export async function loadSnapshot(port) {
  const [responses, reviews, history, origins, papers, documents, schedules, exceptions, fulfillments, suggestions] = await Promise.all([
    readAll(port, 'learner_response'),
    readAll(port, 'teacher_review'),
    readAll(port, 'legacy_history_entry'),
    readAll(port, 'migration_origin'),
    readAll(port, 'paper'),
    readAll(port, 'translation_document'),
    readAll(port, 'schedule'),
    readAll(port, 'schedule_exception'),
    readAll(port, 'schedule_fulfillment'),
    readAll(port, 'schedule_suggestion'),
  ]);
  const originMap = new Map(origins.map((o) => [`${o.payload.collection}:${o.payload.recordId}`, o.payload]));
  return {
    responses: sortById(responses),
    reviews: sortById(reviews),
    history: sortById(history),
    origins: originMap,
    materials: { 'quiz-paper': new Set(papers.map((p) => p.id)), 'translation-document': new Set(documents.map((d) => d.id)) },
    schedules: sortById(schedules).map((s) => ({
      rev: s.rev,
      payload: s.payload,
      exceptions: exceptions.filter((e) => e.payload.scheduleId === s.id).map((e) => e.payload),
      fulfillments: fulfillments.filter((f) => f.payload.scheduleId === s.id).map((f) => f.payload),
      suggestions: suggestions.filter((g) => g.payload.scheduleId === s.id).map((g) => ({ id: g.id, rev: g.rev, payload: g.payload })),
    })),
  };
}
