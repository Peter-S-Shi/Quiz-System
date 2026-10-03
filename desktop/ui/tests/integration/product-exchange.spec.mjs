// Content exchange over the REAL store: a paper with media survives export -> import byte for byte, imports are previews
// first, collisions become copies, hostile files are refused, and document imports validate like V1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibrary } from '../../web/src/product/library.js';
import { createExchange } from '../../web/src/product/exchange.js';
import { fetchMedia, storeMedia } from '../../web/src/media/media-source.js';
import { paperWithExplanations } from '../objective-fixtures.mjs';
import { withEnv } from './env.mjs';

let n = 0;
const now = () => `2026-10-02T15:${String(n++ % 60).padStart(2, '0')}:00.000Z`;
const png = (seed) => Uint8Array.from({ length: 300 }, (_, i) => (i * 7 + seed) % 256);

async function setup(e) {
  const library = await createLibrary({ port: e.port, now });
  return { library, exchange: createExchange({ port: e.port, now, library }) };
}

test('a paper with image and audio exports and imports back byte for byte (collision -> copy, media deduplicated)', withEnv(async (e) => {
  const { library, exchange } = await setup(e);
  const seeded = await e.port.count('paper'); // the environment seeds empty papers
  const img = await storeMedia(e.port, { name: 'figure.png', mimeType: 'image/png', bytes: png(1) });
  const aud = await storeMedia(e.port, { name: 'clip.mp3', mimeType: 'audio/mpeg', bytes: png(2) });
  const paper = { ...paperWithExplanations({ id: 'paper-x' }), title: 'Exchange paper' };
  paper.questions[0].image = { id: img.id, name: 'figure.png', alt: 'a figure' };
  paper.questions[3].audio = { id: aud.id, name: 'clip.mp3' };
  await library.savePaper(paper);
  const file = await exchange.exportPaper('paper-x');
  const pkg = JSON.parse(file.text);
  assert.equal(pkg.documentType, 'quiz-studio.quiz-paper');
  assert.deepEqual(pkg.assets.map((a) => a.mimeType).sort(), ['audio/mpeg', 'image/png']);
  // import into the same library: the id collides, so it becomes a copy; the media dedupes
  const pre = await exchange.previewPaperImport(file.text);
  assert.deepEqual([pre.ok, pre.collision, pre.summary.questionCount, pre.summary.mediaCount], [true, true, 5, 2]);
  assert.equal(await e.port.count('paper'), seeded + 1, 'a preview stores nothing');
  const saved = await exchange.commitPaperImport(pre);
  assert.notEqual(saved.payload.id, 'paper-x');
  assert.match(saved.payload.title, /\(copy\)$/);
  assert.equal(saved.payload.questions[0].image.id, img.id, 'identical bytes -> the same media object');
  assert.deepEqual((await fetchMedia(e.port, saved.payload.questions[3].audio.id)).bytes, png(2));
  assert.equal(await e.port.count('media_object'), 2);
  assert.deepEqual(saved.payload.questions.map((q) => q.explanation), paper.questions.map((q) => q.explanation), 'explanations travel with the paper');
  assert.equal(await e.port.count('paper'), seeded + 2);
}));

test('a paper without collision keeps its id; a bare paper object (no envelope) is accepted', withEnv(async (e) => {
  const { exchange } = await setup(e);
  const bare = { ...paperWithExplanations({ id: 'bare-1' }), title: 'Bare paper' };
  const pre = await exchange.previewPaperImport(JSON.stringify(bare));
  assert.deepEqual([pre.ok, pre.collision], [true, false]);
  const saved = await exchange.commitPaperImport(pre);
  assert.equal(saved.payload.id, 'bare-1');
}));

test('hostile or broken paper files are refused before anything is stored', withEnv(async (e) => {
  const { exchange } = await setup(e);
  const ok = paperWithExplanations({ id: 'p-bad' });
  const asset = (over = {}) => ({ id: 'a1', name: 'x.png', mimeType: 'image/png', data: Buffer.from(png(3)).toString('base64'), ...over });
  const withImage = (assets) => JSON.stringify({ documentType: 'quiz-studio.quiz-paper', schemaVersion: 2, paper: { ...ok, questions: ok.questions.map((q, i) => (i === 0 ? { ...q, image: { id: 'a1' } } : q)) }, assets });
  const cases = [
    ['not json', '{nope'],
    ['not an object', '[]'],
    ['no paper', '{"hello":1}'],
    ['empty questions', JSON.stringify({ ...ok, questions: [{}] })],
    ['media referenced but missing', withImage([])],
    ['bad base64', withImage([asset({ data: '***' })])],
    ['empty data', withImage([asset({ data: '' })])],
    ['executable type', withImage([asset({ mimeType: 'application/x-msdownload' })])],
    ['audio payload for an image', withImage([asset({ mimeType: 'audio/mpeg' })])],
    ['asset without id', withImage([asset({ id: ' ' })])],
  ];
  for (const [name, text] of cases) {
    const pre = await exchange.previewPaperImport(text);
    assert.equal(pre.ok, false, name);
    assert.ok(pre.errors.length > 0, name);
  }
  const good = await exchange.previewPaperImport(withImage([asset()]));
  assert.equal(good.ok, true);
  assert.equal(await e.port.count('media_object'), 0, 'previews never store media');
  await assert.rejects(() => exchange.commitPaperImport({ ok: false }), /cannot be imported/);
}));

test('Translation document import: JSON, source-only text and bilingual text; collision -> copy; folder made safe', withEnv(async (e) => {
  const { library, exchange } = await setup(e);
  const json = JSON.stringify({ schemaVersion: 1, documentType: 'quiz-studio.translation-document', id: 'doc-j', title: 'From file', folderId: 'foreign-folder', sourceLanguage: 'en', targetLanguage: 'zh', createdAt: now(), updatedAt: now(), items: [{ id: 'a', position: 0, sourceText: 'One.', referenceTranslation: '一。' }] });
  const pj = await exchange.previewDocumentImport(json, 'json');
  assert.deepEqual([pj.ok, pj.collision, pj.summary.itemCount], [true, false, 1]);
  const saved = await exchange.commitDocumentImport(pj);
  assert.equal(saved.payload.id, 'doc-j');
  assert.ok((await library.list()).folders.some((f) => f.id === saved.payload.folderId));
  const again = await exchange.previewDocumentImport(json, 'json');
  assert.equal(again.collision, true);
  const copy = await exchange.commitDocumentImport(again);
  assert.notEqual(copy.payload.id, 'doc-j');
  assert.match(copy.payload.title, /\(copy\)$/);
  // plain text
  const meta = { title: 'Lines', sourceLanguage: 'en', targetLanguage: 'zh' };
  const src = await exchange.previewDocumentImport('First sentence.\n\n  Second one.  \r\nThird.', 'source-only', meta);
  assert.deepEqual([src.ok, src.summary.itemCount], [true, 3]);
  const bi = await exchange.previewDocumentImport('Hello\t你好\nWorld\t世界', 'bilingual', meta);
  const stored = await exchange.commitDocumentImport(bi);
  assert.deepEqual(stored.payload.items.map((i) => i.referenceTranslation), ['你好', '世界']);
  // refusals
  assert.equal((await exchange.previewDocumentImport('', 'source-only', meta)).ok, false);
  assert.equal((await exchange.previewDocumentImport('only one column', 'bilingual', meta)).ok, false);
  assert.equal((await exchange.previewDocumentImport('x', 'source-only', { ...meta, title: ' ' })).ok, false);
  assert.equal((await exchange.previewDocumentImport('{bad', 'json')).ok, false);
  // export round trip
  const out = await exchange.exportDocument('doc-j');
  assert.equal(JSON.parse(out.text).documentType, 'quiz-studio.translation-document');
}));
