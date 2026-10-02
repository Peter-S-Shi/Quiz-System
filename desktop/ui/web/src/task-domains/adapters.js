// The closed Domain Evidence Adapter registry (ADR 0004 section 5): per domain, the evidence collection a finalizing
// session may CREATE, the payload validator, and the slot derived from the validated evidence.
//
// The write registry derived here (`SESSION_EVIDENCE_WRITABLE`) is deliberately NOT the Reader registry
// (readers.js `EVIDENCE_SOURCES`): readers may read teacher_review and migrated legacy_history_entry, finalization
// may never write them. Adding an adapter needs an ADR amendment.
//
// Objective and Translation keep the V1 `learner_response` contract: the validators below accept exactly the
// records the V1 validator and JSON Schema accept (section 5.3: session facts live only in the schema's open
// `extensions` field under one namespaced key), plus the domain constraints of sections 6 and 7.
import { validateTypingAttempt } from './typing/attempt.js';

export const SESSION_EXT_KEY = 'quiz-studio.v2.session';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
// V1's `nonEmptyString` trims, the public schema's `minLength: 1` does not: the adapter takes the stricter (a
// whitespace-only identity or timestamp is refused). `optStr`: a schema `string` that is only checked when present.
const str = (v) => typeof v === 'string' && v.trim().length > 0;
const optStr = (o, k, at, errs) => { if (k in o && typeof o[k] !== 'string') errs.push(`${at}.${k} must be a string`); };
const KINDS = ['unknown', 'uncertain', 'should_know'];
/** The closed key sets of the V1 Learner Response public schema (guarded against drift by a test). */
export const V1_CLOSED_KEYS = Object.freeze({
  top: ['schemaVersion', 'documentType', 'id', 'status', 'finalizedAt', 'material', 'session', 'responses', 'summary', 'provenance', 'learnerAnnotations', 'learnerItemMarks', 'extensions'],
  material: ['type', 'id', 'title', 'snapshot'],
  session: ['id', 'startedAt', 'completedAt'],
  response: ['itemId', 'answer', 'result'],
  summary: ['itemCount', 'correctCount', 'percent'],
  provenance: ['purpose', 'sourceResponseId', 'sourceReviewId', 'sourceMaterialId', 'createdAt', 'author', 'extensions'],
  annotation: ['itemId', 'id', 'kind', 'start', 'end', 'text', 'createdAt'],
  mark: ['itemId', 'kind', 'createdAt'],
});
const PURPOSES = ['practice', 'retry', 'remediation'];

function closedKeys(obj, keys, at, errs) {
  for (const k of Object.keys(obj)) if (!keys.includes(k)) errs.push(`${at}: unknown field ${k}`);
}

const ACTOR_TYPES = ['anonymous', 'human', 'external-ai', 'agent', 'system'];
/** The public schema's `provenance` definition: closed keys, string fields, a closed actor, an object `extensions`. */
function validateProvenanceShape(p, errs) {
  closedKeys(p, V1_CLOSED_KEYS.provenance, 'provenance', errs);
  for (const k of ['purpose', 'sourceResponseId', 'sourceReviewId', 'sourceMaterialId', 'createdAt']) optStr(p, k, 'provenance', errs);
  if ('extensions' in p && !isObj(p.extensions)) errs.push('provenance.extensions must be an object');
  if ('author' in p) {
    const a = p.author;
    if (!isObj(a)) errs.push('provenance.author must be an object');
    else {
      closedKeys(a, ['type', 'displayLabel', 'toolName'], 'provenance.author', errs);
      if (!ACTOR_TYPES.includes(a.type)) errs.push('provenance.author.type is invalid');
      optStr(a, 'displayLabel', 'provenance.author', errs);
      optStr(a, 'toolName', 'provenance.author', errs);
    }
  }
}

/** The V1 Learner Response contract (validateLearnerResponse + the closed public schema), mirrored. */
function validateV1Shape(v, errs) {
  if (!isObj(v)) { errs.push('Learner Response must be an object'); return null; }
  closedKeys(v, V1_CLOSED_KEYS.top, 'learner_response', errs);
  if (v.documentType !== 'quiz-studio.learner-response') errs.push('invalid documentType');
  if (!Number.isInteger(v.schemaVersion) || v.schemaVersion < 1) errs.push('invalid schemaVersion');
  if (!str(v.id)) errs.push('id is required');
  if (v.status !== 'finalized') errs.push('status must be finalized');
  if (!str(v.finalizedAt)) errs.push('finalizedAt is required');
  const m = v.material;
  if (!isObj(m) || !str(m.id) || !str(m.type)) errs.push('material identity is required');
  else {
    closedKeys(m, V1_CLOSED_KEYS.material, 'material', errs);
    if (typeof m.title !== 'string') errs.push('material.title is required');
  }
  if (isObj(m) && !isObj(m.snapshot)) errs.push('material.snapshot must be an object');
  const items = m?.snapshot?.items;
  if (!Array.isArray(items) || !items.length) errs.push('material item snapshots are required');
  if (!isObj(v.session) || !str(v.session.id)) errs.push('session identity is required');
  else closedKeys(v.session, V1_CLOSED_KEYS.session, 'session', errs);
  if (!str(v.session?.startedAt)) errs.push('session.startedAt is required');
  if (!str(v.session?.completedAt)) errs.push('session.completedAt is required');
  if (!Array.isArray(v.responses) || !v.responses.length) errs.push('responses are required');
  const itemIds = new Set();
  (Array.isArray(items) ? items : []).forEach((it) => {
    if (!isObj(it)) errs.push('each item snapshot must be an object');
    else if (!str(it.id)) errs.push('each item snapshot requires an id');
    else if (itemIds.has(it.id)) errs.push(`duplicate item id ${it.id}`);
    else itemIds.add(it.id);
  });
  const answered = new Set();
  const answers = new Map();
  (Array.isArray(v.responses) ? v.responses : []).forEach((r) => {
    if (!isObj(r) || !str(r.itemId)) { errs.push('each response requires an itemId'); return; }
    closedKeys(r, V1_CLOSED_KEYS.response, 'response', errs);
    if (!('answer' in r)) errs.push(`response ${r.itemId} requires an answer`);
    if (answered.has(r.itemId)) errs.push(`duplicate response itemId ${r.itemId}`);
    answered.add(r.itemId);
    if (typeof r.answer === 'string') answers.set(r.itemId, r.answer);
    if (!itemIds.has(r.itemId)) errs.push(`response references unknown itemId ${r.itemId}`);
  });
  itemIds.forEach((id) => { if (!answered.has(id)) errs.push(`missing response for itemId ${id}`); });
  if (!isObj(v.summary)) errs.push('summary is required');
  else {
    closedKeys(v.summary, V1_CLOSED_KEYS.summary, 'summary', errs);
    if (v.summary.itemCount !== v.responses?.length) errs.push('summary itemCount must match the response count');
  }
  if ('provenance' in v) {
    if (!isObj(v.provenance)) errs.push('provenance must be an object');
    else validateProvenanceShape(v.provenance, errs);
  }
  if ('extensions' in v && !isObj(v.extensions)) errs.push('extensions must be an object');

  if ('learnerAnnotations' in v) {
    if (!Array.isArray(v.learnerAnnotations)) errs.push('learnerAnnotations must be an array');
    else {
      const ids = new Set();
      const byItem = new Map();
      v.learnerAnnotations.forEach((a, i) => {
        if (!isObj(a)) { errs.push(`annotation ${i} must be an object`); return; }
        closedKeys(a, V1_CLOSED_KEYS.annotation, `annotation ${i}`, errs);
        if (!str(a.id)) errs.push(`annotation ${i} requires an id`);
        else if (ids.has(a.id)) errs.push(`duplicate annotation id ${a.id}`);
        else ids.add(a.id);
        if (!str(a.itemId)) errs.push(`annotation ${i} requires an itemId`);
        else if (!itemIds.has(a.itemId)) errs.push(`annotation references unknown itemId ${a.itemId}`);
        if (!KINDS.includes(a.kind)) errs.push(`invalid annotation kind ${a.kind}`);
        if (!Number.isInteger(a.start) || a.start < 0) errs.push(`annotation ${i} has an invalid start`);
        if (!Number.isInteger(a.end) || a.end <= a.start) errs.push(`annotation ${i} has an invalid end`);
        if (typeof a.text !== 'string' || !a.text.length) errs.push(`annotation ${i} requires text`);
        if (!str(a.createdAt)) errs.push(`annotation ${i} requires createdAt`);
        if (str(a.itemId) && itemIds.has(a.itemId)) {
          const answer = answers.get(a.itemId);
          if (typeof answer !== 'string') errs.push(`annotation ${i} references an item with no answer text`);
          else if (Number.isInteger(a.start) && Number.isInteger(a.end) && a.start >= 0 && a.end > a.start && typeof a.text === 'string') {
            if (a.end > answer.length) errs.push(`annotation ${i} range is outside the answer`);
            else if (answer.slice(a.start, a.end) !== a.text) errs.push(`annotation ${i} text does not match the anchored span`);
            else { if (!byItem.has(a.itemId)) byItem.set(a.itemId, []); byItem.get(a.itemId).push(a); }
          }
        }
      });
      byItem.forEach((list, itemId) => {
        for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) if (list[i].start < list[j].end && list[j].start < list[i].end) errs.push(`annotations for ${itemId} overlap`);
      });
    }
  }
  if ('learnerItemMarks' in v) {
    if (!Array.isArray(v.learnerItemMarks)) errs.push('learnerItemMarks must be an array');
    else {
      const seen = new Set();
      v.learnerItemMarks.forEach((mk, i) => {
        if (!isObj(mk)) { errs.push(`mark ${i} must be an object`); return; }
        closedKeys(mk, V1_CLOSED_KEYS.mark, `mark ${i}`, errs);
        if (!str(mk.itemId)) errs.push(`mark ${i} requires an itemId`);
        else if (!itemIds.has(mk.itemId)) errs.push(`mark references unknown itemId ${mk.itemId}`);
        else if (seen.has(mk.itemId)) errs.push(`duplicate mark for ${mk.itemId}`);
        else seen.add(mk.itemId);
        if (!KINDS.includes(mk.kind)) errs.push(`invalid mark kind ${mk.kind}`);
        optStr(mk, 'createdAt', `mark ${i}`, errs);
      });
    }
  }
  return v;
}

/** The namespaced session facts (section 5.3). `offsets`: whether the record carries offset-bearing annotations. */
function validateSessionFacts(v, { objective, offsets }, errs) {
  const f = v.extensions?.[SESSION_EXT_KEY];
  if (!isObj(f)) { errs.push(`extensions["${SESSION_EXT_KEY}"] (the V2 session facts) is required on a native record`); return null; }
  closedKeys(f, ['schemaVersion', 'intent', 'feedbackTiming', 'offsetEncoding'], 'session facts', errs);
  if (f.schemaVersion !== 1) errs.push('session facts schemaVersion must be 1');
  if (!['practice', 'test'].includes(f.intent)) errs.push('session facts intent must be practice or test');
  if (objective) {
    if (!['instant', 'submit-at-end'].includes(f.feedbackTiming)) errs.push('an Objective record declares feedbackTiming instant or submit-at-end');
  } else if ('feedbackTiming' in f) errs.push('feedbackTiming is an Objective fact');
  if (offsets) {
    if (f.offsetEncoding !== 'utf16-code-unit') errs.push('a record carrying offsets must declare offsetEncoding utf16-code-unit explicitly');
  } else if ('offsetEncoding' in f) errs.push('offsetEncoding is declared only by a record that carries offsets');
  return f;
}

function validateProvenance(v, errs) {
  const p = v.provenance;
  if (!isObj(p)) { errs.push('a native record carries provenance'); return; }
  if (!PURPOSES.includes(p.purpose)) errs.push('provenance.purpose must be practice, retry or remediation');
  if (p.purpose === 'retry' && (!str(p.sourceResponseId) || !str(p.sourceMaterialId))) errs.push('a retry records sourceResponseId and sourceMaterialId');
}

function validateObjective(v) {
  const errs = [];
  if (!validateV1Shape(v, errs)) return errs;
  if (v.material?.type !== 'quiz-paper') errs.push('an Objective record has material.type quiz-paper');
  // the public schema's quiz-paper condition: every item snapshot carries a `type` (a non-empty string here)
  (Array.isArray(v.material?.snapshot?.items) ? v.material.snapshot.items : []).forEach((it) => { if (isObj(it) && !str(it.type)) errs.push(`Objective item snapshot ${it.id} requires a type`); });
  (Array.isArray(v.responses) ? v.responses : []).forEach((r) => { if (isObj(r) && !('result' in r)) errs.push(`Objective response ${r.itemId} requires a grading result`); });
  if (!Number.isInteger(v.summary?.correctCount) || v.summary.correctCount < 0) errs.push('Objective summary correctCount is required');
  if (typeof v.summary?.percent !== 'number' || !Number.isFinite(v.summary.percent) || v.summary.percent < 0 || v.summary.percent > 100) errs.push('Objective summary percent is required');
  if ('learnerAnnotations' in v || 'learnerItemMarks' in v) errs.push('learner metacognition is a Translation fact; an Objective record carries none');
  validateProvenance(v, errs);
  validateSessionFacts(v, { objective: true, offsets: false }, errs);
  return errs;
}

function validateTranslation(v) {
  const errs = [];
  if (!validateV1Shape(v, errs)) return errs;
  if (v.material?.type !== 'translation-document') errs.push('a Translation record has material.type translation-document');
  (Array.isArray(v.responses) ? v.responses : []).forEach((r) => { if (isObj(r) && 'result' in r) errs.push(`Translation response ${r.itemId} must not carry a grading result`); });
  if (isObj(v.summary) && ('correctCount' in v.summary || 'percent' in v.summary)) errs.push('a Translation summary never carries correctCount or percent');
  validateProvenance(v, errs);
  validateSessionFacts(v, { objective: false, offsets: Array.isArray(v.learnerAnnotations) && v.learnerAnnotations.length > 0 }, errs);
  return errs;
}

const factsOf = (p) => p.extensions[SESSION_EXT_KEY];

export const ADAPTERS = Object.freeze({
  objective: Object.freeze({
    domain: 'objective', collection: 'learner_response', materialType: 'quiz-paper',
    validate: (p) => validateObjective(p),
    slot: (p) => ({ domain: 'objective', material: { type: 'quiz-paper', id: p.material.id }, intent: factsOf(p).intent }),
  }),
  translation: Object.freeze({
    domain: 'translation', collection: 'learner_response', materialType: 'translation-document',
    validate: (p) => validateTranslation(p),
    // an ephemeral retry material is not schedulable: the slot is the SOURCE document (section 5.4)
    slot: (p) => ({ domain: 'translation', material: { type: 'translation-document', id: p.provenance.purpose === 'retry' ? p.provenance.sourceMaterialId : p.material.id }, intent: factsOf(p).intent }),
  }),
  typing: Object.freeze({
    domain: 'typing', collection: 'typing_attempt', materialType: 'typing-text',
    validate: (p) => validateTypingAttempt(p, { creating: true }).errors,
    slot: (p) => ({ domain: 'typing', material: { type: 'typing-text', id: p.material.id }, intent: p.intent }),
  }),
});

/** The collections a finalizing session may create: derived from the adapters, never from the Reader registry. */
export const SESSION_EVIDENCE_WRITABLE = Object.freeze([...new Set(Object.values(ADAPTERS).map((a) => a.collection))]);

/** The adapter for a payload bound for `collection`, or null (unknown collection or unknown material type). */
export function adapterFor(collection, payload) {
  const type = payload?.material?.type;
  return Object.values(ADAPTERS).find((a) => a.collection === collection && a.materialType === type) ?? null;
}

/** Attaches the V2 session facts to a V1 Learner Response (a helper for the domain session engines). */
export function withSessionFacts(response, facts) {
  return { ...response, extensions: { ...(response.extensions ?? {}), [SESSION_EXT_KEY]: { schemaVersion: 1, ...facts } } };
}
