// The Focused Practice runtime against the REAL Rust store (port-serve): materials in, sessions started with ids allocated
// up front, recovery state saved/restored/discarded, results out through the one finalization door, the explanation
// preserved in the stored snapshot, and the three domains kept apart. Content only changes through explicit puts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPracticeRuntime } from '../../web/src/practice/runtime.js';
import { createLibrary } from '../../web/src/product/library.js';
import { putOp } from '../../web/src/projection.js';
import { loadSnapshot } from '../../web/src/orchestration/readers.js';
import { recommend } from '../../web/src/orchestration/recommend.js';
import { storeMedia } from '../../web/src/media/media-source.js';
import { withEnv } from './env.mjs';
import { correctAnswerForView, paperWithExplanations, wrongAnswerForView } from '../objective-fixtures.mjs';

/** Typing text is authored through the Library service (the formal content workflow). */
const addText = async (e, { title, text }) => {
  const lib = await createLibrary({ port: e.port, now: () => new Date().toISOString() });
  return (await lib.saveTypingText({ ...lib.newTypingText(), title, text })).payload;
};
const typed = (engine, value) => engine.input({ isTrusted: true, type: 'input', inputType: 'insertText', value });
const count = (e, c) => e.port.count(c);

async function seed(e) {
  const paper = paperWithExplanations({ id: 'paper-exp' });
  await e.port.commit({ ops: [
    putOp(e.spec('paper'), paper.id, paper),
    putOp(e.spec('translation_folder'), 'f-1', { schemaVersion: 1, id: 'f-1', name: 'Folder', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }),
    putOp(e.spec('translation_document'), 'doc-1', { schemaVersion: 1, id: 'doc-1', title: 'Synthetic document', folderId: 'f-1', sourceLanguage: 'en', targetLanguage: 'zh', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
      items: [{ id: 'it-1', position: 0, sourceText: 'The environment matters.', referenceTranslation: '环境很重要。' }, { id: 'it-2', position: 1, sourceText: 'Learning is a habit.' }] }),
  ] });
  return paper;
}
const playAll = (engine, source, ok = () => true) => {
  for (let i = 0; i < source.questions.length; i += 1) {
    engine.go(i);
    engine.answer(ok(i) ? correctAnswerForView(engine.view(), source) : wrongAnswerForView(engine.view(), source));
    if (engine.view().canSubmitItem) engine.submitItem();
  }
};

test('materials: papers, documents and typing texts are listed; only ready content is startable', withEnv(async (e) => {
  const paper = await seed(e);
  const rt = await createPracticeRuntime(e.port);
  await addText(e, { title: 'Copy', text: 'environment' });
  const m = await rt.materials();
  const mine = m.papers.find((p) => p.id === paper.id);
  assert.ok(mine && mine.ready && mine.questions === 5);
  assert.ok(m.papers.filter((p) => p.id !== paper.id).every((p) => !p.ready), 'seeded empty papers are not startable');
  assert.deepEqual(m.documents.map((d) => [d.id, d.ready, d.items]), [['doc-1', true, 2]]);
  assert.equal(m.texts.length, 1);
  await assert.rejects(() => addText(e, { title: 'x', text: '   ' }), /empty/);
}));

test('Objective end to end: start (recovery saved), play, finalize through the one door, explanation stored in the snapshot', withEnv(async (e) => {
  const paper = await seed(e);
  const rt = await createPracticeRuntime(e.port);
  const started = await rt.begin(rt.startObjective({ paper, intent: 'practice', feedbackTiming: 'instant' }));
  assert.equal((await rt.resumable()).length, 1, 'a started session is resumable at once');
  playAll(started.engine, paper, (i) => i !== 1);
  await rt.services.save(started.engine.snapshot());
  const payload = started.engine.finalize({ now: '2026-10-02T10:00:00.000Z' });
  const out = await rt.services.commit({ payload });
  assert.equal(out.alreadyFinalized, false);
  await rt.services.clear(payload.session.id);
  assert.equal((await rt.resumable()).length, 0, 'the recovery state is gone once the evidence is committed');
  const [row] = await e.port.read('learner_response', { id: payload.id });
  assert.deepEqual(row.payload.material.snapshot.items.map((i) => i.explanation), paper.questions.map((q) => q.explanation), 'the stored snapshot keeps every explanation');
  // later edits of the source paper never rewrite the stored attempt (Scope 10.3)
  const edited = { ...paper, questions: paper.questions.map((q) => ({ ...q, explanation: 'EDITED LATER' })) };
  const [cur] = await e.port.read('paper', { id: paper.id });
  await e.port.commit({ preconditions: [{ kind: 'rev', collection: 'paper', id: paper.id, equals: cur.rev }], ops: [putOp(e.spec('paper'), paper.id, edited)] });
  const [after] = await e.port.read('learner_response', { id: payload.id });
  assert.equal(JSON.stringify(after.payload), JSON.stringify(row.payload));
  assert.ok(!JSON.stringify(after.payload).includes('EDITED LATER'));
  // idempotent across an ambiguous crash
  assert.equal((await rt.services.commit({ payload })).alreadyFinalized, true);
  assert.equal(await count(e, 'learner_response'), 1);
}));

test('Explanation never changes what the Readers see: the same answers with and without explanations recommend identically', withEnv(async (e) => {
  const a = paperWithExplanations({ id: 'paper-a2' });
  const b = paperWithExplanations({ id: 'paper-b2', explain: false });
  await e.port.commit({ ops: [putOp(e.spec('paper'), a.id, a), putOp(e.spec('paper'), b.id, b)] });
  const rt = await createPracticeRuntime(e.port);
  for (const paper of [a, b]) {
    const s = rt.startObjective({ paper, intent: 'practice', feedbackTiming: 'submit-at-end' });
    for (let i = 0; i < paper.questions.length; i += 1) { s.engine.go(i); s.engine.answer(i % 2 ? correctAnswerForView(s.engine.view(), paper) : wrongAnswerForView(s.engine.view(), paper)); }
    await rt.services.commit({ payload: s.engine.finalize({ now: '2026-10-02T10:00:00.000Z' }) });
  }
  const rec = recommend(await loadSnapshot(e.port), '2026-10-02');
  const norm = (id) => JSON.stringify(rec.filter((r) => r.target.material.id === id)).replaceAll(id, 'M').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'EVIDENCE');
  assert.ok(rec.length >= 2, 'both papers are recommended (incorrect answers recorded)');
  assert.equal(norm('paper-a2'), norm('paper-b2'), 'identical reasons, groups and provenance shapes');
}));

test('Translation end to end: marks, finalize, retry material, lineage slots to the source document', withEnv(async (e) => {
  await seed(e);
  const rt = await createPracticeRuntime(e.port);
  const m = await rt.materials();
  const started = await rt.begin(rt.startTranslation({ document: m.documents[0].document }));
  const s = started.engine;
  s.setAnswer('环境很重要。');
  s.addAnnotation({ start: 0, end: 2, kind: 'uncertain' }, { now: '2026-10-02T10:00:00.000Z' });
  s.setMark('unknown');
  const payload = s.finalize({ now: '2026-10-02T10:05:00.000Z' });
  await rt.services.commit({ payload });
  await rt.services.clear(payload.session.id);
  const [row] = await e.port.read('learner_response', { id: payload.id });
  assert.equal(row.payload.learnerAnnotations.length, 1);
  assert.ok(!('result' in row.payload.responses[0]));
  // retry from the stored snapshot only
  const { buildRetryMaterial } = await import('../../web/src/translation/session.js');
  const retry = buildRetryMaterial({ response: row.payload, itemIds: ['it-1'], createdAt: '2026-10-02T11:00:00.000Z', ids: () => rt.services.newId() });
  const r = await rt.begin(rt.startTranslation({ document: retry }));
  r.engine.setAnswer('again');
  const p2 = r.engine.finalize({ now: '2026-10-02T11:05:00.000Z' });
  await rt.services.commit({ payload: p2 });
  assert.equal(p2.provenance.sourceMaterialId, 'doc-1');
  assert.equal(await count(e, 'learner_response'), 2);
}));

test('Typing end to end on a long passage: live view, finalize, valid immutable attempt; Test has no live view', withEnv(async (e) => {
  const rt = await createPracticeRuntime(e.port);
  const words = ['the', 'environment', 'matters', 'learning', 'by', 'copying', 'careful', 'text'];
  let text = ''; let n = 0;
  while ([...text].length < 7600) text += `${words[(n++ * 7 + (n >> 2)) % words.length]} `;
  const added = await addText(e, { title: 'Long', text });
  const started = await rt.begin(rt.startTyping({ text: added, intent: 'practice' }));
  const parts = [...text];
  parts[30] = 'Z';
  parts.splice(4000, 1);
  const t0 = Date.now();
  typed(started.engine, parts.join(''));
  assert.ok(started.engine.view().live, 'live view while typing');
  const out = started.engine.finalize({ completedAt: '2026-10-02T12:00:00.000Z' });
  assert.ok(Date.now() - t0 < 5000, 'finalizing a long passage with dispersed errors is quick');
  assert.equal(out.payload.errors.length, 2, 'one substitution and one omission');
  await rt.services.commit(out);
  await rt.services.clear(out.payload.session.id);
  const [row] = await e.port.read('typing_attempt', { id: out.payload.id });
  assert.equal(row.payload.counts.referenceGraphemes, parts.length + 1);
  const test = rt.startTyping({ text: added, intent: 'test' });
  typed(test.engine, 'abc');
  assert.equal('live' in test.engine.view(), false);
}));

test('recovery across a restart: a new runtime resumes every domain exactly, and a discarded session is gone', withEnv(async (e) => {
  const paper = await seed(e);
  const rt = await createPracticeRuntime(e.port);
  const obj = await rt.begin(rt.startObjective({ paper, intent: 'practice', feedbackTiming: 'submit-at-end' }));
  obj.engine.answer(correctAnswerForView(obj.engine.view(), paper));
  await rt.services.save(obj.engine.snapshot());
  const m = await rt.materials();
  const trn = await rt.begin(rt.startTranslation({ document: m.documents[0].document }));
  trn.engine.setAnswer('half done');
  await rt.services.save(trn.engine.snapshot());
  const added = await addText(e, { title: 'Copy', text: 'environment' });
  const ty = await rt.begin(rt.startTyping({ text: added, intent: 'practice' }));
  typed(ty.engine, 'envi');
  await rt.services.save(ty.engine.snapshot());

  const rt2 = await createPracticeRuntime(e.port); // "the app was restarted"
  const states = await rt2.resumable();
  assert.deepEqual(states.map((s) => s.domain).sort(), ['objective', 'translation', 'typing']);
  const byDomain = Object.fromEntries(await Promise.all(states.map(async (s) => [s.domain, await rt2.restore(s)])));
  assert.deepEqual(byDomain.objective.engine.view(), obj.engine.view());
  assert.equal(byDomain.translation.engine.view().answer, 'half done');
  assert.equal(byDomain.typing.engine.committedText, 'envi');
  assert.ok(!JSON.stringify(byDomain.objective.engine.view()).includes('EXPL-'), 'a resumed Submit-at-End session is still opaque');
  assert.equal(await count(e, 'learner_response'), 0, 'recovery state is never evidence');
  assert.equal(await count(e, 'typing_attempt'), 0);

  await rt2.discard(states.find((s) => s.domain === 'typing').session.id);
  assert.deepEqual((await rt2.resumable()).map((s) => s.domain).sort(), ['objective', 'translation']);
  // finalizing a resumed session works and clears its recovery row
  const resumed = byDomain.objective.engine;
  const payload = resumed.finalize({ now: '2026-10-02T13:00:00.000Z' });
  await rt2.services.commit({ payload });
  await rt2.services.clear(payload.session.id);
  assert.deepEqual((await rt2.resumable()).map((s) => s.domain), ['translation']);
}));

test('a committed session found again in recovery (crash between commit and clear) is discarded, not re-finalized', withEnv(async (e) => {
  const paper = await seed(e);
  const rt = await createPracticeRuntime(e.port);
  const s = await rt.begin(rt.startObjective({ paper, intent: 'practice', feedbackTiming: 'instant' }));
  playAll(s.engine, paper);
  await rt.services.save(s.engine.snapshot());
  await rt.services.commit({ payload: s.engine.finalize({ now: '2026-10-02T10:00:00.000Z' }) });
  // the process dies before the recovery row is cleared
  const rt2 = await createPracticeRuntime(e.port);
  assert.deepEqual(await rt2.resumable(), []);
  assert.equal(await count(e, 'learner_response'), 1);
}));

test('media-bearing papers: listed with hasMedia; with no presenter they fail closed, with a failing one too, and only a proof starts them', withEnv(async (e) => {
  const paper = paperWithExplanations({ id: 'paper-media' });
  const ref = await storeMedia(e.port, { name: 'figure.png', mimeType: 'image/png', bytes: Uint8Array.from({ length: 64 }, (_, i) => i) });
  paper.questions[2].image = { id: ref.id, name: 'figure.png', alt: 'synthetic' };
  await e.port.commit({ ops: [putOp(e.spec('paper'), paper.id, paper)] });
  const rtNone = await createPracticeRuntime(e.port);
  const mine = (await rtNone.materials()).papers.find((p) => p.id === paper.id);
  assert.ok(mine, 'listed');
  assert.equal(mine.hasMedia, true);
  assert.equal(mine.questions, 5);
  // no presenter: nothing can be proven
  const none = await rtNone.objectiveMedia(paper);
  assert.equal(none.presentable.size, 0);
  assert.equal(none.problems.length, 1);
  assert.throws(() => rtNone.startObjective({ paper, intent: 'practice', feedbackTiming: 'instant' }), (err) => err.code === 'MEDIA_UNSUPPORTED');
  // a presenter that cannot present it
  const failing = await createPracticeRuntime(e.port, { media: { prove: async (refs) => ({ presentable: new Set(), problems: refs.map((r) => ({ ...r, reason: 'cannot decode' })) }) } });
  const bad = await failing.objectiveMedia(paper);
  assert.deepEqual(bad.problems.map((p) => [p.questionId, p.reason]), [['q-blank', 'cannot decode']]);
  assert.throws(() => failing.startObjective({ paper, intent: 'practice', feedbackTiming: 'instant', presentableMedia: bad.presentable }), (err) => err.code === 'MEDIA_UNSUPPORTED');
  assert.equal((await failing.resumable()).length, 0, 'nothing was started or saved');
  assert.equal(await count(e, 'learner_response'), 0, 'no Evidence');
  // a retry of questions without media is not affected
  assert.equal((await failing.objectiveMedia(paper, ['q-single'])).problems.length, 0);
  // a presenter that proves it: the session starts and the reference is kept
  const proving = await createPracticeRuntime(e.port, { media: { prove: async (refs) => ({ presentable: new Set(refs.map((r) => r.id)), problems: [] }) } });
  const ok = await proving.objectiveMedia(paper);
  assert.equal(ok.problems.length, 0);
  const started = await proving.begin(proving.startObjective({ paper, intent: 'practice', feedbackTiming: 'instant', presentableMedia: ok.presentable }));
  assert.equal(started.engine.snapshot().questions[2].image.id, ref.id);
  const [row] = await e.port.read('paper', { id: paper.id });
  assert.deepEqual(row.payload.questions[2].image, paper.questions[2].image, 'the media metadata is stored unchanged');
  // resuming proves again: a presenter that cannot present it refuses to resume
  const state = (await proving.resumable())[0];
  await assert.rejects(() => failing.restore(state), /cannot be shown/);
  assert.equal((await proving.restore(state)).engine.view().total, 5);
}));
