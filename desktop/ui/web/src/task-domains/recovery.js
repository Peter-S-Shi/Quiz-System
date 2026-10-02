// Session recovery state (ADR 0004 section 10.2): recovery-ONLY data in the foundation `recovery_session` collection
// (outside archives and canonical hashes, ADR 0001 section 5.5). It restores STATE, never results; it is never evidence,
// never read by the Readers and never an input to fulfillment. Clearing it is deliberately NOT part of the evidence Unit
// of Work: recovery-only state cannot corrupt evidence, and finalization is idempotent (finalizer.js), so a crash between
// the two is safe in both directions. A recovery row whose evidence is already committed is discarded, never re-finalized.
import { deleteOp, putOp } from '../projection.js';
import { ADAPTERS } from './adapters.js';

const COLLECTION = 'recovery_session';

export class SessionRecovery {
  #port;
  #spec = null;

  constructor(port) {
    this.#port = port;
  }

  async #recoverySpec() {
    if (!this.#spec) this.#spec = (await this.#port.schemaInfo()).collections.find((c) => c.name === COLLECTION);
    return this.#spec;
  }

  /** Create or replace the recovery state of a session (small per-answer transactions). */
  async save(state) {
    if (typeof state?.evidenceId !== 'string' || typeof state?.session?.id !== 'string') throw new TypeError('recovery state needs the evidence id allocated at session start and a session id');
    const id = state.session.id;
    await this.#port.commit({ ops: [putOp(await this.#recoverySpec(), id, { schemaVersion: 1, id, state })] });
  }

  async load(sessionId) {
    const [row] = await this.#port.read(COLLECTION, { id: sessionId });
    return row ? row.payload.state : null;
  }

  async clear(sessionId) {
    await this.#port.commit({ ops: [deleteOp(COLLECTION, sessionId)] });
  }

  /**
   * The sessions that may be resumed after a restart. A state whose evidence is already committed (the crash fell
   * between commit and clearing) is discarded and not offered.
   */
  async resumable() {
    const rows = await this.#port.read(COLLECTION);
    const out = [];
    for (const r of rows) {
      const state = r.payload.state;
      const adapter = ADAPTERS[state?.domain];
      if (!adapter) { out.push(state); continue; }
      const [done] = await this.#port.read(adapter.collection, { id: state.evidenceId });
      if (done) await this.clear(r.id);
      else out.push(state);
    }
    return out;
  }
}
