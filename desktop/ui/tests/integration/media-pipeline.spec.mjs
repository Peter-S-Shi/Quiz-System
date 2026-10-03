// The formal media pipeline over the REAL store: bytes in (media.put), content addressing, bounded chunked reads back
// out (media.read), type checks, and a paper that references media (projection + foreign key) - all path-free.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MediaError, bytesToBase64, base64ToBytes, fetchMedia, mimeMatchesKind, storeMedia } from '../../web/src/media/media-source.js';
import { putOp } from '../../web/src/projection.js';
import { paperWithExplanations } from '../objective-fixtures.mjs';
import { withEnv } from './env.mjs';

const synthetic = (n, seed = 7) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) % 251);

test('base64 helpers round-trip arbitrary bytes', () => {
  for (const n of [1, 2, 3, 4, 100, 70000]) assert.deepEqual(base64ToBytes(bytesToBase64(synthetic(n))), synthetic(n));
});

test('mimeMatchesKind separates images from audio', () => {
  assert.ok(mimeMatchesKind('image', 'image/png') && mimeMatchesKind('audio', 'audio/mpeg'));
  assert.ok(!mimeMatchesKind('image', 'audio/mpeg') && !mimeMatchesKind('audio', 'image/png') && !mimeMatchesKind('image', 'text/html') && !mimeMatchesKind('image', undefined));
});

test('store -> fetch round trip across several chunks, deduplicated by content', withEnv(async (e) => {
  const bytes = synthetic(2_500_000); // > two 1 MiB chunks
  const ref = await storeMedia(e.port, { name: 'figure.png', mimeType: 'image/png', bytes });
  assert.match(ref.id, /^media-[0-9a-f]{16}$/);
  const back = await fetchMedia(e.port, ref.id);
  assert.equal(back.mimeType, 'image/png');
  assert.equal(back.size, 2_500_000);
  assert.deepEqual(back.bytes, bytes, 'byte for byte');
  const again = await storeMedia(e.port, { name: 'other-name.png', mimeType: 'image/png', bytes });
  assert.equal(again.id, ref.id);
  assert.equal(again.deduplicated, true);
  assert.equal(await e.port.count('media_object'), 1);
}));

test('refusals: empty, unsupported type, unknown id', withEnv(async (e) => {
  await assert.rejects(() => storeMedia(e.port, { name: 'x', mimeType: 'image/png', bytes: new Uint8Array(0) }), (err) => err instanceof MediaError && err.code === 'MEDIA_EMPTY');
  await assert.rejects(() => storeMedia(e.port, { name: 'x', mimeType: 'text/html', bytes: synthetic(10) }), (err) => err.code === 'MEDIA_TYPE');
  await assert.rejects(() => fetchMedia(e.port, 'media-nope'), (err) => err.code === 'MEDIA_MISSING');
}));

test('a paper may reference stored media; an unknown media id is refused by the store', withEnv(async (e) => {
  const ref = await storeMedia(e.port, { name: 'figure.png', mimeType: 'image/png', bytes: synthetic(3000) });
  const paper = paperWithExplanations({ id: 'paper-with-media' });
  paper.questions[0].image = { id: ref.id, name: ref.name, mimeType: ref.mimeType, alt: 'a synthetic figure' };
  await e.port.commit({ ops: [putOp(e.spec('paper'), paper.id, paper)] });
  const [row] = await e.port.read('paper', { id: paper.id });
  assert.equal(row.payload.questions[0].image.id, ref.id);
  const dangling = paperWithExplanations({ id: 'paper-dangling' });
  dangling.questions[0].image = { id: 'media-missing' };
  await assert.rejects(() => e.port.commit({ ops: [putOp(e.spec('paper'), dangling.id, dangling)] }), /FOREIGN|REFERENCE|constraint|REJECT/i);
}));
