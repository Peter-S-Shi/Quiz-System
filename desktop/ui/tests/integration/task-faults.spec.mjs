// ADR 0004 section 13.4: the `sched-*:session-complete` fault matrix for EACH of the three domains, and randomly timed
// kills over a mixed three-domain workload. A killed finalization leaves EXACTLY the pre-state or EXACTLY the post-state
// (computed on a clone), the evidence/selection/fulfillment trio is never split, and the invariants (S-1, S-3, S-6, S-7,
// E-1, T-1..T-4) hold after every restart.
// Scale: QS_ORCH_KILLS (random kills, default 8; CI 100).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSnapshot } from '../../web/src/orchestration/readers.js';
import { TypingSession } from '../../web/src/task-domains/typing/session.js';
import { nativeObjective, nativeTranslation, nativeTyping } from '../task-fixtures.mjs';
import { every3, slotA } from './env.mjs';
import { TODAY, clone, digestOf, prepared, session } from './faults-kit.mjs';

const slotTr = { domain: 'translation', material: { type: 'translation-document', id: 'doc-1' }, intent: 'practice' };
const slotTy = { domain: 'typing', material: { type: 'typing-text', id: 'typing-1' }, intent: 'practice' };
const at = (m) => `${TODAY}T09:${String(m).padStart(2, '0')}:00.000Z`;

const DOMAINS = {
  objective: { slot: slotA, collection: 'learner_response', payload: () => nativeObjective('ev-obj', 'paper-a', { time: at(1) }) },
  translation: { slot: slotTr, collection: 'learner_response', payload: () => nativeTranslation('ev-tr', 'doc-1', { time: at(2) }) },
  typing: {
    slot: slotTy, collection: 'typing_attempt',
    payload: () => {
      const s = new TypingSession({ evidenceId: 'ev-ty', sessionId: 'sess-ev-ty', startedAt: at(2), material: { id: 'typing-1', title: 'Copy text', text: 'environment' }, intent: 'practice', policy: { feedbackTiming: 'live', corrections: 'allowed' } });
      s.input({ isTrusted: true, type: 'input', value: 'enviroment' });
      return s.finalize({ completedAt: at(3) }).payload;
    },
  },
};

test('sched-*:session-complete leaves exactly the pre- or post-state for Objective, Translation and Typing, and never splits the trio', async () => {
  let kills = 0;
  for (const [name, d] of Object.entries(DOMAINS)) {
    const op = (s) => s.finalizer.finalize({ payload: d.payload(), selection: { source: 'manual' } });
    const t = await prepared((s) => s.store.create({ slot: d.slot, date: TODAY }));
    const pre = await digestOf(t.root);
    const post = clone(t);
    const s0 = await session(post.root);
    const ok = await op(s0);
    assert.notEqual(ok.fulfilled, null, `${name}: the schedule is fulfilled`);
    await s0.b.close();
    const want = await digestOf(post.root);
    assert.notEqual(want, pre);
    for (const [phase, expected, trio] of [['before', pre, [0, 0, 0]], ['after', want, [1, 1, 1]]]) {
      const v = clone(t);
      const k = await session(v.root, { env: { QS_FAULT_AT: `sched-${phase}-commit:session-complete` } });
      await assert.rejects(op(k), undefined, `${name}/${phase}: the process must die`);
      assert.equal(await k.b.waitExit(), 99, `${name}/${phase}`);
      kills += 1;
      assert.equal(await digestOf(v.root), expected, `${name}/${phase}: exactly the ${phase === 'before' ? 'pre' : 'post'}-state`);
      const r = await session(v.root);
      assert.deepEqual((await r.port.checkConsistency()).problems, [], `${name}/${phase}`);
      const counts = [(await r.port.read(d.collection)).length, (await r.port.read('schedule_fulfillment')).length, (await r.port.read('session_selection')).length];
      assert.deepEqual(counts, trio, `${name}/${phase}: evidence, fulfillment and selection are all absent or all present`);
      await r.b.close();
      v.cleanup();
    }
    post.cleanup();
    t.cleanup();
  }
  assert.equal(kills, Object.keys(DOMAINS).length * 2);
});

// ----------------------------------------------------------------------------------------------- random kills
async function chaos(s, rnd) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const days = ['2026-10-03', '2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12'];
  const slots = [slotA, slotTr, slotTy];
  let n = 0;
  for (;;) {
    const slot = pick(slots);
    try {
      const active = await s.store.activeInSlot(slot);
      const act = pick(['create', 'moveOnce', 'cancel', 'finalize', 'finalize', 'sweep']);
      if (act === 'create') await s.store.create({ slot, date: pick(days), cadence: pick([{ kind: 'once' }, every3]) });
      else if (act === 'moveOnce' && active) await s.store.moveOnce(active.id, pick(days));
      else if (act === 'cancel' && active) await s.store.cancel(active.id);
      else if (act === 'sweep') await s.store.sweep();
      else if (act === 'finalize') {
        n += 1;
        const id = `k-${Math.floor(rnd() * 1e9)}-${n}`;
        const time = at(10 + (n % 49));
        const payload = slot.domain === 'objective' ? nativeObjective(id, 'paper-a', { wrong: rnd() < 0.5 ? ['q1'] : [], time })
          : slot.domain === 'translation' ? nativeTranslation(id, 'doc-1', { time })
            : nativeTyping(id, { typed: rnd() < 0.5 ? 'environment' : 'enviroment', time });
        await s.finalizer.finalize({ payload, ...(active && rnd() < 0.5 ? { scheduleRef: { scheduleId: active.id, originalDate: pick(days) } } : {}) });
      }
    } catch (e) {
      if (s.b.exited() !== null || String(e?.message).includes('process exited')) return;
    }
  }
}

test('randomly timed kills over a mixed three-domain workload keep every invariant and never rewrite evidence', async () => {
  const rounds = Number(process.env.QS_ORCH_KILLS ?? 8);
  const template = await prepared(async (s) => {
    await s.finalizer.finalize({ payload: nativeObjective('seed-o', 'paper-a', { time: '2026-10-01T09:00:00.000Z' }) });
    await s.finalizer.finalize({ payload: nativeTyping('seed-t', { typed: 'enviroment', time: '2026-10-01T09:00:00.000Z' }) });
    await s.store.create({ slot: slotA, date: '2026-10-09', cadence: every3 });
    await s.store.create({ slot: slotTy, date: '2026-10-02' });
  });
  const seedRows = async (root) => {
    const r = await session(root);
    try { return JSON.stringify([await r.port.read('learner_response'), await r.port.read('typing_attempt')]); } finally { await r.b.close(); }
  };
  const seeded = await seedRows(template.root);
  let seed = 777;
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
      const evidence = new Map();
      for (const c of ['learner_response', 'typing_attempt']) for (const x of await r.port.read(c)) evidence.set(`${c}:${x.id}`, x);
      for (const f of await r.port.read('schedule_fulfillment')) assert.ok(evidence.has(`${f.payload.session.collection}:${f.payload.session.id}`), `round ${round}: fulfillment without its evidence`);
      for (const sel of await r.port.read('session_selection')) assert.ok(evidence.has(`${sel.payload.session.collection}:${sel.payload.session.id}`), `round ${round}: selection without its evidence`);
      // evidence is immutable: every record that existed before the kills is byte-identical afterwards (rev never bumped)
      const before = JSON.parse(seeded);
      for (const c of before) for (const x of c) assert.equal(JSON.stringify(evidence.get(`${x.payload.material.type === 'typing-text' ? 'typing_attempt' : 'learner_response'}:${x.id}`)), JSON.stringify(x), `round ${round}: ${x.id} was rewritten`);
      // an evidence record is never in two collections and carries its own domain's material type
      for (const [key, x] of evidence) assert.equal(key.startsWith('typing_attempt:'), x.payload.material.type === 'typing-text', `round ${round}: ${key} in the wrong collection`);
      const snap = await loadSnapshot(r.port);
      assert.ok(Array.isArray(snap.typingAttempts));
    } finally {
      await r.b.close();
      v.cleanup();
    }
  }
  template.cleanup();
});
