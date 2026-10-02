import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonical, hashHex } from '../web/src/canonical.js';

const vectors = JSON.parse(readFileSync(new URL('../../core/store/tests/fixtures/canonical-vectors.json', import.meta.url), 'utf8')).vectors;

test('JS canonical text and SHA-256 equal the checked-in cross-language vectors', async () => {
  assert.ok(vectors.length >= 100);
  for (const [i, v] of vectors.entries()) {
    assert.equal(canonical(v.value), v.canonical, `vector ${i}`);
    assert.equal(await hashHex(v.value), v.sha256, `vector ${i}`);
  }
});

test('object keys sort by code point, not UTF-16 code unit', () => {
  // U+10000 is a surrogate pair (0xD800...) in UTF-16 but sorts AFTER U+FFFF by code point
  assert.equal(canonical({ '\u{10000}': 1, '￿': 2 }), '{"￿":2,"\u{10000}":1}');
});

test('numbers use ECMAScript formatting and -0 is 0', () => {
  assert.equal(canonical([1.0, 1e0, -0, 0.5, 1e-7, 123456.789]), '[1,1,0,0.5,1e-7,123456.789]');
});

test('integers beyond the safe range are refused (they must travel as strings, ADR 0001 A4)', () => {
  assert.throws(() => canonical({ n: 2 ** 53 }), RangeError);
  assert.doesNotThrow(() => canonical({ n: '9007199254740993' }));
  assert.throws(() => canonical({ n: Number.NaN }), TypeError);
  assert.throws(() => canonical({ f() {} }), TypeError);
});

test('strings are never normalized', async () => {
  assert.notEqual(await hashHex({ s: 'é' }), await hashHex({ s: 'é' }));
});
