// Derived attempt duration: from existing session timestamps only; invalid / missing / legacy timing degrades gracefully.
import test from 'node:test';
import assert from 'node:assert/strict';
import { durationLine, durationMs, formatDuration } from '../web/src/duration.js';
import { setLocale } from '../web/src/i18n.js';

test('durationMs derives the elapsed time and rejects missing, invalid and negative timing', () => {
  assert.equal(durationMs('2026-10-02T09:00:00.000Z', '2026-10-02T09:01:05.500Z'), 65500);
  assert.equal(durationMs('2026-10-02T09:00:00.000Z', '2026-10-02T09:00:00.000Z'), 0);
  for (const [a, b] of [[undefined, 'x'], ['2026-10-02T09:00:00Z', undefined], ['garbage', '2026-10-02T09:00:00Z'], ['2026-10-02T09:10:00Z', '2026-10-02T09:00:00Z'], [1, 2], [null, null]]) assert.equal(durationMs(a, b), null);
});

test('formatDuration is human readable in both interface languages', () => {
  setLocale('en');
  assert.equal(formatDuration(0), '0 sec');
  assert.equal(formatDuration(42_900), '42 sec');
  assert.equal(formatDuration(65_000), '1 min 5 sec');
  assert.equal(formatDuration(3_725_000), '1 h 2 min 5 sec');
  assert.equal(formatDuration(NaN), 'Time not recorded');
  setLocale('zh-CN');
  assert.equal(formatDuration(65_000), '1 分 5 秒');
  assert.equal(formatDuration(-1), '未记录用时');
  setLocale('en');
});

test('durationLine labels the value and falls back to a neutral statement', () => {
  setLocale('en');
  assert.equal(durationLine({ startedAt: '2026-10-02T09:00:00Z', completedAt: '2026-10-02T09:02:00Z' }), 'Time taken: 2 min 0 sec');
  assert.equal(durationLine({ startedAt: 'bad', completedAt: 'bad' }), 'Time not recorded');
  assert.equal(durationLine(null), 'Time not recorded');
  assert.equal(durationLine(undefined), 'Time not recorded');
});
