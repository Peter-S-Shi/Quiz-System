// The typing_attempt record contract (ADR 0004 section 8.2, 13.5, 13.6): closed schema, immutable-by-construction facts,
// alignment validated ONLY under the pinned comparison named by the record, historical replay, unknown versions read-only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTypingAttempt, validateTypingAttempt } from '../web/src/task-domains/typing/attempt.js';
import { nativeTyping } from './task-fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const clone = (v) => JSON.parse(JSON.stringify(v));
const ok = (a, opts) => assert.deepEqual(validateTypingAttempt(a, opts).errors, []);
const bad = (a, why, opts) => assert.ok(!validateTypingAttempt(a, opts).valid, why);

test('a built attempt records verbatim texts, the explicit comparison basis, counts and error facts', () => {
  const a = nativeTyping('t1', { text: 'environment', typed: 'enviroment' });
  assert.equal(a.material.snapshot.text, 'environment');
  assert.equal(a.committed.text, 'enviroment');
  assert.deepEqual(a.comparison, { version: 'typing-compare/1', normalization: 'NFC', segmentation: 'extended-grapheme-cluster', offsetEncoding: 'utf16-code-unit' });
  assert.deepEqual(a.counts, { referenceGraphemes: 11, committedGraphemes: 10 });
  assert.deepEqual(a.errors, [{ kind: 'omission', reference: { start: 6, end: 7 }, committed: { start: 6, end: 6 } }]);
  assert.equal(a.status, 'finalized');
  ok(a);
  // no derived truth is stored (T-9)
  const flat = JSON.stringify(a);
  for (const banned of ['accuracy', 'wpm', 'cpm', 'speed', 'score', 'level', 'mastery']) assert.ok(!flat.toLowerCase().includes(`"${banned}`), banned);
});

test('verbatim fidelity: an NFD input is stored NFD and a canonically equal copy has no errors', () => {
  const a = nativeTyping('t2', { text: 'café', typed: 'café' });
  assert.equal(a.committed.text, 'café');
  assert.deepEqual(a.errors, []);
  assert.deepEqual(a.counts, { referenceGraphemes: 4, committedGraphemes: 4 });
  ok(a);
});

test('the closed schema rejects every malformed or extended record', () => {
  const good = nativeTyping('t3', { text: 'hello world', typed: 'hello wrld' });
  ok(good);
  const mutate = (fn) => { const a = clone(good); fn(a); return a; };
  const cases = {
    'unknown top-level field': mutate((a) => { a.accuracy = 0.9; }),
    'wrong schemaVersion': mutate((a) => { a.schemaVersion = 2; }),
    'missing id': mutate((a) => { delete a.id; }),
    'status not finalized': mutate((a) => { a.status = 'draft'; }),
    'material type': mutate((a) => { a.material.type = 'quiz-paper'; }),
    'material extra field': mutate((a) => { a.material.difficulty = 3; }),
    'empty reference text': mutate((a) => { a.material.snapshot.text = ''; }),
    'snapshot extra field': mutate((a) => { a.material.snapshot.level = 2; }),
    'session missing completedAt': mutate((a) => { delete a.session.completedAt; }),
    'intent enum': mutate((a) => { a.intent = 'drill'; }),
    'policy enum': mutate((a) => { a.policy.corrections = 'sometimes'; }),
    'policy extra field': mutate((a) => { a.policy.strict = true; }),
    'test intent with live feedback': mutate((a) => { a.intent = 'test'; a.policy.feedbackTiming = 'live'; }),
    'committed not a string': mutate((a) => { a.committed.text = 7; }),
    'committed extra field': mutate((a) => { a.committed.normalized = 'x'; }),
    'comparison missing offsetEncoding': mutate((a) => { delete a.comparison.offsetEncoding; }),
    'comparison offsetEncoding not explicit utf16': mutate((a) => { a.comparison.offsetEncoding = 'codepoint'; }),
    'counts negative': mutate((a) => { a.counts.committedGraphemes = -1; }),
    'error kind': mutate((a) => { a.errors[0].kind = 'typo'; }),
    'error span out of bounds': mutate((a) => { a.errors[0].reference.end = 999; }),
    'error span reversed': mutate((a) => { a.errors[0].reference = { start: 9, end: 8 }; }),
    'error extra field': mutate((a) => { a.errors[0].severity = 'high'; }),
    'omission with committed text': mutate((a) => { a.errors[0].committed = { start: 0, end: 1 }; }),
    'correctedErrorCount not an integer': mutate((a) => { a.correctedErrorCount = 1.5; }),
    'provenance purpose': mutate((a) => { a.provenance.purpose = 'remediation'; }),
    'practice provenance with a source': mutate((a) => { a.provenance.sourceAttemptId = 'x'; }),
    'retry without sourceAttemptId': mutate((a) => { a.provenance = { purpose: 'retry', sourceMaterialId: 'm', createdAt: 'x' }; }),
    'provenance extra field': mutate((a) => { a.provenance.author = 'me'; }),
  };
  for (const [why, a] of Object.entries(cases)) bad(a, why);
});

test('spans must sit on cluster boundaries of the pinned segmentation (a surrogate pair or a cluster is never split)', () => {
  const a = nativeTyping('t4', { text: 'a\u{1F600}b', typed: 'a\u{1F601}b' });
  ok(a);
  const split = clone(a);
  split.errors[0].reference = { start: 1, end: 2 }; // inside the surrogate pair
  bad(split, 'splits a surrogate pair');
  const family = nativeTyping('t5', { text: '\u{1F468}‍\u{1F469}', typed: 'x' });
  const half = clone(family);
  half.errors[0].reference = { start: 0, end: 2 }; // half of a ZWJ cluster
  bad(half, 'splits a ZWJ cluster');
});

test('alignment facts are re-proved under the pinned comparison: tampered counts or errors are rejected', () => {
  const a = nativeTyping('t6', { text: 'environment', typed: 'enviroment' });
  const counts = clone(a); counts.counts.referenceGraphemes = 12;
  bad(counts, 'wrong count');
  const dropped = clone(a); dropped.errors = [];
  bad(dropped, 'an error that really exists was removed');
  const invented = nativeTyping('t7', { text: 'abc', typed: 'abc' });
  invented.errors = [{ kind: 'substitution', reference: { start: 0, end: 1 }, committed: { start: 0, end: 1 } }];
  bad(invented, 'an error that does not exist was added');
});

test('an unknown comparison.version is carried read-only: structurally validated, never alignment-validated, never creatable', () => {
  const a = nativeTyping('t8', { text: 'environment', typed: 'enviroment' });
  const future = clone(a);
  future.comparison.version = 'typing-compare/9';
  future.counts = { referenceGraphemes: 99, committedGraphemes: 98 }; // would fail alignment, but the version is not ours to judge
  const read = validateTypingAttempt(future);
  assert.equal(read.valid, true, read.errors.join('; '));
  assert.equal(read.alignmentChecked, false);
  assert.equal(read.readOnly, true);
  const create = validateTypingAttempt(future, { creating: true });
  assert.equal(create.valid, false, 'a new attempt must use an implemented comparison version');
  // structural defects are still caught on a future version
  future.errors[0].reference.end = 999;
  bad(future, 'structure is checked for any version');
  const known = validateTypingAttempt(a);
  assert.equal(known.alignmentChecked, true);
  assert.equal(known.readOnly, false);
});

test('historical replay: stored attempts (committed literals) re-validate and re-derive byte-identically', () => {
  const stored = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'typing-attempts-v1.json'), 'utf8'));
  assert.ok(stored.length >= 6);
  for (const a of stored) {
    const r = validateTypingAttempt(a);
    assert.equal(r.valid, true, `${a.id}: ${r.errors.join('; ')}`);
    assert.equal(r.alignmentChecked, true);
    const rebuilt = buildTypingAttempt({ id: a.id, material: { id: a.material.id, title: a.material.title, text: a.material.snapshot.text }, session: a.session, intent: a.intent, policy: a.policy, committedText: a.committed.text, provenance: a.provenance });
    assert.equal(JSON.stringify(rebuilt.errors), JSON.stringify(a.errors), `${a.id} errors replay identically`);
    assert.equal(JSON.stringify(rebuilt.counts), JSON.stringify(a.counts), `${a.id} counts replay identically`);
  }
});

test('the builder refuses what the validator would refuse (fail closed, nothing half-built)', () => {
  assert.throws(() => buildTypingAttempt({ id: 'x', material: { id: 'm', title: 't', text: '' }, session: { id: 's', startedAt: 'a', completedAt: 'b' }, intent: 'practice', policy: { feedbackTiming: 'live', corrections: 'allowed' }, committedText: 'x', provenance: { purpose: 'practice', createdAt: 'c' } }), /TYPING_ATTEMPT_INVALID/);
  assert.throws(() => nativeTyping('x', { intent: 'test', feedbackTiming: 'live' }), /TYPING_ATTEMPT_INVALID/);
});
