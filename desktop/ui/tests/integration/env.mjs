// Shared harness for the integration specs: a temp data root, the product store behind port-serve, a fixed clock.
import { fixedClock } from '../../web/src/orchestration/dates.js';
import { ScheduleStore } from '../../web/src/orchestration/schedule-store.js';
import { COLLECTIONS } from '../../web/src/orchestration/schema.js';
import { putOp } from '../../web/src/projection.js';
import { objResp } from '../orch-fixtures.mjs';
import { collectionsDigest, counterIds, openBridge, tempRoot } from './bridge.mjs';

export const SCHED = Object.values(COLLECTIONS);
export const EVIDENCE = ['learner_response', 'teacher_review', 'legacy_history_entry'];
export const slotA = { domain: 'objective', material: { type: 'quiz-paper', id: 'paper-a' }, intent: 'practice' };
export const slotB = { domain: 'objective', material: { type: 'quiz-paper', id: 'paper-b' }, intent: 'practice' };
export const every3 = { kind: 'every', unit: 'day', interval: 3 };

export const PAPERS = ['paper-a', 'paper-b', 'paper-c', 'paper-moveOnce', 'paper-cancel', 'paper-gone', 'paper-gone-user'];
export const paperPayload = (id) => ({ schemaVersion: 1, id, title: id, description: '', category: '', tags: [], createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', questions: [] });

export async function env(today = '2026-10-02') {
  const t = tempRoot();
  const b = openBridge(t.root);
  const clock = fixedClock(today);
  const store = await ScheduleStore.open(b.port, { clock, newId: counterIds() });
  const info = await b.port.schemaInfo();
  const spec = (n) => info.collections.find((c) => c.name === n);
  const putEvidence = (payload) => b.port.commit({ ops: [putOp(spec('learner_response'), payload.id, payload)] });
  const e = {
    t, b, clock, store, port: b.port, spec, putEvidence,
    seedPapers: (ids = PAPERS) => b.port.commit({ ops: ids.map((id) => putOp(spec('paper'), id, paperPayload(id))) }),
    digest: (names = SCHED) => collectionsDigest(b.port, names),
    async close() { await b.close(); t.cleanup(); },
    // a second ScheduleStore on the same data root = "the learner" acting while the engine works
    other: () => ScheduleStore.open(b.port, { clock, newId: counterIds('lrn') }),
    async rows(c, where = []) { return (await b.port.read(c, { where })); },
  };
  await e.seedPapers();
  return e;
}
export const withEnv = (fn, today) => async () => { const e = await env(today); try { await fn(e); } finally { await e.close(); } };
export const hook = (port, onFirstCommit) => {
  let armed = true;
  return { ...port, commit: async (uow) => { if (armed && onFirstCommit.match(uow)) { armed = false; await onFirstCommit.run(uow); } return port.commit(uow); } };
};
export const tagIs = (tag) => (uow) => uow.tag === tag;

// A native (V2) difficult session: one incorrect objective item at a recorded time.
export const hard = (id, paper = 'paper-a', time = '2026-10-01T10:00:00.000Z') => objResp(id, paper, { q1: false }, { time }).payload;

