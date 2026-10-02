// typing-compare/1 scalability (ADR 0004 section 8.3): a long, mostly-correct transcription with a few dispersed errors
// must finalize without a full O(n*m) alignment matrix, and the result must be byte-identical to the frozen rules
// (prefix/suffix trim, minimum edit distance, diagonal > omission > insertion on a tie). The quadratic reference below is
// an independent copy of the original full-matrix algorithm and is only used as the oracle for the differential test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPARISON, MAX_ALIGNMENT_CELLS, TypingCompareError, alignKeys, applyErrors, compare } from '../web/src/task-domains/typing/compare.js';
import { clusters } from '../web/src/task-domains/unicode/graphemes.js';
import { nfc } from '../web/src/task-domains/unicode/normalize.js';

function referenceAlign(a, b) {
  let lo = 0;
  while (lo < a.length && lo < b.length && a[lo] === b[lo]) lo += 1;
  let ea = a.length; let eb = b.length;
  while (ea > lo && eb > lo && a[ea - 1] === b[eb - 1]) { ea -= 1; eb -= 1; }
  const n = ea - lo; const m = eb - lo;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const dir = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let j = 1; j <= m; j += 1) { dp[0][j] = j; dir[0][j] = 3; }
  for (let i = 1; i <= n; i += 1) {
    dp[i][0] = i; dir[i][0] = 2;
    for (let j = 1; j <= m; j += 1) {
      const diag = dp[i - 1][j - 1] + (a[lo + i - 1] === b[lo + j - 1] ? 0 : 1);
      const omit = dp[i - 1][j] + 1; const ins = dp[i][j - 1] + 1;
      if (diag <= omit && diag <= ins) { dp[i][j] = diag; dir[i][j] = 1; } else if (omit <= ins) { dp[i][j] = omit; dir[i][j] = 2; } else { dp[i][j] = ins; dir[i][j] = 3; }
    }
  }
  const mid = []; let i = n; let j = m;
  while (i > 0 || j > 0) {
    const d = dir[i][j];
    if (d === 1) { mid.push(a[lo + i - 1] === b[lo + j - 1] ? 'm' : 's'); i -= 1; j -= 1; } else if (d === 2) { mid.push('o'); i -= 1; } else { mid.push('i'); j -= 1; }
  }
  return [...new Array(lo).fill('m'), ...mid.reverse(), ...new Array(a.length - ea).fill('m')];
}

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

/** A long deterministic prose-like text of about `graphemes` clusters (varied, with repeats and multi-codepoint units). */
function longText(graphemes, seed = 7) {
  const rnd = rng(seed);
  const words = ['the', 'environment', 'matters', 'learning', 'by', 'copying', 'careful', 'text', 'café', '你好', 'क्ष', '\u{1F468}‍\u{1F469}‍\u{1F467}', 'and', 'of', 'to', 'practice'];
  let out = '';
  while (clusters(out).length < graphemes) out += `${words[Math.floor(rnd() * words.length)]}${rnd() < 0.15 ? '.\n' : ' '}`;
  return out;
}

test('regression: ~7500 graphemes with a few far-apart edits finalize (no COMPARE_TOO_LARGE), exactly and fast', () => {
  const ref = longText(7500);
  const parts = clusters(ref);
  assert.ok(parts.length >= 7500);
  // first-region substitution, mid omission, mid insertion, last-region substitution: the common prefix/suffix is tiny
  const typed = parts.map((p, i) => (i === 3 ? 'Z' : i === 2500 ? '' : i === 5000 ? `${p}Q` : i === parts.length - 4 ? 'Y' : p)).join('');
  const t0 = Date.now();
  const r = compare(ref, typed);
  assert.ok(Date.now() - t0 < 3000, `bounded time (${Date.now() - t0} ms)`);
  assert.deepEqual(r.errors.map((e) => e.kind), ['substitution', 'omission', 'insertion', 'substitution']);
  assert.equal(nfc(applyErrors(ref, typed, r.errors)), nfc(typed), 'error replay');
  assert.equal(JSON.stringify(compare(ref, typed)), JSON.stringify(r), 'deterministic');
  // literal spans for the first error: the 4th cluster of the reference replaced by "Z"
  const start = parts.slice(0, 3).join('').length;
  assert.deepEqual(r.errors[0], { kind: 'substitution', reference: { start, end: start + parts[3].length }, committed: { start, end: start + 1 } });
});

test('an incomplete long copy (a missing tail) and a long copy with a missing head both stay linear', () => {
  const ref = longText(9000, 11);
  const parts = clusters(ref);
  const tail = compare(ref, parts.slice(0, 6000).join(''));
  assert.deepEqual(tail.errors.map((e) => e.kind), ['omission']);
  const head = compare(ref, parts.slice(500).join(''));
  assert.deepEqual(head.errors.map((e) => e.kind), ['omission']);
  assert.deepEqual(head.errors[0].reference, { start: 0, end: parts.slice(0, 500).join('').length });
});

test('differential: the band-limited alignment equals the full-matrix reference on random inputs (including forced band doubling)', () => {
  const rnd = rng(20261003);
  const alpha = ['a', 'b', 'c', 'd'];
  const gen = (n) => Array.from({ length: n }, () => alpha[Math.floor(rnd() * alpha.length)]);
  for (let t = 0; t < 1500; t += 1) {
    const a = gen(Math.floor(rnd() * 70));
    // sometimes similar (few edits), sometimes unrelated (many edits, forcing the band to grow)
    const similar = rnd() < 0.5;
    const b = similar
      ? a.flatMap((x) => { const q = rnd(); return q < 0.04 ? [] : q < 0.08 ? [alpha[Math.floor(rnd() * 4)]] : q < 0.12 ? [x, alpha[Math.floor(rnd() * 4)]] : [x]; })
      : gen(Math.floor(rnd() * 70));
    assert.deepEqual(alignKeys(a, b), referenceAlign(a, b), `${a.join('')} vs ${b.join('')}`);
  }
  // degenerate shapes
  for (const [a, b] of [[[], []], [['a'], []], [[], ['a']], [['a', 'b'], ['b', 'a']], [gen(40), []], [[], gen(40)], [gen(60), gen(3)]]) assert.deepEqual(alignKeys(a, b), referenceAlign(a, b));
});

test('differential at scale: long mostly-similar inputs agree with the full-matrix reference (ties included)', () => {
  const rnd = rng(99);
  const alpha = ['a', 'b'];
  const gen = (n) => Array.from({ length: n }, () => alpha[Math.floor(rnd() * 2)]); // a 2-letter alphabet maximizes tie ambiguity
  for (let t = 0; t < 6; t += 1) {
    const a = gen(900);
    const b = a.filter((_, i) => i % 211 !== 17).map((x, i) => (i % 307 === 5 ? (x === 'a' ? 'b' : 'a') : x));
    assert.deepEqual(alignKeys(a, b), referenceAlign(a, b));
  }
});

test('bounded resource behavior: an unrelated long pair still fails closed, quickly, with the stable error code', () => {
  const ref = longText(8000, 1);
  const other = longText(8000, 2);
  const t0 = Date.now();
  assert.throws(() => compare(ref, other), (e) => e instanceof TypingCompareError && e.code === 'COMPARE_TOO_LARGE');
  assert.ok(Date.now() - t0 < 5000, 'the guard trips on the band size, it does not grind');
  assert.ok(Number.isInteger(MAX_ALIGNMENT_CELLS) && MAX_ALIGNMENT_CELLS > 0);
});

test('the comparison version and the frozen rules are unchanged', () => {
  assert.equal(COMPARISON.version, 'typing-compare/1');
  // worked tie-break examples from the frozen rules still hold: diagonal over omission over insertion
  assert.deepEqual(compare('ab', 'ba').errors.map((e) => e.kind), ['substitution']);
  assert.deepEqual(compare('aa', 'a').errors, [{ kind: 'omission', reference: { start: 1, end: 2 }, committed: { start: 1, end: 1 } }]);
});
