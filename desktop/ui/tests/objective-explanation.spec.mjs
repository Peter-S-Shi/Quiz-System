// Objective Answer Explanation (Scope Freeze Rev.1 section 10; section 4.7): an optional textual explanation on all five
// question types. Explanation is CONTENT, never Evidence: it never changes grading, the summary, the slot or what the
// Readers see. Instant feedback reveals correct answer + explanation only after that item is graded; Submit-at-End
// reveals nothing before the whole-paper submission; a finalized snapshot keeps the explanation of the attempt time.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { validateLearnerResponse } from '../../../src/core/interchange.js';
import { gradeQuestion as v1Grade } from '../../../src/core/grading.js';
import { normalizePaper } from '../../../src/core/migrations.js';
import { ADAPTERS } from '../web/src/task-domains/adapters.js';
import { QUESTION_TYPES, gradeQuestion, normalizeExplanation, normalizeQuestion, prepareQuizQuestion, validateQuestion } from '../web/src/objective/questions.js';
import { ObjectiveSession } from '../web/src/objective/session.js';
import { correctAnswerForView, paperWithExplanations, seeded, wrongAnswerForView } from './objective-fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const T0 = '2026-10-02T09:00:00.000Z';
const T1 = '2026-10-02T09:10:00.000Z';
const clone = (v) => JSON.parse(JSON.stringify(v));

function start(paper, extra = {}) {
  return ObjectiveSession.start({ paper, sessionId: 's-1', evidenceId: 'r-1', startedAt: T0, feedbackTiming: 'instant', intent: 'practice', rng: seeded(7), ...extra });
}
/** Walk every question: answer (correct or wrong per `pick`), in instant mode submit each. */
function play(s, source, pick = () => true) {
  for (let i = 0; i < source.questions.length; i += 1) {
    s.go(i);
    const v = s.view();
    const q = source.questions[i];
    s.answer(pick(q, i) ? correctAnswerForView(v, source) : wrongAnswerForView(v, source));
    if (s.view().canSubmitItem) s.submitItem();
  }
}

test('the five question types are supported; an optional explanation is kept verbatim on every one', () => {
  assert.deepEqual([...QUESTION_TYPES], ['single', 'multiple', 'blank', 'truefalse', 'matching']);
  const paper = paperWithExplanations();
  for (const q of paper.questions) {
    const n = normalizeQuestion(q);
    assert.equal(n.explanation, q.explanation, q.type);
    assert.deepEqual(validateQuestion(n), [], q.type);
  }
  const multiline = normalizeQuestion({ ...paper.questions[0], explanation: '  Line one\n第二行 — é \u{1F600}  ' });
  assert.equal(multiline.explanation, '  Line one\n第二行 — é \u{1F600}  ', 'authored text is not rewritten');
});

test('the explanation is optional: absent, empty, whitespace-only or non-string explanations are simply no explanation', () => {
  const base = paperWithExplanations({ explain: false }).questions[0];
  for (const bad of [undefined, null, '', '   \n\t', 5, true, {}, []]) {
    const n = normalizeQuestion({ ...base, explanation: bad });
    assert.equal('explanation' in n, false, JSON.stringify(bad));
  }
  assert.equal(normalizeExplanation('x'), 'x');
  // validation: a present non-string explanation is an authoring error, not silently dropped
  assert.ok(validateQuestion({ ...base, explanation: 5 }).some((e) => /explanation/.test(e)));
  assert.deepEqual(validateQuestion(base), []);
});

test('backward compatible: a V1 paper without explanations plays, and the public V1 contract accepts papers with them', () => {
  const plain = paperWithExplanations({ explain: false });
  const s = start(plain);
  play(s, plain);
  const payload = s.finalize({ now: T1 });
  assert.ok(payload.material.snapshot.items.every((i) => !('explanation' in i)), 'no explanation, none invented');
  assert.equal(validateLearnerResponse(payload).valid, true);
  // the V1 paper schema is open per question; V1's own paper normalization keeps the field (no V1 change needed)
  const withExp = paperWithExplanations();
  const schema = JSON.parse(fs.readFileSync(path.join(here, '..', '..', '..', 'schemas', 'quiz-paper.schema.json'), 'utf8'));
  const validatePaper = new Ajv2020({ strict: false }).compile(schema);
  assert.equal(validatePaper(withExp), true, JSON.stringify(validatePaper.errors));
  assert.equal(validatePaper(plain), true);
  const roundTrip = normalizePaper(withExp);
  assert.deepEqual(roundTrip.questions.map((q) => q.explanation), withExp.questions.map((q) => q.explanation), 'V1 export/import path keeps it');
});

test('grading is identical to V1 for every type, with or without an explanation (Explanation never changes grading)', () => {
  const rnd = seeded(42);
  const labels = { correctAnswer: 'Correct answer', acceptedAnswers: 'Accepted answers', correctPairs: 'Correct pairs', separator: ', ', pairSeparator: '; ', trueLabel: 'True', falseLabel: 'False' };
  const paper = paperWithExplanations();
  for (const q of paper.questions) {
    const prepared = prepareQuizQuestion(q, seeded(3));
    const stripped = clone(prepared); delete stripped.explanation;
    const answers = q.type === 'single' ? [prepared.options[0].id, prepared.options[1].id, null]
      : q.type === 'multiple' ? [[prepared.options[0].id], prepared.options.filter((o) => o.correct).map((o) => o.id), [], null]
        : q.type === 'blank' ? ['H2O', 'h2o', ' H2O ', 'x', '', null]
          : q.type === 'truefalse' ? [true, false, null]
            : [Object.fromEntries(prepared.pairs.map((p) => [p.id, p.rightId])), { p1: 'p2' }, {}, null];
    for (const a of answers) {
      void rnd();
      const mine = gradeQuestion(prepared, a, labels);
      assert.deepEqual(mine, v1Grade(stripped, a, labels), `${q.type} ${JSON.stringify(a)}`);
      assert.deepEqual(mine, gradeQuestion(stripped, a, labels), 'the explanation is not an input to grading');
      assert.ok(!('explanation' in mine), 'a result never carries the explanation');
    }
  }
});

test('Instant: nothing before grading; after grading the correct answer and the explanation, right or wrong', () => {
  const source = paperWithExplanations();
  const s = start(source);
  for (let i = 0; i < source.questions.length; i += 1) {
    s.go(i);
    const before = s.view();
    assert.equal(before.feedback, null, `no feedback before grading (${source.questions[i].type})`);
    assert.ok(!JSON.stringify(before).includes('EXPL-'), 'no explanation text before grading');
    s.answer(i % 2 === 0 ? correctAnswerForView(before, source) : wrongAnswerForView(before, source));
    assert.equal(s.view().feedback, null, 'answering is not grading');
    assert.ok(!JSON.stringify(s.view()).includes('EXPL-'));
    s.submitItem();
    const after = s.view();
    assert.equal(after.feedback.correct, i % 2 === 0, source.questions[i].type);
    assert.equal(after.feedback.explanation, source.questions[i].explanation, 'explanation shown whether right or wrong');
    assert.equal(typeof after.feedback.correctAnswer, 'string');
    assert.ok(after.feedback.correctAnswer.length > 0);
    assert.equal(after.locked, true, 'a graded item is no longer editable');
  }
  assert.throws(() => { s.go(0); s.answer('x'); }, /locked|graded/i);
});

test('Instant: a question without explanation grades normally and shows no explanation', () => {
  const source = paperWithExplanations();
  delete source.questions[0].explanation;
  const s = start(source);
  s.answer(correctAnswerForView(s.view(), source));
  s.submitItem();
  assert.equal(s.view().feedback.correct, true);
  assert.equal('explanation' in s.view().feedback, false);
});

test('Submit-at-End: no grading, correct answer or explanation leaks before the paper is submitted (structural + textual)', () => {
  const source = paperWithExplanations();
  const s = start(source, { feedbackTiming: 'submit-at-end' });
  const seen = [];
  const snapshotViews = () => seen.push(JSON.stringify(s.view()));
  for (let i = 0; i < source.questions.length; i += 1) {
    s.go(i);
    snapshotViews();
    s.answer(wrongAnswerForView(s.view(), source));
    snapshotViews();
    assert.equal(s.view().canSubmitItem, false, 'there is no per-item submit in Submit-at-End');
    assert.throws(() => s.submitItem(), /submit-at-end|Instant/i);
    assert.equal(s.view().feedback, null);
    // answers stay editable until the paper is submitted
    s.answer(correctAnswerForView(s.view(), source));
    snapshotViews();
  }
  const dump = seen.join('\n');
  assert.ok(!dump.includes('EXPL-'), 'no explanation text');
  assert.ok(!/"correct"|"correctAnswer"|"correctLabel"|"results?"|"explanation"|"answers":\[|"sourceId"|"rightId"/.test(dump), 'no grading / answer-key fields');
  // the answer key for blank and true/false and the matching pairing are not derivable from the view
  assert.ok(!dump.includes('hydrogen oxide'), 'the other accepted blank answers are not in the view');
  const match = source.questions.find((q) => q.type === 'matching');
  s.go(source.questions.length - 1);
  const v = s.view().question;
  assert.deepEqual(v.pairs.map((p) => Object.keys(p).sort()), match.pairs.map(() => ['id', 'left']));
  assert.ok(v.rightOptions.every((r) => !match.pairs.some((p) => p.id === r.id)), 'right-option tokens do not reveal the pairing');
  assert.equal(s.view().items.every((i) => i.graded !== true && !('correct' in i)), true, 'the navigator reveals no per-item verdict');
  // submitting makes the review available, with the explanations
  const payload = s.finalize({ now: T1 });
  const review = s.review();
  assert.equal(review.length, source.questions.length);
  assert.deepEqual(review.map((r) => r.explanation), source.questions.map((q) => q.explanation));
  assert.ok(review.every((r) => typeof r.correctAnswer === 'string' && r.correct === true));
  assert.equal(validateLearnerResponse(payload).valid, true);
});

test('Submit-at-End: review() and the final results are refused before submission', () => {
  const source = paperWithExplanations();
  const s = start(source, { feedbackTiming: 'submit-at-end' });
  assert.throws(() => s.review(), /not finished|submitted/i);
  assert.equal(s.view().phase, 'answering');
});

test('the finalized snapshot keeps the explanation of the attempt time; later edits of the source never rewrite it', () => {
  const source = paperWithExplanations();
  const s = start(source);
  play(s, source);
  // the author edits the SOURCE question mid-session and again after finishing
  source.questions[0].explanation = 'EDITED mid-session';
  source.questions[1].options[0].correct = false;
  const payload = s.finalize({ now: T1 });
  source.questions[2].explanation = 'EDITED after finishing';
  const original = paperWithExplanations();
  const bySource = new Map(original.questions.map((q) => [q.id, q.explanation]));
  assert.deepEqual(payload.material.snapshot.items.map((i) => [i.id, i.explanation]), payload.material.snapshot.items.map((i) => [i.id, bySource.get(i.id)]));
  assert.ok(!JSON.stringify(payload).includes('EDITED'));
  // finalizing twice yields the same bytes, and the payload is not an alias of live state
  assert.deepEqual(s.finalize({ now: T1 }), payload);
  payload.material.snapshot.items[0].explanation = 'tampered';
  assert.notEqual(s.finalize({ now: T1 }).material.snapshot.items[0].explanation, 'tampered');
});

test('Explanation is Content, not Evidence: it changes no result, summary, slot, adapter verdict or Reader input', () => {
  const withExp = paperWithExplanations();
  const without = paperWithExplanations({ explain: false });
  const a = start(withExp); play(a, withExp, (q, i) => i !== 1);
  const b = start(without); play(b, without, (q, i) => i !== 1);
  const pa = a.finalize({ now: T1 });
  const pb = b.finalize({ now: T1 });
  assert.deepEqual(pa.responses, pb.responses);
  assert.deepEqual(pa.summary, pb.summary);
  assert.deepEqual(ADAPTERS.objective.slot(pa), ADAPTERS.objective.slot(pb));
  assert.deepEqual(ADAPTERS.objective.validate(pa), []);
  assert.deepEqual(ADAPTERS.objective.validate(pb), []);
  // the only difference between the two records is the snapshot content
  const strip = (p) => { const c = clone(p); c.material.snapshot.items.forEach((i) => { delete i.explanation; }); return c; };
  assert.deepEqual(strip(pa), pb);
});

test('a finalized Objective record is native-valid: adapter, unchanged V1 validator and the public schema', () => {
  const source = paperWithExplanations();
  const schema = JSON.parse(fs.readFileSync(path.join(here, '..', '..', '..', 'schemas', 'learner-response.schema.json'), 'utf8'));
  const validateSchema = new Ajv2020({ strict: false }).compile(schema);
  for (const feedbackTiming of ['instant', 'submit-at-end']) {
    for (const intent of ['practice', 'test']) {
      const s = start(source, { feedbackTiming, intent });
      play(s, source, (q, i) => i % 2 === 0);
      const p = s.finalize({ now: T1 });
      assert.deepEqual(ADAPTERS.objective.validate(p), [], `${feedbackTiming}/${intent}`);
      assert.equal(validateLearnerResponse(p).valid, true);
      assert.equal(validateSchema(p), true, JSON.stringify(validateSchema.errors));
      assert.deepEqual(p.extensions['quiz-studio.v2.session'], { schemaVersion: 1, intent, feedbackTiming });
      assert.equal(p.id, 'r-1');
      assert.equal(p.summary.itemCount, 5);
      assert.equal(p.summary.correctCount, 3);
    }
  }
});

test('Submit-at-End: unanswered items are allowed at submission and are graded incorrect (V1 behavior), with a null answer', () => {
  const source = paperWithExplanations();
  const s = start(source, { feedbackTiming: 'submit-at-end' });
  s.answer(correctAnswerForView(s.view(), source));
  assert.equal(s.view().progress.answered, 1);
  assert.equal(s.view().canFinish, true);
  const p = s.finalize({ now: T1 });
  assert.equal(p.summary.correctCount, 1);
  assert.equal(p.responses.filter((r) => r.answer === null).length, 4);
  assert.deepEqual(ADAPTERS.objective.validate(p), []);
});

test('Instant: finishing requires every item to be graded', () => {
  const source = paperWithExplanations();
  const s = start(source);
  assert.equal(s.view().canFinish, false);
  assert.throws(() => s.finalize({ now: T1 }), /graded|every/i);
});

test('recovery: a snapshot restores the session exactly, and Submit-at-End stays opaque after a restore', () => {
  const source = paperWithExplanations();
  const s = start(source, { feedbackTiming: 'submit-at-end' });
  s.answer(wrongAnswerForView(s.view(), source));
  s.go(2);
  const snap = clone(s.snapshot());
  const r = ObjectiveSession.restore(snap);
  assert.deepEqual(r.view(), s.view());
  assert.ok(!JSON.stringify(r.view()).includes('EXPL-'));
  r.go(0); s.go(0);
  assert.deepEqual(r.view(), s.view());
  assert.deepEqual(r.finalize({ now: T1 }), s.finalize({ now: T1 }));
  assert.throws(() => ObjectiveSession.restore({ ...snap, domain: 'typing' }), /domain|snapshot/i);
});

test('Retry lineage: a retry over selected questions records its sources and stays native-valid', () => {
  const source = paperWithExplanations();
  const first = start(source); play(first, source, (q, i) => i !== 0 && i !== 3);
  const p1 = first.finalize({ now: T1 });
  const wrongIds = p1.responses.filter((r) => !r.result.correct).map((r) => r.itemId);
  assert.deepEqual(wrongIds, ['q-single', 'q-tf']);
  const retry = ObjectiveSession.start({ paper: source, questionIds: wrongIds, sessionId: 's-2', evidenceId: 'r-2', startedAt: T1, feedbackTiming: 'instant', intent: 'practice', provenance: { purpose: 'retry', sourceResponseId: p1.id, sourceMaterialId: source.id }, rng: seeded(9) });
  assert.equal(retry.view().progress.total, 2);
  play(retry, { questions: source.questions.filter((q) => wrongIds.includes(q.id)) });
  const p2 = retry.finalize({ now: '2026-10-02T09:20:00.000Z' });
  assert.deepEqual(ADAPTERS.objective.validate(p2), []);
  assert.equal(p2.provenance.purpose, 'retry');
  assert.deepEqual(ADAPTERS.objective.slot(p2), ADAPTERS.objective.slot(p1), 'a retry fulfills the same slot as its paper');
  assert.throws(() => ObjectiveSession.start({ paper: source, questionIds: ['nope'], sessionId: 's', evidenceId: 'e', startedAt: T0, feedbackTiming: 'instant', intent: 'practice' }), /question/i);
});

test('input discipline: unknown feedback timing / intent / malformed paper are refused before any state exists', () => {
  const source = paperWithExplanations();
  assert.throws(() => start(source, { feedbackTiming: 'whenever' }), /feedback/i);
  assert.throws(() => start(source, { intent: 'drill' }), /intent/i);
  assert.throws(() => start({ ...source, questions: [] }), /question/i);
  const notReady = clone(source); notReady.questions[0].options.find((o) => o.correct).text = '';
  assert.throws(() => start(notReady), /ready|correct/i);
});
