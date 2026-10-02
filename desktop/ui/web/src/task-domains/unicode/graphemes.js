// Extended grapheme cluster segmentation (UAX #29 rules GB1-GB999 incl. GB9c, Unicode 16.0.0) over the project's pinned
// tables (data.js). Deliberately does NOT call Intl.Segmenter: the host's segmentation is not version-pinned
// (ADR 0004 section 8.3). Boundaries are UTF-16 code-unit offsets and never split a surrogate pair.
import { EXTENDED_PICTOGRAPHIC_RANGES, GCB_CLASSES, GCB_RANGES, INCB_CLASSES, INCB_RANGES } from './data.js';

const C = Object.fromEntries(GCB_CLASSES.map((n, i) => [n, i + 1]));
const INCB_LINKER = INCB_CLASSES.indexOf('Linker') + 1;
const INCB_CONSONANT = INCB_CLASSES.indexOf('Consonant') + 1;
const INCB_EXTEND = INCB_CLASSES.indexOf('Extend') + 1;

function lookup(ranges, cp) {
  let lo = 0;
  let hi = ranges.length / 3 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < ranges[mid * 3]) hi = mid - 1;
    else if (cp > ranges[mid * 3 + 1]) lo = mid + 1;
    else return ranges[mid * 3 + 2];
  }
  return 0;
}

const gcb = (cp) => lookup(GCB_RANGES, cp);
const isPict = (cp) => lookup(EXTENDED_PICTOGRAPHIC_RANGES, cp) === 1;
const incb = (cp) => lookup(INCB_RANGES, cp);

/** UTF-16 offsets of every cluster boundary, including 0 and the string length. */
export function graphemeBoundaries(text) {
  const bounds = [0];
  if (!text.length) return bounds;
  let offset = 0;
  let prev = null; // class of the previous code point
  let riRun = 0; // regional indicators immediately before the current position
  let pict = 0; // GB11: 1 = ExtPict Extend*, 2 = ExtPict Extend* ZWJ
  let conj = 0; // GB9c: 1 = Consonant [Extend|Linker]*, 2 = ... Linker ... [Extend|Linker]*
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    const cls = gcb(cp);
    const ib = incb(cp);
    const ext = isPict(cp);
    if (prev !== null) {
      let noBreak = false;
      if (prev === C.CR && cls === C.LF) noBreak = true; // GB3
      else if (prev === C.Control || prev === C.CR || prev === C.LF) noBreak = false; // GB4
      else if (cls === C.Control || cls === C.CR || cls === C.LF) noBreak = false; // GB5
      else if (prev === C.L && (cls === C.L || cls === C.V || cls === C.LV || cls === C.LVT)) noBreak = true; // GB6
      else if ((prev === C.LV || prev === C.V) && (cls === C.V || cls === C.T)) noBreak = true; // GB7
      else if ((prev === C.LVT || prev === C.T) && cls === C.T) noBreak = true; // GB8
      else if (cls === C.Extend || cls === C.ZWJ) noBreak = true; // GB9
      else if (cls === C.SpacingMark) noBreak = true; // GB9a
      else if (prev === C.Prepend) noBreak = true; // GB9b
      else if (conj === 2 && ib === INCB_CONSONANT) noBreak = true; // GB9c
      else if (pict === 2 && ext) noBreak = true; // GB11
      else if (cls === C.Regional_Indicator && prev === C.Regional_Indicator && riRun % 2 === 1) noBreak = true; // GB12/13
      if (!noBreak) bounds.push(offset);
    }
    // update the lookbehind state with this code point
    riRun = cls === C.Regional_Indicator ? riRun + 1 : 0;
    if (ext) pict = 1;
    else if (cls === C.Extend && pict === 1) pict = 1;
    else if (cls === C.ZWJ && pict === 1) pict = 2;
    else pict = 0;
    if (ib === INCB_CONSONANT) conj = 1;
    else if (ib === INCB_LINKER && conj >= 1) conj = 2;
    else if (ib === INCB_EXTEND && conj >= 1) conj = conj;
    else conj = 0;
    prev = cls;
    offset += ch.length;
  }
  bounds.push(offset);
  return bounds;
}

/** The clusters of `text` (substrings between consecutive boundaries). */
export function clusters(text) {
  const b = graphemeBoundaries(text);
  const out = [];
  for (let i = 0; i + 1 < b.length; i += 1) out.push(text.slice(b[i], b[i + 1]));
  return out;
}
