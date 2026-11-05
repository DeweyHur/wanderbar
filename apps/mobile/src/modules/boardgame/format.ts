/** Board game display helpers (dates in the group's time zone, link names from BGG / BGA URLs). */

const titleCase = (slug: string) =>
  decodeURIComponent(slug)
    .split(/[-_+\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** A game's name from its BoardGameGeek or Board Game Arena link, e.g. ".../boardgame/295947/cascadia" → "Cascadia". */
export function nameFromLink(url: string): string | null {
  const bgg = /boardgamegeek\.com\/boardgame(?:expansion)?\/\d+\/([^/?#]+)/i.exec(url);
  if (bgg) return titleCase(bgg[1]);
  const bga = /boardgamearena\.com\/(?:gamepanel\?game=|game\/|table\?game=)([a-z0-9_-]+)/i.exec(url);
  if (bga) return titleCase(bga[1]);
  return null;
}

/** "Sat, Nov 7, 7:00 PM" in the group's time zone. */
export function nightWhen(iso: string, tz: string, lang: string) {
  return new Intl.DateTimeFormat(lang, { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** The local date (YYYY-MM-DD) and time (HH:MM) of an instant in a time zone, for editing. */
export function localParts(iso: string, tz: string) {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(d);
  return { date, time };
}

/** "19:00" → "7:00 PM" (or "19:00" in Korean), for schedule summaries. */
export function timeLabel(hhmm: string, lang: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return new Intl.DateTimeFormat(lang, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 1, h, m)));
}

export const scoreText = (avg: number | null) => (avg == null ? "–" : Number.isInteger(avg) ? String(avg) : avg.toFixed(1));

/** "coop, Heavy ,party" → ["coop", "Heavy", "party"] */
export const splitTags = (s: string) =>
  s
    .split(/[,，、]/)
    .map((x) => x.trim())
    .filter(Boolean);
