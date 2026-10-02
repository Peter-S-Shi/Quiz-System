// Local calendar dates (ADR 0003 section 6): `YYYY-MM-DD`, no time, no zone, never converted to an instant.
// Day arithmetic is pure calendar arithmetic on a UTC day number, so DST, leap days, month ends and a changed
// system time zone cannot shift or duplicate an occurrence. "Today" always comes from an injected clock.

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function isDate(s) {
  if (typeof s !== 'string') return false;
  const m = RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d && y >= 1;
}

function assertDate(s) {
  if (!isDate(s)) throw new RangeError(`not a calendar date: ${JSON.stringify(s)}`);
}

export function dayNumber(s) {
  assertDate(s);
  const m = RE.exec(s);
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY);
}

export function fromDayNumber(n) {
  const d = new Date(n * MS_PER_DAY);
  const p = (v, w) => String(v).padStart(w, '0');
  return `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1, 2)}-${p(d.getUTCDate(), 2)}`;
}

export const addDays = (s, n) => fromDayNumber(dayNumber(s) + n);
export const diffDays = (a, b) => dayNumber(a) - dayNumber(b);
/** Fixed-width ISO dates order lexicographically. */
export const compareDates = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export const maxDate = (a, b) => (a >= b ? a : b);

/** The device's local calendar date for an instant (the only place a zone is consulted, at the clock edge). */
export function localDateOf(instant) {
  const p = (v, w) => String(v).padStart(w, '0');
  return `${p(instant.getFullYear(), 4)}-${p(instant.getMonth() + 1, 2)}-${p(instant.getDate(), 2)}`;
}

/** A clock is `{ today(): 'YYYY-MM-DD', nowIso(): string }`; domain logic only ever receives one of these. */
export function systemClock() {
  return { today: () => localDateOf(new Date()), nowIso: () => new Date().toISOString() };
}

export function fixedClock(today, nowIso = `${today}T12:00:00.000Z`) {
  assertDate(today);
  const c = { today: () => c.current, nowIso: () => c.currentIso, current: today, currentIso: nowIso };
  c.set = (d, iso = `${d}T12:00:00.000Z`) => {
    assertDate(d);
    c.current = d;
    c.currentIso = iso;
  };
  return c;
}
