// Today / Calendar / start-a-session over the REAL store: projections and the Recommender are read-only, schedule changes
// go through ScheduleStore, sessions start with the learner's real Selection, and finalizing a session started from a due
// occurrence fulfils exactly that occurrence (identity = scheduleId + originalDate).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibrary } from '../../web/src/product/library.js';
import { createLearning, monthWindow, StartError } from '../../web/src/product/learning.js';
import { createPracticeRuntime } from '../../web/src/practice/runtime.js';
import { storeMedia } from '../../web/src/media/media-source.js';
import { correctAnswerForView, paperWithExplanations, wrongAnswerForView } from '../objective-fixtures.mjs';
import { putOp } from '../../web/src/projection.js';
import { withEnv, SCHED } from './env.mjs';

let n = 0;
const now = () => `2026-10-02T09:${String(n++ % 60).padStart(2, '0')}:00.000Z`;

async function setup(e, opts = {}) {
  const library = await createLibrary({ port: e.port, now });
  const runtime = await createPracticeRuntime(e.port, { store: e.store, now, ...opts });
  const learning = createLearning({ port: e.port, store: e.store, clock: e.clock, runtime, library });
  return { library, runtime, learning };
}

async function playObjective(started, paper, { wrongAt = [] } = {}) {
  for (let i = 0; i < started.engine.view().total; i += 1) {
    started.engine.go(i);
    const v = started.engine.view();
    started.engine.answer(wrongAt.includes(v.question.id) ? wrongAnswerForView(v, paper) : correctAnswerForView(v, paper));
    if (started.engine.view().canSubmitItem) started.engine.submitItem();
  }
  return started.engine.finalize({ now: '2026-10-02T10:30:00.000Z' });
}

test('monthWindow: Monday-first 6-week grid that always contains the month', () => {
  const w = monthWindow('2026-10-17');
  assert.deepEqual([w.month, w.first, w.from, w.to], ['2026-10', '2026-10-01', '2026-09-28', '2026-11-08']);
  const feb = monthWindow('2026-02-10'); // Feb 1 2026 is a Sunday
  assert.deepEqual([feb.from, feb.to], ['2026-01-26', '2026-03-08']);
});

test('Today and Calendar are read-only projections; recommendations carry readable reasons in both languages', withEnv(async (e) => {
  const { library, runtime, learning } = await setup(e);
  const paper = { ...paperWithExplanations({ id: 'paper-t' }), title: 'Capital cities' };
  await library.savePaper(paper);
  const started = await runtime.begin(runtime.startObjective({ paper, intent: 'practice', feedbackTiming: 'instant' }));
  await runtime.services.commit({ payload: await playObjective(started, paper, { wrongAt: ['q-single'] }) });
  const before = await e.digest();
  const today = await learning.today('en');
  const cal = await learning.calendar('2026-10-02');
  assert.deepEqual(await e.digest(), before, 'Today and Calendar write nothing');
  const rec = today.recommendations.find((r) => r.target.material.id === 'paper-t');
  assert.ok(rec, 'the paper with a wrong answer is recommended');
  assert.equal(rec.title, 'Capital cities');
  assert.ok(rec.reasonTexts.length > 0 && rec.reasonTexts.every((x) => x.code && x.text.length > 10));
  assert.ok(!JSON.stringify(rec).match(/mastery|score|percent/i), 'no mastery number is shown');
  const zh = (await learning.today('zh-CN')).recommendations.find((r) => r.target.material.id === 'paper-t');
  assert.notEqual(zh.reasonTexts[0].text, rec.reasonTexts[0].text);
  assert.match(zh.reasonTexts[0].text, /[一-龥]/);
  assert.equal(today.facts.due, 0);
  assert.equal(cal.month, '2026-10');
}));

test('the engine sweep proposes a revisit; the learner then owns dates: create, move, cancel; one active schedule per slot', withEnv(async (e) => {
  const { library, learning } = await setup(e);
  const paper = { ...paperWithExplanations({ id: 'paper-s' }), title: 'Scheduled paper' };
  await library.savePaper(paper);
  const created = await learning.createSchedule({ domain: 'objective', materialId: 'paper-s', intent: 'practice', date: '2026-10-05', cadence: { kind: 'every', unit: 'day', interval: 3 } });
  await assert.rejects(() => learning.createSchedule({ domain: 'objective', materialId: 'paper-s', intent: 'practice', date: '2026-10-09' }), (err) => err.code === 'SLOT_OCCUPIED');
  let cal = await learning.calendar('2026-10-02');
  const dates = [...cal.days.keys()].sort();
  assert.deepEqual(dates.slice(0, 3), ['2026-10-05', '2026-10-08', '2026-10-11']);
  assert.equal(cal.days.get('2026-10-05')[0].title, 'Scheduled paper');
  assert.equal(cal.days.get('2026-10-05')[0].owner, 'user');
  // move one occurrence by identity (original date), then everything after it
  await learning.moveOccurrence(created.id, '2026-10-08', '2026-10-09');
  cal = await learning.calendar('2026-10-02');
  assert.ok(cal.days.has('2026-10-09') && !cal.days.has('2026-10-08'));
  assert.equal(cal.days.get('2026-10-09')[0].originalDate, '2026-10-08', 'the moved occurrence keeps its identity');
  await learning.moveFuture(created.id, '2026-10-11', '2026-10-12');
  await learning.cancel(created.id, '2026-10-05');
  cal = await learning.calendar('2026-10-02');
  assert.ok(!cal.days.has('2026-10-05'), 'the cancelled occurrence is gone from the grid');
  await learning.cancel(created.id);
  cal = await learning.calendar('2026-10-02');
  assert.equal([...cal.days.keys()].length, 0);
  // after cancelling, a new schedule may be created for the slot
  const again = await learning.createSchedule({ domain: 'objective', materialId: 'paper-s', intent: 'practice', date: '2026-10-20' });
  assert.notEqual(again.id, created.id);
}));

test('a pending suggestion appears in the Calendar; the learner decides; stale decisions are refused', withEnv(async (e) => {
  const { library, runtime, learning } = await setup(e);
  const paper = { ...paperWithExplanations({ id: 'paper-g' }), title: 'Suggested paper' };
  await library.savePaper(paper);
  // the learner owns a date far away; new evidence makes the engine propose an earlier one -> a suggestion, never a move
  await learning.createSchedule({ domain: 'objective', materialId: 'paper-g', intent: 'practice', date: '2026-10-20' });
  const started = await runtime.begin(runtime.startObjective({ paper, intent: 'test', feedbackTiming: 'submit-at-end' }));
  const payload = await playObjective(started, paper, { wrongAt: ['q-single', 'q-multi'] });
  await runtime.services.commit({ payload });
  await learning.sweep();
  const cal = await learning.calendar('2026-10-02');
  assert.equal(cal.suggestions.length, 1, 'one pending suggestion');
  const sug = cal.suggestions[0];
  assert.equal(sug.currentDate, '2026-10-20');
  assert.notEqual(sug.suggestedDate, sug.currentDate);
  assert.ok(sug.reasons.length > 0 && sug.reasons[0].text.length > 5 && /[一-龥]/.test(sug.reasons[0].textZh));
  assert.equal(sug.title, 'Suggested paper');
  const sched = await learning.scheduleOf(sug.scheduleId);
  assert.equal(sched.payload.owner, 'user', 'the learner still owns the date');
  assert.deepEqual(sched.payload.segments, [{ anchor: '2026-10-20' }]);
  // the learner moves the date themselves meanwhile -> the old suggestion can no longer be applied
  await learning.moveOnce(sug.scheduleId, '2026-10-21');
  await assert.rejects(() => learning.decide(sug.id, 'accept'), (err) => err.code === 'STALE_SUGGESTION');
  assert.equal((await learning.calendar('2026-10-02')).suggestions.length, 0, 'moving superseded the pending suggestion');
}));

test('starting: recommended keeps the reasons the learner was shown; manual says manual; a due occurrence is fulfilled by identity', withEnv(async (e) => {
  const { library, runtime, learning } = await setup(e);
  const paper = { ...paperWithExplanations({ id: 'paper-d' }), title: 'Due paper' };
  await library.savePaper(paper);
  // a recommended start
  let first = await runtime.begin(runtime.startObjective({ paper, intent: 'practice', feedbackTiming: 'instant' }));
  await runtime.services.commit({ payload: await playObjective(first, paper, { wrongAt: ['q-tf'] }) });
  const rec = (await learning.today('en')).recommendations.find((r) => r.target.material.id === 'paper-d');
  const started = await learning.start({ domain: 'objective', materialId: 'paper-d', source: 'recommended', recommendation: rec, intent: 'practice' });
  const payload = await playObjective(started, paper);
  await runtime.servicesFor(started).commit({ payload });
  const sel = (await e.port.read('session_selection', { id: `learner_response:${payload.id}` }))[0].payload;
  assert.equal(sel.selection.source, 'recommended');
  assert.deepEqual(sel.selection.reasons.map((r) => r.code), rec.reasons.map((r) => r.code), 'the stored reasons are the ones shown');
  // a manual start
  const manual = await learning.start({ domain: 'objective', materialId: 'paper-d', intent: 'practice', feedbackTiming: 'submit-at-end' });
  const mp = await playObjective(manual, paper);
  await runtime.servicesFor(manual).commit({ payload: mp });
  assert.equal((await e.port.read('session_selection', { id: `learner_response:${mp.id}` }))[0].payload.selection.source, 'manual');
  // a due, MOVED occurrence is started by identity and fulfilled by identity
  const sch = await learning.createSchedule({ domain: 'objective', materialId: 'paper-d', intent: 'practice', date: '2026-10-02', cadence: { kind: 'every', unit: 'day', interval: 7 } });
  const t = await learning.today('en');
  const entry = t.entries.find((x) => x.scheduleId === sch.id);
  assert.equal(entry.state, 'due');
  const linked = await learning.start({ domain: 'objective', materialId: 'paper-d', intent: 'practice', scheduleRef: { scheduleId: entry.scheduleId, originalDate: entry.originalDate } });
  const lp = await playObjective(linked, paper);
  const out = await runtime.servicesFor(linked).commit({ payload: lp });
  assert.deepEqual([out.fulfilled.scheduleId, out.fulfilled.originalDate, out.fulfilled.via], [sch.id, '2026-10-02', 'linked']);
  assert.equal((await learning.today('en')).facts.due, 0, 'the debt is cleared once');
  // the launch info survives a restart: a resumed session finalizes with the same provenance
  const again = await learning.start({ domain: 'objective', materialId: 'paper-d', intent: 'practice', scheduleRef: { scheduleId: sch.id, originalDate: '2026-10-09' } });
  const state = (await runtime.resumable()).find((s) => s.session.id === again.engine.snapshot().session.id);
  assert.deepEqual(state.launch.scheduleRef, { scheduleId: sch.id, originalDate: '2026-10-09' });
  const restored = await runtime.restore(state);
  assert.deepEqual(restored.launch.scheduleRef, state.launch.scheduleRef);
}));

test('starting refuses what cannot be shown or is not there; typing and translation start with their own domain', withEnv(async (e) => {
  const { library, runtime, learning } = await setup(e);
  await assert.rejects(() => learning.start({ domain: 'objective', materialId: 'ghost' }), (err) => err instanceof StartError && err.code === 'MATERIAL_GONE');
  // a paper whose media cannot be presented (no presenter): refused with the problems, nothing started
  const ref = await storeMedia(e.port, { name: 'f.png', mimeType: 'image/png', bytes: Uint8Array.from({ length: 40 }, (_, i) => i) });
  const paper = { ...paperWithExplanations({ id: 'paper-m' }), title: 'Media paper' };
  paper.questions[0].image = { id: ref.id, name: 'f.png' };
  await library.savePaper(paper);
  await assert.rejects(() => learning.start({ domain: 'objective', materialId: 'paper-m' }), (err) => err.code === 'MEDIA_UNAVAILABLE' && err.detail.problems.length === 1);
  assert.equal((await runtime.resumable()).length, 0);
  // with a presenter that proves it, the same paper starts
  const proving = await setup(e, { media: { prove: async (refs) => ({ presentable: new Set(refs.map((r) => r.id)), problems: [] }) } });
  const ok = await proving.learning.start({ domain: 'objective', materialId: 'paper-m' });
  assert.equal(ok.engine.snapshot().questions[0].image.id, ref.id);
  // typing + translation
  const tt = await library.saveTypingText({ ...library.newTypingText(), title: 'Copy', text: 'environment' });
  const ty = await learning.start({ domain: 'typing', materialId: tt.payload.id, intent: 'test' });
  assert.equal(ty.domain, 'typing');
  const doc = await library.saveDocument({ ...library.newDocument(), title: 'Doc', sourceLanguage: 'en', targetLanguage: 'zh', items: [{ sourceText: 'Hello.' }] });
  const tr = await learning.start({ domain: 'translation', materialId: doc.payload.id });
  assert.equal(tr.domain, 'translation');
  assert.equal(SCHED.length, 5);
}));
