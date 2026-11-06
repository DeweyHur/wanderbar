import { eq } from "drizzle-orm";
import { XMLParser } from "fast-xml-parser";
import type { Db } from "../db/client";
import { bggCache } from "../db/schema";
import { HttpError } from "./errors";

/**
 * BoardGameGeek XML API2: search games by name and read one game's details (picture, players, time).
 * Registration is required: requests carry `Authorization: Bearer $BGG_API_TOKEN` (an application
 * token from boardgamegeek.com/applications). Non-commercial use, data shown unmodified, credited
 * "Powered by BGG". Calls are made by the server and cached in the database, as BGG asks.
 */

type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;

const BASE = "https://boardgamegeek.com/xmlapi2";
const SEARCH_TTL = 24 * 60 * 60 * 1000;
const THING_TTL = 7 * 24 * 60 * 60 * 1000;

/** End-to-end tests only: canned answers instead of calling BGG (needs the in-memory database too). */
export const bggFakeEnabled = (env: Env = process.env) =>
  env.E2E_FAKE_BGG === "1" && (env.DATABASE_URL ?? "").startsWith("pglite:") && env.VERCEL !== "1";

export const bggAvailable = (env: Env = process.env) => bggFakeEnabled(env) || !!env.BGG_API_TOKEN;

export type BggSearchHit = { id: number; name: string; year: number | null };
export type BggGame = {
  id: number;
  name: string;
  year: number | null;
  image: string | null;
  thumbnail: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  playingTime: number | null;
  weight: number | null;
};

/** ".../boardgame/266192/wingspan" (or boardgameexpansion) → 266192 */
export function bggIdFromUrl(url: string): number | null {
  const m = /boardgamegeek\.com\/boardgame(?:expansion)?\/(\d+)/i.exec(url);
  return m ? Number(m[1]) : null;
}

export const bggUrl = (id: number) => `https://boardgamegeek.com/boardgame/${id}`;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  isArray: (name) => name === "item" || name === "name",
});

type XmlValue = { value?: string | number };
type XmlItem = {
  id?: string | number;
  name?: (XmlValue & { type?: string })[];
  yearpublished?: XmlValue;
  image?: string;
  thumbnail?: string;
  minplayers?: XmlValue;
  maxplayers?: XmlValue;
  playingtime?: XmlValue;
  statistics?: { ratings?: { averageweight?: XmlValue } };
};

const num = (v: XmlValue | undefined) => {
  const n = Number(v?.value);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const primaryName = (it: XmlItem) => String((it.name ?? []).find((n) => n.type === "primary")?.value ?? it.name?.[0]?.value ?? "");
/** BGG image URLs sometimes come protocol-relative. */
const https = (u: string | undefined) => (u ? (u.startsWith("//") ? `https:${u}` : u.trim()) : null);

export function parseSearch(xml: string): BggSearchHit[] {
  const items: XmlItem[] = parser.parse(xml)?.items?.item ?? [];
  const seen = new Set<number>();
  const out: BggSearchHit[] = [];
  for (const it of items) {
    const id = Number(it.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: primaryName(it), year: num(it.yearpublished) });
  }
  return out;
}

export function parseThing(xml: string): BggGame | null {
  const it: XmlItem | undefined = parser.parse(xml)?.items?.item?.[0];
  if (!it?.id) return null;
  const w = Number(it.statistics?.ratings?.averageweight?.value);
  return {
    id: Number(it.id),
    name: primaryName(it),
    year: num(it.yearpublished),
    image: https(it.image),
    thumbnail: https(it.thumbnail),
    minPlayers: num(it.minplayers),
    maxPlayers: num(it.maxplayers),
    playingTime: num(it.playingtime),
    weight: Number.isFinite(w) && w > 0 ? Math.round(w * 100) / 100 : null,
  };
}

/** Exact name first, then names starting with the query, then the rest; newer editions first among equals. */
export function rankHits(hits: BggSearchHit[], q: string, limit = 10) {
  const query = q.trim().toLowerCase();
  const score = (h: BggSearchHit) => {
    const n = h.name.toLowerCase();
    return n === query ? 0 : n.startsWith(query) ? 1 : n.split(/[\s:]+/).some((w) => w.startsWith(query)) ? 2 : 3;
  };
  return [...hits].sort((a, b) => score(a) - score(b) || (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name)).slice(0, limit);
}

async function cached<T>(db: Db, key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const [row] = await db.select().from(bggCache).where(eq(bggCache.key, key));
  if (row && Date.now() - row.fetchedAt.getTime() < ttl) return (row.body as { v: T }).v;
  const value = await load();
  // Wrapped, so lists and "not found" (null) are stored as JSON objects.
  const body = { v: value ?? null };
  await db
    .insert(bggCache)
    .values({ key, body, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: bggCache.key, set: { body, fetchedAt: new Date() } });
  return value;
}

async function call(path: string, f: Fetch): Promise<string> {
  if (bggFakeEnabled()) return fakeXml(path);
  const token = process.env.BGG_API_TOKEN;
  if (!token) throw new HttpError(503, "bgg.unavailable");
  let res: Response;
  try {
    // No "www.": BGG ignores the token there.
    res = await f(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/xml" } });
  } catch {
    throw new HttpError(502, "bgg.failed");
  }
  if (res.status === 429) throw new HttpError(503, "bgg.busy");
  if (!res.ok) {
    console.error("[bgg]", res.status, path);
    throw new HttpError(502, "bgg.failed");
  }
  return res.text();
}

export async function searchGames(db: Db, q: string, f: Fetch = fetch) {
  const query = q.replace(/\s+/g, " ").trim();
  if (query.length < 2) return [];
  const hits = await cached(db, `search:${query.toLowerCase()}`, SEARCH_TTL, async () =>
    parseSearch(await call(`/search?type=boardgame&query=${encodeURIComponent(query)}`, f)),
  );
  return rankHits(hits, query);
}

export async function getBggGame(db: Db, id: number, f: Fetch = fetch) {
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "bgg.bad_id");
  const game = await cached(db, `thing:${id}`, THING_TTL, async () => parseThing(await call(`/thing?id=${id}&stats=1`, f)));
  if (!game) throw new HttpError(404, "bgg.not_found");
  return game;
}

// ---- canned BGG answers for end-to-end tests ----

const FAKE: BggGame[] = [
  { id: 266192, name: "Wingspan", year: 2019, minPlayers: 1, maxPlayers: 5, playingTime: 70, weight: 2.48 },
  { id: 295947, name: "Cascadia", year: 2021, minPlayers: 1, maxPlayers: 4, playingTime: 45, weight: 1.84 },
  { id: 224517, name: "Brass: Birmingham", year: 2018, minPlayers: 2, maxPlayers: 4, playingTime: 120, weight: 3.86 },
  { id: 290236, name: "Canvas", year: 2021, minPlayers: 1, maxPlayers: 5, playingTime: 45, weight: 1.84 },
].map((g) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#8fb8de"/><text x="100" y="115" font-size="48" text-anchor="middle" fill="#fff">${g.name[0]}</text></svg>`;
  const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  return { ...g, image: uri, thumbnail: uri };
});

function fakeXml(path: string) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const q = /query=([^&]*)/.exec(path);
  if (q) {
    const query = decodeURIComponent(q[1]).toLowerCase();
    const hits = FAKE.filter((g) => g.name.toLowerCase().includes(query));
    return `<items total="${hits.length}">${hits
      .map((g) => `<item type="boardgame" id="${g.id}"><name type="primary" value="${esc(g.name)}"/><yearpublished value="${g.year}"/></item>`)
      .join("")}</items>`;
  }
  const id = Number(/id=(\d+)/.exec(path)?.[1]);
  const g = FAKE.find((x) => x.id === id);
  if (!g) return "<items></items>";
  return `<items><item type="boardgame" id="${g.id}"><thumbnail>${g.thumbnail}</thumbnail><image>${g.image}</image>
    <name type="primary" sortindex="1" value="${esc(g.name)}"/><name type="alternate" value="Alt ${esc(g.name)}"/>
    <yearpublished value="${g.year}"/><minplayers value="${g.minPlayers}"/><maxplayers value="${g.maxPlayers}"/>
    <playingtime value="${g.playingTime}"/><statistics page="1"><ratings><averageweight value="${g.weight}"/></ratings></statistics></item></items>`;
}
