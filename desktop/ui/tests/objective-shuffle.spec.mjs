// Optional per-session Objective question-order shuffle (Human Evaluation Repair): default OFF keeps the authored order,
// ON realizes a shuffled order ONCE at start with the session RNG, the realized snapshot order survives save/resume and
// finalization, and nothing about grading, ids or the Evidence meaning changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectiveSession } from '../web/src/objective/session.js';
import { correctAnswerForView, paperWithExplanations, seeded } from './objective-fixtures.mjs';

const T0 = '2026-10-02T09:00:00.000Z';
const T1 = '2026-10-02T09:10:00.000Z';
const paper = paperWithExplanations();
const authored = paper.questions.map((q) => q.id);

function start(extra = {}) {
  return ObjectiveSession.start({ paper, sessionId: 's-1', evidenceId: 'r-1', startedAt: T0, feedbackTiming: 'instant', intent: 'practice', rng: seeded(11), ...extra });
}
const order = (s) => s.snapshot().questions.map((q) => q.id);

test('default OFF keeps the authored order, and the explicit false does the same', () => {
  assert.deepEqual(order(start()), authored);
  assert.deepEqual(order(start({ shuffleQuestions: false })), authored);
});

test('ON shuffles once with the session RNG: a permutation of the same ids, reproducible per RNG seed', () => {
  const orders = [1, 2, 3, 4, 5, 6].map((seed) => order(start({ shuffleQuestions: true, rng: seeded(seed) })));
  for (const o of orders) assert.deepEqual([...o].sort(), [...authored].sort());
  assert.ok(orders.some((o) => o.join() !== authored.join()), 'at least one seed must reorder');
  assert.deepEqual(order(start({ shuffleQuestions: true, rng: seeded(3) })), orders[2]);
});

test('the realized order is fixed: it survives snapshot / restore and is never re-shuffled', () => {
  const s = start({ shuffleQuestions: true, rng: seeded(5) });
  const realized = order(s);
  s.go(2);
  const back = ObjectiveSession.restore(JSON.parse(JSON.stringify(s.snapshot())));
  assert.deepEqual(order(back), realized);
  assert.equal(back.view().index, 2);
  assert.equal(back.view().question.id, realized[2]);
});

test('only an explicit true shuffles (truthy look-alikes do not)', () => {
  for (const v of ['yes', 1, {}, 'true']) assert.deepEqual(order(start({ shuffleQuestions: v })), authored);
});

test('a retry subset can be shuffled as another learner choice and stays a correct subset', () => {
  const ids = ['q-single', 'q-tf', 'q-blank'];
  const off = order(start({ questionIds: ids }));
  assert.deepEqual(off, authored.filter((id) => ids.includes(id)));
  for (const seed of [1, 2, 3, 4]) {
    const on = order(start({ questionIds: ids, shuffleQuestions: true, rng: seeded(seed) }));
    assert.deepEqual([...on].sort(), [...ids].sort());
  }
});

test('grading, explanations and the finalized response follow the realized order and do not change meaning', () => {
  const s = start({ shuffleQuestions: true, rng: seeded(5) });
  const realized = order(s);
  for (let i = 0; i < realized.length; i += 1) {
    s.go(i);
    s.answer(correctAnswerForView(s.view(), paper));
    s.submitItem();
  }
  const response = s.finalize({ now: T1 });
  assert.deepEqual(response.responses.map((r) => r.itemId), realized);
  assert.deepEqual(response.material.snapshot.items.map((q) => q.id), realized);
  assert.equal(response.summary.correctCount, authored.length);
  assert.ok(response.responses.every((r) => r.result.correct));
  assert.deepEqual(s.review().map((r) => r.id), realized);
  assert.ok(s.review().every((r) => typeof r.explanation === 'string'));
  // no shuffle flag is stored anywhere in the session facts
  assert.equal(JSON.stringify(response.extensions).includes('huffle'), false);
});

test('no leakage in Submit-at-End when shuffled: nothing about correctness before the paper is submitted', () => {
  const s = start({ shuffleQuestions: true, feedbackTiming: 'submit-at-end', rng: seeded(9) });
  for (let i = 0; i < authored.length; i += 1) {
    s.go(i);
    const v = s.view();
    assert.equal(v.feedback, null);
    assert.ok(v.items.every((it) => it.graded === undefined));
  }
});
