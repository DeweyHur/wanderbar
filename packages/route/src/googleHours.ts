import { formatHours, type Day, type MinuteRange, type WeeklyHours } from "./hours";

/** Places API (New) regularOpeningHours.periods[]: day 0 = Sunday. */
export type GooglePeriod = {
  open?: { day: number; hour?: number; minute?: number } | null;
  close?: { day: number; hour?: number; minute?: number } | null;
};

const ourDay = (googleDay: number) => ((googleDay + 6) % 7) as Day;

/** Google's structured periods → our editable hours text (same rules as the old Kotlin app). */
export function googlePeriodsToHoursRaw(periods: GooglePeriod[] | null | undefined): string {
  const days: WeeklyHours = {};
  const add = (d: Day, r: MinuteRange) => (days[d] ??= []).push(r);
  for (const p of periods ?? []) {
    if (!p.open) continue;
    const start = (p.open.hour ?? 0) * 60 + (p.open.minute ?? 0);
    if (!p.close) {
      // A single period with no close means open 24/7.
      for (const d of [0, 1, 2, 3, 4, 5, 6] as Day[]) add(d, { start: 0, end: 24 * 60 });
      continue;
    }
    let end = (p.close.hour ?? 0) * 60 + (p.close.minute ?? 0);
    if (end === 0 && p.close.day !== p.open.day) end = 24 * 60;
    add(ourDay(p.open.day), { start, end });
  }
  if (!Object.keys(days).length) return "";
  for (const k of Object.keys(days)) days[Number(k) as Day]!.sort((a, b) => a.start - b.start);
  return formatHours(days);
}
