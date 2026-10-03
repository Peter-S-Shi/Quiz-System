// Pure helpers behind the Typing practice surface (Scope Freeze Rev.1 section 12.6): the reference passage as grapheme
// cells with per-cell statuses, and the scroll rule that follows the active position. No DOM here - the surface renders
// what these return. In a Test session the statuses carry POSITION only (typed / current / pending); correctness is
// derived solely from the live comparison, which a Test session does not have.
import { graphemeBoundaries } from '../task-domains/unicode/graphemes.js';

export const STATUS = Object.freeze({ PENDING: 0, OK: 1, ERROR: 2, CURRENT: 3, TYPED: 4 });

/** The reference as grapheme-cluster cells `{start, end}` (UTF-16 offsets into the verbatim text). */
export function passageCells(text) {
  const b = graphemeBoundaries(text);
  const cells = [];
  for (let i = 0; i + 1 < b.length; i += 1) cells.push({ start: b[i], end: b[i + 1] });
  return cells;
}

/**
 * @param {{cells: {start: number, end: number}[], live: ({errors: object[], reached: number}|null), intent: 'practice'|'test', typedGraphemes: number}} input
 * @returns {{statuses: Uint8Array, activeIndex: number}} `activeIndex` is the cell the learner is about to type
 *   (cells.length when the passage is complete).
 */
export function passageStatuses({ cells, live, intent, typedGraphemes }) {
  const statuses = new Uint8Array(cells.length);
  if (!live || intent === 'test') {
    const n = Math.min(typedGraphemes, cells.length);
    statuses.fill(STATUS.TYPED, 0, n);
    if (n < cells.length) statuses[n] = STATUS.CURRENT;
    return { statuses, activeIndex: n };
  }
  const reachedIndex = cells.findIndex((c) => c.start >= live.reached);
  const active = reachedIndex === -1 ? cells.length : reachedIndex;
  statuses.fill(STATUS.OK, 0, active);
  for (const e of live.errors) {
    const { start, end } = e.reference;
    if (end > start) {
      for (let i = 0; i < cells.length; i += 1) if (cells[i].start < end && cells[i].end > start && i < active) statuses[i] = STATUS.ERROR;
    } else if (start < live.reached || e.kind !== 'omission') {
      // an insertion has no reference span: mark the cell it follows
      const prev = cells.findIndex((c) => c.end === start);
      const i = prev === -1 ? 0 : prev;
      if (i < active) statuses[i] = STATUS.ERROR;
    }
  }
  if (active < cells.length) statuses[active] = STATUS.CURRENT;
  return { statuses, activeIndex: active };
}

/**
 * The scroll position that keeps the active line comfortably visible. It only moves when the active line leaves the
 * comfort band (no jitter), so completed text drifts upward out of the viewport as the learner progresses and the
 * layout never jumps on every keystroke. Pure; clamped to the content.
 */
export function followScroll({ scrollTop, viewportHeight, lineHeight, contentHeight, activeTop }) {
  const max = Math.max(0, contentHeight - viewportHeight);
  const offset = activeTop - scrollTop;
  if (offset >= 0 && offset + lineHeight <= viewportHeight * 0.6 + lineHeight) return Math.min(max, Math.max(0, scrollTop));
  return Math.min(max, Math.max(0, activeTop - viewportHeight / 3));
}
