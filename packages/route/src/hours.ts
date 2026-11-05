/** 0 = Monday … 6 = Sunday. */
export type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const DAYS: Day[] = [0, 1, 2, 3, 4, 5, 6];

/** Minutes since midnight. `end` may be <= `start` for ranges that run past midnight. */
export type MinuteRange = { start: number; end: number };
export const isOvernight = (r: MinuteRange) => r.end <= r.start;

/** A day absent from the map is closed; a day mapped to [] is explicitly closed. */
export type WeeklyHours = Partial<Record<Day, MinuteRange[]>>;

/** Times are minutes since midnight. */
export type HoursStatus =
  | { kind: "open"; closesAt: number | null }
  | { kind: "closingSoon"; closesAt: number; minutesLeft: number }
  | { kind: "closed"; opensAt: number | null }
  | { kind: "unknown" };

/** Wall-clock moment: weekday and minutes since midnight in the place's local time. */
export type WallTime = { day: Day; minutes: number };

export const wallTime = (d: Date): WallTime => ({
  day: ((d.getDay() + 6) % 7) as Day,
  minutes: d.getHours() * 60 + d.getMinutes(),
});

const DAY_WORD =
  "monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun|" +
  "월요일|화요일|수요일|목요일|금요일|토요일|일요일|월|화|수|목|금|토|일";
const TIME = String.raw`(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?`;
const DASH = String.raw`\s*(?:-|~|–|—|to)\s*`;

const TOKEN = new RegExp(
  [
    String.raw`(?<all>매일|everyday|every\s*day|daily|all\s*week)`,
    String.raw`(?<weekdays>평일|weekdays?)`,
    String.raw`(?<weekend>주말|weekends?)`,
    String.raw`(?<h24>24\s*h(?:ours|rs)?|24/7|24시간|open\s*24)`,
    String.raw`(?<closed>closed|휴무|휴일|정기휴무|닫음)`,
    `(?<time>${TIME}${DASH}${TIME})`,
    `(?<day>(?:${DAY_WORD})(?:${DASH}(?:${DAY_WORD}))?)`,
  ].join("|"),
  "gi",
);
const DAY_WORD_RE = new RegExp(DAY_WORD, "gi");
const TIME_RE = new RegExp(`${TIME}${DASH}${TIME}`, "i");

export const CLOSING_SOON_MINUTES = 60;
const DAY_MIN = 24 * 60;

function dayOf(word: string): Day | null {
  const w = word.toLowerCase();
  const table: [string, string, Day][] = [
    ["mon", "월", 0], ["tue", "화", 1], ["wed", "수", 2], ["thu", "목", 3], ["fri", "금", 4], ["sat", "토", 5], ["sun", "일", 6],
  ];
  for (const [en, ko, d] of table) if (w.startsWith(en) || w.startsWith(ko)) return d;
  return null;
}

function parseDayRange(s: string): Day[] {
  const words = [...s.matchAll(DAY_WORD_RE)].map((m) => m[0]);
  const first = words[0] ? dayOf(words[0]) : null;
  if (first === null) return [];
  const last = words[1] ? dayOf(words[1]) : null;
  if (last === null) return [first];
  const out: Day[] = [first];
  let d = first;
  while (d !== last) {
    d = ((d + 1) % 7) as Day;
    out.push(d);
  }
  return out;
}

function toMinutes(h: string, m: string | undefined, meridiem: string | undefined, isEnd: boolean): number | null {
  let hour = Number(h);
  const minute = Number(m || "0");
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute > 59) return null;
  const mer = (meridiem ?? "").replace(/\./g, "");
  if (mer === "am" && hour === 12) hour = 0;
  if (mer === "pm" && hour < 12) hour += 12;
  if (hour > 24 || (hour === 24 && minute > 0)) return null;
  if (hour === 24 && !isEnd) return null;
  const total = hour * 60 + minute;
  // A bare "0:00" as end means midnight -> 24:00, so it isn't an overnight range.
  return isEnd && total === 0 ? DAY_MIN : total;
}

function parseTimeRange(s: string): MinuteRange | null {
  const v = TIME_RE.exec(s);
  if (!v) return null;
  const start = toMinutes(v[1], v[2], v[3], false);
  const end = toMinutes(v[4], v[5], v[6], true);
  if (start === null || end === null) return null;
  if (start === end) return { start: 0, end: DAY_MIN };
  return { start, end };
}

/**
 * Parses free-form hours the user types or pastes, e.g.
 *   "09:00-22:00" (every day) · "Mon-Fri 9:00-18:00; Sat 10-14; Sun closed"
 *   "월-금 11:00-14:00 17:00-22:00, 토 12:00-23:00, 일 휴무" · "Fri-Sat 6pm-2am" · "24h" · "매일 24시간"
 */
export function parseHours(raw: string | null | undefined): WeeklyHours | null {
  // Google formats times with narrow/no-break spaces ("9:00 AM").
  const text = (raw ?? "").replace(/[    ]/g, " ").trim().toLowerCase();
  if (!text) return null;

  const result: WeeklyHours = {};
  let currentDays = new Set<Day>();
  let lastWasDay = false;
  let sawAnything = false;

  const targetDays = () => (currentDays.size ? [...currentDays] : DAYS);
  const addDays = (days: Day[]) => {
    if (!lastWasDay) currentDays = new Set();
    days.forEach((d) => currentDays.add(d));
    lastWasDay = true;
  };
  const addRange = (r: MinuteRange) => {
    for (const d of targetDays()) (result[d] ??= []).push(r);
    lastWasDay = false;
    sawAnything = true;
  };

  for (const m of text.matchAll(TOKEN)) {
    const g = m.groups ?? {};
    if (g.all) addDays(DAYS);
    else if (g.weekdays) addDays([0, 1, 2, 3, 4]);
    else if (g.weekend) addDays([5, 6]);
    else if (g.h24) addRange({ start: 0, end: DAY_MIN });
    else if (g.closed) {
      for (const d of targetDays()) result[d] = [];
      lastWasDay = false;
      sawAnything = true;
    } else if (g.time) {
      const r = parseTimeRange(m[0]);
      if (r) addRange(r);
    } else if (g.day) addDays(parseDayRange(m[0]));
  }
  return sawAnything ? result : null;
}

export function hoursStatus(hours: WeeklyHours | null, now: WallTime): HoursStatus {
  if (!hours) return { kind: "unknown" };
  const t = now.minutes;
  const today = hours[now.day] ?? [];
  const yesterday = hours[((now.day + 6) % 7) as Day] ?? [];

  if (today.some((r) => r.start === 0 && r.end === DAY_MIN)) return { kind: "open", closesAt: null };

  let left: number | null = null;
  let closesAt = 0;
  const consider = (l: number, close: number) => {
    if (left === null || l > left) {
      left = l;
      closesAt = close;
    }
  };
  for (const r of today) {
    if (!isOvernight(r) && t >= r.start && t < r.end) consider(r.end - t, r.end);
    if (isOvernight(r) && t >= r.start) consider(DAY_MIN - t + r.end, r.end);
  }
  for (const r of yesterday) if (isOvernight(r) && t < r.end) consider(r.end - t, r.end);

  if (left !== null) {
    const at = closesAt % DAY_MIN;
    return left <= CLOSING_SOON_MINUTES ? { kind: "closingSoon", closesAt: at, minutesLeft: left } : { kind: "open", closesAt: at };
  }
  const later = today.map((r) => r.start).filter((s) => s > t);
  return { kind: "closed", opensAt: later.length ? Math.min(...later) : null };
}

export const hoursStatusFromText = (raw: string | null | undefined, now: WallTime) => hoursStatus(parseHours(raw), now);

const EN_DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Inverse of parseHours: compact, editable text. Closed days are omitted. */
export function formatHours(hours: WeeklyHours): string {
  const allDay = (rs: MinuteRange[] | undefined) => rs?.length === 1 && rs[0].start === 0 && rs[0].end === DAY_MIN;
  if (DAYS.every((d) => allDay(hours[d]))) return "24h";
  return DAYS.filter((d) => (hours[d] ?? []).length)
    .map((d) => `${EN_DAY[d]} ${hours[d]!.map((r) => `${hhmm(r.start)}-${hhmm(r.end)}`).join(" ")}`)
    .join("; ");
}

/** "HH:MM" for a minutes-since-midnight value (24:00 shows as 00:00). */
export const clock = (min: number) => hhmm(min % DAY_MIN);

/** The weekday of a calendar day "YYYY-MM-DD" (Monday = 0, as in WeeklyHours). */
export const dayOfDate = (iso: string): Day => (((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) as Day);

/**
 * Hours on one weekday, for planning another day: the ranges ([] = closed that day), or null when the
 * hours are unknown. "Mon-Fri 11-22" on a Saturday → [].
 */
export function hoursOnDay(raw: string | null | undefined, day: Day): MinuteRange[] | null {
  const h = parseHours(raw);
  if (!h) return null;
  return h[day] ?? [];
}
