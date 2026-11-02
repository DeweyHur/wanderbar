/** A place parsed from text shared into the app (typically from Google Maps). */
export type SharedPlace = { name: string; address: string; mapsUrl: string | null };

const URL_RE = /https?:\/\/\S+/;
const URL_RE_G = /https?:\/\/\S+/g;

/**
 * Google Maps shares e.g. "Blue Bottle Coffee\n315 Linden St, San Francisco, CA 94102\nhttps://maps.app.goo.gl/abc".
 * Sometimes only the URL; sometimes a subject line holds the name.
 */
export function parseSharedText(text?: string | null, subject?: string | null): SharedPlace {
  const raw = text ?? "";
  const url = URL_RE.exec(raw)?.[0]?.replace(/[.,)]+$/, "") ?? null;
  const lines = raw
    .replace(URL_RE_G, "\n")
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^"+|"+$/g, ""))
    .filter(Boolean);
  const subjectName = (subject ?? "").trim();
  let name: string;
  let addressLines: string[];
  if (subjectName && lines[0] !== subjectName) {
    name = subjectName;
    addressLines = lines;
  } else {
    name = lines[0] ?? "";
    addressLines = lines.slice(1);
  }
  return { name, address: addressLines.join(", "), mapsUrl: url };
}
