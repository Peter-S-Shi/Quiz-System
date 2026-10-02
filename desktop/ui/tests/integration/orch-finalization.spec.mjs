// Session-finalization input boundary: completeSession accepts only create-puts of approved session-evidence collections.
// Everything else fails closed BEFORE the Store Port is touched, and a rejected call leaves the store byte-identical.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ScheduleError } from '../../web/src/orchestration/schedule-store.js';
import { deleteOp, putOp } from '../../web/src/projection.js';
import { EVIDENCE, SCHED, hard, paperPayload, slotA, withEnv } from './env.mjs';

const ref = (id) => ({ collection: 'learner_response', id });
const ALL = [...SCHED, ...EVIDENCE, 'paper'];
// projection-free ops: the contract must reject them on collection/shape alone, never on a later constraint
const raw = (collection, id) => ({ op: 'put', collection, id, payload: { id }, proj: { columns: {}, links: [] } });
const bad = (code = 'BAD_EVIDENCE_OPS') => (err) => err instanceof ScheduleError && err.code === code;

test('legal finalization still commits learner_response + selection + fulfillment atomically', withEnv(async (e) => {
  const a = await e.store.create({ slot: slotA, date: '2026-10-02' });
  const ev = hard('r-ok');
  const out = await e.store.completeSession({ evidenceOps: [putOp(e.spec('learner_response'), ev.id, ev)], session: ref(ev.id), slot: slotA, selection: { source: 'manual' } });
  assert.equal(out.fulfilled.scheduleId, a.id);
  assert.equal((await e.rows('learner_response')).length, 1);
  assert.equal((await e.rows('session_selection')).length, 1);
  assert.equal((await e.rows('schedule_fulfillment')).length, 1);
}));

test('illegal evidenceOps are rejected before any write and the store is byte-identical', withEnv(async (e) => {
  await e.store.create({ slot: slotA, date: '2026-10-02' });
  const existing = hard('r-existing');
  await e.b.port.commit({ ops: [putOp(e.spec('learner_response'), existing.id, existing)] });
  const fresh = hard('r-new');
  const freshOp = () => putOp(e.spec('learner_response'), fresh.id, fresh);
  const before = await e.digest(ALL);
  const sched = (await e.rows('schedule'))[0];
  const cases = {
    'delete learner_response': [deleteOp('learner_response', 'r-existing')],
    'delete alongside a legal put': [freshOp(), deleteOp('learner_response', 'r-existing')],
    'put schedule': [putOp(e.spec('schedule'), sched.id, { ...sched.payload, status: 'cancelled' })],
    'put schedule_exception': [raw('schedule_exception', 'x#2026-10-02')],
    'put paper (Content)': [putOp(e.spec('paper'), 'paper-a', { ...paperPayload('paper-a'), title: 'rewritten' })],
    'put teacher_review': [raw('teacher_review', 'tr-1')],
    'put legacy_history_entry': [raw('legacy_history_entry', 'lh-1')],
    'unknown collection': [{ op: 'put', collection: 'nope', id: 'n', payload: { id: 'n' }, proj: {} }],
    'duplicate evidence id': [freshOp(), freshOp()],
    'unknown operation': [{ ...freshOp(), op: 'update' }],
    'extra operation fields': [{ ...freshOp(), preconditions: [] }],
    'payload id differs from op id': [{ ...freshOp(), payload: { ...fresh, id: 'other' } }],
    'not an array': freshOp(),
  };
  for (const [name, evidenceOps] of Object.entries(cases)) {
    await assert.rejects(e.store.completeSession({ evidenceOps, session: ref(fresh.id), slot: slotA, selection: { source: 'manual' } }), bad(), name);
    assert.equal(await e.digest(ALL), before, `${name}: store byte-identical`);
  }
  await assert.rejects(e.store.completeSession({ evidenceOps: [freshOp()], session: { collection: 'teacher_review', id: 'tr-1' }, slot: slotA }), bad(), 'session ref outside the registry');
  assert.equal(await e.digest(ALL), before);
}));

test('an existing learner_response can never be rewritten by finalization (E-1)', withEnv(async (e) => {
  const a = await e.store.create({ slot: slotA, date: '2026-10-02' });
  const ev = hard('r-1');
  await e.store.completeSession({ evidenceOps: [putOp(e.spec('learner_response'), ev.id, ev)], session: ref(ev.id), slot: slotA });
  const before = await e.digest(ALL);
  const rewritten = { ...ev, durationMs: 1 };
  await assert.rejects(e.store.completeSession({ evidenceOps: [putOp(e.spec('learner_response'), ev.id, rewritten)], session: ref(ev.id), slot: slotA }), bad('SESSION_ALREADY_RECORDED'));
  assert.equal(await e.digest(ALL), before);
  assert.ok(a.id);
}));
