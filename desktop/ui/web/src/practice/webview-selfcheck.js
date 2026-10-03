// A startup self-check run INSIDE the real WebView (WebView2 on Windows): it proves that the pinned typing-compare/1
// semantics (project-controlled Unicode 16.0.0 NFC + grapheme tables, banded alignment) give the frozen answers on the
// engine the learner actually runs, independent of the host's own Unicode behavior. The result is reported through
// `ui_ready` into boot-status.json, where the packaged-app smoke asserts it. Literal expectations only (no recomputation).
import { compare as pinnedCompare } from '../task-domains/typing/compare.js';

const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}';

/** [name, reference, committed, expected] - expected is the frozen error list. */
const CASES = [
  ['omission', 'environment', 'enviroment', [{ kind: 'omission', reference: { start: 6, end: 7 }, committed: { start: 6, end: 6 } }]],
  ['substitution', 'cat', 'cut', [{ kind: 'substitution', reference: { start: 1, end: 2 }, committed: { start: 1, end: 2 } }]],
  ['insertion', 'cat', 'cart', [{ kind: 'insertion', reference: { start: 2, end: 2 }, committed: { start: 2, end: 3 } }]],
  ['nfc-equivalent', 'café', 'café', []],
  ['hangul-jamo', '각', '각', []],
  ['zwj-family-is-one-unit', FAMILY, '\u{1F468}', [{ kind: 'substitution', reference: { start: 0, end: FAMILY.length }, committed: { start: 0, end: 2 } }]],
  ['regional-indicators', '\u{1F1E9}\u{1F1EA}\u{1F1EB}\u{1F1F7}', '\u{1F1E9}\u{1F1EA}', [{ kind: 'omission', reference: { start: 4, end: 8 }, committed: { start: 4, end: 4 } }]],
  ['surrogate-safe', 'a\u{1F600}b', 'a\u{1F601}b', [{ kind: 'substitution', reference: { start: 1, end: 3 }, committed: { start: 1, end: 3 } }]],
];

export function runWebviewSelfCheck({ compare = pinnedCompare } = {}) {
  const failed = [];
  for (const [name, reference, committed, expected] of CASES) {
    let got;
    try { got = compare(reference, committed).errors; } catch (e) { got = String(e?.message ?? e); }
    if (JSON.stringify(got) !== JSON.stringify(expected)) failed.push(name);
  }
  // the banded long-text path: 4 000 graphemes, three far-apart edits, exact positions
  const base = Array.from({ length: 4000 }, (_, i) => String.fromCharCode(97 + ((i * 7 + (i >> 3)) % 26))).join('');
  const typed = `${base.slice(0, 10)}Z${base.slice(11, 2000)}${base.slice(2001, 3990)}Y${base.slice(3991)}`;
  let long;
  try { long = compare(base, typed).errors.map((e) => `${e.kind}@${e.reference.start}`).join(','); } catch (e) { long = String(e?.message ?? e); }
  if (long !== 'substitution@10,omission@2000,substitution@3990') failed.push('long-text-banded');
  return {
    ok: failed.length === 0,
    cases: CASES.length + 1,
    failed,
    // informational only - the semantics never read these
    host: { intlSegmenter: typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function', userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a' },
  };
}
