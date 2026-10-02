// ADR 0003 sections 10, 13 and 17.4 / 17.5 (provenance): a real completed session satisfies the right occurrence, in the
// SAME Unit of Work as its evidence, without duplicate debt; occurrence identity is only (scheduleId, originalDate).
import test from 'node:test';
import assert from 'node:assert/strict';
import { expandOccurrences } from '../../web/src/orchestration/occurrences.js';
import { loadSnapshot } from '../../web/src/orchestration/readers.js';
import { recommend, selectionProvenance } from '../../web/src/orchestration/recommend.js';
import { putOp } from '../../web/src/projection.js';
import { objResp } from '../orch-fixtures.mjs';
import { every3, hard, slotA, slotB, withEnv } from './env.mjs';

const ref = (id) => ({ collection: 'learner_response', id });
async function complete(e, id, extra = {}, { slot = slotA, evidence } = {}) {
  const ev = evidence ?? hard(id, slot.material.id, `${e.clock.today()}T09:00:00.000Z`);
  return e.store.completeSession({ evidenceOps: [putOp(e.spec('learner_response'), ev.id, ev)], session: ref(ev.id), slot, ...extra });
}
const states = async (e, scheduleId, from, to) => {
  const m = (await e.store.models()).find((x) => x.schedule.id === scheduleId);
  return expandOccurrences(m, { from, to }, e.clock.today()).occurrences.map((o) => `${o.originalDate}>${o.displayDate}:${o.state}`);
};

test('slot-match: a completion fulfills the earliest Due/Overdue occurrence and completes a once schedule - no debt remains', withEnv(async (e) => {
  const a = await e.store.create({ slot: slotA, date: '2026-10-03' });
  e.clock.set('2026-10-04');
  const out = await complete(e, 'r-1');
  assert.deepEqual(out.fulfilled, { scheduleId: a.id, originalDate: '2026-10-03', via: 'slot-match' });
  const f = (await e.rows('schedule_fulfillment'))[0];
  assert.deepEqual([f.id, f.payload.originalDate, f.payload.fulfilledOn, f.payload.session], [`${a.id}#2026-10-03`, '2026-10-03', '2026-10-04', ref('r-1')]);
  assert.equal((await e.store.load(a.id)).payload.status, 'completed');
  assert.equal((await e.store.models()).length, 0, 'nothing is Due or Overdue any more');
  assert.equal((await e.rows('learner_response')).length, 1, 'the evidence was written in the same Unit of Work');
  assert.equal((await e.store.activeInSlot(slotA)), null, 'the slot is free again');
}));

test('linked start: the occurrence the session was started from is fulfilled even when it is still ahead; an unlinked early session consumes nothing', withEnv(async (e) => {
  const a = await e.store.create({ slot: slotA, date: '2026-10-10' });
  e.clock.set('2026-10-04');
  const unlinked = await complete(e, 'r-unlinked');
  assert.equal(unlinked.fulfilled, null, 'the learner\'s plan for a future date stands');
  assert.equal((await e.store.load(a.id)).payload.status, 'active');
  const linked = await complete(e, 'r-linked', { scheduleRef: { scheduleId: a.id, originalDate: '2026-10-10' } });
  assert.deepEqual(linked.fulfilled, { scheduleId: a.id, originalDate: '2026-10-10', via: 'linked' });
  assert.equal((await e.store.load(a.id)).payload.status, 'completed');
}));

test('intent, domain and material must match the slot; ended series fulfill nothing; the evidence is still written', withEnv(async (e) => {
  const a = await e.store.create({ slot: slotA, date: '2026-10-02' });
  const testSlot = { ...slotA, intent: 'test' };
  assert.equal((await complete(e, 'r-test', {}, { slot: testSlot })).fulfilled, null, 'a Test session never satisfies a Practice schedule');
  assert.equal((await complete(e, 'r-other', {}, { slot: slotB })).fulfilled, null);
  const wrongRef = await complete(e, 'r-wrong-ref', { scheduleRef: { scheduleId: a.id, originalDate: '2026-10-02' } }, { slot: testSlot });
  assert.equal(wrongRef.fulfilled, null, 'a link to a schedule of another slot fulfills nothing');
  assert.equal((await e.rows('schedule_fulfillment')).length, 0);
  await e.store.cancel(a.id);
  assert.equal((await complete(e, 'r-after-cancel')).fulfilled, null);
  assert.equal((await complete(e, 'r-after-cancel-linked', { scheduleRef: { scheduleId: a.id, originalDate: '2026-10-02' } })).fulfilled, null);
  assert.equal((await e.rows('learner_response')).length, 5, 'every completed session left its evidence');
}));

test('no duplicate debt: several Overdue occurrences stay individually Overdue - one session clears exactly one', withEnv(async (e) => {
  const a = await e.store.create({ slot: slotA, date: '2026-10-03', cadence: every3 });
  e.clock.set('2026-10-12');
  const before = await states(e, a.id, '2026-10-12', '2026-10-12');
  assert.deepEqual(before, ['2026-10-03>2026-10-03:overdue', '2026-10-06>2026-10-06:overdue', '2026-10-09>2026-10-09:overdue', '2026-10-12>2026-10-12:due']);
  const out = await complete(e, 'r-1');
  assert.equal(out.fulfilled.originalDate, '2026-10-03', 'the earliest unresolved occurrence');
  assert.deepEqual(await states(e, a.id, '2026-10-12', '2026-10-12'), ['2026-10-06>2026-10-06:overdue', '2026-10-09>2026-10-09:overdue', '2026-10-12>2026-10-12:due']);
}));

test('one session fulfills at most one occurrence (database-enforced) and finalized evidence is never rewritten', withEnv(async (e) => {
  await e.store.create({ slot: slotA, date: '2026-10-02', cadence: every3 });
  e.clock.set('2026-10-08'); // Oct 2, 5 and 8 are all due
  await complete(e, 'r-1');
  const before = await e.digest();
  const evBefore = await e.digest(['learner_response']);
  // re-submitting the same finalized session is refused before anything is written
  await assert.rejects(complete(e, 'r-1'), (err) => err.code === 'SESSION_ALREADY_RECORDED');
  // a DIFFERENT evidence record that claims the SAME session would satisfy a second occurrence: the database refuses it
  const other = hard('r-2', 'paper-a', '2026-10-08T09:00:00.000Z');
  await assert.rejects(
    e.store.completeSession({ evidenceOps: [putOp(e.spec('learner_response'), other.id, other)], session: ref('r-1'), slot: slotA }),
    (err) => err.code === 'REJECT_CONSTRAINT',
  );
  assert.equal(await e.digest(), before);
  assert.equal(await e.digest(['learner_response']), evBefore, 'the evidence write of the rejected Unit of Work rolled back too');
}));

test('atomicity: a rejected evidence write leaves no fulfillment, no selection and an untouched schedule', withEnv(async (e) => {
  const a = await e.store.create({ slot: slotA, date: '2026-10-02' });
  const before = await e.digest();
  const ev = hard('r-bad');
  const bad = putOp(e.spec('learner_response'), ev.id, ev);
  bad.proj.columns.material_type = 'tampered';
  await assert.rejects(e.store.completeSession({ evidenceOps: [bad], session: ref('r-bad'), slot: slotA, selection: { source: 'manual' } }), (err) => err.code === 'REJECT_PROJECTION');
  assert.equal(await e.digest(), before);
  assert.equal((await e.rows('learner_response')).length, 0);
  assert.equal((await e.store.load(a.id)).payload.status, 'active');
}));

test('moved occurrence regression: fulfillment, selection provenance and exception are keyed by originalDate, never by displayDate', withEnv(async (e) => {
  const a = await e.store.create({ slot: slotA, date: '2026-10-06', cadence: every3 });
  await e.store.moveOccurrence(a.id, '2026-10-06', '2026-10-08');
  e.clock.set('2026-10-08');
  // started from the schedule on the day it is shown (Oct 8): the link carries the identity date Oct 6
  const out = await complete(e, 'r-moved', { scheduleRef: { scheduleId: a.id, originalDate: '2026-10-06' } });
  assert.deepEqual(out.fulfilled, { scheduleId: a.id, originalDate: '2026-10-06', via: 'linked' });
  const f = (await e.rows('schedule_fulfillment'))[0];
  assert.deepEqual([f.id, f.payload.originalDate, f.payload.fulfilledOn], [`${a.id}#2026-10-06`, '2026-10-06', '2026-10-08']);
  const sel = (await e.rows('session_selection'))[0].payload;
  assert.deepEqual(sel.scheduleRef, { scheduleId: a.id, originalDate: '2026-10-06' });
  const everyId = (await Promise.all(['schedule_exception', 'schedule_fulfillment', 'session_selection'].map((c) => e.rows(c)))).flat().map((r) => r.id);
  assert.ok(!everyId.some((id) => id.endsWith('#2026-10-08')), 'no record is keyed by the date the occurrence was moved to');
  assert.deepEqual(await states(e, a.id, '2026-10-08', '2026-10-12'), ['2026-10-06>2026-10-08:fulfilled', '2026-10-09>2026-10-09:scheduled', '2026-10-12>2026-10-12:scheduled']);
  // the same occurrence cannot be fulfilled again, and a link by displayDate is not an identity
  const nothing = await complete(e, 'r-display', { scheduleRef: { scheduleId: a.id, originalDate: '2026-10-08' } });
  assert.equal(nothing.fulfilled, null, 'displayDate is not an occurrence identity');
  // slot-match of another moved occurrence still writes its original date
  await e.store.moveOccurrence(a.id, '2026-10-09', '2026-10-11');
  e.clock.set('2026-10-11');
  const sm = await complete(e, 'r-slot');
  assert.deepEqual(sm.fulfilled, { scheduleId: a.id, originalDate: '2026-10-09', via: 'slot-match' });
  // moving onto a date another unresolved occurrence displays is rejected, so no second occurrence appears by moving
  await assert.rejects(e.store.moveOccurrence(a.id, '2026-10-15', '2026-10-12'), (err) => err.code === 'DATE_TAKEN');
}));

test('selection provenance stores what was SHOWN; later evidence or algorithm changes never rewrite it; a manual start without a link stores nothing', withEnv(async (e) => {
  await e.putEvidence(hard('r-old', 'paper-a', '2026-09-30T10:00:00.000Z'));
  const snapshot = await loadSnapshot(e.port);
  const rec = recommend(snapshot, e.clock.today()).find((r) => r.target.material.id === 'paper-a');
  const shown = selectionProvenance(rec);
  await complete(e, 'r-session', { selection: shown });
  const stored = (await e.rows('session_selection'))[0];
  assert.equal(stored.id, 'learner_response:r-session');
  assert.deepEqual(stored.payload.selection, shown);
  assert.deepEqual(stored.payload.selection.reasons[0].provenance, [{ collection: 'learner_response', id: 'r-old', itemId: 'q1' }], 'ids, never positions or timestamps');
  const bytes = JSON.stringify(stored);
  await e.putEvidence(hard('r-newer', 'paper-a', '2026-10-01T10:00:00.000Z'));
  await e.store.sweep();
  assert.equal(JSON.stringify((await e.rows('session_selection'))[0]), bytes, 'the snapshot of what the learner saw is immutable');
  await complete(e, 'r-manual');
  assert.equal((await e.rows('session_selection')).length, 1, 'no provenance for a plain manual start: absence means unknown, never "manual"');
}));

test('a selection record is a closed schema: no extra fields, a recommended selection needs reasons and a version', withEnv(async (e) => {
  await assert.rejects(complete(e, 'r-x', { selection: { source: 'recommended' } }), (err) => err.name === 'SchemaError');
  await assert.rejects(complete(e, 'r-y', { selection: { source: 'manual', reminder: true } }), (err) => err.name === 'SchemaError');
  assert.equal((await e.rows('session_selection')).length, 0);
}));
