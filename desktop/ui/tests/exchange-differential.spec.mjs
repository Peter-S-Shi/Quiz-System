// Differential proof: the exchange modules shipped in the desktop UI (corrections, Teacher Review contract, translation
// document import, review / remediation request packages) behave EXACTLY like the unchanged V1 modules they port.
// Same inputs, same outputs, same errors. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as v1c from '../../../src/core/corrections.js';
import * as v1i from '../../../src/core/interchange.js';
import * as v1t from '../../../src/core/review-transport.js';
import * as v1m from '../../../src/core/translation-import.js';
import * as v1d from '../../../src/core/translation-domain.js';
import * as c from '../web/src/exchange/corrections.js';
import * as r from '../web/src/exchange/teacher-review.js';
import * as q from '../web/src/exchange/review-request.js';
import * as m from '../web/src/exchange/translation-import.js';
import { nativeTranslation } from './task-fixtures.mjs';

const clone = (v) => JSON.parse(JSON.stringify(v));
const same = (a, b, msg) => assert.deepEqual(clone(a), clone(b), msg);
const outcome = (fn) => { try { return { ok: fn() }; } catch (e) { return { throws: e.message }; } };

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

// --------------------------------------------------------------------------------------------------- corrections
const ANSWER = 'The enviroment is very importent for us.';
const T = '2026-10-02T10:00:00.000Z';

test('corrections: constants and every function match V1 on a fuzzed set of drafts', () => {
  same(c.CORRECTION_OPERATIONS, v1c.CORRECTION_OPERATIONS);
  same(c.STYLE_TYPES, v1c.STYLE_TYPES);
  same(c.CORRECTION_COLORS, v1c.CORRECTION_COLORS);
  const rand = rng(11);
  const ops = ['style', 'insert', 'replace', 'delete', 'comment', 'bogus'];
  const styles = [...v1c.STYLE_TYPES, 'neon'];
  const colors = [...v1c.CORRECTION_COLORS, 'pink', undefined];
  let accepted = 0;
  let v1List = [];
  let v2List = [];
  for (let i = 0; i < 400; i += 1) {
    const operation = ops[Math.floor(rand() * ops.length)];
    const start = Math.floor(rand() * (ANSWER.length + 3));
    const end = rand() < 0.2 ? start : start + Math.floor(rand() * 8);
    const draft = {
      id: `c-${i}`, operation, start, end,
      anchoredText: operation === 'insert' ? '' : rand() < 0.15 ? 'wrong' : ANSWER.slice(start, end),
      ...(rand() < 0.7 ? { text: rand() < 0.1 ? '' : 'fix' } : {}),
      ...(operation === 'style' ? { styleType: styles[Math.floor(rand() * styles.length)] } : {}),
      ...(rand() < 0.5 ? { color: colors[Math.floor(rand() * colors.length)] } : {}),
      createdAt: T,
    };
    same(c.validateCorrectionShape(draft), v1c.validateCorrectionShape(draft));
    same(c.validateCorrection(draft, ANSWER), v1c.validateCorrection(draft, ANSWER));
    same(c.createCorrection(draft), v1c.createCorrection(draft));
    for (const other of v1List.slice(-3)) assert.equal(c.correctionsConflict(draft, other), v1c.correctionsConflict(draft, other));
    const a1 = outcome(() => v1c.addCorrection(v1List, draft, ANSWER));
    const a2 = outcome(() => c.addCorrection(v2List, draft, ANSWER));
    same(a2, a1, `addCorrection #${i}`);
    if (a1.ok) { v1List = a1.ok; v2List = a2.ok; accepted += 1; }
  }
  assert.ok(accepted > 30, `the fuzz must accept enough corrections to exercise the projection (${accepted})`);
  same(c.renderCorrectionProjection(ANSWER, v2List), v1c.renderCorrectionProjection(ANSWER, v1List));
  same(c.removeCorrection(v2List, 'c-1'), v1c.removeCorrection(v1List, 'c-1'));
  assert.equal(c.validateColor('red'), v1c.validateColor('red'));
  assert.equal(c.validateColor('x'), v1c.validateColor('x'));
});

// ---------------------------------------------------------------------------------------------- Teacher Review
const response = nativeTranslation('resp-1', 'doc-1', { items: ['ti-1', 'ti-2'], answer: ANSWER });
const goodReview = () => ({
  schemaVersion: 1, documentType: 'quiz-studio.teacher-review', id: 'rev-1', responseId: 'resp-1', createdAt: T,
  reviewer: { type: 'human', displayLabel: 'Ms. Example' }, summary: 'Good effort.',
  itemReviews: [
    { itemId: 'ti-1', judgment: 'partial', comment: 'Spelling.', tags: ['spelling'], suggestedRevision: 'The environment is very important for us.', corrections: [
      { id: 'k1', operation: 'replace', start: 4, end: 14, anchoredText: 'enviroment', text: 'environment', createdAt: T },
      { id: 'k2', operation: 'style', start: 23, end: 32, anchoredText: 'importent', styleType: 'color', color: 'red', createdAt: T },
    ] },
    { itemId: 'ti-2', judgment: 'correct' },
  ],
  remediationRecommendations: [{ kind: 'retry', itemIds: ['ti-1'] }],
});

function mutants() {
  const out = [['good', goodReview()]];
  const mut = (name, fn) => { const x = goodReview(); fn(x); out.push([name, x]); };
  mut('extra field', (x) => { x.surprise = 1; });
  mut('bad doc type', (x) => { x.documentType = 'other'; });
  mut('bad version', (x) => { x.schemaVersion = 0; });
  mut('no id', (x) => { x.id = ' '; });
  mut('wrong response', (x) => { x.responseId = 'resp-9'; });
  mut('bad reviewer', (x) => { x.reviewer = { type: 'wizard' }; });
  mut('reviewer extra', (x) => { x.reviewer.rank = 1; });
  mut('items not array', (x) => { x.itemReviews = {}; });
  mut('duplicate item', (x) => { x.itemReviews.push({ itemId: 'ti-1' }); });
  mut('unknown item', (x) => { x.itemReviews[1].itemId = 'nope'; });
  mut('bad judgment', (x) => { x.itemReviews[0].judgment = 'great'; });
  mut('item extra field', (x) => { x.itemReviews[0].grade = 5; });
  mut('comment type', (x) => { x.itemReviews[0].comment = 4; });
  mut('tags type', (x) => { x.itemReviews[0].tags = [1]; });
  mut('anchored mismatch', (x) => { x.itemReviews[0].corrections[0].anchoredText = 'xxxxxxxxxx'; });
  mut('range outside', (x) => { x.itemReviews[0].corrections[0].end = 999; });
  mut('overlapping edits', (x) => { x.itemReviews[0].corrections.push({ id: 'k3', operation: 'delete', start: 6, end: 9, anchoredText: ANSWER.slice(6, 9), createdAt: T }); });
  mut('duplicate correction id', (x) => { x.itemReviews[0].corrections[1].id = 'k1'; });
  mut('correction extra', (x) => { x.itemReviews[0].corrections[0].note = 'x'; });
  mut('bad style', (x) => { x.itemReviews[0].corrections[1].styleType = 'neon'; });
  mut('bad color', (x) => { x.itemReviews[0].corrections[1].color = 'pink'; });
  mut('remediation not array', (x) => { x.remediationRecommendations = {}; });
  mut('remediation item type', (x) => { x.remediationRecommendations = [1]; });
  mut('missing remediation', (x) => { delete x.remediationRecommendations; });
  mut('summary type', (x) => { x.summary = 3; });
  mut('extensions type', (x) => { x.extensions = []; });
  mut('not an object', () => {});
  out.push(['array', []]);
  out.push(['null', null]);
  return out;
}

test('Teacher Review: validate / canonical / normalize / parse / classify match V1 on every mutant', () => {
  same(r.DOCUMENT_TYPES, v1i.DOCUMENT_TYPES);
  for (const [name, review] of mutants()) {
    for (const withResponse of [true, false]) {
      const o1 = withResponse ? { learnerResponse: response } : {};
      same(r.validateTeacherReview(review, o1), v1i.validateTeacherReview(review, o1), `validate ${name} ${withResponse}`);
      same(r.validateCanonicalTeacherReview(review, o1), v1i.validateCanonicalTeacherReview(review, o1), `canonical ${name} ${withResponse}`);
      same(r.parseExternalTeacherReview(review, o1), v1t.parseExternalTeacherReview(review, o1), `parse ${name} ${withResponse}`);
    }
    if (review && typeof review === 'object' && !Array.isArray(review)) same(r.normalizeTeacherReview(review), v1i.normalizeTeacherReview(review), `normalize ${name}`);
    same(r.parseExternalTeacherReviewText(JSON.stringify(review), { learnerResponse: response }), v1t.parseExternalTeacherReviewText(JSON.stringify(review), { learnerResponse: response }), `text ${name}`);
  }
  same(r.parseExternalTeacherReviewText('{nope'), v1t.parseExternalTeacherReviewText('{nope'));
  assert.deepEqual(r.validateTeacherReview(goodReview(), { learnerResponse: response }), { valid: true, errors: [] });
  assert.ok(mutants().filter(([n, x]) => n !== 'good' && !r.validateTeacherReview(x, { learnerResponse: response }).valid).length >= 15, 'the mutants must actually be rejected');
  same(r.normalizeActor({ type: 'agent', toolName: ' t ', displayLabel: '' }), v1i.normalizeActor({ type: 'agent', toolName: ' t ', displayLabel: '' }));
  same(r.SUPPORTED_TEACHER_REVIEW_IMPORT_VERSIONS, v1t.SUPPORTED_TEACHER_REVIEW_IMPORT_VERSIONS);
});

test('Teacher Review import classification matches V1', () => {
  const base = r.normalizeTeacherReview(goodReview());
  const edited = { ...base, summary: 'Changed.' };
  const reassigned = { ...base, responseId: 'resp-2' };
  for (const [candidate, existing] of [[base, []], [base, [base]], [edited, [base]], [reassigned, [base]], [base, undefined]]) {
    same(r.classifyTeacherReviewImport(candidate, existing), v1t.classifyTeacherReviewImport(candidate, existing));
  }
  assert.equal(r.classifyTeacherReviewImport(base, [base]).kind, 'idempotent');
  assert.equal(r.classifyTeacherReviewImport(edited, [base]).kind, 'update');
  assert.equal(r.classifyTeacherReviewImport(reassigned, [base]).kind, 'reassigned-reject');
});

// -------------------------------------------------------------------------------------- translation documents
const goodDoc = () => ({
  schemaVersion: 1, documentType: 'quiz-studio.translation-document', id: 'doc-x', title: 'Doc', folderId: 'f-1', sourceLanguage: 'en', targetLanguage: 'zh',
  createdAt: T, updatedAt: T, items: [{ id: 'a', position: 0, sourceText: 'One.', referenceTranslation: '一。' }, { id: 'b', position: 1, sourceText: 'Two.', notes: 'n' }],
});

test('Translation document normalize / validate / parse match V1 on mutants', () => {
  const docs = [['good', goodDoc()]];
  const mut = (name, fn) => { const x = goodDoc(); fn(x); docs.push([name, x]); };
  mut('no title', (x) => { x.title = ' '; });
  mut('bad type', (x) => { x.documentType = 'nope'; });
  mut('dup item', (x) => { x.items[1].id = 'a'; });
  mut('bad position', (x) => { x.items[1].position = 5; });
  mut('empty source', (x) => { x.items[0].sourceText = ' '; });
  mut('reference type', (x) => { x.items[0].referenceTranslation = 3; });
  mut('notes type', (x) => { x.items[1].notes = 3; });
  mut('no folder', (x) => { x.folderId = ''; });
  mut('items not array', (x) => { x.items = 'x'; });
  mut('with provenance', (x) => { x.provenance = { purpose: 'remediation', sourceResponseId: 'r', sourceReviewId: 'v', createdAt: T, author: { type: 'external-ai', toolName: 't' } }; });
  mut('shuffled positions', (x) => { x.items = [x.items[1], x.items[0]]; });
  for (const [name, d] of docs) {
    same(m.normalizeTranslationDocument(d), v1d.normalizeTranslationDocument(d), `normalize ${name}`);
    same(m.validateTranslationDocument(m.normalizeTranslationDocument(d)), v1d.validateTranslationDocument(v1d.normalizeTranslationDocument(d)), `validate ${name}`);
    same(m.parseTranslationDocumentJsonText(JSON.stringify(d)), v1m.parseTranslationDocumentJsonText(JSON.stringify(d)), `parse ${name}`);
  }
  same(m.parseTranslationDocumentJsonText('{bad'), v1m.parseTranslationDocumentJsonText('{bad'));
  for (const text of ['', 'one\n\n two \r\nthree', '\n\n']) same(m.parseSourceOnlyText(text), v1m.parseSourceOnlyText(text));
  for (const text of ['a\tb\nc\td', 'a\tb\nbroken\n\tx', '', 'a\tb\tc']) same(m.parseBilingualText(text), v1m.parseBilingualText(text));
  const copy = m.remapDocumentForCopy(goodDoc());
  assert.notEqual(copy.id, 'doc-x');
  assert.equal(copy.items.length, 2);
  assert.ok(copy.items.every((i, k) => i.id !== goodDoc().items[k].id));
});

// ---------------------------------------------------------------------------------- review / remediation requests
test('review-request and remediation-request packages match V1 (a V2-produced response is accepted by both stacks)', () => {
  const opts = { id: 'req-1', learnerResponse: response, exportedAt: T };
  const a = q.createReviewRequestPackage(opts);
  const b = v1t.createReviewRequestPackage(opts);
  same(a.documentType, b.documentType);
  same(a.requestedOutput, b.requestedOutput);
  same(a.learnerResponse, b.learnerResponse);
  assert.deepEqual(q.validateReviewRequestPackage(a), { valid: true, errors: [] });
  same(q.validateReviewRequestPackage(a), v1t.validateReviewRequestPackage(a));
  for (const bad of [{ ...a, documentType: 'x' }, { ...a, schemaVersion: 9 }, { ...a, id: '' }, { ...a, task: '' }, { ...a, requestedOutput: { documentType: 'x' } }, null, []]) {
    same(q.validateReviewRequestPackage(bad), v1t.validateReviewRequestPackage(bad));
  }
  // the embedded Learner Response is validated by the V2 adapter, whose MESSAGES differ from V1's; the verdict must not
  const brokenEmbedded = [{ ...a, learnerResponse: { ...a.learnerResponse, id: '' } }, { ...a, learnerResponse: { ...a.learnerResponse, status: 'draft' } }, { ...a, learnerResponse: { ...a.learnerResponse, responses: 'x' } }];
  for (const bad of brokenEmbedded) {
    assert.equal(q.validateReviewRequestPackage(bad).valid, false);
    assert.equal(v1t.validateReviewRequestPackage(bad).valid, false);
  }
  const review = goodReview();
  const ro = { id: 'rem-1', learnerResponse: response, teacherReview: review, exportedAt: T };
  const ra = q.createRemediationRequestPackage(ro);
  const rb = v1t.createRemediationRequestPackage(ro);
  same(ra, rb);
  same(q.validateRemediationRequestPackage(ra), v1t.validateRemediationRequestPackage(ra));
  same(q.validateRemediationRequestPackage({ ...ra, teacherReview: { ...review, responseId: 'zzz' } }), v1t.validateRemediationRequestPackage({ ...rb, teacherReview: { ...review, responseId: 'zzz' } }));
  assert.throws(() => q.createRemediationRequestPackage({ ...ro, teacherReview: { ...review, id: '' } }), TypeError);
  assert.throws(() => v1t.createRemediationRequestPackage({ ...ro, teacherReview: { ...review, id: '' } }), TypeError);
});

test('remediation provenance / import checks match V1', () => {
  const ctx = { learnerResponses: [response], teacherReviews: [goodReview()] };
  const doc = (prov) => ({ ...goodDoc(), provenance: prov });
  const good = { purpose: 'remediation', sourceResponseId: 'resp-1', sourceReviewId: 'rev-1', sourceMaterialId: 'doc-1', createdAt: T, author: { type: 'external-ai', displayLabel: 'Tool' } };
  const cases = [good, { ...good, sourceResponseId: 'resp-x' }, { ...good, sourceReviewId: 'rev-x' }, { ...good, sourceMaterialId: 'other' }, { ...good, createdAt: '' }, { ...good, author: undefined },
    { ...good, author: { type: 'wizard' } }, { ...good, junk: 1 }, { purpose: 'practice' }, { ...good, sourceResponseId: '' }, { ...good, extensions: [] }];
  for (const p of cases) {
    same(q.validateRemediationProvenance(doc(p), ctx), v1t.validateRemediationProvenance(doc(p), ctx));
    same(q.validateRemediationImportProvenance(doc(p), ctx), v1t.validateRemediationImportProvenance(doc(p), ctx));
    same(q.parseRemediationTranslationDocumentText(JSON.stringify(doc(p))), v1t.parseRemediationTranslationDocumentText(JSON.stringify(doc(p))));
  }
  same(q.validateRemediationImportProvenance(goodDoc(), ctx), v1t.validateRemediationImportProvenance(goodDoc(), ctx));
  same(q.parseRemediationTranslationDocumentText('nope'), v1t.parseRemediationTranslationDocumentText('nope'));
  assert.equal(q.validateRemediationImportProvenance(doc(good), ctx).valid, true);
});
