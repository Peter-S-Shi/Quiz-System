// typing-compare/1 (ADR 0004 section 8.3, 13.6, T-7, T-13): the comparison facts of a copy-typing attempt are derived
// only from the project's pinned Unicode semantics, are lossless about the verbatim texts, and are deterministic.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPARISON, applyErrors, compare } from '../web/src/task-domains/typing/compare.js';
import { clusters } from '../web/src/task-domains/unicode/graphemes.js';
import { nfc } from '../web/src/task-domains/unicode/normalize.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}';
const kinds = (r) => r.errors.map((e) => e.kind);

test('the comparison basis is named, versioned and explicit about offsets', () => {
  assert.deepEqual(COMPARISON, { version: 'typing-compare/1', normalization: 'NFC', segmentation: 'extended-grapheme-cluster', offsetEncoding: 'utf16-code-unit' });
  assert.ok(Object.isFrozen(COMPARISON));
});

test('identical texts have no errors; counts are grapheme counts', () => {
  const r = compare('environment', 'environment');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.counts, { referenceGraphemes: 11, committedGraphemes: 11 });
});

test('worked examples with committed literal spans (omission, substitution, insertion)', () => {
  assert.deepEqual(compare('environment', 'enviroment').errors, [
    { kind: 'omission', reference: { start: 6, end: 7 }, committed: { start: 6, end: 6 } },
  ]);
  assert.deepEqual(compare('cat', 'cut').errors, [
    { kind: 'substitution', reference: { start: 1, end: 2 }, committed: { start: 1, end: 2 } },
  ]);
  assert.deepEqual(compare('cat', 'cart').errors, [
    { kind: 'insertion', reference: { start: 2, end: 2 }, committed: { start: 2, end: 3 } },
  ]);
  // an incomplete copy: the missing tail is one omission span
  assert.deepEqual(compare('hello world', 'hello').errors, [
    { kind: 'omission', reference: { start: 5, end: 11 }, committed: { start: 5, end: 5 } },
  ]);
});

test('canonically equivalent input is not an error, and both texts are kept verbatim (NFC fidelity)', () => {
  const ref = 'café';
  const typed = 'café'; // NFD
  const r = compare(ref, typed);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.counts, { referenceGraphemes: 4, committedGraphemes: 4 });
  assert.equal(typed, 'café', 'compare never mutates or normalizes its inputs');
  assert.deepEqual(compare('각', '각').errors, [], 'Hangul syllable == jamo sequence');
});

test('multi-codepoint characters are single units: ZWJ family, flags, skin tone, Indic conjunct, CRLF', () => {
  assert.deepEqual(compare(FAMILY, FAMILY).counts, { referenceGraphemes: 1, committedGraphemes: 1 });
  const partial = compare(FAMILY, '\u{1F468}');
  assert.deepEqual(kinds(partial), ['substitution']);
  assert.deepEqual(partial.errors[0].reference, { start: 0, end: FAMILY.length }, 'the span covers the whole cluster, never half of it');
  assert.deepEqual(compare('\u{1F1E9}\u{1F1EA}\u{1F1EB}\u{1F1F7}', '\u{1F1E9}\u{1F1EA}').counts, { referenceGraphemes: 2, committedGraphemes: 1 });
  assert.deepEqual(kinds(compare('क्ष', 'कष')), ['substitution'], 'dropping the virama changes the conjunct');
  assert.deepEqual(compare('a\r\nb', 'a\r\nb').counts, { referenceGraphemes: 3, committedGraphemes: 3 });
  assert.deepEqual(compare('\u{1F44D}\u{1F3FD}', '\u{1F44D}').errors[0].kind, 'substitution');
});

test('spans are UTF-16 code units of the verbatim string and never split a surrogate pair', () => {
  const r = compare('a\u{1F600}b', 'a\u{1F601}b');
  assert.deepEqual(r.errors, [{ kind: 'substitution', reference: { start: 1, end: 3 }, committed: { start: 1, end: 3 } }]);
  const rtl = compare('مرحبا', 'مرحب');
  assert.deepEqual(rtl.errors, [{ kind: 'omission', reference: { start: 4, end: 5 }, committed: { start: 4, end: 4 } }]);
  assert.deepEqual(compare('你好', '你好').errors, []);
});

// ------------------------------------------------------------------------------------------ property test
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
const ALPHABET = ['a', 'b', 'e', ' ', 'n', 'é', 'é', '你', '각', '각', FAMILY, '\u{1F600}', '\u{1F1E9}\u{1F1EA}', 'क्ष', 'م', '\r\n', '\u{10400}'];

test('property: identity, cluster-aligned in-bounds ordered spans, edit replay, determinism (seeded)', () => {
  const rnd = rng(20261002);
  const pick = () => ALPHABET[Math.floor(rnd() * ALPHABET.length)];
  const gen = (n) => Array.from({ length: n }, pick).join('');
  for (let i = 0; i < 400; i += 1) {
    const ref = gen(Math.floor(rnd() * 14));
    const parts = clusters(ref);
    // a random edit script: delete / substitute / insert clusters
    const typed = parts.flatMap((p) => { const x = rnd(); return x < 0.12 ? [] : x < 0.24 ? [pick()] : x < 0.34 ? [p, pick()] : [p]; }).join('');
    const r = compare(ref, typed);
    assert.deepEqual(compare(ref, ref).errors, [], 'identity');
    const rb = new Set([0, ...clusters(ref).reduce((a, c) => [...a, a[a.length - 1] + c.length], [0])]);
    const cb = new Set([0, ...clusters(typed).reduce((a, c) => [...a, a[a.length - 1] + c.length], [0])]);
    let lastEnd = -1;
    for (const e of r.errors) {
      assert.ok(rb.has(e.reference.start) && rb.has(e.reference.end), `reference span on cluster boundaries: ${JSON.stringify(e)} in ${JSON.stringify(ref)}`);
      assert.ok(cb.has(e.committed.start) && cb.has(e.committed.end), 'committed span on cluster boundaries');
      assert.ok(e.reference.start <= e.reference.end && e.reference.end <= ref.length && e.committed.end <= typed.length, 'in bounds');
      assert.ok(e.reference.start > lastEnd || (lastEnd === -1), 'ordered and non-overlapping');
      lastEnd = e.reference.end;
      if (e.kind === 'omission') assert.equal(e.committed.start, e.committed.end);
      if (e.kind === 'insertion') assert.equal(e.reference.start, e.reference.end);
      if (e.kind === 'substitution') assert.ok(e.reference.end > e.reference.start && e.committed.end > e.committed.start);
    }
    assert.equal(nfc(applyErrors(ref, typed, r.errors)), nfc(typed), 'applying the recorded edits to the reference reproduces the committed text');
    assert.equal(JSON.stringify(compare(ref, typed)), JSON.stringify(r), 'deterministic');
  }
});

// ------------------------------------------------------------------------------------------ determinism (T-13)
test('canonical typing code never consults the host: no Intl.Segmenter, no String.prototype.normalize (static)', () => {
  const root = path.join(here, '..', 'web', 'src', 'task-domains');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const files = walk(root).filter((f) => f.endsWith('.js') && !f.endsWith('data.js'));
  assert.ok(files.length >= 3);
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/Intl\s*\.\s*Segmenter|\.normalize\s*\(|localeCompare|toLocale(Lower|Upper)Case/.test(src), `${path.basename(f)} must not use ambient Unicode behavior`);
  }
});

test('a deliberately divergent host (broken Intl.Segmenter and normalize) changes nothing', () => {
  const cases = [['café', 'café'], [FAMILY, '\u{1F468}'], ['क्ष', 'कष'], ['environment', 'enviroment']];
  const baseline = cases.map(([a, b]) => JSON.stringify(compare(a, b)));
  const seg = Intl.Segmenter;
  const norm = String.prototype.normalize;
  Intl.Segmenter = class { segment(s) { return [...s].map((c, index) => ({ segment: c, index })); } };
  String.prototype.normalize = function broken() { return String(this).toUpperCase(); };
  try {
    assert.deepEqual(cases.map(([a, b]) => JSON.stringify(compare(a, b))), baseline);
  } finally {
    Intl.Segmenter = seg;
    String.prototype.normalize = norm;
  }
});
