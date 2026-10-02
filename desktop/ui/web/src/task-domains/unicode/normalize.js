// NFC / NFD over the project's pinned tables (data.js). Deliberately does NOT call String.prototype.normalize:
// the host's normalization is not version-pinned (ADR 0004 section 8.3).
import { CCC_RANGES, COMPOSITIONS, DECOMPOSITIONS } from './data.js';

const S_BASE = 0xac00;
const L_BASE = 0x1100;
const V_BASE = 0x1161;
const T_BASE = 0x11a7;
const L_COUNT = 19;
const V_COUNT = 21;
const T_COUNT = 28;
const N_COUNT = V_COUNT * T_COUNT;
const S_COUNT = L_COUNT * N_COUNT;

let decomposition = null;
let composition = null;

function build() {
  decomposition = new Map();
  for (let i = 0; i < DECOMPOSITIONS.length;) {
    const len = DECOMPOSITIONS[i];
    decomposition.set(DECOMPOSITIONS[i + 1], DECOMPOSITIONS.slice(i + 2, i + 2 + len));
    i += 2 + len;
  }
  composition = new Map();
  for (let i = 0; i < COMPOSITIONS.length; i += 3) composition.set(COMPOSITIONS[i] * 0x200000 + COMPOSITIONS[i + 1], COMPOSITIONS[i + 2]);
}

/** Canonical combining class of a code point (binary search over the pinned ranges). */
export function combiningClass(cp) {
  let lo = 0;
  let hi = CCC_RANGES.length / 3 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = CCC_RANGES[mid * 3];
    if (cp < s) hi = mid - 1;
    else if (cp > CCC_RANGES[mid * 3 + 1]) lo = mid + 1;
    else return CCC_RANGES[mid * 3 + 2];
  }
  return 0;
}

function decomposeInto(cp, out) {
  if (cp >= S_BASE && cp < S_BASE + S_COUNT) {
    const s = cp - S_BASE;
    out.push(L_BASE + Math.floor(s / N_COUNT), V_BASE + Math.floor((s % N_COUNT) / T_COUNT));
    if (s % T_COUNT) out.push(T_BASE + (s % T_COUNT));
    return;
  }
  const d = decomposition.get(cp);
  if (!d) { out.push(cp); return; }
  for (const x of d) decomposeInto(x, out);
}

function toCodePoints(s) {
  const out = [];
  for (const ch of s) out.push(ch.codePointAt(0));
  return out;
}

function canonicalOrder(cps) {
  for (let i = 0; i < cps.length;) {
    if (combiningClass(cps[i]) === 0) { i += 1; continue; }
    let j = i;
    while (j < cps.length && combiningClass(cps[j]) !== 0) j += 1;
    const run = cps.slice(i, j).map((cp, k) => ({ cp, k, c: combiningClass(cp) }));
    run.sort((a, b) => a.c - b.c || a.k - b.k); // stable
    for (let k = 0; k < run.length; k += 1) cps[i + k] = run[k].cp;
    i = j;
  }
}

function decompose(s) {
  if (!decomposition) build();
  const cps = [];
  for (const cp of toCodePoints(s)) decomposeInto(cp, cps);
  canonicalOrder(cps);
  return cps;
}

function pair(first, second) {
  if (first >= L_BASE && first < L_BASE + L_COUNT && second >= V_BASE && second < V_BASE + V_COUNT) {
    return S_BASE + ((first - L_BASE) * V_COUNT + (second - V_BASE)) * T_COUNT;
  }
  if (first >= S_BASE && first < S_BASE + S_COUNT && (first - S_BASE) % T_COUNT === 0 && second > T_BASE && second < T_BASE + T_COUNT) {
    return first + (second - T_BASE);
  }
  return composition.get(first * 0x200000 + second);
}

export function nfd(s) {
  return String.fromCodePoint(...decompose(s));
}

export function nfc(s) {
  const cps = decompose(s);
  const out = [];
  let starter = -1;
  for (const c of cps) {
    const cc = combiningClass(c);
    if (starter >= 0) {
      const lastIndex = out.length - 1;
      const adjacent = lastIndex === starter;
      if (adjacent || combiningClass(out[lastIndex]) < cc) {
        const composite = pair(out[starter], c);
        if (composite !== undefined) { out[starter] = composite; continue; }
      }
    }
    if (cc === 0) starter = out.length;
    out.push(c);
  }
  return String.fromCodePoint(...out);
}
