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

/** A stop with a time you can't move (a reservation, a show), as /api/me/reminders sends it. */
export type FixedStop = {
  stopId: string;
  planId: string;
  groupId: string;
  name: string;
  /** When to be there (ISO). */
  fixedAt: string;
  /** The stop you'd leave from, if the route has one before it. */
  from: string | null;
  /** Drive time from there, when known. */
  travelSeconds: number | null;
};

/** Minutes of slack on top of the drive (parking, walking in). */
export const LEAVE_BUFFER_MIN = 10;

/** When to leave to be there on time: the fixed time minus the drive and a little slack. Null when the drive isn't known. */
export function leaveAt(fixedAt: Date, travelSeconds: number | null | undefined, bufferMin = LEAVE_BUFFER_MIN): Date | null {
  if (travelSeconds == null) return null;
  return new Date(fixedAt.getTime() - travelSeconds * 1000 - bufferMin * 60_000);
}

export type FixedReminderKind = "leaveSoon" | "leaveNow" | "fixedSoon";
export type FixedReminder = { id: string; at: Date; kind: FixedReminderKind; stopId: string; planId: string; name: string; fixedAt: Date; leaveAt: Date | null; from: string | null };

/**
 * Reminders for fixed-time stops: 15 minutes before you need to leave, and when it's time to go. When the
 * drive isn't known (no location, or it's the first stop), one reminder an hour before the time instead.
 */
export function fixedReminders(fixed: FixedStop[], now: Date, limit = 20): FixedReminder[] {
  const out: FixedReminder[] = [];
  for (const f of fixed) {
    const fixedAt = new Date(f.fixedAt);
    const leave = leaveAt(fixedAt, f.travelSeconds);
    const base = { stopId: f.stopId, planId: f.planId, name: f.name, fixedAt, leaveAt: leave, from: f.from };
    const add = (kind: FixedReminderKind, when: Date) => {
      if (when.getTime() > now.getTime()) out.push({ ...base, id: `${kind}-${f.stopId}`, at: when, kind });
    };
    if (leave) {
      add("leaveSoon", new Date(leave.getTime() - 15 * 60_000));
      add("leaveNow", leave);
    } else add("fixedSoon", new Date(fixedAt.getTime() - 60 * 60_000));
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, limit);
}
