// Evidence History over the REAL store: what was recorded, shown as recorded - no mastery state, twins never listed,
// the explanation of the attempt moment, retry lineage by recorded provenance only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHistory, entryDetail, filterHistory, lineageOf } from '../../web/src/product/history.js';
import { createPracticeRuntime } from '../../web/src/practice/runtime.js';
import { loadSnapshot } from '../../web/src/orchestration/readers.js';
import { putOp } from '../../web/src/projection.js';
import { correctAnswerForView, paperWithExplanations, wrongAnswerForView } from '../objective-fixtures.mjs';
import { withEnv } from './env.mjs';

const typed = (engine, value) => engine.input({ isTrusted: true, type: 'input', inputType: 'insertText', value });

async function seedAndPlay(e) {
  const paper = paperWithExplanations({ id: 'paper-h' });
  await e.port.commit({ ops: [
    putOp(e.spec('paper'), paper.id, paper),
    putOp(e.spec('translation_folder'), 'f-1', { schemaVersion: 1, id: 'f-1', name: 'Folder', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }),
    putOp(e.spec('translation_document'), 'doc-h', { schemaVersion: 1, id: 'doc-h', title: 'Phrases', folderId: 'f-1', sourceLanguage: 'en', targetLanguage: 'zh', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
      items: [{ id: 'it-1', position: 0, sourceText: 'The environment matters.', referenceTranslation: '环境很重要。' }, { id: 'it-2', position: 1, sourceText: 'Learning is a habit.' }] }),
    putOp(e.spec('typing_text'), 'tt-h', { schemaVersion: 1, id: 'tt-h', title: 'Copy', text: 'environment', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }),
  ] });
  let n = 0;
  const rt = await createPracticeRuntime(e.port, { store: e.store, now: () => `2026-10-02T10:${String(n++).padStart(2, '0')}:00.000Z` });
  const done = {};
  // Objective: one wrong answer
  const o = rt.startObjective({ paper, intent: 'practice', feedbackTiming: 'instant' });
  for (let i = 0; i < 5; i += 1) {
    o.engine.go(i);
    o.engine.answer(i === 1 ? wrongAnswerForView(o.engine.view(), paper) : correctAnswerForView(o.engine.view(), paper));
    o.engine.submitItem();
  }
  done.objective = o.engine.finalize({ now: '2026-10-02T10:30:00.000Z' });
  await rt.services.commit({ payload: done.objective });
  // Translation
  const t = rt.startTranslation({ document: (await e.port.read('translation_document', { id: 'doc-h' }))[0].payload });
  t.engine.setAnswer('The environment is important.');
  t.engine.addAnnotation({ kind: 'uncertain', start: 4, end: 15 }, { now: '2026-10-02T11:10:00.000Z' });
  done.translation = t.engine.finalize({ now: '2026-10-02T11:30:00.000Z' });
  await rt.services.commit({ payload: done.translation });
  // Typing
  const y = rt.startTyping({ text: { id: 'tt-h', title: 'Copy', text: 'environment' }, intent: 'practice' });
  typed(y.engine, 'enviroment');
  done.typing = y.engine.finalize({ completedAt: '2026-10-02T12:30:00.000Z' }).payload;
  await rt.services.commit({ payload: done.typing });
  return { rt, paper, done };
}

test('every recorded attempt is listed newest first with recorded facts only; filters work', withEnv(async (e) => {
  const { done } = await seedAndPlay(e);
  const snap = await loadSnapshot(e.port);
  const { entries } = buildHistory(snap);
  assert.deepEqual(entries.map((x) => x.domain), ['typing', 'translation', 'objective'], 'newest first');
  const obj = entries.find((x) => x.domain === 'objective');
  assert.deepEqual([obj.facts.itemCount, obj.facts.correctCount, obj.facts.percent, obj.intent, obj.purpose, obj.title], [5, 4, 80, 'practice', 'practice', 'Synthetic paper']);
  const tr = entries.find((x) => x.domain === 'translation');
  assert.deepEqual([tr.facts.itemCount, tr.facts.answered, tr.facts.marks.uncertain], [2, 1, 1]);
  assert.equal('percent' in tr.facts || 'correctCount' in tr.facts, false, 'Translation carries no grade');
  const ty = entries.find((x) => x.domain === 'typing');
  assert.deepEqual([ty.facts.referenceGraphemes, ty.facts.committedGraphemes, ty.facts.errorCount], [11, 10, 1]);
  assert.deepEqual(filterHistory(entries, { domain: 'translation' }).map((x) => x.id), [done.translation.id]);
  assert.deepEqual(filterHistory(entries, { query: 'copy' }).map((x) => x.domain), ['typing']);
  assert.equal(filterHistory(entries, { domain: 'all', query: 'zzz' }).length, 0);
  assert.ok(!JSON.stringify(entries).match(/mastery|score|streak/i), 'no mastery vocabulary in the derived facts');
}));

test('details show what was recorded: the attempt-moment explanation, formatted answers, marks, typing differences', withEnv(async (e) => {
  const { paper } = await seedAndPlay(e);
  const snap = await loadSnapshot(e.port);
  const { entries, reviews } = buildHistory(snap);
  const od = entryDetail(entries.find((x) => x.domain === 'objective'), snap, reviews);
  assert.equal(od.items.length, 5);
  const wrong = od.items.find((i) => i.id === 'q-multi');
  assert.equal(wrong.correct, false);
  assert.ok(wrong.answer.length > 0 && wrong.correctAnswer, 'the learner answer and the recorded correct answer are shown');
  assert.deepEqual(od.items.map((i) => i.explanation), paper.questions.map((q) => q.explanation), 'explanations come from the stored snapshot');
  const td = entryDetail(entries.find((x) => x.domain === 'translation'), snap, reviews);
  assert.equal(td.items[0].answer, 'The environment is important.');
  assert.deepEqual(td.items[0].annotations.map((a) => [a.kind, a.text]), [['uncertain', 'environment']]);
  assert.equal(td.items[1].answer, '');
  const yd = entryDetail(entries.find((x) => x.domain === 'typing'), snap, reviews);
  assert.deepEqual(yd.errors.map((x) => [x.kind, x.reference, x.committed]), [['omission', 'n', '']]);
  assert.equal(yd.referenceText, 'environment');
}));

test('legacy history: only legacy-only entries are attempts, a twin never is; unknown stays unknown', withEnv(async (e) => {
  await e.port.commit({ ops: [
    putOp(e.spec('legacy_history_entry'), 'h-1', { schemaVersion: 1, role: 'legacy-only', entry: { id: 'h-1', paperId: 'paper-a', paperTitle: 'Old paper', completedAt: '2025-12-01T10:00:00.000Z', results: [{ questionId: 'q1', correct: true }, { questionId: 'q2', correct: false }] } }),
    putOp(e.spec('legacy_history_entry'), 'h-2', { schemaVersion: 1, role: 'twin', twinResponseId: 'resp-none', entry: { id: 'h-2', paperId: 'paper-a', results: [{ questionId: 'q1', correct: true }] } }),
    putOp(e.spec('legacy_history_entry'), 'h-3', { schemaVersion: 1, role: 'legacy-only', entry: { id: 'h-3', paperId: 'paper-b', results: [] } }),
  ] });
  const snap = await loadSnapshot(e.port);
  const { entries } = buildHistory(snap);
  assert.deepEqual(entries.map((x) => x.id), ['h-1', 'h-3'], 'the twin is not listed; the undated entry sorts last');
  assert.deepEqual([entries[0].legacy, entries[0].facts.correctCount, entries[0].facts.percent, entries[0].intent, entries[0].purpose], [true, 1, 50, null, null]);
  assert.equal(entries[1].facts.percent, null, 'no results recorded: no percent is invented');
  assert.equal(entries[1].completedAt, null);
}));

test('retry lineage comes only from recorded provenance', withEnv(async (e) => {
  const { rt, paper, done } = await seedAndPlay(e);
  const retry = rt.startObjective({ paper, intent: 'practice', feedbackTiming: 'instant', questionIds: ['q-multi'], provenance: { purpose: 'retry', sourceResponseId: done.objective.id, sourceMaterialId: paper.id } });
  retry.engine.answer(correctAnswerForView(retry.engine.view(), paper));
  retry.engine.submitItem();
  const payload = retry.engine.finalize({ now: '2026-10-02T13:30:00.000Z' });
  await rt.services.commit({ payload });
  const snap = await loadSnapshot(e.port);
  const { entries } = buildHistory(snap);
  const original = entries.find((x) => x.id === done.objective.id);
  const again = entries.find((x) => x.id === payload.id);
  assert.deepEqual(lineageOf(original, snap).retries, [payload.id]);
  assert.deepEqual([lineageOf(again, snap).source, lineageOf(again, snap).purpose], [done.objective.id, 'retry']);
  assert.equal(lineageOf(entries.find((x) => x.domain === 'typing'), snap).retries.length, 0);
}));
