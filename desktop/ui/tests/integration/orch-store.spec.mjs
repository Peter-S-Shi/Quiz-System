// ADR 0003 sections 8-10, 14, 16 and 17.1-17.5: the ScheduleStore against the REAL Rust store (database-enforced
// uniqueness / foreign keys / revision preconditions, atomic Units of Work). Needs the qs-scenario binary.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ScheduleStore, ScheduleError } from '../../web/src/orchestration/schedule-store.js';
import { COLLECTIONS, assertValid } from '../../web/src/orchestration/schema.js';
import { calendarView, expandOccurrences, isGenerated, isUnresolved } from '../../web/src/orchestration/occurrences.js';
import { putOp } from '../../web/src/projection.js';
import { objResp, T } from '../orch-fixtures.mjs';
import { collectionsDigest, counterIds } from './bridge.mjs';
import { EVIDENCE, SCHED, every3, env, hard, hook, slotA, slotB, tagIs, withEnv } from './env.mjs';

// ----------------------------------------------------------------------------------------------- O-1 create
test('Create is only for an unoccupied slot: an occupied slot is refused with the existing schedule and NOTHING is rewritten (A-1)', withEnv(async (e) => {
  const a = await e.store.create({ slot: slotA, date: '2026-10-06', cadence: every3 });
  await e.store.moveOccurrence(a.id, '2026-10-06', '2026-10-08');
  const before = await e.digest();
  await assert.rejects(e.store.create({ slot: slotA, date: '2026-10-20' }), (err) => err.code === 'SLOT_OCCUPIED' && err.detail.existing.id === a.id);
  await assert.rejects(e.store.create({ slot: slotA, date: '2026-10-20', cadence: { kind: 'every', unit: 'week', interval: 1 } }), (err) => err.code === 'SLOT_OCCUPIED');
  assert.equal(await e.digest(), before, 'segments, exceptions, fulfillments and history are untouched by a refused Create');
  assert.equal((await e.store.load(a.id)).payload.cadence.interval, 3);
}));

test('a racing Create loses to the database (partial unique index), and the direct duplicate commit is rejected by the constraint', withEnv(async (e) => {
  const results = await Promise.allSettled([e.store.create({ slot: slotB, date: '2026-10-05' }), e.store.create({ slot: slotB, date: '2026-10-09' })]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const lost = results.find((r) => r.status === 'rejected');
  assert.equal(lost.reason.code, 'SLOT_OCCUPIED');
  assert.equal((await e.rows('schedule', [{ column: 'status', op: 'eq', value: 'active' }])).length, 1);
  const active = (await e.rows('schedule'))[0].payload;
  const dup = { ...active, id: 'sch-dup' };
  await assert.rejects(e.port.commit({ ops: [putOp(e.spec('schedule'), 'sch-dup', dup)] }), (err) => err.code === 'REJECT_CONSTRAINT');
}));

test('a full cadence change is cancel-then-create with a NEW identity; the old series keeps its history byte for byte', withEnv(async (e) => {
  const a = await e.store.create({ slot: slotA, date: '2026-10-06', cadence: every3 });
  await e.store.moveOccurrence(a.id, '2026-10-06', '2026-10-08');
  const oldExceptions = await collectionsDigest(e.port, ['schedule_exception']);
  await e.store.cancel(a.id);
  const b = await e.store.create({ slot: slotA, date: '2026-10-10', cadence: { kind: 'every', unit: 'week', interval: 1 } });
  assert.notEqual(b.id, a.id);
  assert.equal(await collectionsDigest(e.port, ['schedule_exception']), oldExceptions);
  const old = await e.store.load(a.id);
  assert.equal(old.payload.status, 'cancelled');
  assert.deepEqual(old.payload.segments, [{ anchor: '2026-10-06' }]);
  assert.equal((await e.store.load(b.id)).payload.owner, 'user');
}));

// ------------------------------------------------------------------------------------------------ ownership
test('ownership matrix: a learner move/cancel makes an existing schedule user-owned IN PLACE; the engine only writes engine-owned rows', withEnv(async (e) => {
  const proposal = (slot, date) => ({ slot, date, reasons: [{ code: 'OBJECTIVE_INCORRECT_LATEST', params: {} }], basis: [{ collection: 'learner_response', id: 'r1' }], algorithmVersion: 'v1' });
  for (const [name, act] of [
    ['moveOnce', (id) => e.store.moveOnce(id, '2026-10-12')],
    ['cancel', (id) => e.store.cancel(id)],
  ]) {
    const slot = { ...slotA, material: { type: 'quiz-paper', id: `paper-${name}` } };
    const [r] = await e.store.applyPlan([proposal(slot, '2026-10-03')]);
    assert.equal(r.result, 'applied');
    const eng = (await e.rows('schedule', [{ column: 'material_id', op: 'eq', value: `paper-${name}` }]))[0];
    assert.equal(eng.payload.owner, 'engine');
    await act(eng.id);
    const after = (await e.rows('schedule', [{ column: 'material_id', op: 'eq', value: `paper-${name}` }]));
    assert.equal(after.length, 1, `${name}: same row, no second schedule`);
    assert.equal(after[0].id, eng.id);
    assert.equal(after[0].payload.owner, 'user');
    assert.equal(after[0].payload.engine, undefined);
    assert.ok(after[0].rev > eng.rev);
  }
}));

test('the engine never overwrites a user-owned schedule: apply against a user row stores only a suggestion and leaves the row byte-identical', withEnv(async (e) => {
  const a = await e.store.create({ slot: slotA, date: '2026-10-06' });
  await e.putEvidence(hard('r1'));
  const row = JSON.stringify((await e.store.load(a.id)).payload);
  const rev = (await e.store.load(a.id)).rev;
  const res = await e.store.sweep();
  assert.deepEqual(res.map((r) => r.action), ['create-suggestion']);
  const after = await e.store.load(a.id);
  assert.equal(JSON.stringify(after.payload), row);
  assert.equal(after.rev, rev);
}));

// ------------------------------------------------------------------------------------------------ conflicts
test('ANY different engine date is a learner-resolved suggestion (a one-day difference too); accept leaves ONE active schedule and no Overdue from the old date', withEnv(async (e) => {
  await e.putEvidence(hard('r1')); // sweep proposes 2026-10-03
  const a = await e.store.create({ slot: slotA, date: '2026-10-04' });
  const [r] = await e.store.sweep();
  assert.equal(r.action, 'create-suggestion');
  const [g] = await e.store.pendingSuggestions();
  assert.deepEqual([g.payload.suggestedDate, g.payload.currentDate, g.payload.targetOriginalDate], ['2026-10-03', '2026-10-04', '2026-10-04']);
  assert.equal(g.payload.scheduleRev, (await e.store.load(a.id)).rev, 'bound to the schedule revision it was computed against');
  assert.equal((await e.rows('schedule', [{ column: 'status', op: 'eq', value: 'active' }])).length, 1, 'a suggestion is not a second schedule');
  await e.store.decideSuggestion(g.id, 'accept');
  const after = await e.store.load(a.id);
  assert.deepEqual([after.payload.owner, after.payload.segments], ['user', [{ anchor: '2026-10-03' }]]);
  assert.equal((await e.rows('schedule_suggestion'))[0].payload.status, 'accepted');
  e.clock.set('2026-10-05');
  const models = await e.store.models();
  assert.equal(models.length, 1);
  assert.equal(expandOccurrences(models[0], { from: '2026-10-05', to: '2026-10-05' }, '2026-10-05').occurrences.filter((o) => o.originalDate === '2026-10-04').length, 0, 'the discarded date generates no occurrence, so no Overdue');
  e.clock.set('2026-10-02');
  assert.deepEqual((await e.store.sweep()).map((x) => x.why), ['equal-date']);
  e.clock.set('2026-10-04'); // the planning date moved, so the engine date differs again - but the accepted basis is covered
  assert.deepEqual((await e.store.sweep()).map((x) => x.why), ['basis-covered'], 'an accepted basis does not nag again');
}));

test('an EQUAL date is a no-op; keep leaves the learner date, never re-nags without a new evidence id, and a new id raises one again', withEnv(async (e) => {
  await e.putEvidence(hard('r1'));
  const equal = await e.store.create({ slot: slotA, date: '2026-10-03' });
  assert.deepEqual((await e.store.sweep()).map((x) => x.why), ['equal-date']);
  await e.store.moveOnce(equal.id, '2026-10-09');
  const [r] = await e.store.sweep();
  assert.equal(r.action, 'create-suggestion', 'the move superseded nothing pending, and the date now differs');
  const [g] = await e.store.pendingSuggestions();
  await e.store.decideSuggestion(g.id, 'keep');
  assert.equal((await e.store.load(equal.id)).payload.segments[0].anchor, '2026-10-09');
  assert.deepEqual((await e.store.sweep()).map((x) => x.why), ['basis-covered']);
  await e.putEvidence(hard('r2', 'paper-a', '2026-10-01T18:00:00.000Z'));
  assert.deepEqual((await e.store.sweep()).map((x) => x.action), ['create-suggestion'], 'a new evidence id may raise a suggestion again');
  assert.equal((await e.store.pendingSuggestions()).length, 1, 'at most one pending suggestion per schedule');
}));

test('learner changes atomically supersede the pending suggestion; an old suggestion can never apply to the changed schedule (L-3)', withEnv(async (e) => {
  await e.putEvidence(hard('r1'));
  const a = await e.store.create({ slot: slotA, date: '2026-10-09' });
  await e.store.sweep();
  const [g] = await e.store.pendingSuggestions();
  const boundRev = g.payload.scheduleRev;
  await e.store.moveOnce(a.id, '2026-10-12');
  const sup = (await e.rows('schedule_suggestion'))[0];
  assert.equal(sup.payload.status, 'superseded');
  assert.ok(sup.payload.decidedAt);
  assert.ok((await e.store.load(a.id)).rev > boundRev, 'the schedule revision advanced in the same Unit of Work');
  const before = await e.digest();
  for (const decision of ['accept', 'keep']) {
    await assert.rejects(e.store.decideSuggestion(g.id, decision), (err) => err.code === 'STALE_SUGGESTION');
  }
  assert.equal(await e.digest(), before, 'a stale decision changes nothing');
  assert.deepEqual((await e.store.sweep()).map((x) => x.why), ['basis-covered'], 'the sweep recomputes against the new revision and does not re-nag');
  // every learner modification supersedes: cancel, move-occurrence and move-future too
  const rec = await e.store.create({ slot: slotB, date: '2026-10-06', cadence: every3 });
  await e.putEvidence(hard('r3', 'paper-b'));
  await e.store.sweep();
  const pend = async () => (await e.store.pendingSuggestions()).filter((p) => p.payload.scheduleId === rec.id);
  let k = 0;
  for (const act of [() => e.store.moveOccurrence(rec.id, '2026-10-09', '2026-10-10'), () => e.store.moveFuture(rec.id, '2026-10-12', '2026-10-13')]) {
    k += 1;
    await e.putEvidence(hard(`r-b${k}`, 'paper-b', `2026-10-01T${String(11 + k).padStart(2, '0')}:00:00.000Z`));
    await e.store.sweep();
    assert.equal((await pend()).length, 1);
    await act();
    assert.equal((await pend()).length, 0);
  }
}));

test('a pending suggestion bound to an OLD revision (even a forged one) can never be accepted or kept', withEnv(async (e) => {
  const a = await e.store.create({ slot: slotA, date: '2026-10-09' });
  await e.store.moveOnce(a.id, '2026-10-12');
  await e.store.moveOnce(a.id, '2026-10-13'); // revision 3
  const stale = { schemaVersion: 1, id: 'g-forged', scheduleId: a.id, scheduleRev: 1, targetOriginalDate: '2026-10-13', currentDate: '2026-10-13', suggestedDate: '2026-10-03', reasons: [], algorithmVersion: 'v1', basis: [], status: 'pending', createdAt: '2026-10-02T00:00:00Z' };
  await e.port.commit({ ops: [putOp(e.spec('schedule_suggestion'), 'g-forged', stale)] });
  const before = await e.digest();
  for (const decision of ['accept', 'keep']) {
    await assert.rejects(e.store.decideSuggestion('g-forged', decision), (err) => err.code === 'STALE_SUGGESTION', decision);
  }
  assert.equal(await e.digest(), before);
  assert.equal((await e.store.load(a.id)).payload.segments[0].anchor, '2026-10-13');
}));

// ---------------------------------------------------------------------------------------------------- races
test('learner-wins race 1: the engine computed from an old state; the learner moves first; the engine write is dropped', withEnv(async (e) => {
  await e.putEvidence(hard('r1'));
  const a = await e.store.create({ slot: slotA, date: '2026-10-06' });
  const learner = await e.other();
  const engine = await ScheduleStore.open(hook(e.port, { match: tagIs('apply-plan'), run: () => learner.moveOnce(a.id, '2026-10-20') }), { clock: e.clock, newId: counterIds('eng') });
  const res = await engine.sweep();
  assert.deepEqual(res.map((r) => r.result), ['lost-race']);
  assert.equal((await e.store.load(a.id)).payload.segments[0].anchor, '2026-10-20', "the learner's date survives");
  assert.equal((await e.store.pendingSuggestions()).length, 0);
  // the next sweep recomputes against the new revision
  assert.deepEqual((await e.store.sweep()).map((x) => x.action), ['create-suggestion']);
}));

test('learner-wins race 2: an in-place engine recalculation loses to a learner move; ownership and date stay the learner\'s', withEnv(async (e) => {
  const slot = slotA;
  await e.store.applyPlan([{ slot, date: '2026-10-05', reasons: [], basis: [{ collection: 'learner_response', id: 'r0' }], algorithmVersion: 'v1' }]);
  const id = (await e.rows('schedule'))[0].id;
  await e.putEvidence(hard('r1'));
  const learner = await e.other();
  const engine = await ScheduleStore.open(hook(e.port, { match: tagIs('apply-plan'), run: () => learner.moveOnce(id, '2026-10-21') }), { clock: e.clock, newId: counterIds('eng') });
  assert.deepEqual((await engine.sweep()).map((r) => r.result), ['lost-race']);
  const after = await e.store.load(id);
  assert.deepEqual([after.payload.owner, after.payload.segments[0].anchor], ['user', '2026-10-21']);
}));

test('learner-wins race 3: accepting a suggestion while the learner cancels aborts with no change', withEnv(async (e) => {
  await e.putEvidence(hard('r1'));
  const a = await e.store.create({ slot: slotA, date: '2026-10-09' });
  await e.store.sweep();
  const [g] = await e.store.pendingSuggestions();
  const learner = await e.other();
  const deciding = await ScheduleStore.open(hook(e.port, { match: tagIs('decide-accept'), run: () => learner.cancel(a.id) }), { clock: e.clock, newId: counterIds('d') });
  await assert.rejects(deciding.decideSuggestion(g.id, 'accept'), (err) => err.code === 'STALE');
  assert.equal((await e.store.load(a.id)).payload.status, 'cancelled');
  assert.equal((await e.rows('schedule_suggestion'))[0].payload.status, 'superseded');
}));

test('learner-wins race 4: completing a session while the learner moves the schedule recomputes against the new revision; the evidence still commits', withEnv(async (e) => {
  const a = await e.store.create({ slot: slotA, date: '2026-10-02' });
  const learner = await e.other();
  const completing = await ScheduleStore.open(hook(e.port, { match: tagIs('session-complete'), run: () => learner.moveOnce(a.id, '2026-10-02'.replace('02', '03')) }), { clock: e.clock, newId: counterIds('c') });
  // the learner's move to Oct 3 happens first, so the Oct-2 slot-match finds nothing due and the session fulfills nothing
  const evidence = hard('r-session', 'paper-a', '2026-10-02T09:00:00.000Z');
  const out = await completing.completeSession({ evidenceOps: [putOp(e.spec('learner_response'), evidence.id, evidence)], session: { collection: 'learner_response', id: evidence.id }, slot: slotA });
  assert.equal(out.fulfilled, null, 'the retry recomputed against the new revision: the future occurrence is not consumed by an unlinked session');
  assert.equal((await e.rows('learner_response')).length, 1, 'the evidence was still committed');
  assert.equal((await e.rows('schedule_fulfillment')).length, 0);
}));

test('learner-wins race 5: the learner moves ANOTHER occurrence during completion; the retry fulfills the due occurrence exactly once', withEnv(async (e) => {
  const a = await e.store.create({ slot: slotA, date: '2026-10-02', cadence: every3 });
  const learner = await e.other();
  const completing = await ScheduleStore.open(hook(e.port, { match: tagIs('session-complete'), run: () => learner.moveOccurrence(a.id, '2026-10-05', '2026-10-06') }), { clock: e.clock, newId: counterIds('c') });
  const ev = hard('r-session', 'paper-a', '2026-10-02T09:00:00.000Z');
  const out = await completing.completeSession({ evidenceOps: [putOp(e.spec('learner_response'), ev.id, ev)], session: { collection: 'learner_response', id: ev.id }, slot: slotA });
  assert.deepEqual(out.fulfilled, { scheduleId: a.id, originalDate: '2026-10-02', via: 'slot-match' });
  assert.equal((await e.rows('schedule_fulfillment')).length, 1);
  assert.equal((await e.rows('schedule_exception')).length, 1, "the learner's move survived");
}));

// ------------------------------------------------------------------------------------------------- recurrence
test('recurrence through the store: this-only exception, this-and-future re-anchor (Scope 7.7 example) and move-back', withEnv(async (e) => {
  e.clock.set('2026-10-02');
  const a = await e.store.create({ slot: slotA, date: '2026-10-03', cadence: every3 });
  e.clock.set('2026-10-03');
  const evidence = objResp('r-oct3', 'paper-a', { q1: true }, { time: '2026-10-03T09:00:00.000Z' }).payload;
  const done = await e.store.completeSession({ evidenceOps: [putOp(e.spec('learner_response'), evidence.id, evidence)], session: { collection: 'learner_response', id: evidence.id }, slot: slotA });
  assert.deepEqual(done.fulfilled, { scheduleId: a.id, originalDate: '2026-10-03', via: 'slot-match' });
  e.clock.set('2026-10-04');
  const dates = async (to = '2026-10-16') => {
    const m = (await e.store.models())[0];
    return expandOccurrences(m, { from: '2026-10-04', to }, e.clock.today()).occurrences.map((o) => `${o.originalDate}>${o.displayDate}:${o.state}`);
  };
  assert.deepEqual(await dates(), ['2026-10-06>2026-10-06:scheduled', '2026-10-09>2026-10-09:scheduled', '2026-10-12>2026-10-12:scheduled', '2026-10-15>2026-10-15:scheduled']);
  await e.store.moveOccurrence(a.id, '2026-10-06', '2026-10-07');
  assert.deepEqual((await dates()).slice(0, 3), ['2026-10-06>2026-10-07:scheduled', '2026-10-09>2026-10-09:scheduled', '2026-10-12>2026-10-12:scheduled'], 'this occurrence only: the rest keeps its anchor');
  await e.store.moveOccurrence(a.id, '2026-10-06', '2026-10-06'); // back to its original date: the exception disappears
  assert.equal((await e.rows('schedule_exception')).length, 0);
  await e.store.moveFuture(a.id, '2026-10-06', '2026-10-08');
  assert.deepEqual(await dates('2026-10-14'), ['2026-10-08>2026-10-08:scheduled', '2026-10-11>2026-10-11:scheduled', '2026-10-14>2026-10-14:scheduled']);
  const s = (await e.store.load(a.id)).payload;
  assert.deepEqual(s.segments, [{ anchor: '2026-10-03' }, { anchor: '2026-10-08', takesOverAt: '2026-10-06' }]);
  assert.equal(s.owner, 'user');
}));

test('recurrence guards: every rejected operation leaves the store byte-identical', withEnv(async (e) => {
  const a = await e.store.create({ slot: slotA, date: '2026-10-06', cadence: { kind: 'every', unit: 'day', interval: 3, until: '2026-10-15' } });
  await e.store.moveOccurrence(a.id, '2026-10-09', '2026-10-10');
  const before = await e.digest();
  const bad = async (code, p) => { await assert.rejects(p, (err) => err instanceof ScheduleError && err.code === code, code); assert.equal(await e.digest(), before, code); };
  await bad('NOT_AN_OCCURRENCE', e.store.moveOccurrence(a.id, '2026-10-07', '2026-10-08'));
  await bad('DATE_IN_PAST', e.store.moveOccurrence(a.id, '2026-10-06', '2026-10-01'));
  await bad('DATE_TAKEN', e.store.moveOccurrence(a.id, '2026-10-06', '2026-10-10'));
  await bad('NO_CHANGE', e.store.moveOccurrence(a.id, '2026-10-06', '2026-10-06'));
  await bad('REANCHOR_OVERLAP', e.store.moveFuture(a.id, '2026-10-12', '2026-10-09'));
  await bad('BEYOND_UNTIL', e.store.moveFuture(a.id, '2026-10-12', '2026-10-30'));
  await bad('NOT_ONCE', e.store.moveOnce(a.id, '2026-10-20'));
  await bad('BAD_DATE', e.store.moveFuture(a.id, '2026-10-12', '2026-10-13T09:00'));
  const once = await e.store.create({ slot: slotB, date: '2026-10-06' });
  const before2 = await e.digest();
  await assert.rejects(e.store.moveOccurrence(once.id, '2026-10-06', '2026-10-07'), (err) => err.code === 'NOT_RECURRING');
  await assert.rejects(e.store.moveOnce(once.id, '2026-10-06'), (err) => err.code === 'NO_CHANGE');
  assert.equal(await e.digest(), before2);
}));

test('moving this-and-future drops the exceptions at or after the cut and keeps earlier ones; a later fulfilled occurrence blocks it', withEnv(async (e) => {
  const a = await e.store.create({ slot: slotA, date: '2026-10-03', cadence: every3 });
  await e.store.moveOccurrence(a.id, '2026-10-03', '2026-10-04');
  await e.store.moveOccurrence(a.id, '2026-10-12', '2026-10-13');
  await e.store.moveFuture(a.id, '2026-10-09', '2026-10-10');
  const ex = (await e.rows('schedule_exception')).map((r) => r.payload.originalDate);
  assert.deepEqual(ex, ['2026-10-03'], 'the Oct-12 exception (after the cut) is dropped, the Oct-3 one kept');
  // a linked early start fulfilled a later occurrence: re-anchoring before it is refused (nothing may silently vanish)
  const evidence = hard('r-early', 'paper-a', '2026-10-02T09:00:00.000Z');
  await e.store.completeSession({ evidenceOps: [putOp(e.spec('learner_response'), evidence.id, evidence)], session: { collection: 'learner_response', id: evidence.id }, slot: slotA, scheduleRef: { scheduleId: a.id, originalDate: '2026-10-13' } });
  await assert.rejects(e.store.moveFuture(a.id, '2026-10-10', '2026-10-11'), (err) => err.code === 'FUTURE_HAS_FULFILLMENT');
}));

test('property: random operation sequences never violate the scheduling invariants (S-1, S-3, S-6, S-7, L-3, E-1)', withEnv(async (e) => {
  const sequences = Number(process.env.QS_ORCH_SEQUENCES ?? 25);
  let seed = 20261002;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const slots = [slotA, slotB, { ...slotA, intent: 'test' }];
  const days = Array.from({ length: 24 }, (_, i) => `2026-10-${String(2 + i).padStart(2, '0')}`).filter((d) => d <= '2026-10-31');
  let n = 0;
  const stats = {};
  const tally = (act, ok) => { const k = `${act}:${ok ? 'ok' : 'rejected'}`; stats[k] = (stats[k] ?? 0) + 1; };
  const evidenceRows = async () => new Map((await Promise.all(EVIDENCE.map((c) => e.rows(c)))).flat().map((r) => [`${r.id}`, JSON.stringify([r.rev, r.payload])]));
  const invariants = async (label) => {
    const [scheds, exs, fuls, sugs] = await Promise.all(SCHED.slice(0, 4).map((c) => e.rows(c)));
    const bySlot = new Map();
    for (const s of scheds) {
      assert.deepEqual(assertValid('schedule', s.payload), s.payload);
      if (s.payload.status === 'active') { const k = JSON.stringify(s.payload.slot); assert.ok(!bySlot.has(k), `${label}: two active schedules in ${k}`); bySlot.set(k, s); }
      for (const x of exs.filter((r) => r.payload.scheduleId === s.id)) assert.ok(isGenerated(s.payload, x.payload.originalDate), `${label}: orphaned exception ${x.id}`);
      for (const f of fuls.filter((r) => r.payload.scheduleId === s.id)) assert.ok(isGenerated(s.payload, f.payload.originalDate), `${label}: orphaned fulfillment ${f.id}`);
      if (s.payload.status === 'active' && s.payload.cadence.kind === 'every') {
        const m = { schedule: s.payload, exceptions: exs.filter((r) => r.payload.scheduleId === s.id).map((r) => r.payload), fulfillments: fuls.filter((r) => r.payload.scheduleId === s.id).map((r) => r.payload) };
        const shown = expandOccurrences(m, { from: '2026-10-01', to: '2026-12-31' }, e.clock.today()).occurrences.filter((o) => isUnresolved(o.state)).map((o) => o.displayDate);
        assert.equal(new Set(shown).size, shown.length, `${label}: two unresolved occurrences share a display date`);
      }
      const pend = sugs.filter((g) => g.payload.scheduleId === s.id && g.payload.status === 'pending');
      assert.ok(pend.length <= 1, `${label}: two pending suggestions`);
      for (const g of pend) assert.equal(g.payload.scheduleRev, s.rev, `${label}: a pending suggestion is bound to the CURRENT revision`);
    }
    assert.equal(new Set(fuls.map((f) => `${f.payload.session.collection}:${f.payload.session.id}`)).size, fuls.length, `${label}: a session fulfilled twice`);
  };
  for (let seq = 0; seq < sequences; seq += 1) {
    e.clock.set(pick(days.slice(0, 6)));
    for (let step = 0; step < 14; step += 1) {
      const slot = pick(slots);
      const act = pick(['create', 'create', 'moveOnce', 'moveOccurrence', 'moveFuture', 'cancel', 'complete', 'evidence', 'sweep', 'decide', 'tick']);
      const active = await e.store.activeInSlot(slot);
      const before = await evidenceRows();
      const label = `seq ${seq} step ${step} ${act}`;
      let accepted = true;
      try {
        if (act === 'create') await e.store.create({ slot, date: pick(days.filter((d) => d >= e.clock.today())), cadence: pick([{ kind: 'once' }, every3, { kind: 'every', unit: 'week', interval: 1, until: '2026-10-28' }]) });
        else if (act === 'moveOnce' && active) await e.store.moveOnce(active.id, pick(days));
        else if (act === 'moveOccurrence' && active) await e.store.moveOccurrence(active.id, pick(days), pick(days));
        else if (act === 'moveFuture' && active) await e.store.moveFuture(active.id, pick(days), pick(days));
        else if (act === 'cancel' && active) await e.store.cancel(active.id, rnd() < 0.5 ? { originalDate: pick(days) } : {});
        else if (act === 'complete') {
          n += 1;
          const ev = objResp(`pr-${n}`, slot.material.id, { q1: rnd() < 0.5 }, { time: `${e.clock.today()}T08:${String(10 + (n % 50)).padStart(2, '0')}:00.000Z` }).payload;
          await e.store.completeSession({ evidenceOps: [putOp(e.spec('learner_response'), ev.id, ev)], session: { collection: 'learner_response', id: ev.id }, slot, ...(active && rnd() < 0.5 ? { scheduleRef: { scheduleId: active.id, originalDate: pick(days) } } : {}) });
        } else if (act === 'evidence') {
          n += 1;
          await e.putEvidence(objResp(`pe-${n}`, slot.material.id, { q1: false }, { time: `${e.clock.today()}T07:${String(10 + (n % 50)).padStart(2, '0')}:00.000Z` }).payload);
        } else if (act === 'sweep') await e.store.sweep();
        else if (act === 'decide') { const p = await e.store.pendingSuggestions(); if (p.length) await e.store.decideSuggestion(pick(p).id, pick(['accept', 'keep'])); }
        else if (act === 'tick') e.clock.set(pick(days.filter((d) => d >= e.clock.today())));
      } catch (err) {
        accepted = false;
        tally(act, false);
        assert.ok(err instanceof ScheduleError || err?.name === 'SchemaError', `${label}: unexpected ${err?.code ?? ''} ${err?.message}`);
      }
      if (accepted) tally(act, true);
      const after = await evidenceRows();
      for (const [id, v] of before) assert.equal(after.get(id), v, `${label}: evidence ${id} was altered (E-1)`);
      await invariants(label);
    }
  }
  if (process.env.QS_ORCH_STATS) console.log(JSON.stringify(stats));
}));

test('material removal (section 9.4): the sweep retires an engine-owned schedule; a user-owned one is kept and shown as unavailable', withEnv(async (e) => {
  const mat = (id) => ({ domain: 'objective', material: { type: 'quiz-paper', id }, intent: 'practice' });
  await e.store.applyPlan([{ slot: mat('paper-gone'), date: '2026-10-05', reasons: [], basis: [{ collection: 'learner_response', id: 'r0' }], algorithmVersion: 'v1' }]);
  const u = await e.store.create({ slot: mat('paper-gone-user'), date: '2026-10-06' });
  assert.deepEqual(await e.store.sweep(), [], 'while the materials exist nothing happens');
  await e.port.commit({ ops: ['paper-gone', 'paper-gone-user'].map((id) => ({ op: 'delete', collection: 'paper', id })) });
  const res = await e.store.sweep();
  assert.deepEqual(res.map((r) => [r.action, r.result]), [['retire-unavailable', 'applied']]);
  const eng = (await e.rows('schedule')).find((r) => r.payload.slot.material.id === 'paper-gone');
  assert.deepEqual([eng.payload.status, eng.payload.cancellation.by], ['cancelled', 'engine']);
  assert.equal((await e.store.load(u.id)).payload.status, 'active', 'a user-owned schedule is never retired automatically');
  const view = calendarView(await e.store.models(), { from: '2026-10-02', to: '2026-10-31' }, '2026-10-02', { materialAvailable: await e.store.materialAvailable() });
  assert.equal(view.days[0].entries[0].unavailable, true, 'it stays visible and flagged until the learner cancels it');
  await e.store.cancel(u.id);
}));
