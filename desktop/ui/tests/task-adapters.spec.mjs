// The closed Domain Evidence Adapter boundary and V1 preservation (ADR 0004 section 5, 6, 7, 12, 13.1/13.2/13.12; T-1, T-2, T-6).
// Objective and Translation keep the V1 Learner Response contract: every native record the adapters accept is accepted by
// the UNCHANGED V1 validator, everything V1 rejects the adapters reject too, and the closed key sets track the public JSON
// Schema. The V2 session facts live only in the schema's open `extensions` field under one namespaced key.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLearnerResponse } from '../../../src/core/interchange.js';
import { ADAPTERS, SESSION_EVIDENCE_WRITABLE, SESSION_EXT_KEY, V1_CLOSED_KEYS, adapterFor, withSessionFacts } from '../web/src/task-domains/adapters.js';
import { nativeObjective, nativeTranslation, nativeTyping } from './task-fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const clone = (v) => JSON.parse(JSON.stringify(v));
const accepts = (domain, p) => ADAPTERS[domain].validate(p).length === 0;

const OBJ = () => nativeObjective('r-o', 'paper-a', { wrong: ['q1'] });
const TRN = () => nativeTranslation('r-t', 'doc-1', { annotations: [['ti-1', 'unknown', 4, 15]], marks: [] });

test('native Objective and Translation records are accepted by the adapters AND the unchanged V1 validator', () => {
  for (const [domain, p] of [['objective', OBJ()], ['translation', TRN()], ['translation', nativeTranslation('r-t2', 'doc-2', { items: ['a', 'b'], marks: [['a', 'uncertain']] })], ['objective', nativeObjective('r-o2', 'paper-b', { wrong: [], items: ['q1'], intent: 'test', feedbackTiming: 'submit-at-end' })]]) {
    assert.deepEqual(ADAPTERS[domain].validate(p), [], domain);
    assert.equal(validateLearnerResponse(p).valid, true, `V1 accepts ${p.id}: ${validateLearnerResponse(p).errors}`);
  }
});

test('everything the V1 validator rejects, the adapters reject (V1 strictness is preserved, never relaxed)', () => {
  const mutations = {
    'no finalizedAt': (p) => { delete p.finalizedAt; },
    'wrong documentType': (p) => { p.documentType = 'x'; },
    'not finalized': (p) => { p.status = 'draft'; },
    'no material id': (p) => { delete p.material.id; },
    'no item snapshots': (p) => { p.material.snapshot.items = []; },
    'duplicate item snapshot': (p) => { p.material.snapshot.items.push({ ...p.material.snapshot.items[0] }); },
    'no session id': (p) => { delete p.session.id; },
    'no completedAt': (p) => { delete p.session.completedAt; },
    'no responses': (p) => { p.responses = []; },
    'response for an unknown item': (p) => { p.responses[0].itemId = 'ghost'; },
    'duplicate response': (p) => { p.responses.push({ ...p.responses[0] }); },
    'itemCount mismatch': (p) => { p.summary.itemCount = 99; },
  };
  for (const [domain, make] of [['objective', OBJ], ['translation', TRN]]) {
    for (const [why, fn] of Object.entries(mutations)) {
      const p = make(); fn(p);
      assert.equal(validateLearnerResponse(p).valid, false, `precondition: V1 rejects (${domain}: ${why})`);
      assert.equal(accepts(domain, p), false, `${domain}: ${why}`);
    }
  }
  // annotation rules of V1: anchored text must match, no overlap, known item, valid kind
  const tr = (fn) => { const p = TRN(); fn(p); return p; };
  for (const [why, p] of Object.entries({
    'annotation text mismatch': tr((p) => { p.learnerAnnotations[0].text = 'wrong'; }),
    'annotation outside the answer': tr((p) => { p.learnerAnnotations[0].end = 999; }),
    'annotation unknown item': tr((p) => { p.learnerAnnotations[0].itemId = 'ghost'; }),
    'annotation kind': tr((p) => { p.learnerAnnotations[0].kind = 'confident'; }),
    'overlapping annotations': tr((p) => { p.learnerAnnotations.push({ ...p.learnerAnnotations[0], id: 'an-2', start: 6, end: 10, text: p.responses[0].answer.slice(6, 10) }); }),
    'duplicate marks': tr((p) => { p.learnerItemMarks = [{ itemId: 'ti-1', kind: 'unknown' }, { itemId: 'ti-1', kind: 'uncertain' }]; }),
  })) {
    assert.equal(validateLearnerResponse(p).valid, false, `precondition: V1 rejects (${why})`);
    assert.equal(accepts('translation', p), false, why);
  }
  // objective results are required by V1
  const noResult = OBJ(); delete noResult.responses[0].result;
  assert.equal(validateLearnerResponse(noResult).valid, false);
  assert.equal(accepts('objective', noResult), false);
});

test('the closed key sets equal the public JSON Schema property sets (drift guard)', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(here, '..', '..', '..', 'schemas', 'learner-response.schema.json'), 'utf8'));
  const keys = (o) => Object.keys(o).sort();
  const want = {
    top: keys(schema.properties),
    material: keys(schema.properties.material.properties),
    session: keys(schema.properties.session.properties),
    response: keys(schema.properties.responses.items.properties),
    summary: keys(schema.properties.summary.properties),
    provenance: keys(schema.$defs.provenance.properties),
    annotation: keys(schema.properties.learnerAnnotations.items.properties),
    mark: keys(schema.properties.learnerItemMarks.items.properties),
  };
  for (const [name, expected] of Object.entries(want)) assert.deepEqual([...V1_CLOSED_KEYS[name]].sort(), expected, name);
  assert.equal(accepts('objective', { ...OBJ(), accuracy: 0.5 }), false, 'unknown top-level fields stay rejected as in the schema');
});

test('the V2 session facts are required, namespaced, closed and domain-specific (section 5.3)', () => {
  const noExt = OBJ(); delete noExt.extensions;
  assert.equal(validateLearnerResponse(noExt).valid, true, 'V1 itself knows nothing of the facts');
  assert.equal(accepts('objective', noExt), false, 'a native record carries them');
  const mut = (make, domain, fn) => { const p = make(); fn(p.extensions[SESSION_EXT_KEY]); return accepts(domain, p); };
  assert.equal(mut(OBJ, 'objective', (f) => { f.intent = 'drill'; }), false);
  assert.equal(mut(OBJ, 'objective', (f) => { delete f.feedbackTiming; }), false, 'Objective declares its feedback timing');
  assert.equal(mut(OBJ, 'objective', (f) => { f.feedbackTiming = 'later'; }), false);
  assert.equal(mut(OBJ, 'objective', (f) => { f.zzz = 1; }), false, 'closed');
  assert.equal(mut(OBJ, 'objective', (f) => { f.offsetEncoding = 'utf16-code-unit'; }), false, 'no offsets, no encoding label');
  assert.equal(mut(TRN, 'translation', (f) => { f.feedbackTiming = 'instant'; }), false, 'feedback timing is an Objective fact');
  assert.equal(mut(TRN, 'translation', (f) => { delete f.offsetEncoding; }), false, 'annotations carry offsets, so the encoding must be declared explicitly (T-8)');
  assert.equal(mut(TRN, 'translation', (f) => { f.offsetEncoding = 'codepoint'; }), false);
  const plain = nativeTranslation('r-p', 'doc-1');
  assert.equal(accepts('translation', plain), true, 'no annotations: no encoding label needed');
  // other namespaces in `extensions` are untouched by this contract
  const other = OBJ(); other.extensions['other.tool'] = { anything: true };
  assert.equal(accepts('objective', other), true);
  assert.deepEqual(withSessionFacts({ ...nativeObjective('r-x'), extensions: undefined }, { intent: 'test', feedbackTiming: 'instant' }).extensions[SESSION_EXT_KEY], { schemaVersion: 1, intent: 'test', feedbackTiming: 'instant' });
});

test('Objective and Translation semantics never leak into each other (section 6.2, 7)', () => {
  const trWithResult = TRN(); trWithResult.responses[0].result = { correct: true };
  assert.equal(accepts('translation', trWithResult), false, 'a Translation response never carries a grading result');
  const trWithPercent = TRN(); trWithPercent.summary.percent = 50;
  assert.equal(accepts('translation', trWithPercent), false);
  const objWithAnnotations = OBJ(); objWithAnnotations.learnerItemMarks = [{ itemId: 'q1', kind: 'unknown' }];
  assert.equal(accepts('objective', objWithAnnotations), false, 'learner metacognition is a Translation fact');
  // a record is only valid under the adapter of its own material type
  assert.equal(adapterFor('learner_response', OBJ()).domain, 'objective');
  assert.equal(adapterFor('learner_response', TRN()).domain, 'translation');
  assert.equal(adapterFor('typing_attempt', nativeTyping('t1')).domain, 'typing');
  assert.equal(adapterFor('learner_response', nativeTyping('t1')), null, 'a typing payload is not a learner_response');
  assert.equal(adapterFor('typing_attempt', OBJ()), null, 'a learner response is not a typing_attempt');
  assert.equal(adapterFor('teacher_review', OBJ()), null);
  assert.equal(adapterFor('learner_response', { material: { type: 'mystery' } }), null);
});

test('retry lineage: a retry records its sources; a Translation retry slots to the SOURCE document (section 5.4, 6.3)', () => {
  const objRetry = nativeObjective('r-r', 'paper-a', { wrong: [], items: ['q1'], provenance: { purpose: 'retry', sourceResponseId: 'r-o', sourceMaterialId: 'paper-a' } });
  assert.equal(accepts('objective', objRetry), true);
  assert.equal(validateLearnerResponse(objRetry).valid, true);
  assert.equal(accepts('objective', nativeObjective('r-r2', 'paper-a', { provenance: { purpose: 'retry' } })), false, 'a retry without lineage is refused');
  const trRetry = nativeTranslation('r-tr', 'ephemeral-retry-material', { provenance: { purpose: 'retry', sourceResponseId: 'r-t', sourceMaterialId: 'doc-1' } });
  assert.deepEqual(ADAPTERS.translation.slot(trRetry), { domain: 'translation', material: { type: 'translation-document', id: 'doc-1' }, intent: 'practice' });
  const remediation = nativeTranslation('r-rem', 'doc-rem', { provenance: { purpose: 'remediation', sourceResponseId: 'r-t', sourceReviewId: 'rv', sourceMaterialId: 'doc-1' } });
  assert.equal(ADAPTERS.translation.slot(remediation).material.id, 'doc-rem', 'a remediation session practices its own live document');
});

test('Objective feedback timing is recorded but changes nothing else: grading, slot and recommendation are identical', () => {
  const instant = nativeObjective('r-i', 'paper-a', { feedbackTiming: 'instant' });
  const atEnd = nativeObjective('r-e', 'paper-a', { feedbackTiming: 'submit-at-end' });
  assert.deepEqual(instant.responses, atEnd.responses);
  assert.deepEqual(instant.summary, atEnd.summary);
  assert.deepEqual(ADAPTERS.objective.slot(instant), ADAPTERS.objective.slot(atEnd));
  assert.deepEqual(accepts('objective', instant), accepts('objective', atEnd));
});

test('slots are derived from the validated evidence: domain, material and intent', () => {
  assert.deepEqual(ADAPTERS.objective.slot(nativeObjective('a', 'paper-z', { intent: 'test', feedbackTiming: 'submit-at-end' })), { domain: 'objective', material: { type: 'quiz-paper', id: 'paper-z' }, intent: 'test' });
  assert.deepEqual(ADAPTERS.typing.slot(nativeTyping('b', { material: 'typing-q', intent: 'test' })), { domain: 'typing', material: { type: 'typing-text', id: 'typing-q' }, intent: 'test' });
});

test('the write registry is derived from the adapters and is closed; it is not the Reader registry', () => {
  assert.deepEqual([...SESSION_EVIDENCE_WRITABLE], ['learner_response', 'typing_attempt']);
  assert.ok(Object.isFrozen(SESSION_EVIDENCE_WRITABLE) && Object.isFrozen(ADAPTERS));
  for (const c of ['teacher_review', 'legacy_history_entry', 'paper', 'typing_text', 'schedule']) assert.ok(!SESSION_EVIDENCE_WRITABLE.includes(c), c);
});
