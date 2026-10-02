// ADR 0003 sections 11-13 and 17.1, 17.5: the Recommender, Evidence Readers and the planner as pure functions.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALGORITHM_VERSION, GROUPS, REASON_CODES, explain, recommend, selectionProvenance } from '../web/src/orchestration/recommend.js';
import { LADDER_DAYS, plan } from '../web/src/orchestration/planner.js';
import { basisCovers, decideProposal } from '../web/src/orchestration/schedule-store.js';

const here = path.dirname(fileURLToPath(import.meta.url));

import { TODAY, T, objResp, trResp, review, history, snap, schedRec } from './orch-fixtures.mjs';

const codes = (rec) => rec.reasons.map((r) => r.code);
const find = (recs, id) => recs.find((r) => r.target.material.id === id);

// -------------------------------------------------------------------------------------------------- readers
test('heterogeneous evidence keeps its own semantics: unknown, uncertain and should_know are three distinct reasons', () => {
  const s = snap({ responses: [trResp('lr-t', 'doc-1', { annotations: [['ti-1', 'unknown']], marks: [['ti-2', 'uncertain'], ['ti-3', 'should_know']], items: ['ti-1', 'ti-2', 'ti-3'] })] });
  const r = find(recommend(s, TODAY), 'doc-1');
  assert.deepEqual(codes(r), ['LEARNER_UNKNOWN', 'LEARNER_UNCERTAIN', 'LEARNER_SHOULD_KNOW']);
  assert.deepEqual(r.target.focus, [{ itemId: 'ti-1' }, { itemId: 'ti-2' }, { itemId: 'ti-3' }]);
  // all three share a group: sharing a group implies no ranking between them
  assert.equal(r.group, 'due-or-learner-flagged');
});

test('Teacher commentary is not remediation; only a recorded actionable judgment or recommendation is', () => {
  const resp = trResp('lr-t', 'doc-1');
  assert.equal(find(recommend(snap({ responses: [resp], reviews: [review('tr-1', 'lr-t', { judgments: { 'ti-1': 'correct' }, comment: 'nice work, keep practicing' })] }), TODAY), 'doc-1'), undefined, 'commentary and a correct judgment emit nothing');
  const actionable = find(recommend(snap({ responses: [resp], reviews: [review('tr-1', 'lr-t', { judgments: { 'ti-1': 'partial' } })] }), TODAY), 'doc-1');
  assert.deepEqual(codes(actionable), ['TEACHER_ACTIONABLE_REVIEW']);
  const remediation = find(recommend(snap({ responses: [resp], reviews: [review('tr-1', 'lr-t', { remediation: [{ focus: 'articles' }] })] }), TODAY), 'doc-1');
  assert.deepEqual(codes(remediation), ['REMEDIATION_UNRESOLVED']);
  assert.equal(remediation.group, 'overdue-or-remediation');
});

test('objective: latest incorrect and repeated incorrect; legacy-only history counts once, twin entries never', () => {
  const s = snap({
    responses: [objResp('r1', 'paper-a', { q1: false, q2: true }, { time: T('09-01') }), objResp('r2', 'paper-a', { q1: false, q2: true }, { time: T('09-02') })],
    history: [history('h-legacy', 'legacy-only', 'paper-b', { missed: ['qx'] }), history('h-twin', 'twin', 'paper-b', { missed: ['qy'] }), history('h-div', 'twin-divergent', 'paper-b', { missed: ['qz'] })],
  });
  const recs = recommend(s, TODAY);
  const a = find(recs, 'paper-a');
  assert.deepEqual(codes(a), ['OBJECTIVE_INCORRECT_REPEATED', 'OBJECTIVE_INCORRECT_LATEST']);
  assert.deepEqual(a.reasons[0].provenance.map((p) => p.id), ['r1', 'r2']);
  assert.deepEqual(a.target.focus, [{ itemId: 'q1' }]);
  const b = find(recs, 'paper-b');
  assert.deepEqual(b.reasons.flatMap((r) => r.provenance.map((p) => `${p.id}:${p.itemId}`)), ['h-legacy:qx']);
});

test('unknown is not negative: migrated records without recorded lineage or ordering never yield recovery, retry or "latest" signals', () => {
  // source, retry and a later attempt; the retry claims lineage but the source is a migrated record with a gap
  const source = objResp('r-src', 'paper-a', { q1: false }, { time: T('09-01') });
  const retryNoLineage = objResp('r-retry', 'paper-a', { q1: true }, { time: T('09-03'), provenance: { purpose: 'practice' } });
  const s = snap({ responses: [source, retryNoLineage], migrated: [['learner_response', 'r-src', ['objective.retry-lineage']], ['learner_response', 'r-retry', ['objective.retry-lineage']]] });
  const recs = recommend(s, TODAY);
  // the later correct attempt is the latest: no LATEST signal; no recovery was recorded, so nothing is claimed either way
  assert.equal(find(recs, 'paper-a'), undefined);
  assert.ok(!JSON.stringify(recs).includes('SUCCESSFUL_RECOVERY'));
  // unordered attempts (a missing timestamp) leave "latest" unknown: no signal from it, but repeated failure is still countable
  const undated = objResp('r-undated', 'paper-a', { q1: false }, { time: undefined });
  undated.payload.session = { id: 's' };
  delete undated.payload.finalizedAt;
  const t = snap({ responses: [objResp('r-a', 'paper-a', { q1: false }, { time: T('09-01') }), undated], migrated: [['learner_response', 'r-undated', ['timestamp.absent:session.completedAt']]] });
  assert.deepEqual(codes(find(recommend(t, TODAY), 'paper-a')), ['OBJECTIVE_INCORRECT_REPEATED']);
  // a migrated record is not "unscheduled debt": no schedule means no scheduling reason at all
  assert.ok(!JSON.stringify(recommend(s, TODAY)).includes('SCHEDULED'));
});

test('a recovery needs recorded lineage: the same facts with lineage demote the old reasons without erasing them', () => {
  const source = objResp('r-src', 'paper-a', { q1: false, q2: false }, { time: T('09-01') });
  const retry = objResp('r-retry', 'paper-a', { q1: true, q2: false }, { time: T('09-02'), provenance: { purpose: 'retry', sourceResponseId: 'r-src' } });
  const rec = find(recommend(snap({ responses: [source, retry] }), TODAY), 'paper-a');
  // q1 recovered (urgency reduced, history kept in `context`), q2 still wrong in the latest attempt
  assert.deepEqual(rec.target.focus, [{ itemId: 'q2' }]);
  assert.ok(rec.reasons.every((r) => r.provenance.every((p) => p.itemId !== 'q1' || p.id !== 'r-src')));
  assert.ok(rec.context.some((c) => c.code === 'SUCCESSFUL_RECOVERY'));
  // fully recovered: nothing live, so the material is not recommended
  const allGood = objResp('r-retry2', 'paper-a', { q1: true }, { time: T('09-02'), provenance: { purpose: 'retry', sourceResponseId: 'r-one' } });
  const one = objResp('r-one', 'paper-a', { q1: false }, { time: T('09-01') });
  assert.equal(find(recommend(snap({ responses: [one, allGood] }), TODAY), 'paper-a'), undefined);
});

test('a Translation retry recovers only under a recorded all-correct Teacher Review of the retry (no cross-domain inference)', () => {
  const src = trResp('lr-src', 'doc-1', { annotations: [['ti-1', 'unknown']], time: T('09-01') });
  const retry = trResp('lr-retry', 'doc-2', { items: ['ti-1'], time: T('09-02'), provenance: { purpose: 'retry', sourceResponseId: 'lr-src', sourceMaterialId: 'doc-1' } });
  const srcReview = review('tr-src', 'lr-src', { remediation: [{ focus: 'x' }] });
  const bare = recommend(snap({ responses: [src, retry], reviews: [srcReview] }), TODAY);
  const still = find(bare, 'doc-1');
  assert.deepEqual(codes(still), ['LEARNER_UNKNOWN'], 'a bare retry closes the remediation reason but proves no recovery');
  assert.ok(!JSON.stringify(bare).includes('SUCCESSFUL_RECOVERY'));
  const judged = recommend(snap({ responses: [src, retry], reviews: [srcReview, review('tr-retry', 'lr-retry', { judgments: { 'ti-1': 'correct' } })] }), TODAY);
  assert.equal(find(judged, 'doc-1'), undefined, 'all-correct review of the retry recovers the whole source response');
  const partial = recommend(snap({ responses: [src, retry], reviews: [srcReview, review('tr-retry', 'lr-retry', { judgments: { 'ti-1': 'correct', 'ti-9': 'partial' } })] }), TODAY);
  assert.ok(find(partial, 'doc-1'), 'one non-correct item blocks the recovery');
});

test('scheduling context is read as context, never as evidence: due/overdue reasons per owner, groups, and a read-only note', () => {
  const s = snap({
    schedules: [
      schedRec('s-engine-due', { type: 'quiz-paper', id: 'paper-a' }, { owner: 'engine', anchor: TODAY }),
      schedRec('s-user-overdue', { type: 'quiz-paper', id: 'paper-b' }, { owner: 'user', anchor: '2026-09-28' }),
      schedRec('s-future', { type: 'translation-document', id: 'doc-1' }, { owner: 'user', anchor: '2026-10-20' }),
    ],
  });
  const recs = recommend(s, TODAY);
  assert.deepEqual(codes(find(recs, 'paper-a')), ['SCHEDULED_REVIEW_DUE']);
  assert.deepEqual(codes(find(recs, 'paper-b')), ['LEARNER_SCHEDULED_OVERDUE']);
  assert.equal(find(recs, 'doc-1'), undefined, 'a future schedule is not a reason');
  assert.deepEqual(recs.map((r) => r.group), ['overdue-or-remediation', 'due-or-learner-flagged']);
  assert.deepEqual(find(recs, 'paper-b').scheduling, { scheduleId: 's-user-overdue', state: 'overdue' });
  // a schedule alone says nothing about what the learner knows: no evidence reason appears
  assert.ok(recs.every((r) => r.reasons.every((x) => /SCHEDULED/.test(x.code))));
});

test('no numeric score anywhere: the output contains no number and no rank field', () => {
  const s = snap({ responses: [objResp('r1', 'paper-a', { q1: false }), trResp('lr-t', 'doc-1', { annotations: [['ti-1', 'uncertain']] })], schedules: [schedRec('s1', { type: 'quiz-paper', id: 'paper-a' }, { anchor: '2026-09-30' })] });
  const walk = (v, p = '$') => {
    assert.notEqual(typeof v, 'number', `a number at ${p}`);
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
      assert.ok(!/score|rank|priority|mastery|percent|weight|confidence/i.test(k), `${p}.${k}`);
      walk(x, `${p}.${k}`);
    }
  };
  walk(recommend(s, TODAY));
  assert.ok(GROUPS.every((g) => typeof g === 'string'));
  assert.equal(ALGORITHM_VERSION, 'v1');
});

test('determinism: shuffled inputs and repeated runs serialize byte-identically, and match the committed golden file', () => {
  const base = snap({
    responses: [objResp('r1', 'paper-a', { q1: false, q2: true }, { time: T('09-01') }), objResp('r2', 'paper-a', { q1: false }, { time: T('09-02') }), objResp('r3', 'paper-b', { q1: false }), trResp('lr-t', 'doc-1', { annotations: [['ti-1', 'unknown']], marks: [['ti-2', 'should_know']], items: ['ti-1', 'ti-2'] })],
    reviews: [review('tr-1', 'lr-t', { judgments: { 'ti-1': 'partial' }, remediation: [{ focus: 'a' }] })],
    history: [history('h1', 'legacy-only', 'paper-b', { missed: ['q9'] }), history('h2', 'twin', 'paper-b', { missed: ['q8'] })],
    schedules: [schedRec('s1', { type: 'quiz-paper', id: 'paper-a' }, { owner: 'engine', anchor: TODAY }), schedRec('s2', { type: 'translation-document', id: 'doc-1' }, { anchor: '2026-09-25' })],
  });
  const want = JSON.stringify(recommend(base, TODAY));
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const shuffle = (a) => { const o = [...a]; for (let i = o.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
  for (let i = 0; i < 60; i += 1) {
    const s = { ...base, responses: shuffle(base.responses), reviews: shuffle(base.reviews), history: shuffle(base.history), schedules: shuffle(base.schedules) };
    assert.equal(JSON.stringify(recommend(s, TODAY)), want, `shuffle ${i}`);
  }
  const goldenPath = path.join(here, 'fixtures', 'orch-recommend.golden.json');
  if (process.env.UPDATE_GOLDEN) fs.writeFileSync(goldenPath, `${JSON.stringify(recommend(base, TODAY), null, 2)}\n`);
  assert.equal(`${JSON.stringify(recommend(base, TODAY), null, 2)}\n`, fs.readFileSync(goldenPath, 'utf8'));
});

test('the pure domain modules read no clock, randomness or locale (static)', () => {
  const dir = path.join(here, '..', 'web', 'src', 'orchestration');
  for (const f of ['recommend.js', 'readers.js', 'planner.js', 'occurrences.js']) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const bad of ['Date.now', 'Math.random', 'new Date', 'toLocale', 'Intl.', 'performance.now', 'crypto.']) assert.ok(!src.includes(bad), `${f} must not use ${bad}`);
  }
});

test('explanations render from (code, params) for every registry code in both locales', () => {
  for (const code of REASON_CODES) {
    for (const loc of ['en', 'zh-CN']) assert.ok(explain({ code, params: {} }, loc).length > 5, `${code}/${loc}`);
  }
  assert.throws(() => explain({ code: 'MASTERY_PERCENT', params: {} }), /unknown reason code/);
  const rec = find(recommend(snap({ responses: [objResp('r1', 'paper-a', { q1: false })] }), TODAY), 'paper-a');
  assert.deepEqual(selectionProvenance(rec), { source: 'recommended', reasons: [{ code: 'OBJECTIVE_INCORRECT_LATEST', params: {}, provenance: [{ collection: 'learner_response', id: 'r1', itemId: 'q1' }] }], algorithmVersion: 'v1' });
  assert.ok(!REASON_CODES.some((c) => /MASTERY|SCORE|PERCENT/.test(c)));
});

test('reserved Typing codes never appear without a Typing Reader', () => {
  const s = snap({ responses: [objResp('r1', 'paper-a', { q1: false }), trResp('lr-t', 'doc-1', { annotations: [['ti-1', 'unknown']] })], schedules: [schedRec('s1', { type: 'quiz-paper', id: 'paper-a' }, { anchor: '2026-09-25' })] });
  assert.ok(!JSON.stringify(recommend(s, TODAY)).includes('TYPING'));
});

// -------------------------------------------------------------------------------------------------- planner
const NOW = '2026-10-02T12:00:00.000Z';
const proposalFor = (materialId, date, basisIds) => ({ slot: { domain: 'objective', material: { type: 'quiz-paper', id: materialId }, intent: 'practice' }, date, reasons: [], basis: basisIds.map((id) => ({ collection: 'learner_response', id })), algorithmVersion: 'v1' });

test('the planner: a difficulty proposes planning date + LADDER[0]; a clean ordinary session proposes nothing', () => {
  const hard = snap({ responses: [objResp('r1', 'paper-a', { q1: false }, { time: T('10-01') })] });
  const p = plan(hard, TODAY);
  assert.equal(p.length, 1);
  assert.equal(p[0].date, '2026-10-03', 'always relative to the planning date');
  assert.deepEqual(p[0].slot, { domain: 'objective', material: { type: 'quiz-paper', id: 'paper-a' }, intent: 'practice' });
  assert.deepEqual(p[0].basis, [{ collection: 'learner_response', id: 'r1' }]);
  assert.deepEqual(plan(snap({ responses: [objResp('r1', 'paper-a', { q1: true }, { time: T('10-01') })] }), TODAY), []);
  assert.equal(plan(hard, '2027-01-10')[0].date, '2027-01-11', 'a later planning date moves the proposal; stored schedules keep their date (same-basis no-op)');
});

test('the planner climbs the ladder on clean engine-revisit fulfilments and stops at its end', () => {
  const material = { type: 'quiz-paper', id: 'paper-a' };
  const mk = (n) => {
    const responses = [objResp('r0', 'paper-a', { q1: false }, { time: T('08-01') })];
    const fulfillments = [];
    for (let i = 1; i <= n; i += 1) {
      responses.push(objResp(`r${i}`, 'paper-a', { q1: true }, { time: T('08-01', 10 + i) }));
      fulfillments.push({ schemaVersion: 1, id: `e${i}#d`, scheduleId: `e${i}`, originalDate: `2026-08-0${i}`, session: { collection: 'learner_response', id: `r${i}` }, fulfilledOn: `2026-08-0${i}`, via: 'linked' });
    }
    const schedules = fulfillments.map((f, i) => ({ ...schedRec(`e${i + 1}`, material, { owner: 'engine', status: 'completed' }), fulfillments: [f] }));
    return snap({ responses, schedules });
  };
  const dates = [1, 2, 3, 4, 5].map((n) => plan(mk(n), TODAY)[0]?.date ?? null);
  assert.deepEqual(dates, ['2026-10-05', '2026-10-09', '2026-10-16', '2026-11-01', null], `ladder ${LADDER_DAYS}`);
});

test('migration never mints debt, and unordered native sessions propose nothing (M-1, unknown ordering)', () => {
  const r = objResp('r1', 'paper-a', { q1: false }, { time: T('10-01') });
  assert.deepEqual(plan(snap({ responses: [r], migrated: [['learner_response', 'r1', []]] }), TODAY), [], 'migrated difficulty creates no proposal');
  const undated = objResp('r2', 'paper-a', { q1: false });
  delete undated.payload.finalizedAt;
  undated.payload.session = { id: 's' };
  assert.deepEqual(plan(snap({ responses: [r, undated] }), TODAY), []);
});

// ------------------------------------------------------------------------------------ decideProposal (section 11.4)
const mat = { type: 'quiz-paper', id: 'paper-a' };
const loaded = (rec, suggestions = []) => ({ id: rec.payload.id, rev: 3, payload: rec.payload, exceptions: rec.exceptions.map((e) => ({ rev: 1, payload: e })), fulfillments: rec.fulfillments.map((f) => ({ rev: 1, payload: f })), suggestions });
const sug = (status, basisIds, extra = {}) => ({ id: `g-${status}`, rev: 1, payload: { schemaVersion: 1, id: `g-${status}`, scheduleId: 's1', scheduleRev: 3, targetOriginalDate: '2026-10-06', currentDate: '2026-10-06', suggestedDate: '2026-10-08', reasons: [], algorithmVersion: 'v1', basis: basisIds.map((id) => ({ collection: 'learner_response', id })), status, createdAt: NOW, ...(status === 'pending' ? {} : { decidedAt: NOW }), ...extra } });

test('decide: no active schedule creates an engine schedule, unless a user cancel already covered this evidence', () => {
  const p = proposalFor('paper-a', '2026-10-03', ['r1']);
  assert.equal(decideProposal({ active: null, tombstone: null }, p, TODAY).action, 'create-engine');
  const tomb = { cancellation: { by: 'user', considered: [{ collection: 'learner_response', id: 'r1' }] } };
  assert.equal(decideProposal({ active: null, tombstone: tomb }, p, TODAY).why, 'cancelled-basis-covered');
  assert.equal(decideProposal({ active: null, tombstone: tomb }, proposalFor('paper-a', '2026-10-03', ['r1', 'r2']), TODAY).action, 'create-engine', 'new evidence id: allowed again');
});

test('decide: an engine-owned future schedule is recalculated in place only from NEW evidence (no daily creep)', () => {
  const eng = schedRec('s1', mat, { owner: 'engine', anchor: '2026-10-05', engineBasis: [{ collection: 'learner_response', id: 'r1' }] });
  assert.equal(decideProposal({ active: loaded(eng) }, proposalFor('paper-a', '2026-10-09', ['r1']), TODAY).why, 'same-basis');
  assert.equal(decideProposal({ active: loaded(eng) }, proposalFor('paper-a', '2026-10-03', ['r1', 'r2']), TODAY).action, 'update-engine');
});

test('decide: any DIFFERENT date against a user-owned schedule is a learner-resolved suggestion; only an equal date is a no-op (A-2)', () => {
  const user = schedRec('s1', mat, { owner: 'user', anchor: '2026-10-06' });
  const one = decideProposal({ active: loaded(user) }, proposalFor('paper-a', '2026-10-07', ['r9']), TODAY);
  assert.equal(one.action, 'create-suggestion', 'a one-day difference is still a conflict');
  assert.deepEqual([one.date, one.target.displayDate], ['2026-10-07', '2026-10-06']);
  assert.equal(decideProposal({ active: loaded(user) }, proposalFor('paper-a', '2026-10-06', ['r9']), TODAY).why, 'equal-date');
});

test('decide: an Overdue engine-owned schedule is never moved silently - the proposal becomes a suggestion', () => {
  const eng = schedRec('s1', mat, { owner: 'engine', anchor: '2026-09-30', engineBasis: [{ collection: 'learner_response', id: 'r1' }] });
  const d = decideProposal({ active: loaded(eng) }, proposalFor('paper-a', '2026-10-03', ['r1', 'r2']), TODAY);
  assert.equal(d.action, 'create-suggestion');
  assert.equal(decideProposal({ active: loaded(eng) }, proposalFor('paper-a', '2026-10-03', ['r1']), TODAY).why, 'basis-covered', 'the engine already planned from this basis');
});

test('decide: kept, accepted and superseded suggestions cover their basis; only a new evidence id re-raises (anti-nag)', () => {
  const user = schedRec('s1', mat, { owner: 'user', anchor: '2026-10-06' });
  for (const status of ['kept', 'accepted', 'superseded']) {
    const l = loaded(user, [sug(status, ['r9'])]);
    assert.equal(decideProposal({ active: l }, proposalFor('paper-a', '2026-10-08', ['r9']), TODAY).why, 'basis-covered', status);
    assert.equal(decideProposal({ active: l }, proposalFor('paper-a', '2026-10-08', ['r9', 'r10']), TODAY).action, 'create-suggestion', `${status} + new evidence`);
  }
});

test('decide: pending suggestions are bound to the schedule revision - same basis no-op, new basis updates, a stale one is replaced', () => {
  const user = schedRec('s1', mat, { owner: 'user', anchor: '2026-10-06' });
  const fresh = loaded(user, [sug('pending', ['r9'])]);
  assert.equal(decideProposal({ active: fresh }, proposalFor('paper-a', '2026-10-09', ['r9']), TODAY).why, 'pending-covers');
  assert.equal(decideProposal({ active: fresh }, proposalFor('paper-a', '2026-10-09', ['r9', 'r10']), TODAY).action, 'update-pending');
  const stale = loaded(user, [sug('pending', ['r9'], { scheduleRev: 2 })]);
  assert.equal(decideProposal({ active: stale }, proposalFor('paper-a', '2026-10-09', ['r10']), TODAY).action, 'replace-stale-pending');
});

test('decide: a recurring target is the next occurrence ahead; proposals stay inside until', () => {
  const rec = schedRec('s1', mat, { owner: 'user', cadence: { kind: 'every', unit: 'day', interval: 3 }, anchor: '2026-09-29' });
  const d = decideProposal({ active: loaded(rec) }, proposalFor('paper-a', '2026-10-03', ['r9']), TODAY);
  // Sept 29 is Overdue; the suggestion concerns the next occurrence still ahead (Oct 2, due today), identified by its original date
  assert.deepEqual([d.action, d.target.originalDate, d.target.displayDate, d.date], ['create-suggestion', '2026-10-02', '2026-10-02', '2026-10-03']);
  const finite = schedRec('s1', mat, { owner: 'user', cadence: { kind: 'every', unit: 'day', interval: 3, until: '2026-10-06' }, anchor: '2026-10-03' });
  assert.equal(decideProposal({ active: loaded(finite) }, proposalFor('paper-a', '2026-12-01', ['r9']), TODAY).why, 'beyond-until');
});

test('basisCovers is plain set containment over (collection, id)', () => {
  const a = [{ collection: 'learner_response', id: 'r1' }, { collection: 'teacher_review', id: 't1' }];
  assert.equal(basisCovers(a, [{ collection: 'learner_response', id: 'r1' }]), true);
  assert.equal(basisCovers(a, [{ collection: 'learner_response', id: 't1' }]), false);
  assert.equal(basisCovers([], []), true);
});
