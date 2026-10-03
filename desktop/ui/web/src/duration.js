// A completed attempt's elapsed time, DERIVED from the canonical session timestamps (nothing is stored: no speed, WPM,
// accuracy or score). Missing, unparsable or negative timing (a legacy or damaged record) yields null, never a guess.
import { defineStrings, t } from './i18n.js';

defineStrings({
  'dur.label': ['Time taken', '用时'],
  'dur.seconds': ['{s} sec', '{s} 秒'],
  'dur.minutes': ['{m} min {s} sec', '{m} 分 {s} 秒'],
  'dur.hours': ['{h} h {m} min {s} sec', '{h} 小时 {m} 分 {s} 秒'],
  'dur.unknown': ['Time not recorded', '未记录用时'],
});

/** Milliseconds between two ISO instants, or null when either is missing / invalid or the span is negative. */
export function durationMs(startedAt, completedAt) {
  if (typeof startedAt !== 'string' || typeof completedAt !== 'string') return null;
  const a = Date.parse(startedAt);
  const b = Date.parse(completedAt);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return b - a;
}

/** Human-readable duration in the current interface language (whole seconds; under one second reads as "0 sec"). */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return t('dur.unknown');
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return t('dur.hours', { h, m, s });
  if (m) return t('dur.minutes', { m, s });
  return t('dur.seconds', { s });
}

/** The text a surface shows for an attempt's session: "Time taken: 1 min 05 sec" or the neutral "not recorded". */
export const durationLine = (session) => {
  const ms = durationMs(session?.startedAt, session?.completedAt);
  return ms === null ? t('dur.unknown') : `${t('dur.label')}: ${formatDuration(ms)}`;
};
