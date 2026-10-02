// Generates deterministic canonical-JSON test vectors (value, canonical text, SHA-256) with the JS
// implementation. The Rust store verifies the same vectors (canonical text, hash, and a full round trip
// through the database), proving JS <-> Rust <-> DB fidelity (ADR 0001 H2 method).
//
//   node desktop/scripts/gen-canonical-vectors.mjs <count> <out.json> [seed]
//
// Edge fixtures are always included; <count> adds seeded random values. Synthetic data only.

import { writeFileSync } from 'node:fs';
import { canonical, hashHex } from '../ui/web/src/canonical.js';

const [, , countArg = '150', outArg = 'canonical-vectors.json', seedArg = '20261002'] = process.argv;

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(Number(seedArg));
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo));
const pick = (xs) => xs[int(0, xs.length)];

const CHARS = [
  'a', 'Z', '0', ' ', '"', '\\', '/', '\n', '\t', '\u0000', '\u001f', '\u007f', ' ', ' ',
  'é', 'é', '你', '好', 'あ', '한', 'क्ष',
  '\u{1f469}‍\u{1f4bb}', '\u{1f1ef}\u{1f1f5}', '\u{10000}', '\u{10ffff}', '￿', '', 'ß', 'İ',
];
const str = () => Array.from({ length: int(0, 8) }, () => pick(CHARS)).join('');

// integer-valued numbers beyond the JS safe range cannot be sent (ADR 0001 A4: they travel as strings)
const safe = (x) => (Number.isInteger(x) && !Number.isSafeInteger(x) ? 0.5 : x);

function num() {
  return safe(rawNum());
}

function rawNum() {
  switch (int(0, 6)) {
    case 0: return int(-1000, 1000);
    case 1: return (rnd() - 0.5) * 2 ** int(0, 60);
    case 2: return Number(`${int(1, 9)}e${int(-30, 30)}`);
    case 3: return pick([0, -0, 1, -1, 0.1 + 0.2, 1e-7, 5e-324, 1.5e-300, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]);
    case 4: return rnd();
    default: return int(-(2 ** 31), 2 ** 31);
  }
}

function value(depth = 0) {
  const k = depth > 3 ? int(0, 5) : int(0, 7);
  switch (k) {
    case 0: return null;
    case 1: return rnd() < 0.5;
    case 2: case 3: return num();
    case 4: return str();
    case 5: return Array.from({ length: int(0, 5) }, () => value(depth + 1));
    default: {
      const o = {};
      for (let i = int(0, 5); i > 0; i -= 1) o[str()] = value(depth + 1);
      return o;
    }
  }
}

const edge = [
  {},
  [],
  { a: 1, b: 2 },
  { b: 2, a: 1 },
  { '\u{10000}': 1, '￿': 2, '': 3, a: 4 }, // code point order differs from UTF-16 order
  { z: [3, 1, 2], y: { x: null } },
  { n: [1.0, 1, 1e0, -0, 0.5, 1e-7, 0.000001, 5e-324, 1.5e-300, 123456.789, Number.MAX_SAFE_INTEGER] },
  { s: ['é', 'é', ' ', '\u0000', '\u001f', '\u007f', '"\\/'] },
  { big: '9007199254740993', ok: Number.MAX_SAFE_INTEGER },
  { extensions: { 'vendor.x': { deep: [1, [2, [3, { k: 'v' }]]] } }, unknownFutureField: true },
  { emoji: '\u{1f469}‍\u{1f4bb}', flag: '\u{1f1ef}\u{1f1f5}', hangul: '한', indic: 'क्ष' },
  { arr: [[], {}, [[]], [{}], null, false, true, '', 0] },
];

const out = [];
for (const v of edge) out.push(v);
for (let i = 0; i < Number(countArg); i += 1) out.push(value());
const vectors = [];
for (const v of out) {
  const wrapped = v !== null && typeof v === 'object' && !Array.isArray(v) ? v : { v };
  vectors.push({ value: wrapped, canonical: canonical(wrapped), sha256: await hashHex(wrapped) });
}
writeFileSync(outArg, JSON.stringify({ generator: 'gen-canonical-vectors.mjs', seed: Number(seedArg), vectors }));
console.log(`wrote ${vectors.length} vectors to ${outArg}`);
