// Occurrence projection (ADR 0003 sections 7.4, 7.8, 9, 10): occurrences are DERIVED from a schedule's cadence and
// segments; their only identity is (scheduleId, originalDate). `displayDate` (= movedTo when moved) decides where an
// occurrence is shown and in which state, and is never an identity or a key. Due / Overdue / Scheduled are pure
// functions of (data, today): nothing here writes, so moving the clock changes states without any write (S-5).

import { addDays, compareDates, dayNumber } from './dates.js';

/** Explicit projection-enumeration safety limit (ADR 0003 section 9.2): bounds one projection call, never deletes anything. */
export const OVERDUE_ENUMERATION_CAP = 366;

const SAFETY_ITERATIONS = 200_000;

export const stepDays = (cadence) => (cadence.unit === 'week' ? 7 * cadence.interval : cadence.interval);

/** Original dates the schedule generates, ascending, lazily. Yields `{ originalDate, segment }`. */
export function* iterateOriginals(schedule) {
  const { cadence, segments } = schedule;
  if (cadence.kind === 'once') {
    yield { originalDate: segments[0].anchor, segment: 0 };
    return;
  }
  const step = stepDays(cadence);
  const until = cadence.until ?? null;
  let n = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const upper = i + 1 < segments.length ? segments[i + 1].takesOverAt : null; // exclusive
    for (let d = segments[i].anchor; (until === null || d <= until) && (upper === null || d < upper); d = addDays(d, step)) {
      yield { originalDate: d, segment: i };
      n += 1;
      if (n > SAFETY_ITERATIONS) return;
    }
  }
}

/** Every generated original date up to `upTo` inclusive. */
export function generate(schedule, upTo) {
  const out = [];
  for (const o of iterateOriginals(schedule)) {
    if (o.originalDate > upTo) break;
    out.push(o);
  }
  return out;
}

/** True iff `date` is a date this schedule generates (membership by arithmetic, no enumeration). */
export function isGenerated(schedule, date) {
  const { cadence, segments } = schedule;
  if (cadence.kind === 'once') return segments[0].anchor === date;
  const step = stepDays(cadence);
  if (cadence.until !== undefined && date > cadence.until) return false;
  for (let i = 0; i < segments.length; i += 1) {
    const upper = i + 1 < segments.length ? segments[i + 1].takesOverAt : null;
    if (date >= segments[i].anchor && (upper === null || date < upper) && (dayNumber(date) - dayNumber(segments[i].anchor)) % step === 0) return true;
  }
  return false;
}

/** Index of the segment that generates `date`, or -1. */
export function segmentOf(schedule, date) {
  if (!isGenerated(schedule, date)) return -1;
  const { segments } = schedule;
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const upper = i + 1 < segments.length ? segments[i + 1].takesOverAt : null;
    if (date >= segments[i].anchor && (upper === null || date < upper)) return i;
  }
  return -1;
}

/** The last generated original date strictly before `date` (null if none). */
export function previousOriginalBefore(schedule, date) {
  let prev = null;
  for (const o of iterateOriginals(schedule)) {
    if (o.originalDate >= date) break;
    prev = o.originalDate;
  }
  return prev;
}

function stateOf(schedule, exception, fulfillment, displayDate, today) {
  if (schedule.status === 'cancelled' && !fulfillment) return 'cancelled';
  if (exception?.kind === 'cancelled' && !fulfillment) return 'cancelled';
  if (fulfillment) return 'fulfilled';
  if (displayDate < today) return 'overdue';
  if (displayDate === today) return 'due';
  return 'scheduled';
}

export const isUnresolved = (state) => state === 'overdue' || state === 'due' || state === 'scheduled';

function indexes(model) {
  const ex = new Map((model.exceptions ?? []).map((e) => [e.originalDate, e]));
  const fu = new Map((model.fulfillments ?? []).map((f) => [f.originalDate, f]));
  return { ex, fu };
}

function make(schedule, o, ex, fu, today, extra) {
  const e = ex.get(o.originalDate);
  const f = fu.get(o.originalDate);
  const displayDate = e?.kind === 'moved' ? e.movedTo : o.originalDate;
  return {
    scheduleId: schedule.id,
    originalDate: o.originalDate,
    displayDate,
    slot: schedule.slot,
    owner: schedule.owner,
    state: stateOf(schedule, e, f, displayDate, today),
    ...extra,
  };
}

/**
 * Occurrences of one schedule shown in `[from, to]` (by displayDate) plus every unresolved occurrence at or before
 * today. `model = { schedule, exceptions, fulfillments }` (payloads). The Overdue enumeration is bounded by
 * `OVERDUE_ENUMERATION_CAP`; the most recent ones are listed and the truncation is reported, never silent.
 */
export function expandOccurrences(model, window, today, opts = {}) {
  const { schedule } = model;
  const { ex, fu } = indexes(model);
  const horizon = [window.to, today, ...[...ex.keys()]].reduce((a, b) => (a >= b ? a : b));
  const hasPending = Boolean(opts.hasPendingSuggestion);
  const unavailable = opts.materialAvailable ? !opts.materialAvailable(schedule.slot) : false;
  const all = generate(schedule, horizon).map((o) => make(schedule, o, ex, fu, today, { hasPendingSuggestion: hasPending, unavailable }));
  const keep = all.filter((o) => (o.displayDate >= window.from && o.displayDate <= window.to) || (isUnresolved(o.state) && o.displayDate <= today));
  const overdue = keep.filter((o) => o.state === 'overdue').sort((a, b) => compareDates(b.displayDate, a.displayDate) || compareDates(b.originalDate, a.originalDate));
  let overdueTruncated = false;
  let result = keep;
  if (overdue.length > OVERDUE_ENUMERATION_CAP) {
    overdueTruncated = true;
    const dropped = new Set(overdue.slice(OVERDUE_ENUMERATION_CAP).map((o) => o.originalDate));
    result = keep.filter((o) => !(o.state === 'overdue' && dropped.has(o.originalDate)));
  }
  result.sort((a, b) => compareDates(a.displayDate, b.displayDate) || compareDates(a.originalDate, b.originalDate));
  return { occurrences: result, overdueTruncated, overdueTotal: overdue.length };
}

/** The occurrence with this identity date (null when the schedule does not generate it). */
export function occurrenceAt(model, originalDate, today) {
  if (!isGenerated(model.schedule, originalDate)) return null;
  const { ex, fu } = indexes(model);
  return make(model.schedule, { originalDate }, ex, fu, today, {});
}

/** Unresolved occurrences (ascending by original date) up to `upTo` original date inclusive. */
export function unresolvedOccurrences(model, today, upTo) {
  const { schedule } = model;
  const { ex, fu } = indexes(model);
  return generate(schedule, upTo)
    .map((o) => make(schedule, o, ex, fu, today, {}))
    .filter((o) => isUnresolved(o.state));
}

/** The occurrence a suggestion or re-anchor concerns (ADR 0003 sections 7.5 and 11.4): once -> its only occurrence;
 *  recurring -> the earliest unresolved occurrence still ahead (`displayDate >= today`). */
export function suggestionTarget(model, today) {
  const { schedule } = model;
  const { ex, fu } = indexes(model);
  let n = 0;
  for (const o of iterateOriginals(schedule)) {
    n += 1;
    if (n > SAFETY_ITERATIONS) break;
    const occ = make(schedule, o, ex, fu, today, {});
    if (!isUnresolved(occ.state)) continue;
    if (schedule.cadence.kind === 'once') return occ;
    if (occ.displayDate >= today) return occ;
  }
  return null;
}

/** True iff a series with a finite `until` (or a once schedule) has every occurrence resolved. */
export function isExhausted(model, today) {
  const { schedule } = model;
  if (schedule.cadence.kind === 'every' && schedule.cadence.until === undefined) return false;
  const { ex, fu } = indexes(model);
  for (const o of iterateOriginals(schedule)) {
    if (isUnresolved(make(schedule, o, ex, fu, today, {}).state)) return false;
  }
  return true;
}

/** Calendar projection (ADR 0003 section 9.5): entries grouped by displayDate. */
export function calendarView(models, window, today, opts = {}) {
  const entries = [];
  let overdueTruncated = false;
  for (const m of models) {
    if (m.schedule.status !== 'active' && !opts.includeInactive) continue;
    const r = expandOccurrences(m, window, today, { hasPendingSuggestion: m.hasPendingSuggestion, materialAvailable: opts.materialAvailable });
    overdueTruncated ||= r.overdueTruncated;
    for (const o of r.occurrences) if (opts.includeCancelled || o.state !== 'cancelled') entries.push(o);
  }
  entries.sort((a, b) => compareDates(a.displayDate, b.displayDate) || compareDates(a.originalDate, b.originalDate) || (a.scheduleId < b.scheduleId ? -1 : 1));
  const days = [];
  for (const e of entries) {
    const last = days[days.length - 1];
    if (last && last.date === e.displayDate) last.entries.push(e);
    else days.push({ date: e.displayDate, entries: [e] });
  }
  return { days, overdueTruncated };
}

/** Today = the same projection narrowed to what is due or overdue (it adds no data). */
export function todayView(models, today, opts = {}) {
  const view = calendarView(models, { from: today, to: today }, today, opts);
  const entries = view.days.flatMap((d) => d.entries).filter((e) => e.state === 'due' || e.state === 'overdue');
  return { entries, overdueTruncated: view.overdueTruncated };
}
