// Shared helpers for the fault specs: a bridge session on a data root, a prepared template, clones and digests.
import fs from 'node:fs';
import path from 'node:path';
import { fixedClock } from '../../web/src/orchestration/dates.js';
import { ScheduleStore } from '../../web/src/orchestration/schedule-store.js';
import { SessionFinalizer } from '../../web/src/task-domains/finalizer.js';
import { putOp } from '../../web/src/projection.js';
import { collectionsDigest, counterIds, openBridge, tempRoot } from './bridge.mjs';
import { EVIDENCE, PAPERS, SCHED, paperPayload } from './env.mjs';

export const TODAY = '2026-10-02';
export const ALL = [...SCHED, ...EVIDENCE];
export const ref = (id) => ({ collection: 'learner_response', id });
export const typingText = (id) => ({ schemaVersion: 1, id, title: 'Copy text', text: 'environment', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' });

export async function session(root, { env = {}, prefix = 'op' } = {}) {
  const b = openBridge(root, { env });
  const clock = fixedClock(TODAY);
  const store = await ScheduleStore.open(b.port, { clock, newId: counterIds(prefix) });
  const info = await b.port.schemaInfo();
  const spec = (n) => info.collections.find((c) => c.name === n);
  const putEvidence = (payload) => b.port.commit({ ops: [putOp(spec('learner_response'), payload.id, payload)] });
  return { b, store, clock, port: b.port, spec, putEvidence, finalizer: new SessionFinalizer({ port: b.port, store }) };
}

export async function prepared(prep) {
  const t = tempRoot();
  const s = await session(t.root, { prefix: 'prep' });
  await s.b.port.commit({ ops: [...PAPERS.map((id) => putOp(s.spec('paper'), id, paperPayload(id))), putOp(s.spec('typing_text'), 'typing-1', typingText('typing-1'))] });
  await prep(s);
  await s.b.close();
  return t;
}

export const clone = (t) => {
  const dir = fs.mkdtempSync(path.join(path.dirname(t.dir), 'qs-orch-clone-'));
  fs.cpSync(t.dir, dir, { recursive: true });
  return { dir, root: path.join(dir, 'qs-data'), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
};

export async function digestOf(root) {
  const s = await session(root);
  try { return await collectionsDigest(s.port, ALL); } finally { await s.b.close(); }
}
