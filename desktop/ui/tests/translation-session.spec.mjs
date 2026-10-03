// The Translation practice session engine (Scope Freeze Rev.1 section 11; ADR 0004 section 7): production, learner
// metacognition (annotations on the learner's OWN answer, item marks) and retry semantics. Translation is never graded:
// no result, correctCount or percent, and the evidence is the V1 Learner Response contract unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { validateLearnerResponse } from '../../../src/core/interchange.js';
import { buildRetryMaterial as v1BuildRetry } from '../../../src/core/translation-retry.js';
import { ADAPTERS } from '../web/src/task-domains/adapters.js';
import { TranslationSession, TranslationSessionError, buildRetryMaterial } from '../web/src/translation/session.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(fs.readFileSync(path.join(here, '..', '..', '..', 'schemas', 'learner-response.schema.json'), 'utf8'));
const validateSchema = new Ajv2020({ strict: false }).compile(schema);
const T0 = '2026-10-02T09:00:00.000Z';
const T1 = '2026-10-02T09:10:00.000Z';
const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}';
const clone = (v) => JSON.parse(JSON.stringify(v));
const counter = () => { let n = 0; return () => `id-${++n}`; };

const doc = () => ({
  id: 'doc-1', title: 'Synthetic document', sourceLanguage: 'en', targetLanguage: 'zh', folderId: 'f-1',
  items: [
    { id: 'it-1', position: 0, sourceText: 'The environment matters.', referenceTranslation: '环境很重要。', notes: 'note one' },
    { id: 'it-2', position: 1, sourceText: 'Learning is a habit.' },
  ],
});
const start = (extra = {}) => TranslationSession.start({ document: doc(), sessionId: 's-1', evidenceId: 'r-1', startedAt: T0, intent: 'practice', ids: counter(), ...extra });

function assertNative(p) {
  assert.deepEqual(ADAPTERS.translation.validate(p), []);
  assert.equal(validateLearnerResponse(p).valid, true, validateLearnerResponse(p).errors.join(';'));
  assert.equal(validateSchema(p), true, JSON.stringify(validateSchema.errors));
  assert.ok(!('result' in p.responses[0]) && !('correctCount' in p.summary) && !('percent' in p.summary), 'Translation is never graded');
}

test('production: answers per item; finalization is a native V1-valid record with an answer for every item', () => {
  const s = start();
  assert.equal(s.view().phase, 'answering');
  assert.equal(s.view().item.sourceText, 'The environment matters.');
  s.setAnswer('环境很重要。');
  s.go(1);
  const p = s.finalize({ now: T1 });
  assertNative(p);
  assert.deepEqual(p.responses, [{ itemId: 'it-1', answer: '环境很重要。' }, { itemId: 'it-2', answer: '' }], 'an unattempted item records the empty answer, as V1');
  assert.deepEqual(p.summary, { itemCount: 2 });
  assert.equal(p.material.type, 'translation-document');
  assert.equal(p.material.id, 'doc-1');
  assert.deepEqual(p.material.snapshot.sourceLanguage, 'en');
  assert.deepEqual(p.extensions['quiz-studio.v2.session'], { schemaVersion: 1, intent: 'practice' });
  assert.equal(p.provenance.purpose, 'practice');
});

test('the document is snapshotted at start: later edits of the source never reach the session or the evidence', () => {
  const source = doc();
  const s = TranslationSession.start({ document: source, sessionId: 's', evidenceId: 'r', startedAt: T0, intent: 'practice', ids: counter() });
  source.items[0].sourceText = 'EDITED';
  source.items.pop();
  const p = s.finalize({ now: T1 });
  assert.equal(p.material.snapshot.items.length, 2);
  assert.equal(p.material.snapshot.items[0].sourceText, 'The environment matters.');
  assert.ok(!JSON.stringify(p).includes('EDITED'));
});

test('the reference translation is shown only after the learner reveals it, and revealing is session state, not evidence', () => {
  const s = start();
  assert.equal(JSON.stringify(s.view()).includes('环境很重要'), false, 'not before the reveal');
  s.reveal(true);
  assert.equal(s.view().reference, '环境很重要。');
  const p = s.finalize({ now: T1 });
  assertNative(p);
  assert.ok(!('revealed' in p) && !JSON.stringify(p.extensions).includes('reveal'));
});

test('metacognition: annotations anchor to the learner\'s own answer in UTF-16 units and never to a half grapheme', () => {
  const s = start();
  const answer = `a ${FAMILY} b café end`;
  s.setAnswer(answer);
  // select from the middle of the surrogate pair/ZWJ sequence: the engine snaps outward to grapheme boundaries
  const mid = answer.indexOf(FAMILY) + 1;
  const a = s.addAnnotation({ start: mid, end: mid + 2, kind: 'unknown' }, { now: T1 });
  assert.equal(a.start, answer.indexOf(FAMILY));
  assert.equal(a.end, answer.indexOf(FAMILY) + FAMILY.length);
  assert.equal(a.text, FAMILY);
  assert.equal(answer.slice(a.start, a.end), a.text);
  const e = answer.indexOf('cafe');
  s.addAnnotation({ start: e + 3, end: e + 4, kind: 'uncertain' }, { now: T1 }); // selects the lone 'e' of e + combining acute
  const view = s.view();
  assert.equal(view.annotations.length, 2);
  const p = s.finalize({ now: T1 });
  assertNative(p);
  assert.equal(p.learnerAnnotations.length, 2);
  assert.deepEqual(p.extensions['quiz-studio.v2.session'], { schemaVersion: 1, intent: 'practice', offsetEncoding: 'utf16-code-unit' });
  // the learner's text itself is untouched
  assert.equal(p.responses[0].answer, answer);
  for (const an of p.learnerAnnotations) assert.equal(p.responses[0].answer.slice(an.start, an.end), an.text);
});

test('annotation policy (V1): same span replaces the kind, partial overlap is refused, three distinct kinds, bad ranges refused', () => {
  const s = start();
  s.setAnswer('hello brave new world');
  const a = s.addAnnotation({ start: 0, end: 5, kind: 'unknown' }, { now: T1 });
  const b = s.addAnnotation({ start: 0, end: 5, kind: 'should_know' }, { now: T1 });
  assert.equal(s.view().annotations.length, 1);
  assert.equal(b.kind, 'should_know');
  assert.throws(() => s.addAnnotation({ start: 3, end: 8, kind: 'uncertain' }, { now: T1 }), TranslationSessionError);
  assert.throws(() => s.addAnnotation({ start: 5, end: 5, kind: 'uncertain' }, { now: T1 }), TranslationSessionError);
  assert.throws(() => s.addAnnotation({ start: 0, end: 99, kind: 'uncertain' }, { now: T1 }), TranslationSessionError);
  assert.throws(() => s.addAnnotation({ start: 6, end: 11, kind: 'confident' }, { now: T1 }), TranslationSessionError);
  s.addAnnotation({ start: 6, end: 11, kind: 'uncertain' }, { now: T1 });
  assert.deepEqual(s.view().annotations.map((x) => x.kind), ['should_know', 'uncertain']);
  s.changeAnnotationKind(a.id, 'unknown');
  assert.equal(s.view().annotations[0].kind, 'unknown');
  s.removeAnnotation(a.id);
  assert.equal(s.view().annotations.length, 1);
});

test('editing the answer never leaves a stale anchor: annotations whose span changed are dropped', () => {
  const s = start();
  s.setAnswer('hello world');
  s.addAnnotation({ start: 0, end: 5, kind: 'unknown' }, { now: T1 });
  s.addAnnotation({ start: 6, end: 11, kind: 'uncertain' }, { now: T1 });
  s.setAnswer('hello World');
  assert.deepEqual(s.view().annotations.map((x) => x.text), ['hello']);
  s.setAnswer('');
  assert.equal(s.view().annotations.length, 0);
});

test('item marks: a per-item metacognitive mark, optional, one per item, never a grade', () => {
  const s = start();
  s.setAnswer('x');
  s.setMark('uncertain', { now: T1 });
  s.go(1);
  s.setMark('should_know', { now: T1 });
  s.setMark(null);
  assert.equal(s.view().mark, null);
  s.go(0);
  assert.equal(s.view().mark, 'uncertain');
  assert.throws(() => s.setMark('great', { now: T1 }), TranslationSessionError);
  const p = s.finalize({ now: T1 });
  assertNative(p);
  assert.deepEqual(p.learnerItemMarks.map((m) => [m.itemId, m.kind]), [['it-1', 'uncertain']]);
  assert.ok(!('learnerAnnotations' in p), 'no annotations, no key');
  assert.deepEqual(p.extensions['quiz-studio.v2.session'], { schemaVersion: 1, intent: 'practice' }, 'no offsets, no encoding label');
});

test('recovery: snapshot/restore round-trips answers, annotations, marks, reveal state and position', () => {
  const s = start();
  s.setAnswer('hello world');
  s.addAnnotation({ start: 0, end: 5, kind: 'unknown' }, { now: T1 });
  s.setMark('uncertain', { now: T1 });
  s.reveal(true);
  s.go(1);
  const r = TranslationSession.restore(clone(s.snapshot()));
  assert.deepEqual(r.view(), s.view());
  r.go(0);
  s.go(0);
  assert.deepEqual(r.view(), s.view());
  assert.deepEqual(r.finalize({ now: T1 }), s.finalize({ now: T1 }));
  // a corrupt annotation degrades gracefully instead of blocking recovery (V1 behavior)
  const bad = clone(s.snapshot());
  bad.annotations['it-1'][0].text = 'WRONG';
  const healed = TranslationSession.restore(bad);
  healed.go(0);
  assert.equal(healed.view().answer, 'hello world');
  assert.equal(healed.view().annotations.length, 0);
  assert.throws(() => TranslationSession.restore({ domain: 'objective' }), TranslationSessionError);
});

test('finalization is idempotent and fixes the completion time at the first call', () => {
  const s = start();
  s.setAnswer('x');
  const p1 = s.finalize({ now: T1 });
  const p2 = s.finalize({ now: '2030-01-01T00:00:00.000Z' });
  assert.deepEqual(p1, p2);
  assert.throws(() => s.setAnswer('y'), TranslationSessionError, 'a finished session is closed');
});

test('retry: an ephemeral material is built from the finalized snapshot, with its own identities and by-value lineage', () => {
  const first = start();
  first.setAnswer('环境很重要。');
  const p1 = first.finalize({ now: T1 });
  const retry = buildRetryMaterial({ response: p1, itemIds: ['it-2'], createdAt: T1, ids: counter() });
  // same shape as V1's builder (modulo generated ids)
  const v1 = v1BuildRetry({ response: p1, itemIds: ['it-2'], createdAt: T1 });
  assert.deepEqual(Object.keys(retry).sort(), Object.keys(v1).sort());
  assert.deepEqual(retry.provenance, { ...v1.provenance, sourceMaterialId: 'doc-1', sourceResponseId: 'r-1' });
  assert.notEqual(retry.id, 'doc-1');
  assert.equal(retry.items.length, 1);
  assert.notEqual(retry.items[0].id, 'it-2', 'fresh item identities');
  assert.equal(retry.items[0].sourceText, 'Learning is a habit.');
  // the retry session finalizes natively and slots to the SOURCE document
  const rs = TranslationSession.start({ document: retry, sessionId: 's-2', evidenceId: 'r-2', startedAt: T1, intent: 'practice', ids: counter() });
  rs.setAnswer('学习是一种习惯。');
  const p2 = rs.finalize({ now: '2026-10-02T09:20:00.000Z' });
  assertNative(p2);
  assert.equal(p2.provenance.purpose, 'retry');
  assert.equal(p2.provenance.sourceResponseId, 'r-1');
  assert.equal(p2.provenance.sourceMaterialId, 'doc-1');
  assert.deepEqual(ADAPTERS.translation.slot(p2), ADAPTERS.translation.slot(p1));
  assert.throws(() => buildRetryMaterial({ response: p1, itemIds: ['ghost'], createdAt: T1, ids: counter() }), /item/i);
  assert.throws(() => buildRetryMaterial({ response: { id: 'x' }, createdAt: T1, ids: counter() }), /response|snapshot/i);
});

test('retry works from the snapshot alone: it survives the live document being deleted or rewritten', () => {
  const first = start();
  const p1 = first.finalize({ now: T1 });
  const stored = clone(p1);
  const retry = buildRetryMaterial({ response: stored, createdAt: T1, ids: counter() });
  assert.equal(retry.items.length, 2);
});

test('input discipline: a document without items, an unknown intent or missing ids are refused', () => {
  assert.throws(() => TranslationSession.start({ document: { ...doc(), items: [] }, sessionId: 's', evidenceId: 'r', startedAt: T0, intent: 'practice' }), TranslationSessionError);
  assert.throws(() => start({ intent: 'drill' }), TranslationSessionError);
  assert.throws(() => start({ sessionId: '' }), TranslationSessionError);
  assert.throws(() => start().go(5), RangeError);
});
