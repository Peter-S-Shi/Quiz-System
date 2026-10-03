// Review / Correction over the REAL store: independent Teacher Reviews, the Teacher Review contract on save and on
// import, request exports accepted by the unchanged V1 validators, remediation provenance against local records, and the
// Recommender reading the new review (learner sovereignty: a review never edits the response).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibrary } from '../../web/src/product/library.js';
import { createReviews, ReviewError } from '../../web/src/product/reviews.js';
import { createPracticeRuntime } from '../../web/src/practice/runtime.js';
import { loadSnapshot } from '../../web/src/orchestration/readers.js';
import { recommend } from '../../web/src/orchestration/recommend.js';
import { addCorrection } from '../../web/src/exchange/corrections.js';
import { validateReviewRequestPackage as v1ValidateReviewRequest, validateRemediationRequestPackage as v1ValidateRemediation } from '../../../../src/core/review-transport.js';
import { putOp } from '../../web/src/projection.js';
import { withEnv } from './env.mjs';

const ANSWER = 'The enviroment is very importent for us.';
let n = 0;
const now = () => `2026-10-02T14:${String(n++ % 60).padStart(2, '0')}:00.000Z`;

async function setup(e) {
  const library = await createLibrary({ port: e.port, now });
  const reviews = await createReviews({ port: e.port, now, library });
  await e.port.commit({ ops: [
    putOp(e.spec('translation_folder'), 'f-1', { schemaVersion: 1, id: 'f-1', name: 'Folder', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }),
    putOp(e.spec('translation_document'), 'doc-r', { schemaVersion: 1, id: 'doc-r', title: 'Phrases', folderId: 'f-1', sourceLanguage: 'en', targetLanguage: 'zh', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
      items: [{ id: 'it-1', position: 0, sourceText: '环境很重要。' }, { id: 'it-2', position: 1, sourceText: '学习是一种习惯。' }] }),
  ] });
  const rt = await createPracticeRuntime(e.port, { store: e.store, now });
  const t = rt.startTranslation({ document: (await e.port.read('translation_document', { id: 'doc-r' }))[0].payload });
  t.engine.setAnswer(ANSWER);
  const payload = t.engine.finalize({ now: '2026-10-02T11:30:00.000Z' });
  await rt.services.commit({ payload });
  const response = (await e.port.read('learner_response', { id: payload.id }))[0].payload;
  return { library, reviews, response, rt };
}

function draftWith(reviews, response, patch = {}) {
  const draft = reviews.newDraft(response, { type: 'human', displayLabel: 'Ms. Example' });
  const first = response.responses[0].itemId;
  let corrections = addCorrection([], { id: 'k1', operation: 'replace', start: 4, end: 14, anchoredText: 'enviroment', text: 'environment', createdAt: '2026-10-02T14:00:00.000Z' }, ANSWER);
  corrections = addCorrection(corrections, { id: 'k2', operation: 'style', styleType: 'color', color: 'red', start: 23, end: 32, anchoredText: 'importent', createdAt: '2026-10-02T14:00:01.000Z' }, ANSWER);
  draft.items[first] = { judgment: 'partial', comment: 'Mind the spelling.', tags: ['spelling'], suggestedRevision: 'The environment is very important for us.', corrections };
  draft.summary = 'Good effort.';
  return Object.assign(draft, patch);
}

test('a review is saved as its own record; the response is untouched; several reviews coexist', withEnv(async (e) => {
  const { reviews, response } = await setup(e);
  const before = JSON.stringify((await e.port.read('learner_response', { id: response.id }))[0].payload);
  const first = await reviews.save(draftWith(reviews, response));
  const second = await reviews.save({ ...draftWith(reviews, response), reviewer: { type: 'external-ai', toolName: 'Some tool' }, summary: 'Second opinion.' });
  assert.notEqual(first.id, second.id);
  const stored = await reviews.reviewsOf(response.id);
  assert.deepEqual(stored.map((r) => r.id).sort(), [first.id, second.id].sort());
  assert.equal(stored[0].payload.itemReviews[0].corrections.length, 2);
  assert.deepEqual(stored[0].payload.itemReviews.map((i) => i.itemId), [response.responses[0].itemId], 'items with no content are left out');
  assert.equal(JSON.stringify((await e.port.read('learner_response', { id: response.id }))[0].payload), before, 'the original response is never modified');
  assert.deepEqual((await reviews.list()).map((r) => [r.id, r.reviewCount]), [[response.id, 2]]);
}));

test('an invalid draft never reaches the store: nothing to save, stale anchors, overlapping edits, unknown response', withEnv(async (e) => {
  const { reviews, response } = await setup(e);
  const base = () => draftWith(reviews, response);
  const reject = (draft, re) => assert.rejects(() => reviews.save(draft), (err) => err instanceof ReviewError && re.test(err.message));
  await reject(reviews.newDraft(response), /nothing to save/i);
  const stale = base();
  stale.items[response.responses[0].itemId].corrections[0].anchoredText = 'XXXXXXXXXX';
  await reject(stale, /anchoredText/i);
  const overlap = base();
  overlap.items[response.responses[0].itemId].corrections.push({ id: 'k3', operation: 'delete', start: 6, end: 9, anchoredText: ANSWER.slice(6, 9), createdAt: '2026-10-02T14:00:02.000Z' });
  await reject(overlap, /conflict/i);
  await reject({ ...base(), responseId: 'resp-missing' }, /no longer exists/i);
  assert.equal(await e.port.count('teacher_review'), 0);
}));

test('Teacher Review import: new, identical (no-op), explicit update, refused for unknown response', withEnv(async (e) => {
  const { reviews, response } = await setup(e);
  const saved = await reviews.save(draftWith(reviews, response));
  const exported = await reviews.exportReview(saved.id);
  // identical re-import is a no-op
  const same = await reviews.previewReviewImport(exported.text);
  assert.equal(same.kind, 'idempotent');
  assert.equal((await reviews.commitReviewImport(same)).stored, false);
  // an edited resubmission with the same id is an explicit update
  const edited = JSON.parse(exported.text);
  edited.summary = 'Revised summary.';
  const upd = await reviews.previewReviewImport(JSON.stringify(edited));
  assert.equal(upd.kind, 'update');
  assert.equal(upd.summary.correctionCount, 2);
  await reviews.commitReviewImport(upd);
  assert.equal((await reviews.reviewsOf(response.id))[0].payload.summary, 'Revised summary.');
  assert.equal(await e.port.count('teacher_review'), 1);
  // a brand-new review from outside
  const fresh = { ...edited, id: 'rev-external-1', reviewer: { type: 'external-ai', toolName: 'Tool' } };
  const np = await reviews.previewReviewImport(JSON.stringify(fresh));
  assert.equal(np.kind, 'new');
  await reviews.commitReviewImport(np);
  assert.equal(await e.port.count('teacher_review'), 2);
  // refusals: a response that is not here, a corrupted anchor, not JSON, moving a review to another response
  const nowhere = await reviews.previewReviewImport(JSON.stringify({ ...fresh, id: 'rev-x', responseId: 'resp-elsewhere' }));
  assert.deepEqual([nowhere.ok, nowhere.kind], [false, 'no-response']);
  const corrupt = JSON.parse(JSON.stringify(fresh));
  corrupt.id = 'rev-y';
  corrupt.itemReviews[0].corrections[0].anchoredText = 'nope';
  assert.equal((await reviews.previewReviewImport(JSON.stringify(corrupt))).ok, false);
  assert.equal((await reviews.previewReviewImport('{not json')).ok, false);
  assert.equal(await e.port.count('teacher_review'), 2, 'nothing was stored by a refused preview');
  await assert.rejects(() => reviews.commitReviewImport({ ok: false }), (err) => err.code === 'NOT_ALLOWED');
}));

test('request exports are accepted by the unchanged V1 validators', withEnv(async (e) => {
  const { reviews, response } = await setup(e);
  const saved = await reviews.save(draftWith(reviews, response));
  const rq = JSON.parse((await reviews.exportReviewRequest(response.id)).text);
  assert.deepEqual(v1ValidateReviewRequest(rq).valid, true, v1ValidateReviewRequest(rq).errors.join('; '));
  const rem = JSON.parse((await reviews.exportRemediationRequest(response.id, saved.id)).text);
  assert.deepEqual(v1ValidateRemediation(rem).valid, true, v1ValidateRemediation(rem).errors.join('; '));
  await assert.rejects(() => reviews.exportRemediationRequest(response.id, 'rev-none'), (err) => err.code === 'NOT_FOUND');
}));

test('remediation material is accepted only if its provenance traces to this library; ids and folders are made safe', withEnv(async (e) => {
  const { reviews, response, library } = await setup(e);
  const saved = await reviews.save(draftWith(reviews, response));
  const doc = (prov, extra = {}) => JSON.stringify({
    schemaVersion: 1, documentType: 'quiz-studio.translation-document', id: 'doc-rem', title: 'Targeted practice', folderId: 'folder-from-another-app', sourceLanguage: 'zh', targetLanguage: 'en',
    createdAt: '2026-10-03T09:00:00.000Z', updatedAt: '2026-10-03T09:00:00.000Z', items: [{ id: 'r1', position: 0, sourceText: '环境很重要。' }],
    provenance: prov, ...extra,
  });
  const good = { purpose: 'remediation', sourceResponseId: response.id, sourceReviewId: saved.id, sourceMaterialId: 'doc-r', createdAt: '2026-10-03T09:00:00.000Z', author: { type: 'external-ai', displayLabel: 'Tool' } };
  assert.equal((await reviews.previewRemediationImport(doc({ ...good, sourceReviewId: 'rev-nowhere' }))).ok, false);
  assert.equal((await reviews.previewRemediationImport(doc({ ...good, sourceResponseId: 'resp-nowhere' }))).ok, false);
  assert.equal((await reviews.previewRemediationImport(doc({ ...good, purpose: 'practice' }))).ok, false);
  const p = await reviews.previewRemediationImport(doc(good));
  assert.deepEqual([p.ok, p.collision, p.summary.itemCount], [true, false, 1]);
  const stored = await reviews.commitRemediationImport(p);
  const row = (await e.port.read('translation_document', { id: 'doc-rem' }))[0].payload;
  assert.equal(row.provenance.purpose, 'remediation');
  assert.equal(row.provenance.sourceReviewId, saved.id);
  assert.ok((await library.list()).folders.some((f) => f.id === row.folderId), 'the foreign folder id was replaced by a real folder');
  assert.ok(stored.payload.id === 'doc-rem');
  // importing it again collides on the id: it is stored as a copy, never over the first
  const again = await reviews.previewRemediationImport(doc(good));
  assert.equal(again.collision, true);
  await reviews.commitRemediationImport(again);
  assert.equal(await e.port.count('translation_document'), 3); // doc-r, doc-rem, and the copy
}));

test('a saved review that flags an item feeds the Recommender (read only; nothing is written back)', withEnv(async (e) => {
  const { reviews, response } = await setup(e);
  const draft = draftWith(reviews, response);
  draft.items[response.responses[0].itemId].judgment = 'incorrect';
  await reviews.save(draft);
  const snap = await loadSnapshot(e.port);
  const rec = recommend(snap, '2026-10-03');
  const forDoc = rec.find((r) => r.target.material.id === 'doc-r');
  assert.ok(forDoc, 'the reviewed document is recommended');
  assert.ok(forDoc.reasons.some((r) => r.code === 'TEACHER_ACTIONABLE_REVIEW'));
  assert.equal(await e.port.count('schedule'), 0, 'recommending writes nothing');
}));
