import type { TFunction } from "i18next";

/** A local calendar day as YYYY-MM-DD. */
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const today = () => isoDay(new Date());
export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoDay(d);
};
const asDate = (iso: string) => new Date(`${iso}T12:00:00`);

/** "Today" / "Tomorrow" / "Yesterday" / "Sat, Nov 8" (with the year when it isn't this year). */
export function dayLabel(t: TFunction, locale: string, iso: string) {
  const now = today();
  if (iso === now) return t("food:date.today");
  if (iso === addDays(now, 1)) return t("food:date.tomorrow");
  if (iso === addDays(now, -1)) return t("food:date.yesterday");
  const sameYear = iso.slice(0, 4) === now.slice(0, 4);
  return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(asDate(iso));
}

/** A route's name: its title, else its day ("Sat, Nov 8 route"). */
export function planLabel(t: TFunction, locale: string, p: { title: string; date: string | null }) {
  if (p.title.trim()) return p.title;
  return t("food:route.defaultTitle", { date: p.date ? dayLabel(t, locale, p.date) : "" });
}

/** Days of the month grid for the month containing iso, Monday first; null = padding. */
export function monthGrid(iso: string): (string | null)[] {
  const first = new Date(`${iso.slice(0, 7)}-01T12:00:00`);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${iso.slice(0, 7)}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export const shiftMonth = (iso: string, n: number) => {
  const d = new Date(`${iso.slice(0, 7)}-01T12:00:00`);
  d.setMonth(d.getMonth() + n);
  return isoDay(d);
};
