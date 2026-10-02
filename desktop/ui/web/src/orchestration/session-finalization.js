// The closed WRITE contract of session finalization. This is deliberately NOT readers.js EVIDENCE_SOURCES: that list is
// what the Recommendation side may READ (it includes teacher_review and migrated legacy_history_entry); this one is the
// only thing a completing session may CREATE. Typing's attempt collection is added by the Typing milestone, not here.
import { ScheduleError } from './schedule-store.js';

export const SESSION_EVIDENCE_WRITABLE = Object.freeze(['learner_response']);

const OP_KEYS = ['op', 'collection', 'id', 'payload', 'proj'];

/**
 * Structural validation of the caller-supplied evidence write, before any Store Port access.
 * Only `put` of a brand-new record into an approved session-evidence collection; everything else fails closed.
 * Returns the (collection, id) pairs that must each carry an `absent` precondition.
 */
export function validateSessionEvidenceOps(evidenceOps) {
  if (!Array.isArray(evidenceOps)) throw new ScheduleError('BAD_EVIDENCE_OPS', 'evidenceOps must be an array');
  const seen = new Set();
  return evidenceOps.map((op, i) => {
    const at = `evidenceOps[${i}]`;
    if (op === null || typeof op !== 'object' || Array.isArray(op)) throw new ScheduleError('BAD_EVIDENCE_OPS', `${at} is not an operation`);
    if (op.op !== 'put') throw new ScheduleError('BAD_EVIDENCE_OPS', `${at}: only create (put) is allowed, got ${JSON.stringify(op.op)}`);
    const extra = Object.keys(op).filter((k) => !OP_KEYS.includes(k));
    if (extra.length) throw new ScheduleError('BAD_EVIDENCE_OPS', `${at}: unexpected fields ${extra.join(',')}`);
    if (!SESSION_EVIDENCE_WRITABLE.includes(op.collection)) throw new ScheduleError('BAD_EVIDENCE_OPS', `${at}: collection ${JSON.stringify(op.collection)} is not writable by session finalization`);
    if (typeof op.id !== 'string' || op.id === '') throw new ScheduleError('BAD_EVIDENCE_OPS', `${at}: missing id`);
    if (op.payload === null || typeof op.payload !== 'object' || op.payload.id !== op.id) throw new ScheduleError('BAD_EVIDENCE_OPS', `${at}: payload.id must equal the operation id`);
    const key = `${op.collection}/${op.id}`;
    if (seen.has(key)) throw new ScheduleError('BAD_EVIDENCE_OPS', `${at}: duplicate ${key}`);
    seen.add(key);
    return { collection: op.collection, id: op.id };
  });
}
