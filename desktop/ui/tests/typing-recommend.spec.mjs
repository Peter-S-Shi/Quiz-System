// Recommendation and planner behavior once Typing evidence exists (ADR 0004 section 9, 13.9, 13.10; T-5, T-14):
// a typing difference is Typing-domain evidence only, the Typing Reader speaks only for the latest attempt, nothing
// crosses domains, v2 output for non-Typing snapshots equals v1, and typing attempts never create engine schedules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLANNER_ALGORITHM_VERSION, plan } from '../web/src/orchestration/planner.js';
import { ALGORITHM_VERSION, REASON_CODES, explain, recommend } from '../web/src/orchestration/recommend.js';
import { EVIDENCE_SOURCES, evidenceIdsForMaterial, materialAvailability, readTyping } from '../web/src/orchestration/readers.js';
import { TODAY, objResp, review, schedRec, snap, trResp } from './orch-fixtures.mjs';
import { nativeTyping } from './task-fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const asRow = (payload) => ({ id: payload.id, rev: 1, payload });
const typing = (id, over = {}) => asRow(nativeTyping(id, over));
const find = (recs, id) => recs.find((r) => r.target.material.id === id);
const codes = (r) => r.reasons.map((x) => x.code);

test('the registry and algorithm label: Typing activates v2 and only TYPING_ERRORS_REMAIN; the planner stays v1', () => {
  assert.equal(ALGORITHM_VERSION, 'v2');
  assert.equal(PLANNER_ALGORITHM_VERSION, 'v1');
  assert.ok(REASON_CODES.includes('TYPING_ERRORS_REMAIN'));
  assert.ok(!REASON_CODES.includes('TYPING_REVISIT_DUE'), 'not introduced (D-8)');
  assert.ok(EVIDENCE_SOURCES.includes('typing_attempt'));
  for (const loc of ['en', 'zh-CN']) assert.match(explain({ code: 'TYPING_ERRORS_REMAIN', params: {} }, loc), /./);
  assert.ok(!/know|master|understand/i.test(explain({ code: 'TYPING_ERRORS_REMAIN', params: {} }, 'en')), 'the explanation speaks of typing differences, never of knowledge');
});

test('v2 output for a snapshot without Typing rows equals the committed v1 golden file modulo the version label', () => {
  const v1 = fs.readFileSync(path.join(here, 'fixtures', 'orch-recommend.v1.golden.json'), 'utf8').replace(/\r\n/g, '\n');
  const v2 = fs.readFileSync(path.join(here, 'fixtures', 'orch-recommend.golden.json'), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(v1.includes('"algorithmVersion": "v1"') && v2.includes('"algorithmVersion": "v2"'));
  assert.equal(v2.replaceAll('"algorithmVersion": "v2"', '"algorithmVersion": "v1"'), v1);
});

test('adding Typing rows changes only Typing targets: Objective and Translation reasons, provenance and order are unchanged', () => {
  const base = {
    responses: [objResp('r1', 'paper-a', { q1: false }), trResp('lr-t', 'doc-1', { annotations: [['ti-1', 'uncertain']] })],
    reviews: [review('rv1', 'lr-t', { judgments: { 'ti-1': 'partial' } })],
    schedules: [schedRec('s1', { type: 'quiz-paper', id: 'paper-a' }, { anchor: '2026-09-30' })],
  };
  const without = recommend(snap(base), TODAY);
  const withTyping = recommend(snap({ ...base, typing: [typing('ta-1', { text: 'environment', typed: 'enviroment' })] }), TODAY);
  const nonTyping = (list) => list.filter((r) => r.target.domain !== 'typing');
  assert.equal(JSON.stringify(nonTyping(withTyping)), JSON.stringify(without));
  assert.equal(withTyping.filter((r) => r.target.domain === 'typing').length, 1);
});

test('typing error is not a knowledge error: environment -> enviroment yields one Typing signal and nothing else', () => {
  const s = snap({
    responses: [trResp('lr-t', 'doc-1', { annotations: [['ti-1', 'unknown']], answer: 'The environment matters.' })],
    typing: [typing('ta-1', { text: 'environment', typed: 'enviroment' })],
  });
  const recs = recommend(s, TODAY);
  const t = find(recs, 'typing-1');
  assert.deepEqual(codes(t), ['TYPING_ERRORS_REMAIN']);
  assert.deepEqual(t.reasons[0].provenance, [{ collection: 'typing_attempt', id: 'ta-1' }]);
  assert.deepEqual(t.reasons[0].params, {});
  assert.equal(t.group, 'incorrect-or-teacher-flagged');
  assert.deepEqual(t.target, { domain: 'typing', material: { type: 'typing-text', id: 'typing-1' } }, 'no focus items: a typing difference names no knowledge item');
  const d = find(recs, 'doc-1');
  assert.deepEqual(codes(d), ['LEARNER_UNKNOWN'], 'the translation target keeps exactly its own learner signal');
  assert.ok(d.reasons.every((r) => r.provenance.every((p) => p.collection === 'learner_response')), 'no typing record is provenance of a translation reason');
  const flat = JSON.stringify(recs);
  for (const bad of ['OBJECTIVE_', 'TEACHER_', 'REMEDIATION', 'SUCCESSFUL_RECOVERY']) assert.ok(!flat.includes(bad), bad);
});

test('no Objective / Translation / Teacher evidence ever yields TYPING_ERRORS_REMAIN, and a typing attempt never recovers anything', () => {
  const s = snap({
    responses: [objResp('r1', 'paper-a', { q1: false }), trResp('lr-t', 'doc-1', { annotations: [['ti-1', 'unknown']] }), objResp('r2', 'paper-a', { q1: true }, { provenance: { purpose: 'retry', sourceResponseId: 'r1', sourceMaterialId: 'paper-a' } })],
    reviews: [review('rv1', 'lr-t', { judgments: { 'ti-1': 'incorrect' }, remediation: ['practice'] })],
    history: [],
  });
  assert.ok(!JSON.stringify(recommend(s, TODAY)).includes('TYPING'));
  // a clean typing retry of a text does not recover an Objective or Translation target
  const t = snap({ responses: [objResp('r1', 'paper-a', { q1: false })], typing: [typing('ta-1', { typed: 'environment', provenance: { purpose: 'retry', sourceAttemptId: 'ta-0', sourceMaterialId: 'paper-a', createdAt: '2026-10-02T09:05:00.000Z' } })] });
  const recs = recommend(t, TODAY);
  assert.deepEqual(codes(find(recs, 'paper-a')), ['OBJECTIVE_INCORRECT_LATEST']);
  assert.ok(!find(recs, 'typing-1'), 'a clean typing attempt recommends nothing');
});

test('only the LATEST attempt of a Typing Text speaks; an unorderable pair is unknown', () => {
  const T = (min) => `2026-10-02T09:${String(min).padStart(2, '0')}:00.000Z`;
  const worse = typing('ta-1', { typed: 'enviroment', time: T(1) });
  const clean = typing('ta-2', { typed: 'environment', time: T(2) });
  assert.ok(!find(recommend(snap({ typing: [worse, clean] }), TODAY), 'typing-1'), 'a later clean attempt ends the signal (history stays)');
  const regress = typing('ta-3', { typed: 'enviroment', time: T(3) });
  assert.equal(codes(find(recommend(snap({ typing: [worse, clean, regress] }), TODAY), 'typing-1')).join(), 'TYPING_ERRORS_REMAIN');
  assert.deepEqual(recommend(snap({ typing: [worse, clean] }), TODAY).filter((r) => r.target.domain === 'typing'), []);
  const noTime = (id, typed) => { const a = typing(id, { typed }); delete a.payload.session.completedAt; return a; };
  assert.deepEqual(readTyping({ typingAttempts: [noTime('x1', 'enviroment'), noTime('x2', 'enviroment')] }), [], 'two attempts with no comparable ordering: unknown, so no signal');
  assert.equal(readTyping({ typingAttempts: [typing('only', { typed: 'enviroment' })] }).length, 1);
});

test('a recommended Typing target is available only while its Typing Text exists, and its evidence ids are reported', () => {
  const s = snap({ typing: [typing('ta-1', { typed: 'enviroment' })], texts: ['typing-1'] });
  const slot = { domain: 'typing', material: { type: 'typing-text', id: 'typing-1' }, intent: 'practice' };
  assert.equal(materialAvailability(s)(slot), true);
  assert.equal(materialAvailability(snap({ typing: [], texts: [] }))(slot), false);
  assert.deepEqual(evidenceIdsForMaterial(s, slot.material), [{ collection: 'typing_attempt', id: 'ta-1' }]);
  const gone = recommend(snap({ typing: [typing('ta-1', { typed: 'enviroment' })], texts: [] }), TODAY);
  assert.equal(find(gone, 'typing-1').unavailable, true);
});

test('determinism: shuffled Typing inputs serialize byte-identically', () => {
  const a = typing('ta-a', { material: 'typing-1', typed: 'enviroment' });
  const b = typing('ta-b', { material: 'typing-2', typed: 'x' });
  const one = JSON.stringify(recommend(snap({ typing: [a, b], texts: ['typing-1', 'typing-2'] }), TODAY));
  const two = JSON.stringify(recommend(snap({ typing: [b, a], texts: ['typing-2', 'typing-1'] }), TODAY));
  assert.equal(one, two);
});

test('typing attempts never create engine schedules: the planner output is identical with and without them (T-14)', () => {
  const base = { responses: [objResp('r1', 'paper-a', { q1: false })] };
  const withTyping = snap({ ...base, typing: [typing('ta-1', { typed: 'enviroment' }), typing('ta-2', { material: 'typing-2', typed: 'x' })] });
  const without = plan(snap(base), TODAY);
  assert.ok(without.length > 0, 'the objective revisit is still proposed');
  assert.equal(JSON.stringify(plan(withTyping, TODAY)), JSON.stringify(without));
  assert.deepEqual(plan(snap({ typing: [typing('ta-1', { typed: 'enviroment' })] }), TODAY), [], 'a typing attempt with differences proposes nothing');
  assert.deepEqual(plan(snap({ typing: [typing('ta-1', { typed: 'environment' })] }), TODAY), []);
});
