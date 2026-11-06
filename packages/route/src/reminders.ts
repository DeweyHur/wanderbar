/**
 * Local reminders the phone schedules for my upcoming days (no server push needed):
 * - a route with stops: the evening before (20:00) and that morning (08:30);
 * - a day at home with things still to buy for its meals: the afternoon before (17:00) and that morning (09:00).
 * Times are the phone's local time on the route's date. Past times are skipped.
 */

export type ReminderDay = {
  planId: string;
  groupId: string;
  date: string;
  title: string;
  atHome: boolean;
  stops: number;
  firstStop: string | null;
  meals: number;
  toBuy: number;
};

export type ReminderKind = "routeTomorrow" | "routeToday" | "shopTomorrow" | "shopToday";
export type Reminder = { id: string; at: Date; kind: ReminderKind; planId: string; groupId: string; title: string; stops: number; firstStop: string | null; toBuy: number };

const at = (date: string, dayOffset: number, hh: number, mm: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d + dayOffset, hh, mm, 0, 0);
};

export function reminderSchedule(days: ReminderDay[], now: Date, limit = 40): Reminder[] {
  const out: Reminder[] = [];
  for (const day of days) {
    const base = { planId: day.planId, groupId: day.groupId, title: day.title, stops: day.stops, firstStop: day.firstStop, toBuy: day.toBuy };
    const add = (kind: ReminderKind, when: Date) => {
      if (when.getTime() > now.getTime()) out.push({ ...base, id: `${kind}-${day.planId}`, at: when, kind });
    };
    if (day.stops > 0) {
      add("routeTomorrow", at(day.date, -1, 20, 0));
      add("routeToday", at(day.date, 0, 8, 30));
    }
    if (day.atHome && day.toBuy > 0) {
      add("shopTomorrow", at(day.date, -1, 17, 0));
      add("shopToday", at(day.date, 0, 9, 0));
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, limit);
}
