/**
 * Date math for regular meetups: "every N weeks on <weekday> at HH:MM" in the group's time zone.
 * Dates are "YYYY-MM-DD" strings for calendar days; instants are Date. No time-zone library: Intl does
 * the offset lookups, so daylight-saving changes are handled (7 pm stays 7 pm local).
 */

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type Recurrence = { weekday: number; time: string; everyWeeks: number; startDate: string };

const DAY_MS = 86_400_000;

export function isTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset of `tz` from UTC at `instant`, in ms (e.g. -7 h for Los Angeles in summer). */
function offsetMs(instant: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** The instant a local wall time happens in `tz`. In a DST gap (e.g. 02:30 on spring-forward) it lands just after. */
export function zonedInstant(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const first = wall - offsetMs(wall, tz);
  const second = wall - offsetMs(first, tz);
  return new Date(second);
}

/** The calendar day of `instant` in `tz`. */
export function localDate(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

/** The local "HH:MM" of `instant` in `tz`. */
export function localTime(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(instant);
}

const dayNumber = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
};
const fromDayNumber = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
export const addDays = (date: string, n: number) => fromDayNumber(dayNumber(date) + n);
export const weekdayOf = (date: string) => new Date(dayNumber(date) * DAY_MS).getUTCDay();

/** Whether the series meets on `date`. */
export function meetsOn(r: Recurrence, date: string) {
  if (weekdayOf(date) !== r.weekday) return false;
  const start = dayNumber(r.startDate);
  const first = start + ((r.weekday - weekdayOf(r.startDate) + 7) % 7);
  const diff = dayNumber(date) - first;
  return diff >= 0 && diff % (7 * r.everyWeeks) === 0;
}

/** The first meeting strictly after `after`. */
export function nextOccurrence(r: Recurrence, after: Date, tz: string): Date {
  // Start a day early: the local calendar day of `after` can lag its UTC day.
  let date = addDays(localDate(after, tz), -1);
  if (dayNumber(date) < dayNumber(r.startDate)) date = r.startDate;
  for (let i = 0; i < 7 * r.everyWeeks + 8; i++, date = addDays(date, 1)) {
    if (!meetsOn(r, date)) continue;
    const at = zonedInstant(date, r.time, tz);
    if (at.getTime() > after.getTime()) return at;
  }
  throw new Error("no occurrence found");
}
