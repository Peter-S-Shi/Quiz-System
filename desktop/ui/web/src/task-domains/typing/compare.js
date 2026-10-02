// typing-compare/1 (ADR 0004 section 8.3): the frozen, project-controlled comparison of a copy-typing attempt.
//
//   1. both texts are cut into extended grapheme clusters by the pinned UAX #29 segmentation (never Intl.Segmenter);
//   2. two clusters are equal iff their pinned-NFC forms are equal (never String.prototype.normalize);
//   3. the common leading and trailing clusters are trimmed, and the middle is aligned by minimum edit distance
//      (substitution, omission, insertion each cost 1); on a tie the backtrace from the end prefers, in order,
//      the diagonal step (match or substitution), then an omission, then an insertion;
//   4. each maximal run of non-matching steps is ONE error: `substitution` (both sides non-empty), `omission`
//      (only the reference has clusters) or `insertion` (only the committed text has clusters).
//
// Spans are UTF-16 code-unit offsets into the VERBATIM strings and always start and end on a cluster boundary of
// their own string. Neither input is normalized, trimmed or otherwise altered. Changing any rule above is a new
// comparison version (a new ADR-level decision that applies only to NEW attempts).
import { graphemeBoundaries } from '../unicode/graphemes.js';
import { nfc } from '../unicode/normalize.js';

export const COMPARISON = Object.freeze({
  version: 'typing-compare/1',
  normalization: 'NFC',
  segmentation: 'extended-grapheme-cluster',
  offsetEncoding: 'utf16-code-unit',
});

/**
 * The most direction cells typing-compare/1 will store while aligning; above it finalization fails closed
 * (`COMPARE_TOO_LARGE`). The alignment is band-limited (below), so this bounds distance x length, not length squared:
 * a long, mostly-correct transcription is cheap, and only a long text with very many errors reaches the limit.
 */
export const MAX_ALIGNMENT_CELLS = 36_000_000;
/** The first half-width of the alignment band; it doubles until the optimum fits (an implementation detail, not a rule). */
const INITIAL_BAND = 32;

export class TypingCompareError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'TypingCompareError';
    this.code = code;
  }
}

function segment(text) {
  const bounds = graphemeBoundaries(text);
  const keys = [];
  for (let i = 0; i + 1 < bounds.length; i += 1) keys.push(nfc(text.slice(bounds[i], bounds[i + 1])));
  return { bounds, keys };
}

const DIAG = 1;
const OMIT = 2;
const INSERT = 3;

const INF = 0xffffffff;

/**
 * Minimum-edit-distance alignment of the (already trimmed) middle `a[lo..lo+n)` x `b[lo..lo+m)` restricted to the band
 * |i - j| <= k. If the optimum is <= k every optimal path lies inside the band and every cell on it holds its exact
 * value, while any predecessor outside the band is > k and can neither win nor tie, so the stored directions (and
 * therefore the tie-break) are exactly those of the full matrix. Returns null when the optimum exceeds k.
 */
function alignBand(a, b, lo, n, m, k) {
  const width = Math.min(2 * k + 1, m + 1);
  const dir = new Uint8Array((n + 1) * width);
  const left = (i) => (i > k ? i - k : 0); // first stored column of row i
  let prev = new Uint32Array(m + 2).fill(INF);
  let cur = new Uint32Array(m + 2).fill(INF);
  for (let j = 0; j <= Math.min(m, k); j += 1) { prev[j] = j; dir[j] = j === 0 ? 0 : INSERT; }
  for (let i = 1; i <= n; i += 1) {
    const jl = left(i);
    const jh = Math.min(m, i + k);
    if (jl > 0) cur[jl - 1] = INF; // a stale value from two rows ago must not act as the left neighbour
    const base = i * width - jl;
    for (let j = jl; j <= jh; j += 1) {
      if (j === 0) { cur[0] = i; dir[base] = OMIT; continue; }
      const diag = prev[j - 1] + (a[lo + i - 1] === b[lo + j - 1] ? 0 : 1);
      const omit = prev[j] + 1;
      const insert = cur[j - 1] + 1;
      // the stored direction is the backtrace preference: diagonal, then omission, then insertion
      if (diag <= omit && diag <= insert) { cur[j] = diag; dir[base + j] = DIAG; } else if (omit <= insert) { cur[j] = omit; dir[base + j] = OMIT; } else { cur[j] = insert; dir[base + j] = INSERT; }
    }
    if (jh < m) cur[jh + 1] = INF;
    [prev, cur] = [cur, prev];
  }
  if (prev[m] > k) return null;
  const middle = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const d = dir[i * width + (j - left(i))];
    if (d === DIAG) { middle.push(a[lo + i - 1] === b[lo + j - 1] ? 'm' : 's'); i -= 1; j -= 1; } else if (d === OMIT) { middle.push('o'); i -= 1; } else { middle.push('i'); j -= 1; }
  }
  return middle.reverse();
}

/**
 * Alignment steps over the cluster keys: 'm' match, 's' substitution, 'o' omission, 'i' insertion (left to right).
 * Exported for the conformance tests, which compare it with an independent full-matrix reference.
 */
export function alignKeys(a, b) {
  let lo = 0;
  while (lo < a.length && lo < b.length && a[lo] === b[lo]) lo += 1;
  let ea = a.length;
  let eb = b.length;
  while (ea > lo && eb > lo && a[ea - 1] === b[eb - 1]) { ea -= 1; eb -= 1; }
  const n = ea - lo;
  const m = eb - lo;
  let middle = [];
  if (n === 0) middle = new Array(m).fill('i');
  else if (m === 0) middle = new Array(n).fill('o');
  else {
    // the band must contain the end cell (|n - m| <= k); it doubles until the optimum fits (at k >= max(n, m) it always does)
    for (let k = Math.max(INITIAL_BAND, Math.abs(n - m)); ; k *= 2) {
      if ((n + 1) * Math.min(2 * k + 1, m + 1) > MAX_ALIGNMENT_CELLS) throw new TypingCompareError('COMPARE_TOO_LARGE', `aligning ${n} x ${m} clusters needs more than ${MAX_ALIGNMENT_CELLS} cells`);
      middle = alignBand(a, b, lo, n, m, k);
      if (middle) break;
    }
  }
  return [...new Array(lo).fill('m'), ...middle, ...new Array(a.length - ea).fill('m')];
}

/**
 * @param {string} reference verbatim reference text
 * @param {string} committed verbatim committed text
 * @returns {{counts: {referenceGraphemes: number, committedGraphemes: number}, errors: object[]}}
 */
export function compare(reference, committed) {
  const r = segment(reference);
  const c = segment(committed);
  const steps = alignKeys(r.keys, c.keys);
  const errors = [];
  let ri = 0;
  let ci = 0;
  let open = null;
  const close = () => {
    if (!open) return;
    const refEmpty = open.r0 === open.r1;
    const comEmpty = open.c0 === open.c1;
    errors.push({
      kind: refEmpty ? 'insertion' : comEmpty ? 'omission' : 'substitution',
      reference: { start: r.bounds[open.r0], end: r.bounds[open.r1] },
      committed: { start: c.bounds[open.c0], end: c.bounds[open.c1] },
    });
    open = null;
  };
  for (const s of steps) {
    if (s === 'm') { close(); ri += 1; ci += 1; continue; }
    if (!open) open = { r0: ri, r1: ri, c0: ci, c1: ci };
    if (s === 's') { ri += 1; ci += 1; } else if (s === 'o') ri += 1; else ci += 1;
    open.r1 = ri;
    open.c1 = ci;
  }
  close();
  return { counts: { referenceGraphemes: r.keys.length, committedGraphemes: c.keys.length }, errors };
}

/** Replays recorded errors: the reference with every error's reference span replaced by its committed span. */
export function applyErrors(reference, committed, errors) {
  let out = '';
  let at = 0;
  for (const e of errors) {
    out += reference.slice(at, e.reference.start) + committed.slice(e.committed.start, e.committed.end);
    at = e.reference.end;
  }
  return out + reference.slice(at);
}
