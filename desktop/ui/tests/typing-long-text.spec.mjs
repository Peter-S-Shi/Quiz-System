// Typing long-text practice (Scope Freeze Rev.1 section 12.6): live feedback stays cheap on long passages, the passage
// statuses are derived without leaking correctness in Test, and the active position is followed with hysteresis so the
// layout does not jump. The pure helpers here are what the DOM surface renders; the DOM behavior is checked separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TypingSession } from '../web/src/task-domains/typing/session.js';
import { compare } from '../web/src/task-domains/typing/compare.js';
import { clusters } from '../web/src/task-domains/unicode/graphemes.js';
import { followScroll, passageCells, passageStatuses, STATUS } from '../web/src/practice/typing-passage.js';

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
function longText(graphemes, seed = 7) {
  const rnd = rng(seed);
  const words = ['the', 'environment', 'matters', 'learning', 'by', 'copying', 'careful', 'text', 'café', '你好', 'क्ष', 'and', 'of', 'to', 'practice'];
  let out = '';
  while (clusters(out).length < graphemes) out += `${words[Math.floor(rnd() * words.length)]}${rnd() < 0.12 ? '.\n' : ' '}`;
  return out;
}
const mk = (text, over = {}) => new TypingSession({
  evidenceId: 'ta-1', sessionId: 'sess-1', startedAt: '2026-10-02T09:00:00.000Z',
  material: { id: 'typing-1', title: 'Long', text }, intent: 'practice', policy: { feedbackTiming: 'live', corrections: 'allowed' }, ...over,
});
const type = (s, value) => s.input({ isTrusted: true, type: 'input', inputType: 'insertText', value });

test('live feedback on a long passage is windowed: half-typed text with a far-apart error is fast and exact', () => {
  const ref = longText(7500);
  const parts = clusters(ref);
  const half = parts.slice(0, 3500);
  half[40] = 'Z'; // one substitution early, then clean typing for 3 000+ graphemes
  const typed = half.join('');
  const s = mk(ref);
  type(s, typed);
  const t0 = Date.now();
  const v = s.view();
  assert.ok(Date.now() - t0 < 500, `bounded live cost (${Date.now() - t0} ms)`);
  assert.deepEqual(v.progress, { typedGraphemes: 3500, referenceGraphemes: parts.length });
  assert.deepEqual(v.live.errors.map((e) => e.kind), ['substitution']);
  assert.equal(v.live.errors[0].reference.start, parts.slice(0, 40).join('').length);
  // the untyped remainder is a trailing omission that ends the window, and `reached` is where typing stands
  assert.equal(v.live.reached, parts.slice(0, 3500).join('').length);
});

test('when the passage is fully typed the live errors equal the final comparison exactly', () => {
  const ref = longText(2000, 3);
  const parts = clusters(ref);
  const typed = parts.map((p, i) => (i === 10 ? '' : i === 1500 ? 'Q' : p)).join('');
  const s = mk(ref);
  type(s, typed);
  assert.deepEqual(s.view().live.errors, compare(ref, typed).errors);
  assert.equal(s.view().live.reached, ref.length);
});

test('Test stays opaque: no live key at all, whatever the length', () => {
  const s = mk(longText(500), { intent: 'test', policy: { feedbackTiming: 'on-completion', corrections: 'allowed' } });
  type(s, 'garbage');
  assert.deepEqual(Object.keys(s.view()).sort(), ['committedText', 'progress']);
});

test('passage cells are grapheme clusters with verbatim UTF-16 spans', () => {
  const text = 'a\u{1F468}‍\u{1F469}‍\u{1F467}éb';
  const cells = passageCells(text);
  assert.equal(cells.length, 4);
  assert.deepEqual(cells.map((c) => text.slice(c.start, c.end)), ['a', '\u{1F468}‍\u{1F469}‍\u{1F467}', 'é', 'b']);
});

test('Practice statuses: typed-correct, error, current and pending are derived from the live comparison', () => {
  const ref = 'abcdef';
  const s = mk(ref);
  type(s, 'abXd');
  const st = passageStatuses({ cells: passageCells(ref), live: s.view().live, intent: 'practice', typedGraphemes: 4 });
  assert.deepEqual(Array.from(st.statuses), [STATUS.OK, STATUS.OK, STATUS.ERROR, STATUS.OK, STATUS.CURRENT, STATUS.PENDING]);
  assert.equal(st.activeIndex, 4);
});

test('Practice statuses: an insertion marks the preceding cell; a skipped letter is shown where the typed text diverges', () => {
  const ins = mk('abc'); type(ins, 'abZc');
  const a = passageStatuses({ cells: passageCells('abc'), live: ins.view().live, intent: 'practice', typedGraphemes: 4 });
  assert.deepEqual(Array.from(a.statuses), [STATUS.OK, STATUS.ERROR, STATUS.OK]);
  const om = mk('abcd'); type(om, 'abd');
  const b = passageStatuses({ cells: passageCells('abcd'), live: om.view().live, intent: 'practice', typedGraphemes: 3 });
  assert.deepEqual(Array.from(b.statuses), [STATUS.OK, STATUS.OK, STATUS.ERROR, STATUS.CURRENT], 'positional while typing: the third typed letter differs from the third reference letter');
});

test('Test statuses carry position only: typed cells are NEUTRAL whatever was typed, never ok/error', () => {
  const ref = 'abcdef';
  const cells = passageCells(ref);
  const right = passageStatuses({ cells, live: null, intent: 'test', typedGraphemes: 3 });
  const wrong = passageStatuses({ cells, live: null, intent: 'test', typedGraphemes: 3 });
  assert.deepEqual(Array.from(right.statuses), [STATUS.TYPED, STATUS.TYPED, STATUS.TYPED, STATUS.CURRENT, STATUS.PENDING, STATUS.PENDING]);
  assert.deepEqual(Array.from(right.statuses), Array.from(wrong.statuses));
  assert.ok(!Array.from(right.statuses).includes(STATUS.OK) && !Array.from(right.statuses).includes(STATUS.ERROR));
  assert.equal(right.activeIndex, 3);
  // a finished position: no current cell, nothing invented
  const done = passageStatuses({ cells, live: null, intent: 'test', typedGraphemes: 6 });
  assert.equal(done.activeIndex, 6);
  assert.ok(!Array.from(done.statuses).includes(STATUS.CURRENT));
});

test('followScroll: keeps the active line comfortably visible, only moves when it leaves the comfort band (no jitter)', () => {
  const view = { viewportHeight: 300, lineHeight: 30, contentHeight: 3000 };
  // inside the band: no change
  assert.equal(followScroll({ ...view, scrollTop: 100, activeTop: 160 }), 100);
  assert.equal(followScroll({ ...view, scrollTop: 100, activeTop: 100 + 150 }), 100);
  // below the band: scrolls so the active line sits about a third from the top
  const down = followScroll({ ...view, scrollTop: 100, activeTop: 100 + 250 });
  assert.equal(down, 350 - 100);
  assert.ok(350 - down >= 0);
  // above the visible area (user scrolled away or a correction jumped back): brought back into the band
  const up = followScroll({ ...view, scrollTop: 1000, activeTop: 500 });
  assert.equal(up, 500 - 100);
  // clamped at both ends
  assert.equal(followScroll({ ...view, scrollTop: 0, activeTop: 20 }), 0);
  assert.equal(followScroll({ ...view, scrollTop: 2600, activeTop: 2990 }), 2700);
  // a short passage never scrolls
  assert.equal(followScroll({ viewportHeight: 300, lineHeight: 30, contentHeight: 200, scrollTop: 0, activeTop: 190 }), 0);
});

test('following is monotone while typing forward: the scroll position never moves backward on its own', () => {
  const view = { viewportHeight: 300, lineHeight: 30, contentHeight: 6000 };
  let scrollTop = 0;
  for (let line = 0; line < 190; line += 1) {
    const next = followScroll({ ...view, scrollTop, activeTop: line * 30 });
    assert.ok(next >= scrollTop, `line ${line}`);
    scrollTop = next;
  }
  assert.ok(scrollTop > 5000);
});
