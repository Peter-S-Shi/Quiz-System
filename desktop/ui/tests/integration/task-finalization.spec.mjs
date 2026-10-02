// ADR 0004 section 13.1-13.3, 13.5, 13.11, 13.12 against the REAL Rust store: legal finalization of all three domains
// (atomic evidence + selection + fulfillment), slot derived from the evidence, the closed adapter boundary with a
// byte-identical store on every refusal, idempotent finalization across an ambiguous crash, retry lineage, archive.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { SessionFinalizer } from '../../web/src/task-domains/finalizer.js';
import { SessionRecovery } from '../../web/src/task-domains/recovery.js';
import { TypingSession } from '../../web/src/task-domains/typing/session.js';
import { ScheduleStore } from '../../web/src/orchestration/schedule-store.js';
import { fixedClock } from '../../web/src/orchestration/dates.js';
import { loadSnapshot } from '../../web/src/orchestration/readers.js';
import { recommend, selectionProvenance } from '../../web/src/orchestration/recommend.js';
import { putOp } from '../../web/src/projection.js';
import { collectionsDigest, counterIds, openBridge, scenario, tempRoot } from './bridge.mjs';
import { SCHED, env, slotA, withEnv } from './env.mjs';
import { nativeObjective, nativeTranslation, nativeTyping } from '../task-fixtures.mjs';

const TODAY = '2026-10-02';
const ALL = [...SCHED, 'learner_response', 'teacher_review', 'legacy_history_entry', 'typing_attempt', 'typing_text', 'paper'];
const slotTr = { domain: 'translation', material: { type: 'translation-document', id: 'doc-1' }, intent: 'practice' };
const slotTy = { domain: 'typing', material: { type: 'typing-text', id: 'typing-1' }, intent: 'practice' };
const text = (id) => ({ schemaVersion: 1, id, title: 'Copy text', text: 'environment', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' });
const bad = (code) => (err) => err.code === code;

async function fin(e) {
  await e.port.commit({ ops: [putOp(e.spec('typing_text'), 'typing-1', text('typing-1'))] });
  return { finalizer: new SessionFinalizer({ port: e.port, store: e.store }), recovery: new SessionRecovery(e.port) };
}

test('all three domains finalize atomically: evidence + selection + fulfillment, linked and slot-match', withEnv(async (e) => {
  const { finalizer } = await fin(e);
  const a = await e.store.create({ slot: slotA, date: TODAY });
  const b = await e.store.create({ slot: slotTr, date: TODAY });
  const c = await e.store.create({ slot: slotTy, date: TODAY });
  // Objective: slot-match (no link)
  const o = await finalizer.finalize({ payload: nativeObjective('o-1', 'paper-a', { time: `${TODAY}T09:00:00.000Z` }) });
  assert.deepEqual(o.fulfilled, { scheduleId: a.id, originalDate: TODAY, via: 'slot-match' });
  // Translation: linked
  const t = await finalizer.finalize({ payload: nativeTranslation('t-1', 'doc-1', { time: `${TODAY}T09:00:00.000Z` }), selection: { source: 'manual' }, scheduleRef: { scheduleId: b.id, originalDate: TODAY } });
  assert.deepEqual(t.fulfilled, { scheduleId: b.id, originalDate: TODAY, via: 'linked' });
  // Typing: through the real session engine
  const s = new TypingSession({ evidenceId: 'ty-1', sessionId: 'sess-ty-1', startedAt: `${TODAY}T09:00:00.000Z`, material: { id: 'typing-1', title: 'Copy text', text: 'environment' }, intent: 'practice', policy: { feedbackTiming: 'live', corrections: 'allowed' } });
  s.input({ isTrusted: true, type: 'input', value: 'enviroment' });
  const done = s.finalize({ completedAt: `${TODAY}T09:03:00.000Z` });
  const y = await finalizer.finalize({ payload: done.payload, selection: done.selection });
  assert.deepEqual(y.fulfilled, { scheduleId: c.id, originalDate: TODAY, via: 'slot-match' });
  for (const [coll, n] of [['learner_response', 2], ['typing_attempt', 1], ['schedule_fulfillment', 3], ['session_selection', 2]]) assert.equal((await e.rows(coll)).length, n, coll);
  const sels = (await e.rows('session_selection')).map((r) => r.id).sort();
  assert.deepEqual(sels, ['learner_response:t-1', 'typing_attempt:ty-1'], 'keyed by the evidence collection and id');
  for (const id of [a.id, b.id, c.id]) assert.equal((await e.store.load(id)).payload.status, 'completed');
  assert.deepEqual((await e.port.checkConsistency()).problems, []);
}));

test('the recommended-selection snapshot the learner saw round-trips byte-for-byte through finalization', withEnv(async (e) => {
  const { finalizer } = await fin(e);
  await e.putEvidence(nativeObjective('old', 'paper-a', { time: '2026-09-30T10:00:00.000Z' }));
  const shown = selectionProvenance(recommend(await loadSnapshot(e.port), TODAY).find((r) => r.target.material.id === 'paper-a'));
  assert.equal(shown.algorithmVersion, 'v2');
  await finalizer.finalize({ payload: nativeObjective('o-rec', 'paper-a', { time: `${TODAY}T09:00:00.000Z` }), selection: shown });
  const [row] = await e.rows('session_selection', [{ column: 'session_id', op: 'eq', value: 'o-rec' }]);
  assert.deepEqual(row.payload.selection, shown);
}));

test('the slot comes from the evidence: intent, domain and material decide what a session fulfills (T-2)', withEnv(async (e) => {
  const { finalizer } = await fin(e);
  const testObj = await e.store.create({ slot: { ...slotA, intent: 'test' }, date: TODAY });
  const typingSched = await e.store.create({ slot: slotTy, date: TODAY });
  // a Practice objective session never satisfies a Test schedule
  assert.equal((await finalizer.finalize({ payload: nativeObjective('o-p', 'paper-a', { time: `${TODAY}T09:00:00.000Z` }) })).fulfilled, null);
  // the Test session does
  const done = await finalizer.finalize({ payload: nativeObjective('o-t', 'paper-a', { intent: 'test', feedbackTiming: 'submit-at-end', time: `${TODAY}T09:01:00.000Z` }) });
  assert.equal(done.fulfilled.scheduleId, testObj.id);
  // a typing attempt on text 'paper-a' (same id string, other domain) never fulfills the objective slot or the typing schedule of another text
  const ty = nativeTyping('ty-x', { material: 'paper-a', text: 'environment', typed: 'environment' });
  assert.equal((await finalizer.finalize({ payload: ty })).fulfilled, null);
  assert.equal((await e.store.load(typingSched.id)).payload.status, 'active', 'a different Typing Text does not satisfy it');
  // a quiz-paper record never fulfills a translation slot with the same id
  await e.store.create({ slot: { ...slotTr, material: { type: 'translation-document', id: 'paper-a' } }, date: TODAY });
  assert.equal((await finalizer.finalize({ payload: nativeObjective('o-p2', 'paper-a', { time: `${TODAY}T09:02:00.000Z` }) })).fulfilled, null);
}));

test('a Translation retry (ephemeral material) fulfills the SOURCE document\'s schedule; remediation uses its own document', withEnv(async (e) => {
  const { finalizer } = await fin(e);
  const src = await e.store.create({ slot: slotTr, date: TODAY });
  const retry = nativeTranslation('t-retry', 'ephemeral-retry-1', { time: `${TODAY}T09:00:00.000Z`, provenance: { purpose: 'retry', sourceResponseId: 't-0', sourceMaterialId: 'doc-1' } });
  const r = await finalizer.finalize({ payload: retry });
  assert.deepEqual(r.fulfilled, { scheduleId: src.id, originalDate: TODAY, via: 'slot-match' });
  const rem = await e.store.create({ slot: { ...slotTr, material: { type: 'translation-document', id: 'doc-rem' } }, date: TODAY });
  const m = await finalizer.finalize({ payload: nativeTranslation('t-rem', 'doc-rem', { time: `${TODAY}T09:05:00.000Z`, provenance: { purpose: 'remediation', sourceResponseId: 't-0', sourceReviewId: 'rv-1', sourceMaterialId: 'doc-1' } }) });
  assert.equal(m.fulfilled.scheduleId, rem.id);
}));

test('closed adapter boundary: every invalid finalization is rejected before any write; the store is byte-identical', withEnv(async (e) => {
  const { finalizer } = await fin(e);
  await e.store.create({ slot: slotA, date: TODAY });
  const before = await e.digest(ALL);
  const withAnnotation = nativeTranslation('t-bad-1', 'doc-1', { annotations: [['ti-1', 'unknown', 4, 15]] });
  delete withAnnotation.extensions['quiz-studio.v2.session'].offsetEncoding;
  const objWithMarks = nativeObjective('o-bad-1'); objWithMarks.learnerItemMarks = [{ itemId: 'q1', kind: 'unknown' }];
  const trWithResult = nativeTranslation('t-bad-2'); trWithResult.responses[0].result = { correct: true };
  const noFacts = nativeObjective('o-bad-2'); delete noFacts.extensions;
  const typingLive = nativeTyping('ty-bad-1'); typingLive.intent = 'test';
  const typingExtra = nativeTyping('ty-bad-2'); typingExtra.accuracy = 0.9;
  const typingTampered = nativeTyping('ty-bad-3', { typed: 'enviroment' }); typingTampered.errors = [];
  const typingOldVersion = nativeTyping('ty-bad-4'); typingOldVersion.comparison.version = 'typing-compare/0';
  const cases = {
    'unknown material type': [{ ...nativeObjective('x-1'), material: { ...nativeObjective('x-1').material, type: 'mystery' } }, 'BAD_EVIDENCE_OPS'],
    'native annotations without offsetEncoding': [withAnnotation, 'BAD_EVIDENCE_PAYLOAD'],
    'objective carrying learner marks': [objWithMarks, 'BAD_EVIDENCE_PAYLOAD'],
    'translation carrying a grading result': [trWithResult, 'BAD_EVIDENCE_PAYLOAD'],
    'no V2 session facts': [noFacts, 'BAD_EVIDENCE_PAYLOAD'],
    'test attempt with live feedback': [typingLive, 'BAD_EVIDENCE_PAYLOAD'],
    'unknown typing field': [typingExtra, 'BAD_EVIDENCE_PAYLOAD'],
    'typing facts that disagree with the pinned comparison': [typingTampered, 'BAD_EVIDENCE_PAYLOAD'],
    'a new attempt on an unimplemented comparison version': [typingOldVersion, 'BAD_EVIDENCE_PAYLOAD'],
  };
  for (const [why, [payload, code]] of Object.entries(cases)) {
    await assert.rejects(finalizer.finalize({ payload, selection: { source: 'manual' } }), bad(code), why);
    assert.equal(await e.digest(ALL), before, `${why}: store byte-identical`);
  }
  // the store seam itself refuses a caller that pushes a typing record through the wrong collection or a foreign slot
  const ty = nativeTyping('ty-ok');
  await assert.rejects(e.store.completeSession({ evidenceOps: [putOp(e.spec('typing_attempt'), ty.id, ty)], session: { collection: 'typing_attempt', id: ty.id }, slot: slotA }), bad('SLOT_MISMATCH'));
  assert.equal(await e.digest(ALL), before);
}));

test('idempotent finalization: the same session twice leaves one record; different content under the same id is refused (T-3, T-4)', withEnv(async (e) => {
  const { finalizer } = await fin(e);
  const a = await e.store.create({ slot: slotA, date: TODAY });
  const payload = nativeObjective('o-1', 'paper-a', { time: `${TODAY}T09:00:00.000Z` });
  const first = await finalizer.finalize({ payload, selection: { source: 'manual' } });
  assert.equal(first.alreadyFinalized, false);
  const after = await e.digest(ALL);
  const second = await finalizer.finalize({ payload: JSON.parse(JSON.stringify(payload)), selection: { source: 'manual' } });
  assert.deepEqual([second.alreadyFinalized, second.fulfilled], [true, { scheduleId: a.id, originalDate: TODAY, via: 'slot-match' }]);
  assert.equal(await e.digest(ALL), after, 'no write at all');
  const different = nativeObjective('o-1', 'paper-a', { time: `${TODAY}T09:00:00.000Z`, wrong: [] });
  await assert.rejects(finalizer.finalize({ payload: different }), bad('SESSION_ALREADY_RECORDED'));
  assert.equal(await e.digest(ALL), after, 'finalized evidence is never rewritten');
  // two concurrent finalizations of one session: exactly one record, both calls settle
  const ty = nativeTyping('ty-race', { typed: 'enviroment' });
  const [x, y] = await Promise.all([finalizer.finalize({ payload: ty }), finalizer.finalize({ payload: ty })]);
  assert.equal([x, y].filter((r) => r.alreadyFinalized === false).length, 1);
  assert.equal((await e.rows('typing_attempt')).length, 1);
}));

test('no automatic Typing scheduling: a difficult attempt followed by a sweep creates no schedule and no suggestion (T-14)', withEnv(async (e) => {
  const { finalizer } = await fin(e);
  await finalizer.finalize({ payload: nativeTyping('ty-d', { typed: 'enviroment' }) });
  const applied = await e.store.sweep();
  assert.deepEqual(applied.filter((x) => x.slot?.domain === 'typing' || x.slot === undefined), []);
  assert.equal((await e.rows('schedule')).length, 0, 'no engine-owned schedule');
  assert.equal((await e.rows('schedule_suggestion')).length, 0, 'no suggestion');
  // the learner can still schedule it by hand, and a retry fulfills that schedule through the normal rules
  const mine = await e.store.create({ slot: slotTy, date: TODAY });
  const retry = await finalizer.finalize({ payload: nativeTyping('ty-r', { typed: 'environment', time: '2026-10-02T09:10:00.000Z', provenance: { purpose: 'retry', sourceAttemptId: 'ty-d', sourceMaterialId: 'typing-1', createdAt: '2026-10-02T09:10:00.000Z' } }) });
  assert.deepEqual(retry.fulfilled, { scheduleId: mine.id, originalDate: TODAY, via: 'slot-match' });
  assert.equal((await e.store.load(mine.id)).payload.owner, 'user');
}));

test('typing_attempt is immutable: a finalized attempt cannot be rewritten through the seam, and a retry is a NEW attempt', withEnv(async (e) => {
  const { finalizer } = await fin(e);
  const a = nativeTyping('ty-1', { typed: 'enviroment' });
  await finalizer.finalize({ payload: a });
  const before = await e.digest(ALL);
  await assert.rejects(finalizer.finalize({ payload: nativeTyping('ty-1', { typed: 'environment' }) }), bad('SESSION_ALREADY_RECORDED'));
  assert.equal(await e.digest(ALL), before);
  const retry = nativeTyping('ty-2', { typed: 'environment', provenance: { purpose: 'retry', sourceAttemptId: 'ty-1', sourceMaterialId: 'typing-1', createdAt: '2026-10-02T09:10:00.000Z' }, time: '2026-10-02T09:10:00.000Z' });
  await finalizer.finalize({ payload: retry });
  assert.equal((await e.rows('typing_attempt')).length, 2);
  assert.deepEqual((await e.rows('typing_attempt')).find((r) => r.id === 'ty-1').payload, a, 'the source attempt is byte-identical');
}));

// ------------------------------------------------------------------------------- crash recovery (T-4, section 10.3)
function bridgeSession(root, env = {}) {
  const b = openBridge(root, { env });
  const clock = fixedClock(TODAY);
  return (async () => {
    const store = await ScheduleStore.open(b.port, { clock, newId: counterIds('rc') });
    const spec = (await b.port.schemaInfo()).collections;
    return { b, store, port: b.port, finalizer: new SessionFinalizer({ port: b.port, store }), recovery: new SessionRecovery(b.port), spec: (n) => spec.find((c) => c.name === n) };
  })();
}

for (const domain of ['objective', 'typing']) {
  test(`${domain}: a kill AFTER commit and BEFORE the recovery row is cleared re-finalizes to exactly one record; a kill BEFORE commit re-finalizes once`, async () => {
    for (const phase of ['after', 'before']) {
      const t = tempRoot();
      const s0 = await bridgeSession(t.root);
      await s0.port.commit({ ops: [putOp(s0.spec('typing_text'), 'typing-1', text('typing-1')), putOp(s0.spec('paper'), 'paper-a', { schemaVersion: 1, id: 'paper-a', title: 'p', description: '', category: '', tags: [], createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', questions: [] })] });
      const slot = domain === 'typing' ? slotTy : slotA;
      const sched = await s0.store.create({ slot, date: TODAY });
      const payload = domain === 'typing' ? nativeTyping('ev-1', { typed: 'enviroment', time: `${TODAY}T09:00:00.000Z` }) : nativeObjective('ev-1', 'paper-a', { time: `${TODAY}T09:00:00.000Z` });
      await s0.recovery.save({ schemaVersion: 1, domain, evidenceId: 'ev-1', session: { id: payload.session.id, startedAt: payload.session.startedAt }, domainState: { note: 'answers so far' } });
      await s0.b.close();
      // the finalizing process dies at the Unit-of-Work boundary
      const dying = await bridgeSession(t.root, { QS_FAULT_AT: `sched-${phase}-commit:session-complete` });
      await assert.rejects(dying.finalizer.finalize({ payload, selection: { source: 'manual' } }));
      assert.equal(await dying.b.waitExit(), 99);
      // restart: the recovery row survived; its evidence exists only if the commit happened
      const s1 = await bridgeSession(t.root);
      const offered = await s1.recovery.resumable();
      if (phase === 'after') {
        assert.deepEqual(offered, [], 'the finalized session is discarded, never re-finalized');
        assert.equal(await s1.port.count('recovery_session'), 0);
      } else {
        assert.equal(offered.length, 1);
        assert.equal(offered[0].evidenceId, 'ev-1', 'the id allocated at session start survives the crash');
      }
      // re-finalize with the SAME payload (rebuilt from recovery state in a real engine): idempotent in both phases
      const again = await s1.finalizer.finalize({ payload, selection: { source: 'manual' } });
      assert.equal(again.alreadyFinalized, phase === 'after');
      assert.deepEqual(again.fulfilled, { scheduleId: sched.id, originalDate: TODAY, via: 'slot-match' });
      const coll = domain === 'typing' ? 'typing_attempt' : 'learner_response';
      assert.equal((await s1.port.read(coll)).length, 1, `${phase}: exactly one evidence record`);
      assert.equal((await s1.port.read('schedule_fulfillment')).length, 1);
      assert.equal((await s1.port.read('session_selection')).length, 1);
      await s1.recovery.clear(payload.session.id);
      assert.deepEqual((await s1.port.checkConsistency()).problems, []);
      await s1.b.close();
      t.cleanup();
    }
  });
}

test('recovery state is recovery-only: never evidence, never archived, never read by the Readers', withEnv(async (e) => {
  const { recovery } = await fin(e);
  await recovery.save({ schemaVersion: 1, domain: 'typing', evidenceId: 'ty-r', session: { id: 'sess-r', startedAt: '2026-10-02T09:00:00.000Z' }, domainState: { committedText: 'envi' } });
  assert.equal((await e.rows('typing_attempt')).length, 0);
  await e.b.close(); // the archive tool opens the store itself
  const archive = path.join(e.t.dir, 'recovery.qsarchive');
  assert.equal(scenario(['product-archive-create', e.t.root, archive]).status, 0, 'archive');
  // (the live store still holds the row; a restored store must not)
  const t2 = tempRoot();
  assert.equal(scenario(['product-archive-restore', t2.root, archive]).status, 0);
  const b2 = openBridge(t2.root);
  try { assert.equal(await b2.port.count('recovery_session'), 0, 'recovery-only data is excluded from archives'); } finally { await b2.close(); t2.cleanup(); }
}));

// ------------------------------------------------------------------------------- retry lineage and archive
test('retry lineage through the real store: Objective recovery is read as before; a Typing retry is invisible to it', withEnv(async (e) => {
  const { finalizer } = await fin(e);
  await finalizer.finalize({ payload: nativeObjective('o-1', 'paper-a', { wrong: ['q1'], items: ['q1'], time: '2026-10-01T09:00:00.000Z' }) });
  await finalizer.finalize({ payload: nativeObjective('o-2', 'paper-a', { wrong: [], items: ['q1'], time: '2026-10-02T09:00:00.000Z', provenance: { purpose: 'retry', sourceResponseId: 'o-1', sourceMaterialId: 'paper-a' } }) });
  await finalizer.finalize({ payload: nativeTyping('ty-1', { typed: 'enviroment', time: '2026-10-01T09:00:00.000Z' }) });
  await finalizer.finalize({ payload: nativeTyping('ty-2', { typed: 'enviroment', time: '2026-10-02T09:00:00.000Z', provenance: { purpose: 'retry', sourceAttemptId: 'ty-1', sourceMaterialId: 'paper-a', createdAt: '2026-10-02T09:00:00.000Z' } }) });
  const recs = recommend(await loadSnapshot(e.port), TODAY);
  assert.equal(recs.find((r) => r.target.material.id === 'paper-a'), undefined, 'the objective retry recovered the incorrect item; the typing retry changed nothing there');
  const typing = recs.find((r) => r.target.domain === 'typing');
  assert.deepEqual(typing.reasons.map((r) => r.code), ['TYPING_ERRORS_REMAIN']);
  assert.deepEqual(typing.reasons[0].provenance, [{ collection: 'typing_attempt', id: 'ty-2' }], 'only the latest attempt speaks');
  assert.ok(!JSON.stringify(recs).includes('SUCCESSFUL_RECOVERY') || !typing.context, 'typing never produces recovery');
}));

test('typing facts survive an archive round trip verbatim (NFD text, spans, lineage) with an identical state', async () => {
  const e = await env();
  try {
    const { finalizer } = await fin(e);
    await finalizer.finalize({ payload: nativeTyping('ty-nfd', { text: 'café', typed: 'café', time: '2026-10-02T09:00:00.000Z' }) });
    await finalizer.finalize({ payload: nativeTyping('ty-fam', { text: '\u{1F468}‍\u{1F469}‍\u{1F467}', typed: '\u{1F468}', time: '2026-10-02T09:01:00.000Z' }) });
    const want = await collectionsDigest(e.port, ALL);
    await e.b.close(); // the archive tool opens the store itself
    const archive = path.join(e.t.dir, 'typing.qsarchive');
    assert.equal(scenario(['product-archive-create', e.t.root, archive]).status, 0);
    const t2 = tempRoot();
    assert.equal(scenario(['product-archive-restore', t2.root, archive]).status, 0);
    const b2 = openBridge(t2.root);
    try {
      assert.equal(await collectionsDigest(b2.port, ALL), want);
      const [nfd] = await b2.port.read('typing_attempt', { id: 'ty-nfd' });
      assert.equal(nfd.payload.committed.text, 'café', 'NFD survives byte-for-byte');
      assert.deepEqual((await b2.port.checkConsistency()).problems, []);
    } finally { await b2.close(); t2.cleanup(); }
  } finally { await e.close(); }
});
