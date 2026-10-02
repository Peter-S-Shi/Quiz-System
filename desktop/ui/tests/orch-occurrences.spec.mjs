// ADR 0003 sections 6, 7.4, 7.8, 9 and 17.2-17.3, 17.6: dates, recurrence expansion, derived states, schema closure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, diffDays, isDate, localDateOf } from '../web/src/orchestration/dates.js';
import {
  OVERDUE_ENUMERATION_CAP,
  calendarView,
  expandOccurrences,
  generate,
  isExhausted,
  isGenerated,
  previousOriginalBefore,
  suggestionTarget,
  todayView,
} from '../web/src/orchestration/occurrences.js';
import { validateException, validateFulfillment, validateSchedule, validateSelection, validateSuggestion } from '../web/src/orchestration/schema.js';

const slot = { domain: 'objective', material: { type: 'quiz-paper', id: 'paper-a' }, intent: 'practice' };

export function schedule(over = {}) {
  return {
    schemaVersion: 1,
    id: 's1',
    slot,
    owner: 'user',
    status: 'active',
    cadence: { kind: 'every', unit: 'day', interval: 3 },
    segments: [{ anchor: '2026-10-03' }],
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    ...over,
  };
}
const once = (anchor, over = {}) => schedule({ cadence: { kind: 'once' }, segments: [{ anchor }], ...over });
const dates = (s, upTo) => generate(s, upTo).map((o) => o.originalDate);
const exception = (scheduleId, originalDate, kind, movedTo) => ({ schemaVersion: 1, id: `${scheduleId}#${originalDate}`, scheduleId, originalDate, kind, ...(movedTo ? { movedTo } : {}) });
const fulfillment = (scheduleId, originalDate, session = 'lr-1') => ({ schemaVersion: 1, id: `${scheduleId}#${originalDate}`, scheduleId, originalDate, session: { collection: 'learner_response', id: session }, fulfilledOn: originalDate, via: 'linked' });
const deepFreeze = (o) => { Object.values(o).forEach((v) => v && typeof v === 'object' && deepFreeze(v)); return Object.freeze(o); };

test('calendar dates: validity, calendar-day arithmetic, month ends and leap days', () => {
  assert.equal(isDate('2026-02-29'), false);
  assert.equal(isDate('2028-02-29'), true);
  assert.equal(isDate('2026-13-01'), false);
  assert.equal(isDate('2026-1-1'), false);
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-10-02', -2), '2026-09-30');
  assert.equal(diffDays('2026-10-09', '2026-10-02'), 7);
});

test('day arithmetic is independent of the system time zone and of DST transitions (only the clock edge reads a zone)', () => {
  const dstDates = ['2026-03-07', '2026-03-28', '2026-10-24', '2026-11-01'];
  const before = process.env.TZ;
  try {
    const results = [];
    for (const tz of ['UTC', 'America/New_York', 'Europe/London', 'Asia/Shanghai', 'Pacific/Auckland']) {
      process.env.TZ = tz;
      results.push(dstDates.map((d) => addDays(d, 1)).join(','));
    }
    assert.equal(new Set(results).size, 1, results.join(' | '));
  } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
  assert.match(localDateOf(new Date(2026, 9, 2, 23, 59)), /^2026-10-02$/);
});

test('expansion table: cadence x anchor x until (committed expected lists)', () => {
  assert.deepEqual(dates(schedule(), '2026-10-12'), ['2026-10-03', '2026-10-06', '2026-10-09', '2026-10-12']);
  assert.deepEqual(dates(schedule({ cadence: { kind: 'every', unit: 'week', interval: 1 }, segments: [{ anchor: '2026-12-28' }] }), '2027-01-18'), ['2026-12-28', '2027-01-04', '2027-01-11', '2027-01-18']);
  assert.deepEqual(dates(schedule({ cadence: { kind: 'every', unit: 'day', interval: 1, until: '2026-10-05' }, segments: [{ anchor: '2026-10-03' }] }), '2027-01-01'), ['2026-10-03', '2026-10-04', '2026-10-05'], 'until is inclusive');
  assert.deepEqual(dates(schedule({ cadence: { kind: 'every', unit: 'day', interval: 5, until: '2026-10-03' }, segments: [{ anchor: '2026-10-03' }] }), '2027-01-01'), ['2026-10-03'], 'until = anchor yields exactly the anchor');
  assert.deepEqual(dates(schedule({ cadence: { kind: 'every', unit: 'day', interval: 7 }, segments: [{ anchor: '2028-02-22' }] }), '2028-03-07'), ['2028-02-22', '2028-02-29', '2028-03-07'], 'leap day');
  assert.deepEqual(dates(schedule({ cadence: { kind: 'every', unit: 'day', interval: 30 }, segments: [{ anchor: '2026-01-31' }] }), '2026-04-30'), ['2026-01-31', '2026-03-02', '2026-04-01', '2026-05-01'].filter((d) => d <= '2026-04-30'), 'month ends are plain day arithmetic');
  assert.deepEqual(dates(schedule({ cadence: { kind: 'every', unit: 'day', interval: 365 }, segments: [{ anchor: '2026-10-03' }] }), '2028-10-03'), ['2026-10-03', '2027-10-03', '2028-10-02'], 'a large interval across a leap year');
  assert.deepEqual(dates(once('2026-10-06'), '2026-10-05'), [], 'a once schedule before its date');
  assert.deepEqual(dates(once('2026-10-06'), '2030-01-01'), ['2026-10-06']);
});

test('re-anchor example of Scope 7.7: Oct 3 -> 6 -> 9 -> 12 becomes Oct 3 -> 8 -> 11 -> 14', () => {
  const s = schedule({ segments: [{ anchor: '2026-10-03' }, { anchor: '2026-10-08', takesOverAt: '2026-10-06' }] });
  assert.deepEqual(dates(s, '2026-10-14'), ['2026-10-03', '2026-10-08', '2026-10-11', '2026-10-14']);
  assert.equal(isGenerated(s, '2026-10-06'), false, 'the replaced occurrence no longer exists');
  assert.equal(isGenerated(s, '2026-10-11'), true);
  assert.equal(previousOriginalBefore(s, '2026-10-08'), '2026-10-03');
  // several re-anchors in sequence: everything before each cut is untouched
  const t = schedule({ segments: [{ anchor: '2026-10-03' }, { anchor: '2026-10-08', takesOverAt: '2026-10-06' }, { anchor: '2026-10-20', takesOverAt: '2026-10-14' }] });
  assert.deepEqual(dates(t, '2026-10-30'), ['2026-10-03', '2026-10-08', '2026-10-11', '2026-10-20', '2026-10-23', '2026-10-26', '2026-10-29']);
});

test('occurrence identity is (scheduleId, originalDate): a moved occurrence keeps its original date, displayDate is only presentation', () => {
  const s = schedule();
  const ex = exception('s1', '2026-10-06', 'moved', '2026-10-08');
  const r = expandOccurrences({ schedule: s, exceptions: [ex], fulfillments: [] }, { from: '2026-10-01', to: '2026-10-12' }, '2026-10-04');
  const moved = r.occurrences.find((o) => o.originalDate === '2026-10-06');
  assert.equal(moved.displayDate, '2026-10-08');
  assert.equal(moved.state, 'scheduled');
  assert.deepEqual(r.occurrences.map((o) => o.originalDate), ['2026-10-03', '2026-10-06', '2026-10-09', '2026-10-12'].sort());
  // the date it moved to is not an occurrence of its own
  assert.equal(r.occurrences.filter((o) => o.originalDate === '2026-10-08').length, 0);
  // the old date never generates Overdue: after Oct 6 the moved occurrence is still scheduled for Oct 8
  const later = expandOccurrences({ schedule: s, exceptions: [ex], fulfillments: [] }, { from: '2026-10-01', to: '2026-10-12' }, '2026-10-07');
  assert.equal(later.occurrences.find((o) => o.originalDate === '2026-10-06').state, 'scheduled');
  const overdue = expandOccurrences({ schedule: s, exceptions: [ex], fulfillments: [] }, { from: '2026-10-01', to: '2026-10-12' }, '2026-10-09');
  assert.equal(overdue.occurrences.find((o) => o.originalDate === '2026-10-06').state, 'overdue');
});

test('state table: Due / Overdue / Scheduled / fulfilled / cancelled, evaluated with zero writes under a moving clock', () => {
  const s = deepFreeze(once('2026-10-06'));
  const m = deepFreeze({ schedule: s, exceptions: [], fulfillments: [] });
  const stateAt = (today) => expandOccurrences(m, { from: '2026-10-01', to: '2026-10-31' }, today).occurrences[0].state;
  assert.equal(stateAt('2026-10-04'), 'scheduled');
  assert.equal(stateAt('2026-10-05'), 'scheduled');
  assert.equal(stateAt('2026-10-06'), 'due');
  assert.equal(stateAt('2026-10-07'), 'overdue');
  assert.equal(stateAt('2026-10-05'), 'scheduled', 'the clock moved back: Overdue/Due are derived, not stored');
  assert.equal(stateAt('2026-12-31'), 'overdue');
  const done = deepFreeze({ schedule: s, exceptions: [], fulfillments: [fulfillment('s1', '2026-10-06')] });
  assert.equal(expandOccurrences(done, { from: '2026-10-01', to: '2026-10-31' }, '2026-10-20').occurrences[0].state, 'fulfilled');
  const cancelledEx = deepFreeze({ schedule: schedule(), exceptions: [exception('s1', '2026-10-06', 'cancelled')], fulfillments: [] });
  const r = expandOccurrences(cancelledEx, { from: '2026-10-01', to: '2026-10-12' }, '2026-10-04');
  assert.equal(r.occurrences.find((o) => o.originalDate === '2026-10-06').state, 'cancelled');
  const cancelledSeries = deepFreeze({ schedule: schedule({ status: 'cancelled', cancellation: { by: 'user', considered: [] } }), exceptions: [], fulfillments: [] });
  assert.ok(expandOccurrences(cancelledSeries, { from: '2026-10-01', to: '2026-10-12' }, '2026-10-04').occurrences.every((o) => o.state === 'cancelled'));
});

test('a missed schedule stays Overdue (never moves or disappears) and Overdue enumeration is capped explicitly', () => {
  const m = { schedule: schedule({ cadence: { kind: 'every', unit: 'day', interval: 1 }, segments: [{ anchor: '2024-01-01' }] }), exceptions: [], fulfillments: [] };
  const r = expandOccurrences(m, { from: '2026-10-02', to: '2026-10-09' }, '2026-10-02');
  const total = diffDays('2026-10-01', '2024-01-01') + 1; // every unresolved day before today
  assert.equal(r.overdueTruncated, true);
  assert.equal(r.overdueTotal, total, 'the exact count is reported');
  assert.equal(r.occurrences.filter((o) => o.state === 'overdue').length, OVERDUE_ENUMERATION_CAP);
  assert.equal(r.occurrences.filter((o) => o.state === 'overdue').at(-1).displayDate, '2026-10-01', 'the most recent ones are listed');
  // a small backlog is complete and not truncated
  const small = expandOccurrences({ schedule: once('2026-09-01'), exceptions: [], fulfillments: [] }, { from: '2026-10-02', to: '2026-10-09' }, '2026-10-02');
  assert.equal(small.overdueTruncated, false);
  assert.equal(small.occurrences[0].state, 'overdue');
});

test('the suggestion target and exhaustion rules', () => {
  const rec = { schedule: schedule(), exceptions: [exception('s1', '2026-10-06', 'cancelled')], fulfillments: [fulfillment('s1', '2026-10-03')] };
  assert.equal(suggestionTarget(rec, '2026-10-04').originalDate, '2026-10-09', 'earliest unresolved occurrence still ahead');
  const o = { schedule: once('2026-10-02', { owner: 'engine', engine: { reasons: [], algorithmVersion: 'v1', basis: [] } }), exceptions: [], fulfillments: [] };
  assert.equal(suggestionTarget(o, '2026-10-05').originalDate, '2026-10-02', 'a once schedule targets its only occurrence even when Overdue');
  assert.equal(suggestionTarget({ ...o, fulfillments: [fulfillment('s1', '2026-10-02')] }, '2026-10-05'), null);
  const finite = schedule({ cadence: { kind: 'every', unit: 'day', interval: 3, until: '2026-10-09' } });
  const all = [fulfillment('s1', '2026-10-03'), exception('s1', '2026-10-06', 'cancelled'), fulfillment('s1', '2026-10-09', 'lr-2')];
  assert.equal(isExhausted({ schedule: finite, exceptions: all.filter((e) => e.kind), fulfillments: all.filter((e) => e.session) }, '2026-10-10'), true);
  assert.equal(isExhausted({ schedule: finite, exceptions: [], fulfillments: [] }, '2026-10-10'), false);
  assert.equal(isExhausted({ schedule: schedule(), exceptions: [], fulfillments: [] }, '2026-10-10'), false, 'an unbounded series never completes');
});

test('calendar and Today projections: grouped by displayDate, identity kept, no data added', () => {
  const a = { schedule: schedule(), exceptions: [exception('s1', '2026-10-06', 'moved', '2026-10-09')], fulfillments: [fulfillment('s1', '2026-10-03')], hasPendingSuggestion: true };
  const b = { schedule: once('2026-10-04', { id: 's2', slot: { ...slot, material: { type: 'quiz-paper', id: 'paper-b' } } }), exceptions: [], fulfillments: [] };
  const view = calendarView([a, b], { from: '2026-10-03', to: '2026-10-12' }, '2026-10-04');
  const on9 = view.days.find((d) => d.date === '2026-10-09');
  assert.deepEqual(on9.entries.map((e) => [e.scheduleId, e.originalDate]).sort(), [['s1', '2026-10-06'], ['s1', '2026-10-09']].sort());
  assert.equal(on9.entries.every((e) => e.hasPendingSuggestion), true);
  const today = todayView([a, b], '2026-10-04');
  assert.deepEqual(today.entries.map((e) => [e.scheduleId, e.state]), [['s2', 'due']]);
  const overdueToday = todayView([a, b], '2026-10-05');
  assert.deepEqual(overdueToday.entries.map((e) => [e.scheduleId, e.state]), [['s2', 'overdue']]);
});

test('schema closure (CAL-1): no time, reminder, deadline, title, budget or external reference can be represented', () => {
  assert.deepEqual(validateSchedule(schedule()), []);
  for (const key of ['time', 'reminder', 'notify', 'duration', 'budget', 'deadline', 'goal', 'exam', 'title', 'notes', 'location', 'calendarId', 'extensions']) {
    const errs = validateSchedule({ ...schedule(), [key]: 'x' });
    assert.ok(errs.some((e) => e.includes(`'${key}'`)), `${key}: ${errs}`);
  }
  assert.ok(validateSchedule({ ...schedule(), slot: { ...slot, startsAt: '09:00' } }).length > 0, 'no time of day inside the slot');
  assert.ok(validateSchedule({ ...schedule(), segments: [{ anchor: '2026-10-03T09:00' }] }).length > 0, 'dates are date-level only');
  assert.ok(validateSchedule({ ...schedule(), cadence: { kind: 'monthly' } }).length > 0, 'only simple bounded recurrence');
  assert.ok(validateSchedule({ ...schedule({ owner: 'engine', engine: { reasons: [], algorithmVersion: 'v1', basis: [] } }), slot: { ...slot, intent: 'test' } }).some((e) => e.includes('Test')));
  assert.ok(validateSchedule(schedule({ owner: 'engine', engine: { reasons: [], algorithmVersion: 'v1', basis: [] } })).some((e) => e.includes('recurrence')), 'the engine never creates recurrence');
  assert.ok(validateSchedule({ ...once('2026-10-06'), domain: 'objective' }).length > 0);
  for (const [fn, rec] of [
    [validateException, exception('s1', '2026-10-06', 'cancelled')],
    [validateFulfillment, fulfillment('s1', '2026-10-06')],
    [validateSelection, { schemaVersion: 1, id: 'learner_response:lr-1', session: { collection: 'learner_response', id: 'lr-1' }, selection: { source: 'manual' }, createdAt: 'x' }],
  ]) {
    assert.deepEqual(fn(rec), []);
    assert.ok(fn({ ...rec, reminder: true }).length > 0);
  }
  assert.ok(validateException({ ...exception('s1', '2026-10-06', 'moved', '2026-10-08'), id: 's1#2026-10-08' }).length > 0, 'an exception id must carry the original date, never movedTo');
  assert.ok(validateFulfillment({ ...fulfillment('s1', '2026-10-06'), id: 's1#2026-10-08' }).length > 0);
  assert.ok(validateSuggestion({ schemaVersion: 1, id: 'g', scheduleId: 's1', targetOriginalDate: '2026-10-06', currentDate: '2026-10-06', suggestedDate: '2026-10-08', reasons: [], algorithmVersion: 'v1', basis: [], status: 'pending', createdAt: 'x' }).some((e) => e.includes('scheduleRev')), 'a suggestion must be bound to a schedule revision');
});
