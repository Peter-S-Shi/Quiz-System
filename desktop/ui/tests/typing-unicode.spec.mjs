// typing-compare/1 foundation (ADR 0004 section 8.3, 13.6): the project-controlled, version-pinned NFC and extended
// grapheme segmentation. Conformance is proved against the OFFICIAL Unicode test suites of the pinned version
// (committed under tests/fixtures/unicode-16.0.0), never against the host's Intl.Segmenter / String.normalize.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { UNICODE_VERSION } from '../web/src/task-domains/unicode/data.js';
import { nfc, nfd } from '../web/src/task-domains/unicode/normalize.js';
import { clusters, graphemeBoundaries } from '../web/src/task-domains/unicode/graphemes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = path.join(here, 'fixtures', 'unicode-16.0.0');
const str = (hexes) => String.fromCodePoint(...hexes.trim().split(/\s+/).filter(Boolean).map((h) => parseInt(h, 16)));

test('the pinned data names its Unicode version', () => {
  assert.equal(UNICODE_VERSION, '16.0.0');
});

test('GraphemeBreakTest.txt (official, Unicode 16.0.0): every line segments exactly as specified', () => {
  const lines = fs.readFileSync(path.join(fx, 'GraphemeBreakTest.txt'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  assert.ok(lines.length > 700, `suite present (${lines.length} cases)`);
  let checked = 0;
  for (const line of lines) {
    const body = line.split('#')[0].trim();
    const tokens = body.split(/\s+/);
    let text = '';
    const expected = [0];
    for (const tok of tokens) {
      if (tok === '÷') { if (text.length) expected.push(text.length); } else if (tok === '×') { /* no break */ } else text += String.fromCodePoint(parseInt(tok, 16));
    }
    const want = [...new Set(expected)];
    assert.deepEqual(graphemeBoundaries(text), want, body);
    checked += 1;
  }
  assert.equal(checked, lines.length);
});

test('NormalizationTest.txt (official, Unicode 16.0.0): NFC and NFD hold for every case', () => {
  const lines = zlib.gunzipSync(fs.readFileSync(path.join(fx, 'NormalizationTest.txt.gz'))).toString('utf8').split('\n');
  let n = 0;
  for (const line of lines) {
    if (!line || line.startsWith('#') || line.startsWith('@')) continue;
    const [c1, c2, c3, c4, c5] = line.split('#')[0].split(';').slice(0, 5).map(str);
    // NFC: c2 == NFC(c1) == NFC(c2) == NFC(c3); c4 == NFC(c4) == NFC(c5)
    for (const c of [c1, c2, c3]) assert.equal(nfc(c), c2, `NFC of ${[...c].map((x) => x.codePointAt(0).toString(16))} in ${line}`);
    for (const c of [c4, c5]) assert.equal(nfc(c), c4, `NFC(c4/c5) in ${line}`);
    // NFD: c3 == NFD(c1) == NFD(c2) == NFD(c3); c5 == NFD(c4) == NFD(c5)
    for (const c of [c1, c2, c3]) assert.equal(nfd(c), c3, `NFD in ${line}`);
    for (const c of [c4, c5]) assert.equal(nfd(c), c5, `NFD(c4/c5) in ${line}`);
    n += 1;
  }
  assert.ok(n > 18000, `suite present (${n} cases)`);
});

test('worked examples (independent literals, not recomputed)', () => {
  assert.equal(nfc('é'), 'é');
  assert.equal(nfd('é'), 'é');
  assert.equal(nfc('각'), '각', 'Hangul jamo compose algorithmically');
  assert.equal(nfd('각'), '각');
  assert.equal(nfc('ạ̇'), 'ạ̇', 'canonical ordering: dot-below sorts before dot-above, then composes');
  assert.equal(nfc('plain ASCII'), 'plain ASCII');
  assert.deepEqual(clusters('éx'), ['é', 'x']);
  assert.deepEqual(clusters('\u{1F468}‍\u{1F469}‍\u{1F467}'), ['\u{1F468}‍\u{1F469}‍\u{1F467}'], 'ZWJ family is one cluster');
  assert.deepEqual(clusters('\u{1F1E9}\u{1F1EA}\u{1F1EB}\u{1F1F7}'), ['\u{1F1E9}\u{1F1EA}', '\u{1F1EB}\u{1F1F7}'], 'two flags');
  assert.deepEqual(clusters('क्ष'), ['क्ष'], 'Devanagari conjunct (InCB) is one cluster');
  assert.deepEqual(clusters('a\r\nb'), ['a', '\r\n', 'b']);
  assert.deepEqual(clusters('\u{1F44D}\u{1F3FD}'), ['\u{1F44D}\u{1F3FD}'], 'emoji + skin tone modifier');
});

test('boundaries are UTF-16 code-unit offsets that never split a surrogate pair', () => {
  const s = 'a\u{1F600}b\u{10400}';
  assert.deepEqual(graphemeBoundaries(s), [0, 1, 3, 4, 6]);
  assert.deepEqual(graphemeBoundaries(''), [0]);
});
