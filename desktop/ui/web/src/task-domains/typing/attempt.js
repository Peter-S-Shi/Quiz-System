// The `typing_attempt` record (ADR 0004 section 8.2): a closed, immutable copy-typing fact record.
//
// Validation is split on purpose (section 8.3). STRUCTURE (shape, bounds, ordering, UTF-16 well-formedness) needs no
// Unicode tables. ALIGNMENT (cluster boundaries, counts, the error list) is re-proved ONLY under the pinned semantics
// named by `comparison.version`; a version this build does not implement is carried read-only - never judged against
// the host's tables, never rejected as corrupt, never creatable.
import { COMPARISON, compare } from './compare.js';
import { graphemeBoundaries } from '../unicode/graphemes.js';

const TOP = ['schemaVersion', 'id', 'status', 'material', 'session', 'intent', 'policy', 'committed', 'comparison', 'counts', 'errors', 'correctedErrorCount', 'provenance'];
const KINDS = ['substitution', 'omission', 'insertion'];
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => typeof v === 'string' && v.length > 0;
const int = (v) => Number.isInteger(v) && v >= 0;

function closed(obj, keys, at, errs) {
  if (!isObj(obj)) { errs.push(`${at} must be an object`); return false; }
  for (const k of Object.keys(obj)) if (!keys.includes(k)) errs.push(`${at}: unknown field ${k}`);
  return true;
}

function spanOk(span, at, text, errs) {
  if (!closed(span, ['start', 'end'], at, errs)) return false;
  if (!int(span.start) || !int(span.end) || span.start > span.end) { errs.push(`${at} must be {start <= end} non-negative integers`); return false; }
  if (span.end > text.length) { errs.push(`${at} is outside the text`); return false; }
  // UTF-16 well-formedness: a boundary never falls inside a surrogate pair
  for (const at16 of [span.start, span.end]) {
    const lo = text.charCodeAt(at16 - 1);
    const hi = text.charCodeAt(at16);
    if (at16 > 0 && at16 < text.length && lo >= 0xd800 && lo <= 0xdbff && hi >= 0xdc00 && hi <= 0xdfff) { errs.push(`${at} splits a surrogate pair`); return false; }
  }
  return true;
}

/**
 * @param {object} a candidate payload
 * @param {{creating?: boolean}} opts `creating` demands an implemented comparison version
 * @returns {{valid: boolean, errors: string[], alignmentChecked: boolean, readOnly: boolean}}
 */
export function validateTypingAttempt(a, { creating = false } = {}) {
  const errs = [];
  const result = (alignmentChecked = false, readOnly = false) => ({ valid: errs.length === 0, errors: errs, alignmentChecked, readOnly });
  if (!closed(a, TOP, 'typing_attempt', errs)) return result();
  if (a.schemaVersion !== 1) errs.push('schemaVersion must be 1');
  if (!str(a.id)) errs.push('id is required');
  if (a.status !== 'finalized') errs.push('status must be finalized');

  const m = a.material;
  let reference = '';
  if (closed(m, ['type', 'id', 'title', 'snapshot'], 'material', errs)) {
    if (m.type !== 'typing-text') errs.push('material.type must be typing-text');
    if (!str(m.id)) errs.push('material.id is required');
    if (typeof m.title !== 'string') errs.push('material.title must be a string');
    if (closed(m.snapshot, ['text'], 'material.snapshot', errs)) {
      if (!str(m.snapshot.text)) errs.push('material.snapshot.text must be a non-empty string');
      else reference = m.snapshot.text;
    }
  }
  if (closed(a.session, ['id', 'startedAt', 'completedAt'], 'session', errs)) {
    for (const k of ['id', 'startedAt', 'completedAt']) if (!str(a.session[k])) errs.push(`session.${k} is required`);
  }
  if (!['practice', 'test'].includes(a.intent)) errs.push('intent must be practice or test');
  if (closed(a.policy, ['feedbackTiming', 'corrections'], 'policy', errs)) {
    if (!['live', 'on-completion'].includes(a.policy.feedbackTiming)) errs.push('policy.feedbackTiming must be live or on-completion');
    if (!['allowed', 'disallowed'].includes(a.policy.corrections)) errs.push('policy.corrections must be allowed or disallowed');
    if (a.intent === 'test' && a.policy.feedbackTiming !== 'on-completion') errs.push('a test attempt must have feedbackTiming on-completion');
  }
  let committed = '';
  if (closed(a.committed, ['text'], 'committed', errs)) {
    if (typeof a.committed.text !== 'string') errs.push('committed.text must be a string');
    else committed = a.committed.text;
  }
  let versionKnown = false;
  if (closed(a.comparison, ['version', 'normalization', 'segmentation', 'offsetEncoding'], 'comparison', errs)) {
    if (!str(a.comparison.version)) errs.push('comparison.version is required');
    if (a.comparison.offsetEncoding !== 'utf16-code-unit') errs.push('comparison.offsetEncoding must be explicitly utf16-code-unit');
    versionKnown = a.comparison.version === COMPARISON.version;
    if (versionKnown) for (const k of Object.keys(COMPARISON)) if (a.comparison[k] !== COMPARISON[k]) errs.push(`comparison.${k} must be ${COMPARISON[k]} under ${COMPARISON.version}`);
    if (creating && !versionKnown) errs.push(`a new attempt must use an implemented comparison version (${COMPARISON.version})`);
  }
  if (closed(a.counts, ['referenceGraphemes', 'committedGraphemes'], 'counts', errs)) {
    if (!int(a.counts.referenceGraphemes) || !int(a.counts.committedGraphemes)) errs.push('counts must be non-negative integers');
  }
  if ('correctedErrorCount' in a && !int(a.correctedErrorCount)) errs.push('correctedErrorCount must be a non-negative integer when present');

  // structure of the error facts
  let structural = true;
  if (!Array.isArray(a.errors)) { errs.push('errors must be an array'); structural = false; } else {
    let lastEnd = -1;
    a.errors.forEach((e, i) => {
      const at = `errors[${i}]`;
      if (!closed(e, ['kind', 'reference', 'committed'], at, errs)) { structural = false; return; }
      if (!KINDS.includes(e.kind)) { errs.push(`${at}.kind is invalid`); structural = false; }
      const okRef = spanOk(e.reference, `${at}.reference`, reference, errs);
      const okCom = spanOk(e.committed, `${at}.committed`, committed, errs);
      if (!okRef || !okCom) { structural = false; return; }
      const refEmpty = e.reference.start === e.reference.end;
      const comEmpty = e.committed.start === e.committed.end;
      if (e.kind === 'omission' && !(comEmpty && !refEmpty)) { errs.push(`${at}: an omission has a reference span and an empty committed span`); structural = false; }
      if (e.kind === 'insertion' && !(refEmpty && !comEmpty)) { errs.push(`${at}: an insertion has an empty reference span and a committed span`); structural = false; }
      if (e.kind === 'substitution' && (refEmpty || comEmpty)) { errs.push(`${at}: a substitution has both spans non-empty`); structural = false; }
      if (e.reference.start <= lastEnd) { errs.push(`${at} overlaps or precedes the previous error`); structural = false; }
      lastEnd = e.reference.end;
    });
  }

  const p = a.provenance;
  if (closed(p, ['purpose', 'sourceAttemptId', 'sourceMaterialId', 'createdAt'], 'provenance', errs)) {
    if (!['practice', 'retry'].includes(p.purpose)) errs.push('provenance.purpose must be practice or retry');
    if (!str(p.createdAt)) errs.push('provenance.createdAt is required');
    if (p.purpose === 'retry' && (!str(p.sourceAttemptId) || !str(p.sourceMaterialId))) errs.push('a retry records sourceAttemptId and sourceMaterialId');
    if (p.purpose === 'practice' && ('sourceAttemptId' in p || 'sourceMaterialId' in p)) errs.push('a practice attempt records no source lineage');
  }

  // alignment facts: re-proved only under the pinned semantics the record names
  if (errs.length === 0 && structural && versionKnown) {
    let derived;
    try {
      derived = compare(reference, committed);
    } catch (e) {
      errs.push(String(e.message));
    }
    if (derived) {
      if (JSON.stringify(derived.counts) !== JSON.stringify(a.counts)) errs.push('counts do not match the pinned comparison');
      if (JSON.stringify(derived.errors) !== JSON.stringify(a.errors)) errs.push('errors do not match the pinned comparison');
      // every recorded span edge is a pinned cluster boundary (implied by equality; kept explicit for the clearest message)
      const rb = new Set(graphemeBoundaries(reference));
      const cb = new Set(graphemeBoundaries(committed));
      for (const e of a.errors) {
        if (!rb.has(e.reference.start) || !rb.has(e.reference.end) || !cb.has(e.committed.start) || !cb.has(e.committed.end)) errs.push('a span is not grapheme-aligned');
      }
    }
    return result(true, false);
  }
  return result(false, !versionKnown && errs.length === 0);
}

/**
 * Builds a finalized attempt from the session's recorded facts. The comparison facts are DERIVED here, once, with
 * typing-compare/1; nothing else (no score, no speed) is computed or stored.
 */
export function buildTypingAttempt({ id, material, session, intent, policy, committedText, correctedErrorCount, provenance }) {
  const derived = compare(material.text, committedText);
  const attempt = {
    schemaVersion: 1,
    id,
    status: 'finalized',
    material: { type: 'typing-text', id: material.id, title: material.title, snapshot: { text: material.text } },
    session: { id: session.id, startedAt: session.startedAt, completedAt: session.completedAt },
    intent,
    policy: { feedbackTiming: policy.feedbackTiming, corrections: policy.corrections },
    committed: { text: committedText },
    comparison: { ...COMPARISON },
    counts: derived.counts,
    errors: derived.errors,
    ...(correctedErrorCount === undefined ? {} : { correctedErrorCount }),
    provenance: { ...provenance },
  };
  const v = validateTypingAttempt(attempt, { creating: true });
  if (!v.valid) throw new Error(`TYPING_ATTEMPT_INVALID: ${v.errors.join('; ')}`);
  return attempt;
}
