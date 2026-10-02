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

/** The largest alignment middle (cells) typing-compare/1 will compute; above it finalization fails closed. */
export const MAX_ALIGNMENT_CELLS = 36_000_000;

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

/** Alignment steps over the clusters: 'm' match, 's' substitution, 'o' omission, 'i' insertion (left to right). */
function align(a, b) {
  let lo = 0;
  while (lo < a.length && lo < b.length && a[lo] === b[lo]) lo += 1;
  let ea = a.length;
  let eb = b.length;
  while (ea > lo && eb > lo && a[ea - 1] === b[eb - 1]) { ea -= 1; eb -= 1; }
  const n = ea - lo;
  const m = eb - lo;
  const steps = new Array(lo).fill('m');
  if (n * m > MAX_ALIGNMENT_CELLS) throw new TypingCompareError('COMPARE_TOO_LARGE', `alignment of ${n} x ${m} clusters exceeds the typing-compare/1 limit`);
  const dir = new Uint8Array((n + 1) * (m + 1));
  let prev = new Uint32Array(m + 1);
  let cur = new Uint32Array(m + 1);
  for (let j = 1; j <= m; j += 1) { prev[j] = j; dir[j] = INSERT; }
  for (let i = 1; i <= n; i += 1) {
    cur[0] = i;
    dir[i * (m + 1)] = OMIT;
    for (let j = 1; j <= m; j += 1) {
      const diag = prev[j - 1] + (a[lo + i - 1] === b[lo + j - 1] ? 0 : 1);
      const omit = prev[j] + 1;
      const insert = cur[j - 1] + 1;
      // the stored direction is the backtrace preference: diagonal, then omission, then insertion
      if (diag <= omit && diag <= insert) { cur[j] = diag; dir[i * (m + 1) + j] = DIAG; } else if (omit <= insert) { cur[j] = omit; dir[i * (m + 1) + j] = OMIT; } else { cur[j] = insert; dir[i * (m + 1) + j] = INSERT; }
    }
    [prev, cur] = [cur, prev];
  }
  const middle = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const d = dir[i * (m + 1) + j];
    if (d === DIAG) { middle.push(a[lo + i - 1] === b[lo + j - 1] ? 'm' : 's'); i -= 1; j -= 1; } else if (d === OMIT) { middle.push('o'); i -= 1; } else { middle.push('i'); j -= 1; }
  }
  middle.reverse();
  steps.push(...middle);
  for (let k = 0; k < a.length - ea; k += 1) steps.push('m');
  return steps;
}

/**
 * @param {string} reference verbatim reference text
 * @param {string} committed verbatim committed text
 * @returns {{counts: {referenceGraphemes: number, committedGraphemes: number}, errors: object[]}}
 */
export function compare(reference, committed) {
  const r = segment(reference);
  const c = segment(committed);
  const steps = align(r.keys, c.keys);
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
