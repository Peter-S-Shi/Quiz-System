// ADR 0003 sections 11.2, 12.2 and 17.5-17.7: a REAL migrated store (V1 fixture through the Migration milestone) is
// upgraded 2 -> 3, read by the Recommender and swept by the planner. Unknown facts are never negative evidence, migration
// never mints scheduling debt, and no scheduling operation touches Evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { todayView } from '../../web/src/orchestration/occurrences.js';
import { loadSnapshot } from '../../web/src/orchestration/readers.js';
import { recommend } from '../../web/src/orchestration/recommend.js';
import { ScheduleStore } from '../../web/src/orchestration/schedule-store.js';
import { fixedClock } from '../../web/src/orchestration/dates.js';
import { putOp } from '../../web/src/projection.js';
import { collectionsDigest, counterIds, fixturePath, openBridge, scenario, tempRoot } from './bridge.mjs';
import { slotA } from './env.mjs';

const FIXTURE = JSON.parse(fs.readFileSync(fixturePath('r-full.json'), 'utf8'));
const TODAY = '2026-10-02';
const EVIDENCE_AND_FACTS = ['learner_response', 'teacher_review', 'legacy_history_entry', 'migration_origin', 'migration_run', 'paper', 'translation_document', 'translation_folder', 'media_object', 'library_categories', 'legacy_residue'];

async function migratedEnv() {
  const t = tempRoot();
  const r = scenario(['migrate', t.root, fixturePath('r-full.json')]); // writes a schema-2 store
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const b = openBridge(t.root); // opening with the product catalog upgrades it to schema 3
  const clock = fixedClock(TODAY);
  const store = await ScheduleStore.open(b.port, { clock, newId: counterIds('m') });
  return { t, b, port: b.port, clock, store, async close() { await b.close(); t.cleanup(); } };
}
const run = (fn) => async () => { const e = await migratedEnv(); try { await fn(e); } finally { await e.close(); } };
const codesOf = (recs, id) => recs.find((r) => r.target.material.id === id)?.reasons.map((x) => x.code) ?? null;

test('schema 2 -> 3: a migrated store upgrades with every record verbatim, empty scheduling collections and a clean consistency check', run(async (e) => {
  const info = await e.port.schemaInfo();
  assert.equal(info.store.userVersion, 3);
  for (const c of ['schedule', 'schedule_exception', 'schedule_fulfillment', 'schedule_suggestion', 'session_selection']) assert.equal(await e.port.count(c), 0, c);
  const check = await e.port.checkConsistency();
  assert.equal(check.quickCheckOk, true);
  assert.deepEqual(check.problems, []);
  const [lr] = await e.port.read('learner_response', { id: 'lr-obj-1' });
  assert.deepEqual(lr.payload, FIXTURE.learnerResponses[0], 'verbatim carry survives the upgrade');
  assert.ok((await e.port.count('migration_origin')) > 10);
}));

test('unknown is not negative: a migrated store yields no recovery, retry, scheduling or Typing signal, and twin history never counts', run(async (e) => {
  const snapshot = await loadSnapshot(e.port);
  const recs = recommend(snapshot, TODAY);
  const text = JSON.stringify(recs);
  for (const never of ['SUCCESSFUL_RECOVERY', 'SCHEDULED', 'TYPING']) assert.ok(!text.includes(never), `${never} must not appear for migrated records`);
  // the dangling retry lineage ('lr-gone') is carried but proves nothing: the retry's own difficulty still shows, nothing is "recovered"
  assert.ok(codesOf(recs, 'doc-1-retry'));
  // Objective: lr-obj-2 has one incorrect item; its history entry is a TWIN, so it is not a second attempt
  const paperB = recs.find((r) => r.target.material.id === 'paper-b');
  assert.deepEqual(paperB.reasons.map((r) => r.code), ['OBJECTIVE_INCORRECT_LATEST']);
  assert.deepEqual(paperB.reasons[0].provenance, [{ collection: 'learner_response', id: 'lr-obj-2', itemId: 'q-single' }]);
  assert.ok(!JSON.stringify(paperB).includes('legacy_history_entry'), 'twin and twin-divergent entries never create signals');
  // Translation: three learner marks stay three distinct reasons; remediation recommended and still unresolved
  const doc1 = codesOf(recs, 'doc-1');
  for (const c of ['LEARNER_UNKNOWN', 'LEARNER_UNCERTAIN', 'LEARNER_SHOULD_KNOW', 'REMEDIATION_UNRESOLVED', 'TEACHER_ACTIONABLE_REVIEW']) assert.ok(doc1.includes(c), c);
  // a migrated library has no schedule: nothing is "unscheduled debt", nothing is overdue
  assert.equal((await e.store.models()).length, 0);
  assert.deepEqual(todayView(await e.store.models(), TODAY).entries, []);
}));

test('migration never mints debt: sweeping a migrated store creates no schedule, suggestion or Overdue item', run(async (e) => {
  assert.deepEqual(await e.store.sweep(), []);
  for (const c of ['schedule', 'schedule_suggestion']) assert.equal(await e.port.count(c), 0, c);
  e.clock.set('2027-06-01'); // time alone changes nothing
  assert.deepEqual(await e.store.sweep(), []);
}));

test('the same facts as NATIVE records do produce proposals - the difference is the missing origin, not the content', async () => {
  const src = await migratedEnv();
  const t2 = tempRoot();
  const b2 = openBridge(t2.root);
  try {
    // copy the difficult records without any migration_origin: they are native V2 records now
    const take = async (c, ids) => (await src.port.read(c)).filter((r) => ids.includes(r.id));
    const responses = await take('learner_response', ['lr-obj-2', 'lr-tr-1']);
    const reviews = await take('teacher_review', ['tr-1']);
    const info = await b2.port.schemaInfo();
    const spec = (n) => info.collections.find((c) => c.name === n);
    await b2.port.commit({ ops: [...responses.map((r) => putOp(spec('learner_response'), r.id, r.payload)), ...reviews.map((r) => putOp(spec('teacher_review'), r.id, r.payload))] });
    const store2 = await ScheduleStore.open(b2.port, { clock: fixedClock(TODAY), newId: counterIds('n') });
    const out = await store2.sweep();
    assert.deepEqual(out.map((o) => `${o.action}:${o.result}`).sort(), ['create-engine:applied', 'create-engine:applied']);
    const rows = await b2.port.read('schedule');
    assert.deepEqual(rows.map((r) => r.payload.slot.material.id).sort(), ['doc-1', 'paper-b']);
    assert.ok(rows.every((r) => r.payload.owner === 'engine' && r.payload.segments[0].anchor === '2026-10-03' && r.payload.slot.intent === 'practice' && r.payload.cadence.kind === 'once'));
  } finally {
    await b2.close();
    t2.cleanup();
    await src.close();
  }
});

test('Evidence immutability: scheduling operations over a migrated store leave every pre-existing record byte-identical', run(async (e) => {
  const before = await collectionsDigest(e.port, EVIDENCE_AND_FACTS);
  const slotDoc = { domain: 'translation', material: { type: 'translation-document', id: 'doc-1' }, intent: 'practice' };
  const a = await e.store.create({ slot: slotA, date: '2026-10-06', cadence: { kind: 'every', unit: 'day', interval: 3 } });
  const d = await e.store.create({ slot: slotDoc, date: '2026-10-05' });
  await e.store.moveOccurrence(a.id, '2026-10-06', '2026-10-07');
  await e.store.moveFuture(a.id, '2026-10-09', '2026-10-10');
  await e.store.moveOnce(d.id, '2026-10-08');
  await e.store.sweep();
  await e.store.cancel(d.id);
  await e.store.cancel(a.id, { originalDate: '2026-10-06' }); // the moved occurrence is cancelled by its identity date
  assert.equal(await collectionsDigest(e.port, EVIDENCE_AND_FACTS), before, 'E-1: no scheduling or recommendation operation altered Evidence or migration facts');
  const check = await e.port.checkConsistency();
  assert.deepEqual(check.problems, []);
}));
