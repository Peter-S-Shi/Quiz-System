// SessionFinalizer (ADR 0004 section 4, 10.3, 10.4): the one door through which a completed session of ANY domain
// reaches the store. It selects the Domain Evidence Adapter from the payload, validates, derives the slot from the
// evidence, and commits through ScheduleStore.completeSession (evidence + selection + at most one fulfillment, one Unit
// of Work). It is idempotent across an ambiguous crash: the evidence id was allocated at session start, so a retried
// finalization of an already committed session is recognized by canonical equality (success, no write); a different
// payload under the same id is a conflict, never a rewrite (E-1).
import { canonical } from '../canonical.js';
import { putOp } from '../projection.js';
import { ScheduleError } from '../orchestration/schedule-store.js';
import { ADAPTERS } from './adapters.js';

export class SessionFinalizer {
  #port;
  #store;
  #specs = null;

  /** @param {{port: object, store: import('../orchestration/schedule-store.js').ScheduleStore}} deps */
  constructor({ port, store }) {
    this.#port = port;
    this.#store = store;
  }

  async #spec(name) {
    if (!this.#specs) this.#specs = (await this.#port.schemaInfo()).collections;
    const spec = this.#specs.find((c) => c.name === name);
    if (!spec) throw new ScheduleError('BAD_EVIDENCE_OPS', `unknown collection ${name}`);
    return spec;
  }

  async #existing(collection, id) {
    return (await this.#port.read(collection, { id }))[0] ?? null;
  }

  async #fulfillmentOf(session) {
    const rows = await this.#port.read('schedule_fulfillment', { where: [{ column: 'session_id', op: 'eq', value: session.id }] });
    const f = rows.map((r) => r.payload).find((p) => p.session.collection === session.collection);
    return f ? { scheduleId: f.scheduleId, originalDate: f.originalDate, via: f.via } : null;
  }

  /**
   * @param {{payload: object, selection?: object, scheduleRef?: {scheduleId: string, originalDate: string}}} input
   * @returns {Promise<{alreadyFinalized: boolean, fulfilled: object|null, session: {collection: string, id: string}}>}
   */
  async finalize({ payload, selection, scheduleRef }) {
    const adapter = Object.values(ADAPTERS).find((a) => a.materialType === payload?.material?.type);
    if (!adapter) throw new ScheduleError('BAD_EVIDENCE_OPS', `no domain adapter for material type ${JSON.stringify(payload?.material?.type)}`);
    const errors = adapter.validate(payload);
    if (errors.length) throw new ScheduleError('BAD_EVIDENCE_PAYLOAD', errors.join('; '));
    const session = { collection: adapter.collection, id: payload.id };

    const settled = async () => {
      const existing = await this.#existing(session.collection, session.id);
      if (!existing) return null;
      if (canonical(existing.payload) !== canonical(payload)) {
        throw new ScheduleError('SESSION_ALREADY_RECORDED', `${session.collection}/${session.id} already exists with different content; finalized evidence is never rewritten`);
      }
      return { alreadyFinalized: true, fulfilled: await this.#fulfillmentOf(session), session };
    };

    const done = await settled();
    if (done) return done;
    try {
      const out = await this.#store.completeSession({
        evidenceOps: [putOp(await this.#spec(adapter.collection), payload.id, payload)],
        session, selection, scheduleRef,
      });
      return { alreadyFinalized: false, fulfilled: out.fulfilled, session };
    } catch (e) {
      // a concurrent or ambiguous earlier commit of the SAME session: settle by content, never by guessing
      if (e instanceof ScheduleError && (e.code === 'SESSION_ALREADY_RECORDED' || e.code === 'STALE')) {
        const again = await settled();
        if (again) return again;
      }
      throw e;
    }
  }
}
