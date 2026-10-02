// The closed WRITE contract of session finalization (ADR 0004 section 5). The collections a finalizing session may
// CREATE come from the Domain Evidence Adapter registry (task-domains/adapters.js), never from readers.js
// `EVIDENCE_SOURCES`: readers may read teacher_review and migrated legacy_history_entry, finalization may never write
// them. A session writes exactly ONE evidence record, create-only, validated by its domain adapter before any Store
// Port access; the fulfilled slot is derived from that validated record, not trusted from the caller.
import { ScheduleError } from './schedule-store.js';
import { SESSION_EVIDENCE_WRITABLE, adapterFor } from '../task-domains/adapters.js';

export { SESSION_EVIDENCE_WRITABLE };

const OP_KEYS = ['op', 'collection', 'id', 'payload', 'proj'];

/**
 * Structural + domain validation of the caller-supplied evidence write, before any Store Port access.
 * Only `put` of a brand-new record into an adapter collection; everything else fails closed.
 * Returns `[{collection, id, slot}]` (one entry per op): each must carry an `absent` precondition, `slot` is derived.
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
    const adapter = adapterFor(op.collection, op.payload);
    if (!adapter) throw new ScheduleError('BAD_EVIDENCE_OPS', `${at}: no domain adapter for ${op.collection} material type ${JSON.stringify(op.payload?.material?.type)}`);
    const errors = adapter.validate(op.payload);
    if (errors.length) throw new ScheduleError('BAD_EVIDENCE_PAYLOAD', `${at}: ${errors.join('; ')}`);
    return { collection: op.collection, id: op.id, slot: adapter.slot(op.payload) };
  });
}

const slotKey = (s) => `${s.domain}|${s.material.type}|${s.material.id}|${s.intent}`;

/** Throws SLOT_MISMATCH when a caller-supplied slot differs from the slot derived from the evidence. */
export function assertSlotMatches(supplied, derived) {
  if (supplied !== undefined && slotKey(supplied) !== slotKey(derived)) {
    throw new ScheduleError('SLOT_MISMATCH', `the supplied slot ${slotKey(supplied)} is not the slot of the evidence (${slotKey(derived)})`);
  }
}
