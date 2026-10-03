// The Library service against the REAL store: authoring of all three domains is Content-only, guarded by revisions,
// verbatim for Typing text, and never touches Evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibrary, LibraryError } from '../../web/src/product/library.js';
import { createPracticeRuntime } from '../../web/src/practice/runtime.js';
import { storeMedia } from '../../web/src/media/media-source.js';
import { correctAnswerForView, paperWithExplanations } from '../objective-fixtures.mjs';
import { withEnv } from './env.mjs';

let tick = 0;
const clock = () => `2026-10-0${1 + Math.floor(tick / 60)}T10:${String(tick++ % 60).padStart(2, '0')}:00.000Z`;
const lib = (e) => createLibrary({ port: e.port, now: clock });

test('Typing text: create, list, edit with the revision, verbatim characters, stale edit refused', withEnv(async (e) => {
  const L = await lib(e);
  const draft = L.newTypingText();
  const text = 'Line one with a tab\there.\r\nLine two: café 你好 👩‍👩‍👧 and "quotes".\n\n  indented';
  const saved = await L.saveTypingText({ ...draft, title: '  Copy practice  ', text, language: 'en' });
  const row = (await e.port.read('typing_text', { id: draft.id }))[0];
  assert.equal(row.payload.text, text, 'every character, including CRLF, tabs, ZWJ sequences and leading spaces, is stored verbatim');
  assert.equal(row.payload.title, 'Copy practice');
  const listed = (await L.list()).texts;
  assert.deepEqual(listed.map((t) => [t.id, t.title, t.language, t.ready]), [[draft.id, 'Copy practice', 'en', true]]);
  assert.equal(listed[0].count, [...text].length);
  // an edit must present the revision it started from
  const edited = await L.saveTypingText({ ...saved.payload, text: 'Second version' }, saved.rev);
  assert.ok(edited.rev > saved.rev);
  await assert.rejects(() => L.saveTypingText({ ...saved.payload, text: 'Lost update' }, saved.rev), (err) => err instanceof LibraryError && err.code === 'STALE');
  assert.equal((await L.get('text', draft.id)).payload.text, 'Second version');
  assert.equal((await L.get('text', draft.id)).payload.createdAt, saved.payload.createdAt, 'creation time is kept');
  // creating over an existing id is refused
  await assert.rejects(() => L.saveTypingText({ ...draft, title: 'x', text: 'y' }), (err) => err.code === 'EXISTS');
  // validation
  for (const bad of [{ ...draft, id: 'a', title: ' ', text: 'x' }, { ...draft, id: 'b', title: 't', text: '   ' }]) {
    await assert.rejects(() => L.saveTypingText(bad), (err) => err.code === 'INVALID');
  }
  assert.equal(await e.port.count('typing_text'), 1);
}));

test('Paper: all five types with explanations and media are authored, listed, edited and removed; invalid drafts refused', withEnv(async (e) => {
  const L = await lib(e);
  const seeded = await e.port.count('paper'); // the environment seeds empty papers
  const ref = await storeMedia(e.port, { name: 'figure.png', mimeType: 'image/png', bytes: Uint8Array.from({ length: 32 }, (_, i) => i) });
  const draft = { ...paperWithExplanations({ id: 'paper-lib' }), title: 'Authoring paper', category: 'Geography', tags: [' europe ', ''] };
  draft.questions[0].image = { id: ref.id, name: 'figure.png', alt: 'a synthetic figure' };
  const saved = await L.savePaper(draft);
  const stored = (await e.port.read('paper', { id: 'paper-lib' }))[0].payload;
  assert.deepEqual(stored.tags, ['europe']);
  assert.equal(stored.questions.length, 5);
  assert.equal(stored.questions[0].image.id, ref.id);
  assert.deepEqual(stored.questions.map((q) => q.explanation), draft.questions.map((q) => q.explanation), 'explanations survive authoring');
  const row = (await L.list()).papers.find((p) => p.id === 'paper-lib');
  assert.deepEqual([row.id, row.title, row.category, row.count, row.hasMedia, row.ready], ['paper-lib', 'Authoring paper', 'Geography', 5, true, true]);
  // edit: change one explanation; the revision guards it
  const next = structuredClone(saved.payload);
  next.questions[1].explanation = 'Edited explanation';
  const again = await L.savePaper(next, saved.rev);
  assert.equal((await L.get('paper', 'paper-lib')).payload.questions[1].explanation, 'Edited explanation');
  await assert.rejects(() => L.savePaper(next, saved.rev), (err) => err.code === 'STALE');
  assert.ok(again.rev > saved.rev);
  // invalid drafts never reach the store
  const noCorrect = structuredClone(draft);
  noCorrect.id = 'paper-bad';
  noCorrect.questions[0].options.forEach((o) => { o.correct = false; });
  noCorrect.questions[3].explanation = 42;
  await assert.rejects(() => L.savePaper(noCorrect), (err) => err.code === 'INVALID' && err.detail.problems.length >= 2);
  await assert.rejects(() => L.savePaper({ ...draft, id: 'paper-empty', questions: [] }), (err) => err.code === 'INVALID');
  await assert.rejects(() => L.savePaper({ ...draft, id: 'paper-notitle', title: ' ' }), (err) => err.code === 'INVALID');
  assert.equal(await e.port.count('paper'), seeded + 1);
  // removal deletes content only
  await L.remove('paper', 'paper-lib');
  assert.equal(await e.port.count('paper'), seeded);
  assert.equal(await e.port.count('media_object'), 1, 'the media object itself is not deleted with the paper');
}));

test('Editing or deleting a paper never changes a recorded attempt (the snapshot is the history)', withEnv(async (e) => {
  const L = await lib(e);
  const draft = { ...paperWithExplanations({ id: 'paper-hist' }), title: 'History paper' };
  const saved = await L.savePaper(draft);
  const rt = await createPracticeRuntime(e.port, { store: e.store });
  const started = await rt.begin(rt.startObjective({ paper: saved.payload, intent: 'practice', feedbackTiming: 'instant' }));
  for (let i = 0; i < 5; i += 1) {
    started.engine.go(i);
    started.engine.answer(correctAnswerForView(started.engine.view(), saved.payload));
    started.engine.submitItem();
  }
  const payload = started.engine.finalize({ now: '2026-10-02T10:00:00.000Z' });
  await rt.services.commit({ payload });
  const before = JSON.stringify((await e.port.read('learner_response', { id: payload.id }))[0].payload);
  const edit = structuredClone(saved.payload);
  edit.title = 'Renamed';
  edit.questions.forEach((q) => { q.explanation = 'REWRITTEN'; q.prompt = `${q.prompt} (edited)`; });
  await L.savePaper(edit, saved.rev);
  await L.remove('paper', 'paper-hist');
  assert.equal(JSON.stringify((await e.port.read('learner_response', { id: payload.id }))[0].payload), before);
  assert.ok(!before.includes('REWRITTEN'));
  assert.equal(await e.port.count('learner_response'), 1);
}));

test('Translation: the first document creates the default folder, positions are normalized, folders protect their documents', withEnv(async (e) => {
  const L = await lib(e);
  assert.equal((await L.list()).folders.length, 0);
  const doc = { ...L.newDocument(), title: 'Daily phrases', sourceLanguage: 'en', targetLanguage: 'zh', items: [
    { sourceText: 'The environment matters.', referenceTranslation: '环境很重要。' }, { sourceText: 'Learning is a habit.' }] };
  const saved = await L.saveDocument(doc);
  const stored = (await e.port.read('translation_document', { id: doc.id }))[0].payload;
  assert.deepEqual(stored.items.map((i) => i.position), [0, 1]);
  assert.ok(stored.items.every((i) => typeof i.id === 'string' && i.id.length > 0), 'items get stable ids');
  assert.equal((await L.list()).folders.length, 1);
  assert.equal(stored.folderId, (await L.list()).folders[0].id);
  // a second folder, moving the document, and the non-empty guard
  const f2 = await L.createFolder('Exam prep');
  await assert.rejects(() => L.deleteFolder(stored.folderId), (err) => err.code === 'NOT_EMPTY');
  const moved = await L.saveDocument({ ...saved.payload, folderId: f2.id }, saved.rev);
  assert.equal(moved.payload.folderId, f2.id);
  await L.deleteFolder(stored.folderId);
  assert.deepEqual((await L.list()).folders.map((f) => f.name), ['Exam prep']);
  await L.renameFolder(f2.id, 'Exam preparation');
  assert.equal((await L.list()).folders[0].name, 'Exam preparation');
  // validation
  await assert.rejects(() => L.saveDocument({ ...doc, id: 'd2', title: 'x', sourceLanguage: '', items: doc.items }), (err) => err.code === 'INVALID');
  await assert.rejects(() => L.saveDocument({ ...doc, id: 'd3', items: [{ sourceText: ' ' }] }), (err) => err.code === 'INVALID');
  await assert.rejects(() => L.saveDocument({ ...doc, id: 'd4', items: [] }), (err) => err.code === 'INVALID');
}));
