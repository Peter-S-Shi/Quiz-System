// V1 preservation (ADR 0004 section 13.12, T-6): the records the UNCHANGED V1 builders produce, plus the V2 session facts,
// are accepted by the Objective/Translation adapters; and the V1 interchange machinery (portable export, review request,
// external Teacher Review import with anchored corrections, retry material, remediation lineage) keeps working on native
// records. Only synthetic data. V1 production code is imported, never modified.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuizLearnerResponse, createTranslationLearnerResponse, toPortableLearnerResponse, validateLearnerResponse } from '../../../src/core/interchange.js';
import { createReviewRequestPackage, parseExternalTeacherReview, validateReviewRequestPackage } from '../../../src/core/review-transport.js';
import { buildRetryMaterial } from '../../../src/core/translation-retry.js';
import { ADAPTERS, SESSION_EXT_KEY, withSessionFacts } from '../web/src/task-domains/adapters.js';

const T0 = '2026-10-02T09:00:00.000Z';
const T1 = '2026-10-02T09:05:00.000Z';

function v1Objective(id = 'lr-o1') {
  const questions = [
    { id: 'q1', type: 'single-choice', prompt: 'Pick one', options: ['a', 'b'], answer: 'a', explanation: 'because' },
    { id: 'q2', type: 'true-false', prompt: 'True?', answer: true },
    { id: 'q3', type: 'fill-blank', prompt: 'Fill __', answer: 'x' },
  ];
  return createQuizLearnerResponse({
    id,
    session: {
      paperId: 'paper-a', paperTitle: 'Paper A', questions, completedAt: T1, startedAt: T0, id: 'sess-o1',
      answers: { q1: 'b', q2: true, q3: ['x', 'y'] },
      results: [{ questionId: 'q1', correct: false }, { questionId: 'q2', correct: true }, { questionId: 'q3', correct: false }],
      correctCount: 1, percent: 33.33,
    },
  });
}

const ANSWER = 'The environment \u{1F30D} matters a lot.';
function v1Translation(id = 'lr-t1') {
  return createTranslationLearnerResponse({
    id,
    session: {
      id: 'sess-t1', documentId: 'doc-1', documentTitle: 'Doc', startedAt: T0, completedAt: T1, sourceLanguage: 'zh', targetLanguage: 'en',
      items: [{ id: 'ti-1', sourceText: '环境很重要' }, { id: 'ti-2', sourceText: '今天' }],
      answers: { 'ti-1': ANSWER, 'ti-2': 'today' },
      annotations: { 'ti-1': [{ id: 'an-1', kind: 'uncertain', start: 4, end: 15, text: ANSWER.slice(4, 15), createdAt: T1 }] },
      itemMarks: { 'ti-2': 'should_know' },
    },
  });
}

const native = (response, facts) => withSessionFacts(response, facts);

test('records built by the unchanged V1 builders, plus the V2 session facts, are native Objective / Translation records', () => {
  const o = native(v1Objective(), { intent: 'practice', feedbackTiming: 'instant' });
  assert.equal(validateLearnerResponse(o).valid, true);
  assert.deepEqual(ADAPTERS.objective.validate(o), []);
  const t = native(v1Translation(), { intent: 'test', offsetEncoding: 'utf16-code-unit' });
  assert.equal(validateLearnerResponse(t).valid, true);
  assert.deepEqual(ADAPTERS.translation.validate(t), []);
  // without the facts a V1 record is not a native V2 record (it is migrated-style: facts unknown)
  assert.notDeepEqual(ADAPTERS.objective.validate(v1Objective()), []);
  assert.ok(o.extensions[SESSION_EXT_KEY]);
  // adding the facts never touches the V1 content
  const { extensions, ...rest } = o;
  assert.deepEqual(rest, v1Objective());
  assert.deepEqual(Object.keys(extensions), [SESSION_EXT_KEY]);
});

test('the V1 portable export and OTI review request accept native records carrying the V2 extension', () => {
  for (const r of [native(v1Objective(), { intent: 'practice', feedbackTiming: 'submit-at-end' }), native(v1Translation(), { intent: 'practice', offsetEncoding: 'utf16-code-unit' })]) {
    const portable = toPortableLearnerResponse(r);
    assert.equal(validateLearnerResponse(portable).valid, true);
    const pkg = createReviewRequestPackage({ id: 'req-1', learnerResponse: r, exportedAt: T1 });
    const v = validateReviewRequestPackage(pkg);
    assert.equal(v.valid, true, v.errors.join('; '));
  }
});

test('Teacher Review import with UTF-16-anchored corrections works against a native Translation record (Teacher Review semantics unchanged)', () => {
  const t = native(v1Translation(), { intent: 'practice', offsetEncoding: 'utf16-code-unit' });
  const review = {
    schemaVersion: 1, documentType: 'quiz-studio.teacher-review', id: 'rv-1', responseId: t.id, createdAt: T1, reviewer: { type: 'human' },
    summary: 'ok',
    itemReviews: [
      { itemId: 'ti-1', judgment: 'partial', comment: 'tweak', tags: ['word-choice'], corrections: [{ id: 'c-1', operation: 'replace', start: 4, end: 15, anchoredText: ANSWER.slice(4, 15), text: 'environment', createdAt: T1 }] },
      { itemId: 'ti-2', judgment: 'correct', comment: '', tags: [] },
    ],
    remediationRecommendations: [{ focus: 'environment vocabulary', rationale: 'practice' }],
  };
  const parsed = parseExternalTeacherReview(review, { learnerResponse: t });
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.review.id, 'rv-1');
  // an anchor that does not match the answer is still refused: the V1 cross-field check is intact
  const bad = JSON.parse(JSON.stringify(review));
  bad.itemReviews[0].corrections[0].anchoredText = 'wrong';
  assert.notDeepEqual(parseExternalTeacherReview(bad, { learnerResponse: t }).errors, []);
});

test('V1 retry material from a native response carries the lineage the adapters slot by (ephemeral material, source document slot)', () => {
  const source = native(v1Translation('lr-src'), { intent: 'practice', offsetEncoding: 'utf16-code-unit' });
  const retry = buildRetryMaterial({ response: source, itemIds: ['ti-1'], createdAt: T1 });
  assert.equal(retry.provenance.purpose, 'retry');
  assert.equal(retry.provenance.sourceMaterialId, 'doc-1');
  assert.equal(retry.provenance.sourceResponseId, 'lr-src');
  assert.notEqual(retry.id, 'doc-1', 'V1 builds fresh, ephemeral material ids');
  // the finalized retry session as V1 would record it
  const finalized = createTranslationLearnerResponse({
    id: 'lr-retry',
    session: { id: 'sess-r', documentId: retry.id, documentTitle: retry.title, startedAt: T0, completedAt: T1, items: retry.items, answers: { [retry.items[0].id]: 'The environment matters.' }, materialProvenance: retry.provenance },
  });
  const nativeRetry = native(finalized, { intent: 'practice' });
  assert.deepEqual(ADAPTERS.translation.validate(nativeRetry), []);
  assert.deepEqual(ADAPTERS.translation.slot(nativeRetry).material, { type: 'translation-document', id: 'doc-1' }, 'it satisfies the SOURCE document\'s schedule, not an ephemeral one');
});

test('remediation lineage stays distinguishable purely by provenance.purpose', () => {
  const rem = createTranslationLearnerResponse({
    id: 'lr-rem',
    session: { id: 'sess-m', documentId: 'doc-rem', documentTitle: 'Rem', startedAt: T0, completedAt: T1, items: [{ id: 'ri-1', sourceText: 's' }], answers: { 'ri-1': 'a' }, materialProvenance: { purpose: 'remediation', sourceResponseId: 'lr-t1', sourceReviewId: 'rv-1', sourceMaterialId: 'doc-1', createdAt: T0 } },
  });
  const n = native(rem, { intent: 'practice' });
  assert.deepEqual(ADAPTERS.translation.validate(n), []);
  assert.equal(ADAPTERS.translation.slot(n).material.id, 'doc-rem');
  assert.equal(n.provenance.purpose, 'remediation');
});

test('a V1 Objective record with an unanswered item (result null) is still a valid native record', () => {
  const o = createQuizLearnerResponse({
    id: 'lr-null',
    session: { paperId: 'paper-a', paperTitle: 'P', questions: [{ id: 'q1', type: 'single-choice', prompt: 'x', options: ['a'], answer: 'a' }], completedAt: T1, startedAt: T0, id: 'sess-null', answers: {}, results: [], correctCount: 0, percent: 0 },
  });
  const n = native(o, { intent: 'practice', feedbackTiming: 'submit-at-end' });
  assert.equal(validateLearnerResponse(n).valid, true);
  assert.deepEqual(ADAPTERS.objective.validate(n), []);
});
