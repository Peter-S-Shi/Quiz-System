// ADR 0003 sections 14, 15 and 17.4 / 17.7: the `sched-*` fault matrix (kill at the Unit-of-Work boundary of every
// scheduling operation), random kills, and the archive round trip. A killed process leaves EXACTLY the pre-state or
// EXACTLY the post-state (the post-state is computed by running the same operation, fault-free, on a clone).
// Scale: QS_ORCH_KILLS (random kills, default 8; CI 100).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fixedClock } from '../../web/src/orchestration/dates.js';
import { loadSnapshot } from '../../web/src/orchestration/readers.js';
import { recommend, selectionProvenance } from '../../web/src/orchestration/recommend.js';
import { ScheduleStore } from '../../web/src/orchestration/schedule-store.js';
import { putOp } from '../../web/src/projection.js';
import { objResp } from '../orch-fixtures.mjs';
import { collectionsDigest, counterIds, openBridge, scenario, tempRoot } from './bridge.mjs';
import { EVIDENCE, PAPERS, SCHED, every3, hard, paperPayload, slotA, slotB } from './env.mjs';

const TODAY = '2026-10-02';
const ALL = [...SCHED, ...EVIDENCE];
const ref = (id) => ({ collection: 'learner_response', id });

async function session(root, { env = {}, prefix = 'op' } = {}) {
  const b = openBridge(root, { env });
  const clock = fixedClock(TODAY);
  const store = await ScheduleStore.open(b.port, { clock, newId: counterIds(prefix) });
  const info = await b.port.schemaInfo();
  const spec = (n) => info.collections.find((c) => c.name === n);
  const putEvidence = (payload) => b.port.commit({ ops: [putOp(spec('learner_response'), payload.id, payload)] });
  return { b, store, clock, port: b.port, spec, putEvidence };
}

async function prepared(prep) {
  const t = tempRoot();
  const s = await session(t.root, { prefix: 'prep' });
  await s.b.port.commit({ ops: PAPERS.map((id) => putOp(s.spec('paper'), id, paperPayload(id))) });
  await prep(s);
  await s.b.close();
  return t;
}

const clone = (t) => {
  const dir = fs.mkdtempSync(path.join(path.dirname(t.dir), 'qs-orch-clone-'));
  fs.cpSync(t.dir, dir, { recursive: true });
  return { dir, root: path.join(dir, 'qs-data'), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
};

async function digestOf(root) {
  const s = await session(root);
  try { return await collectionsDigest(s.port, ALL); } finally { await s.b.close(); }
}

// One scenario per tagged operation: how to reach the state, and the operation itself.
const withSuggestion = async (s) => {
  await s.putEvidence(hard('r1'));
  await s.store.create({ slot: slotA, date: '2026-10-09' }); // prep-001
  await s.store.sweep(); // prep-002: a pending suggestion
};
const SCENARIOS = {
  create: { prep: async () => {}, op: (s) => s.store.create({ slot: slotB, date: '2026-10-05' }) },
  'move-once': { prep: (s) => s.store.create({ slot: slotA, date: '2026-10-06' }), op: (s) => s.store.moveOnce('prep-001', '2026-10-09') },
  'move-occurrence': { prep: (s) => s.store.create({ slot: slotA, date: '2026-10-06', cadence: every3 }), op: (s) => s.store.moveOccurrence('prep-001', '2026-10-06', '2026-10-07') },
  'move-future': { prep: (s) => s.store.create({ slot: slotA, date: '2026-10-06', cadence: every3 }), op: (s) => s.store.moveFuture('prep-001', '2026-10-09', '2026-10-10') },
  cancel: { prep: (s) => s.store.create({ slot: slotA, date: '2026-10-06' }), op: (s) => s.store.cancel('prep-001') },
  'apply-plan': { prep: (s) => s.putEvidence(hard('r1')), op: (s) => s.store.sweep() },
  'decide-accept': { prep: withSuggestion, op: (s) => s.store.decideSuggestion('prep-002', 'accept') },
  'decide-keep': { prep: withSuggestion, op: (s) => s.store.decideSuggestion('prep-002', 'keep') },
  'session-complete': {
    prep: (s) => s.store.create({ slot: slotA, date: '2026-10-02' }),
    op: (s) => {
      const ev = hard('r-session', 'paper-a', '2026-10-02T09:00:00.000Z');
      return s.store.completeSession({ evidenceOps: [putOp(s.spec('learner_response'), ev.id, ev)], session: ref(ev.id), slot: slotA, selection: { source: 'manual' } });
    },
  },
};

test('every sched-* checkpoint leaves exactly the pre-state (before commit) or exactly the post-state (after commit)', async () => {
  let kills = 0;
  for (const [tag, sc] of Object.entries(SCENARIOS)) {
    const t = await prepared(sc.prep);
    const pre = await digestOf(t.root);
    const post = clone(t);
    const s = await session(post.root);
    await sc.op(s);
    await s.b.close();
    const want = await digestOf(post.root);
    assert.notEqual(want, pre, `${tag}: the operation must change something`);
    for (const [phase, expected] of [['before', pre], ['after', want]]) {
      const victim = clone(t);
      const killed = await session(victim.root, { env: { QS_FAULT_AT: `sched-${phase}-commit:${tag}` } });
      await assert.rejects(sc.op(killed), undefined, `${tag}/${phase}: the process must die`);
      assert.equal(await killed.b.waitExit(), 99, `${tag}/${phase}`);
      kills += 1;
      assert.equal(await digestOf(victim.root), expected, `${tag}/${phase}: exactly the ${phase === 'before' ? 'pre' : 'post'}-state`);
      const check = await session(victim.root);
      assert.deepEqual((await check.port.checkConsistency()).problems, [], `${tag}/${phase}`);
      await check.b.close();
      victim.cleanup();
    }
    post.cleanup();
    t.cleanup();
  }
  assert.equal(kills, Object.keys(SCENARIOS).length * 2);
});

test('evidence and fulfillment are never separated: a kill around session finalization leaves both or neither', async () => {
  const t = await prepared(SCENARIOS['session-complete'].prep);
  for (const phase of ['before', 'after']) {
    const v = clone(t);
    const k = await session(v.root, { env: { QS_FAULT_AT: `sched-${phase}-commit:session-complete` } });
    await assert.rejects(SCENARIOS['session-complete'].op(k));
    await k.b.waitExit();
    const s = await session(v.root);
    const evidence = (await s.port.read('learner_response')).length;
    const fulfillments = (await s.port.read('schedule_fulfillment')).length;
    const selections = (await s.port.read('session_selection')).length;
    await s.b.close();
    assert.deepEqual([evidence, fulfillments, selections], phase === 'before' ? [0, 0, 0] : [1, 1, 1], phase);
    v.cleanup();
  }
  t.cleanup();
});

// ----------------------------------------------------------------------------------------------- random kills
async function chaos(s, rnd) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const days = ['2026-10-03', '2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12', '2026-10-15'];
  const slots = [slotA, slotB];
  let n = 0;
  for (;;) {
    const slot = pick(slots);
    try {
      const active = await s.store.activeInSlot(slot);
      const act = pick(['create', 'moveOnce', 'moveOccurrence', 'moveFuture', 'cancel', 'complete', 'sweep', 'decide', 'evidence']);
      if (act === 'create') await s.store.create({ slot, date: pick(days), cadence: pick([{ kind: 'once' }, every3]) });
      else if (act === 'moveOnce' && active) await s.store.moveOnce(active.id, pick(days));
      else if (act === 'moveOccurrence' && active) await s.store.moveOccurrence(active.id, pick(days), pick(days));
      else if (act === 'moveFuture' && active) await s.store.moveFuture(active.id, pick(days), pick(days));
      else if (act === 'cancel' && active) await s.store.cancel(active.id);
      else if (act === 'complete') {
        n += 1;
        const ev = objResp(`k-${Math.floor(rnd() * 1e9)}-${n}`, slot.material.id, { q1: rnd() < 0.5 }, { time: `2026-10-02T08:${String(10 + (n % 50)).padStart(2, '0')}:00.000Z` }).payload;
        await s.store.completeSession({ evidenceOps: [putOp(s.spec('learner_response'), ev.id, ev)], session: ref(ev.id), slot, ...(active && rnd() < 0.5 ? { scheduleRef: { scheduleId: active.id, originalDate: pick(days) } } : {}) });
      } else if (act === 'sweep') await s.store.sweep();
      else if (act === 'evidence') { n += 1; await s.putEvidence(hard(`e-${Math.floor(rnd() * 1e9)}-${n}`, slot.material.id, `2026-10-01T0${n % 10}:00:00.000Z`)); }
      else if (act === 'decide') { const p = await s.store.pendingSuggestions(); if (p.length) await s.store.decideSuggestion(pick(p).id, pick(['accept', 'keep'])); }
    } catch (e) {
      if (String(e?.message).includes('process exited')) return;
    }
  }
}

test('randomly timed kills never leave a half-applied scheduling operation, and the store reopens consistent', async () => {
  const rounds = Number(process.env.QS_ORCH_KILLS ?? 8);
  const template = await prepared(async (s) => {
    await s.putEvidence(hard('r1'));
    await s.store.create({ slot: slotA, date: '2026-10-09', cadence: every3 });
    await s.store.create({ slot: slotB, date: '2026-10-02' });
    await s.store.sweep();
  });
  let seed = 424242;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let round = 0; round < rounds; round += 1) {
    const v = clone(template);
    const s = await session(v.root, { prefix: `k${round}` });
    const running = chaos(s, rnd);
    await new Promise((r) => setTimeout(r, 40 + Math.floor(rnd() * 420)));
    s.b.child.kill();
    await s.b.waitExit();
    await running;
    const r = await session(v.root);
    try {
      const check = await r.port.checkConsistency();
      assert.equal(check.quickCheckOk, true, `round ${round}`);
      assert.deepEqual(check.problems, [], `round ${round}`);
      const scheds = await r.port.read('schedule');
      const active = scheds.filter((x) => x.payload.status === 'active').map((x) => JSON.stringify(x.payload.slot));
      assert.equal(new Set(active).size, active.length, `round ${round}: two active schedules in a slot`);
      for (const g of (await r.port.read('schedule_suggestion')).filter((x) => x.payload.status === 'pending')) {
        assert.equal(g.payload.scheduleRev, scheds.find((x) => x.id === g.payload.scheduleId).rev, `round ${round}: a pending suggestion bound to a stale revision`);
      }
      const evidenceIds = new Set((await r.port.read('learner_response')).map((x) => x.id));
      for (const f of await r.port.read('schedule_fulfillment')) assert.ok(evidenceIds.has(f.payload.session.id), `round ${round}: fulfillment without its evidence`);
      for (const sel of await r.port.read('session_selection')) assert.ok(evidenceIds.has(sel.payload.session.id), `round ${round}: selection without its evidence`);
    } finally {
      await r.b.close();
      v.cleanup();
    }
  }
  template.cleanup();
});

// ------------------------------------------------------------------------------------------------- archive
test('scheduling context survives an archive round trip with identical content, clean consistency and live constraints', async () => {
  const t = await prepared(async (s) => {
    await s.putEvidence(hard('r-old', 'paper-a', '2026-09-30T10:00:00.000Z'));
    const snapshot = await loadSnapshot(s.port);
    const shown = selectionProvenance(recommend(snapshot, TODAY).find((r) => r.target.material.id === 'paper-a'));
    await s.store.create({ slot: { ...slotA, material: { type: 'quiz-paper', id: 'paper-c' } }, date: '2026-10-02' });
    const ev = hard('r-c', 'paper-c', '2026-10-02T09:00:00.000Z');
    await s.store.completeSession({ evidenceOps: [putOp(s.spec('learner_response'), ev.id, ev)], session: ref(ev.id), slot: { ...slotA, material: { type: 'quiz-paper', id: 'paper-c' } }, selection: shown });
    const a = await s.store.create({ slot: slotA, date: '2026-10-09', cadence: every3 });
    await s.store.moveOccurrence(a.id, '2026-10-09', '2026-10-10');
    await s.store.create({ slot: slotB, date: '2026-10-12' });
    await s.putEvidence(hard('r-b', 'paper-b', '2026-10-01T10:00:00.000Z'));
    await s.store.sweep(); // a pending suggestion for slot B
  });
  const want = await digestOf(t.root);
  const archive = path.join(t.dir, 'sched.qsarchive');
  const made = scenario(['product-archive-create', t.root, archive]);
  assert.equal(made.status, 0, made.stderr);
  const t2 = tempRoot();
  const restored = scenario(['product-archive-restore', t2.root, archive]);
  assert.equal(restored.status, 0, restored.stderr);
  const s = await session(t2.root);
  try {
    assert.equal(await collectionsDigest(s.port, ALL), want, 'every scheduling and evidence record travelled');
    for (const c of SCHED) assert.ok((await s.port.count(c)) > 0, `${c} is not empty after the restore`);
    assert.deepEqual((await s.port.checkConsistency()).problems, []);
    // the restored database still enforces the constraints
    await assert.rejects(s.store.create({ slot: slotA, date: '2026-10-20' }), (e) => e.code === 'SLOT_OCCUPIED');
  } finally {
    await s.b.close();
  }
  t2.cleanup();
  t.cleanup();
});
