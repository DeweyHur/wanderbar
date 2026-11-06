import { and, asc, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { externalLinks, gameQueue, groups, items, itemTags, meetupNights, meetupSeries, memberships, nightGames, ratings, tags, users } from "../db/schema";
import { badRequest, forbidden, notFound } from "./errors";
import { requireMember, type Role } from "./groups";
import { displayName, notifyGroup } from "./push";
import { DATE_RE, isTimeZone, localDate, nextOccurrence, TIME_RE, zonedInstant } from "./recurrence";

/**
 * Board game module: the group's game library (with BGG / BGA / TTS / rulebook / video links and tags),
 * regular meetups that create the next game night ahead of time, who picks the games, the wishlist
 * queue, 10-point ratings with comments, and the data the leaderboard is built from.
 */

export const GAME_LINK_KINDS = ["bgg", "bga", "tts", "rulebook", "video", "other"] as const;
export type GameLinkKind = (typeof GAME_LINK_KINDS)[number];
export type LinkInput = { kind: GameLinkKind; url: string; label?: string | null };
export type GameInput = { name?: string; memo?: string; links?: LinkInput[]; tags?: string[] };
export type SeriesInput = { title?: string; weekday?: number; time?: string; everyWeeks?: number; startDate?: string; location?: string };
/** The time is either an instant or a local date + "HH:MM" in the group's time zone. */
export type NightInput = { startsAt?: Date; date?: string; time?: string; location?: string; note?: string; pickerId?: string | null };

/** A night counts as "on" (not yet history) until this long after it starts. */
export const LIVE_MS = 5 * 60 * 60 * 1000;
const MAX_TAGS = 12;

const manager = (role: Role) => role === "owner" || role === "host";
const who = (r: { name: string | null; email: string }) => r.name || r.email.split("@")[0];
/** 10-point sums → { avg (one decimal), count }. */
const summary = (sum: number, n: number) => (n ? { avg: Math.round((sum / n) * 10) / 10, count: n } : { avg: null as number | null, count: 0 });

// ---------- games ----------

async function memberGame(db: Db, id: string, userId: string) {
  const [game] = await db.select().from(items).where(and(eq(items.id, id), eq(items.type, "game")));
  if (!game) throw notFound("game.not_found");
  const role = await requireMember(db, game.groupId, userId).catch(() => {
    throw notFound("game.not_found");
  });
  return { game, role };
}

function cleanLinks(links: LinkInput[]) {
  const out: LinkInput[] = [];
  for (const l of links) {
    const url = l.url.trim();
    if (!url) continue;
    if (!/^https?:\/\/[^\s]+$/i.test(url) || url.length > 2000) throw badRequest("game.link_invalid");
    if (!GAME_LINK_KINDS.includes(l.kind)) throw badRequest("game.link_invalid");
    if (out.some((o) => o.kind === l.kind && o.url === url)) continue;
    out.push({ kind: l.kind, url, label: l.label?.trim() || null });
  }
  return out;
}

/** "  Co-op " → "Co-op"; duplicates (ignoring case) dropped. */
export function cleanTags(names: string[]) {
  const out: string[] = [];
  for (const n of names) {
    const name = n.replace(/\s+/g, " ").trim().slice(0, 30);
    if (name && !out.some((o) => o.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  if (out.length > MAX_TAGS) throw badRequest("game.too_many_tags");
  return out;
}

async function setLinks(db: Db, itemId: string, links: LinkInput[]) {
  await db.delete(externalLinks).where(eq(externalLinks.itemId, itemId));
  if (links.length) await db.insert(externalLinks).values(links.map((l) => ({ itemId, kind: l.kind, url: l.url, label: l.label ?? null })));
}

async function setTags(db: Db, groupId: string, itemId: string, names: string[]) {
  await db.delete(itemTags).where(eq(itemTags.itemId, itemId));
  if (!names.length) return;
  await db
    .insert(tags)
    .values(names.map((name) => ({ groupId, name, key: name.toLowerCase() })))
    .onConflictDoNothing();
  const rows = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.groupId, groupId), inArray(tags.key, names.map((n) => n.toLowerCase()))));
  await db.insert(itemTags).values(rows.map((r) => ({ itemId, tagId: r.id })));
}

/** Links, tags, ratings, plays and queue entries for a set of games, keyed by game id. */
async function gameFacts(db: Db, ids: string[], userId: string, now: Date) {
  if (!ids.length) return () => null;
  const [links, tagRows, rs, plays, queued] = await Promise.all([
    db.select().from(externalLinks).where(inArray(externalLinks.itemId, ids)).orderBy(asc(externalLinks.createdAt)),
    db
      .select({ itemId: itemTags.itemId, name: tags.name })
      .from(itemTags)
      .innerJoin(tags, eq(tags.id, itemTags.tagId))
      .where(inArray(itemTags.itemId, ids))
      .orderBy(asc(sql`lower(${tags.name})`)),
    db.select({ itemId: ratings.itemId, userId: ratings.userId, score: ratings.score, review: ratings.review }).from(ratings).where(inArray(ratings.itemId, ids)),
    db
      .select({ itemId: nightGames.itemId, n: sql<number>`count(*)::int`, last: sql<string>`max(${meetupNights.startsAt})` })
      .from(nightGames)
      .innerJoin(meetupNights, eq(meetupNights.id, nightGames.nightId))
      .where(and(inArray(nightGames.itemId, ids), lte(meetupNights.startsAt, now)))
      .groupBy(nightGames.itemId),
    db
      .select({ itemId: gameQueue.itemId, userId: gameQueue.userId, name: users.name, email: users.email, at: gameQueue.createdAt })
      .from(gameQueue)
      .innerJoin(users, eq(users.id, gameQueue.userId))
      .where(inArray(gameQueue.itemId, ids))
      .orderBy(asc(gameQueue.createdAt)),
  ]);
  return (id: string) => {
    const mine = rs.filter((r) => r.itemId === id);
    const p = plays.find((x) => x.itemId === id);
    const q = queued.filter((x) => x.itemId === id);
    return {
      links: links.filter((l) => l.itemId === id).map((l) => ({ kind: l.kind as GameLinkKind, url: l.url, label: l.label })),
      tags: tagRows.filter((t) => t.itemId === id).map((t) => t.name),
      rating: summary(mine.reduce((a, r) => a + r.score, 0), mine.length),
      myScore: mine.find((r) => r.userId === userId)?.score ?? null,
      myReview: mine.find((r) => r.userId === userId)?.review ?? null,
      plays: p?.n ?? 0,
      lastPlayedAt: p?.last ? new Date(p.last).toISOString() : null,
      queuedBy: q.map((x) => ({ userId: x.userId, name: who(x) })),
      queuedAt: q[0]?.at ?? null,
    };
  };
}

type GameRow = typeof items.$inferSelect;
const gameBase = (g: GameRow) => ({ id: g.id, groupId: g.groupId, name: g.name, memo: g.memo, createdBy: g.createdBy });

export async function listGames(db: Db, groupId: string, userId: string, now = new Date()) {
  await requireMember(db, groupId, userId);
  const rows = await db
    .select()
    .from(items)
    .where(and(eq(items.groupId, groupId), eq(items.type, "game")))
    .orderBy(asc(sql`lower(${items.name})`));
  const facts = await gameFacts(db, rows.map((r) => r.id), userId, now);
  return rows.map((g) => {
    const f = facts(g.id)!;
    return { ...gameBase(g), ...f, queuedByMe: f.queuedBy.some((q) => q.userId === userId) };
  });
}

export async function createGame(db: Db, groupId: string, userId: string, input: GameInput) {
  await requireMember(db, groupId, userId);
  const name = (input.name ?? "").trim();
  if (!name) throw badRequest("game.name_required");
  const links = cleanLinks(input.links ?? []);
  const tagNames = cleanTags(input.tags ?? []);
  const [game] = await db
    .insert(items)
    .values({ groupId, module: "boardgame", type: "game", name, memo: (input.memo ?? "").trim(), createdBy: userId })
    .returning();
  await setLinks(db, game.id, links);
  await setTags(db, groupId, game.id, tagNames);
  return getGame(db, game.id, userId);
}

export async function getGame(db: Db, id: string, userId: string, now = new Date()) {
  const { game, role } = await memberGame(db, id, userId);
  const f = (await gameFacts(db, [id], userId, now))(id)!;
  const rs = await db
    .select({ rating: ratings, name: users.name, email: users.email })
    .from(ratings)
    .innerJoin(users, eq(users.id, ratings.userId))
    .where(eq(ratings.itemId, id))
    .orderBy(desc(ratings.updatedAt));
  const nights = await db
    .select({ id: meetupNights.id, startsAt: meetupNights.startsAt })
    .from(nightGames)
    .innerJoin(meetupNights, eq(meetupNights.id, nightGames.nightId))
    .where(eq(nightGames.itemId, id))
    .orderBy(desc(meetupNights.startsAt))
    .limit(30);
  const mine = rs.find((r) => r.rating.userId === userId);
  return {
    ...gameBase(game),
    ...f,
    queuedByMe: f.queuedBy.some((q) => q.userId === userId),
    canDelete: game.createdBy === userId || manager(role),
    mine: mine ? { score: mine.rating.score, review: mine.rating.review } : null,
    ratings: rs.map((r) => ({ userId: r.rating.userId, name: who(r), score: r.rating.score, review: r.rating.review, updatedAt: r.rating.updatedAt })),
    nights: nights.map((n) => ({ id: n.id, startsAt: n.startsAt, past: n.startsAt.getTime() <= now.getTime() })),
  };
}

export async function updateGame(db: Db, id: string, userId: string, input: GameInput) {
  const { game } = await memberGame(db, id, userId);
  if (input.name !== undefined && !input.name.trim()) throw badRequest("game.name_required");
  const set: Partial<typeof items.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) set.name = input.name.trim();
  if (input.memo !== undefined) set.memo = input.memo.trim();
  const links = input.links === undefined ? undefined : cleanLinks(input.links);
  const tagNames = input.tags === undefined ? undefined : cleanTags(input.tags);
  await db.update(items).set(set).where(eq(items.id, id));
  if (links) await setLinks(db, id, links);
  if (tagNames) await setTags(db, game.groupId, id, tagNames);
  return getGame(db, id, userId);
}

/** Whoever added it, or the group's owner or a host. */
export async function deleteGame(db: Db, id: string, userId: string) {
  const { game, role } = await memberGame(db, id, userId);
  if (game.createdBy !== userId && !manager(role)) throw forbidden("game.delete_forbidden");
  await db.delete(items).where(eq(items.id, id));
}

/** One rating per member per game, 1..10, updated after each play. */
export async function rateGame(db: Db, id: string, userId: string, input: { score: number; review?: string }) {
  const { game } = await memberGame(db, id, userId);
  const score = input.score;
  if (!Number.isInteger(score) || score < 1 || score > 10) throw badRequest("rating.score_invalid");
  const review = (input.review ?? "").trim();
  await db
    .insert(ratings)
    .values({ groupId: game.groupId, itemId: id, userId, score, review })
    .onConflictDoUpdate({ target: [ratings.itemId, ratings.userId], set: { score, review, updatedAt: new Date() } });
  return getGame(db, id, userId);
}

export async function unrateGame(db: Db, id: string, userId: string) {
  await memberGame(db, id, userId);
  await db.delete(ratings).where(and(eq(ratings.itemId, id), eq(ratings.userId, userId)));
  return getGame(db, id, userId);
}

/** "I want to play this": puts the game in the group's queue (my entry). */
export async function queueGame(db: Db, id: string, userId: string) {
  const { game } = await memberGame(db, id, userId);
  await db.insert(gameQueue).values({ groupId: game.groupId, itemId: id, userId }).onConflictDoNothing();
  return getGame(db, id, userId);
}

export async function unqueueGame(db: Db, id: string, userId: string) {
  await memberGame(db, id, userId);
  await db.delete(gameQueue).where(and(eq(gameQueue.itemId, id), eq(gameQueue.userId, userId)));
  return getGame(db, id, userId);
}

// ---------- regular meetups ----------

async function groupTimezone(db: Db, groupId: string) {
  const [g] = await db.select({ timezone: groups.timezone }).from(groups).where(eq(groups.id, groupId));
  return g && isTimeZone(g.timezone) ? g.timezone : "UTC";
}

function checkSeries(s: { weekday: number; time: string; everyWeeks: number; startDate: string }) {
  if (!Number.isInteger(s.weekday) || s.weekday < 0 || s.weekday > 6) throw badRequest("series.weekday_invalid");
  if (!TIME_RE.test(s.time)) throw badRequest("series.time_invalid");
  if (!Number.isInteger(s.everyWeeks) || s.everyWeeks < 1 || s.everyWeeks > 4) throw badRequest("series.every_invalid");
  if (!DATE_RE.test(s.startDate)) throw badRequest("series.start_invalid");
}

async function managedSeries(db: Db, id: string, userId: string) {
  const [series] = await db.select().from(meetupSeries).where(eq(meetupSeries.id, id));
  if (!series) throw notFound("series.not_found");
  const role = await requireMember(db, series.groupId, userId).catch(() => {
    throw notFound("series.not_found");
  });
  if (!manager(role)) throw forbidden("series.manage_forbidden");
  return series;
}

/**
 * Who picks next: the member after the last night's picker, in the order people joined
 * (null until someone has picked once).
 */
export async function suggestPicker(db: Db, groupId: string) {
  const [last] = await db
    .select({ pickerId: meetupNights.pickerId })
    .from(meetupNights)
    .where(and(eq(meetupNights.groupId, groupId), sql`${meetupNights.pickerId} is not null`))
    .orderBy(desc(meetupNights.startsAt))
    .limit(1);
  if (!last?.pickerId) return null;
  const members = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.groupId, groupId))
    .orderBy(asc(memberships.joinedAt), asc(memberships.userId));
  const i = members.findIndex((m) => m.userId === last.pickerId);
  return members[(i + 1) % members.length]?.userId ?? null;
}

/** Each active series always has its next night created (the one after the current one has passed). */
export async function ensureUpcoming(db: Db, groupId: string, now = new Date()) {
  const series = await db
    .select()
    .from(meetupSeries)
    .where(and(eq(meetupSeries.groupId, groupId), eq(meetupSeries.active, true)));
  if (!series.length) return;
  const tz = await groupTimezone(db, groupId);
  const since = new Date(now.getTime() - LIVE_MS);
  for (const s of series) {
    const [has] = await db
      .select({ id: meetupNights.id })
      .from(meetupNights)
      .where(and(eq(meetupNights.seriesId, s.id), gt(meetupNights.startsAt, since)))
      .limit(1);
    if (has) continue;
    const startsAt = nextOccurrence(s, now, tz);
    const pickerId = await suggestPicker(db, groupId);
    await db.insert(meetupNights).values({ groupId, seriesId: s.id, startsAt, location: s.location, pickerId }).onConflictDoNothing();
  }
}

export async function createSeries(db: Db, groupId: string, userId: string, input: SeriesInput, now = new Date()) {
  const role = await requireMember(db, groupId, userId);
  if (!manager(role)) throw forbidden("series.manage_forbidden");
  const tz = await groupTimezone(db, groupId);
  const s = {
    weekday: input.weekday ?? 6,
    time: input.time ?? "19:00",
    everyWeeks: input.everyWeeks ?? 1,
    startDate: input.startDate ?? localDate(now, tz),
  };
  checkSeries(s);
  const [row] = await db
    .insert(meetupSeries)
    .values({ groupId, ...s, title: (input.title ?? "").trim(), location: (input.location ?? "").trim(), createdBy: userId })
    .returning();
  await ensureUpcoming(db, groupId, now);
  return row;
}

/** Changing the schedule moves the series' upcoming night (keeping its games and picker). */
export async function updateSeries(db: Db, id: string, userId: string, input: SeriesInput, now = new Date()) {
  const series = await managedSeries(db, id, userId);
  const next = {
    weekday: input.weekday ?? series.weekday,
    time: input.time ?? series.time,
    everyWeeks: input.everyWeeks ?? series.everyWeeks,
    startDate: input.startDate ?? series.startDate,
  };
  checkSeries(next);
  const [row] = await db
    .update(meetupSeries)
    .set({
      ...next,
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.location !== undefined ? { location: input.location.trim() } : {}),
    })
    .where(eq(meetupSeries.id, id))
    .returning();
  const tz = await groupTimezone(db, series.groupId);
  const [upcoming] = await db
    .select()
    .from(meetupNights)
    .where(and(eq(meetupNights.seriesId, id), gt(meetupNights.startsAt, now)))
    .orderBy(asc(meetupNights.startsAt))
    .limit(1);
  if (upcoming) {
    await db
      .update(meetupNights)
      .set({ startsAt: nextOccurrence(row, now, tz), location: row.location })
      .where(eq(meetupNights.id, upcoming.id));
  }
  await ensureUpcoming(db, series.groupId, now);
  return row;
}

/** Stops the series: its future nights go; past nights stay in the history. */
export async function deleteSeries(db: Db, id: string, userId: string, now = new Date()) {
  await managedSeries(db, id, userId);
  await db.delete(meetupNights).where(and(eq(meetupNights.seriesId, id), gt(meetupNights.startsAt, now)));
  await db.delete(meetupSeries).where(eq(meetupSeries.id, id));
}

// ---------- nights ----------

async function memberNight(db: Db, id: string, userId: string) {
  const [night] = await db.select().from(meetupNights).where(eq(meetupNights.id, id));
  if (!night) throw notFound("night.not_found");
  const role = await requireMember(db, night.groupId, userId).catch(() => {
    throw notFound("night.not_found");
  });
  return { night, role };
}

async function nightTime(db: Db, groupId: string, input: NightInput) {
  if (input.date !== undefined || input.time !== undefined) {
    if (!input.date || !input.time || !DATE_RE.test(input.date) || !TIME_RE.test(input.time)) throw badRequest("night.time_invalid");
    return zonedInstant(input.date, input.time, await groupTimezone(db, groupId));
  }
  if (input.startsAt && Number.isNaN(input.startsAt.getTime())) throw badRequest("night.time_invalid");
  return input.startsAt;
}

/** The picker chooses the games; until someone is picking, anyone can. The owner and hosts always can. */
const canEditLineup = (night: { pickerId: string | null }, role: Role, userId: string) =>
  manager(role) || night.pickerId === null || night.pickerId === userId;

type NightRow = typeof meetupNights.$inferSelect;

async function nightViews(db: Db, nights: NightRow[], userId: string, now: Date) {
  if (!nights.length) return [];
  const ids = nights.map((n) => n.id);
  const lineup = await db
    .select({ nightId: nightGames.nightId, item: items, orderIndex: nightGames.orderIndex })
    .from(nightGames)
    .innerJoin(items, eq(items.id, nightGames.itemId))
    .where(inArray(nightGames.nightId, ids))
    .orderBy(asc(nightGames.orderIndex), asc(nightGames.createdAt));
  const facts = await gameFacts(db, [...new Set(lineup.map((l) => l.item.id))], userId, now);
  const pickerIds = [...new Set(nights.map((n) => n.pickerId).filter((x): x is string => !!x))];
  const pickers = pickerIds.length
    ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, pickerIds))
    : [];
  const series = await db
    .select({ id: meetupSeries.id, title: meetupSeries.title })
    .from(meetupSeries)
    .where(inArray(meetupSeries.id, [...new Set(nights.map((n) => n.seriesId).filter((x): x is string => !!x))].concat([""])));
  return nights.map((n) => {
    const p = pickers.find((x) => x.id === n.pickerId);
    const t = n.startsAt.getTime();
    return {
      id: n.id,
      groupId: n.groupId,
      seriesId: n.seriesId,
      seriesTitle: series.find((s) => s.id === n.seriesId)?.title ?? null,
      startsAt: n.startsAt,
      location: n.location,
      note: n.note,
      picker: p ? { id: p.id, name: who(p) } : null,
      status: (now.getTime() < t ? "upcoming" : now.getTime() < t + LIVE_MS ? "live" : "past") as "upcoming" | "live" | "past",
      games: lineup
        .filter((l) => l.nightId === n.id)
        .map((l) => {
          const f = facts(l.item.id)!;
          return { id: l.item.id, name: l.item.name, links: f.links, tags: f.tags, rating: f.rating, myScore: f.myScore, myReview: f.myReview };
        }),
    };
  });
}

export async function getNight(db: Db, id: string, userId: string, now = new Date()) {
  const { night, role } = await memberNight(db, id, userId);
  const [view] = await nightViews(db, [night], userId, now);
  const members = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.groupId, night.groupId))
    .orderBy(asc(memberships.joinedAt));
  return {
    ...view,
    timezone: await groupTimezone(db, night.groupId),
    canManage: manager(role),
    canEditLineup: canEditLineup(night, role, userId),
    /** Reassigning the picker: the owner, hosts, or the current picker. Anyone can volunteer when nobody is. */
    canAssignPicker: manager(role) || night.pickerId === userId || night.pickerId === null,
    members: members.map((m) => ({ id: m.id, name: who(m) })),
  };
}

/** A one-off night (not from a series). */
export async function createNight(db: Db, groupId: string, userId: string, input: NightInput) {
  const role = await requireMember(db, groupId, userId);
  if (!manager(role)) throw forbidden("night.manage_forbidden");
  const startsAt = await nightTime(db, groupId, input);
  if (!startsAt) throw badRequest("night.time_invalid");
  const [night] = await db
    .insert(meetupNights)
    .values({ groupId, startsAt, location: (input.location ?? "").trim(), note: (input.note ?? "").trim(), pickerId: input.pickerId ?? null })
    .returning();
  notifyGroup(db, groupId, userId, { type: "night_new", at: startsAt, tz: await groupTimezone(db, groupId), nightId: night.id });
  return getNight(db, night.id, userId);
}

export async function updateNight(db: Db, id: string, userId: string, input: NightInput) {
  const { night, role } = await memberNight(db, id, userId);
  const set: Partial<NightRow> = {};
  if (input.startsAt !== undefined || input.date !== undefined || input.time !== undefined || input.location !== undefined) {
    if (!manager(role)) throw forbidden("night.manage_forbidden");
    const startsAt = await nightTime(db, night.groupId, input);
    if (startsAt) set.startsAt = startsAt;
    if (input.location !== undefined) set.location = input.location.trim();
  }
  if (input.note !== undefined) {
    if (!manager(role) && night.pickerId !== userId) throw forbidden("night.manage_forbidden");
    set.note = input.note.trim();
  }
  if (input.pickerId !== undefined) {
    const volunteering = input.pickerId === userId && night.pickerId === null;
    if (!volunteering && !manager(role) && night.pickerId !== userId) throw forbidden("night.picker_forbidden");
    if (input.pickerId) await requireMember(db, night.groupId, input.pickerId).catch(() => {
      throw badRequest("night.picker_not_member");
    });
    set.pickerId = input.pickerId;
  }
  if (Object.keys(set).length) await db.update(meetupNights).set(set).where(eq(meetupNights.id, id));
  return getNight(db, id, userId);
}

export async function deleteNight(db: Db, id: string, userId: string) {
  const { role } = await memberNight(db, id, userId);
  if (!manager(role)) throw forbidden("night.manage_forbidden");
  await db.delete(meetupNights).where(eq(meetupNights.id, id));
}

/** Adds a game to the night's lineup. For an upcoming night it got picked, so it leaves the queue. */
export async function addNightGame(db: Db, id: string, gameId: string, userId: string, now = new Date()) {
  const { night, role } = await memberNight(db, id, userId);
  if (!canEditLineup(night, role, userId)) throw forbidden("night.lineup_forbidden");
  const { game } = await memberGame(db, gameId, userId);
  if (game.groupId !== night.groupId) throw notFound("game.not_found");
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(nightGames).where(eq(nightGames.nightId, id));
  const added = await db.insert(nightGames).values({ nightId: id, itemId: gameId, orderIndex: n, addedBy: userId }).onConflictDoNothing().returning({ itemId: nightGames.itemId });
  // Picked for a night still to come: it leaves the queue (and the group hears). Recording what a past night played doesn't.
  if (night.startsAt.getTime() > now.getTime()) {
    await db.delete(gameQueue).where(eq(gameQueue.itemId, gameId));
    if (added.length)
      notifyGroup(db, night.groupId, userId, { type: "night_game", who: await displayName(db, userId), game: game.name, at: night.startsAt, tz: await groupTimezone(db, night.groupId), nightId: id });
  }
  return getNight(db, id, userId);
}

export async function removeNightGame(db: Db, id: string, gameId: string, userId: string) {
  const { night, role } = await memberNight(db, id, userId);
  if (!canEditLineup(night, role, userId)) throw forbidden("night.lineup_forbidden");
  await db.delete(nightGames).where(and(eq(nightGames.nightId, id), eq(nightGames.itemId, gameId)));
  return getNight(db, id, userId);
}

// ---------- the group's board game home ----------

export async function boardgameHome(db: Db, groupId: string, userId: string, now = new Date()) {
  const role = await requireMember(db, groupId, userId);
  await ensureUpcoming(db, groupId, now);
  const since = new Date(now.getTime() - LIVE_MS);
  const [series, upcoming, past, queue] = await Promise.all([
    db.select().from(meetupSeries).where(eq(meetupSeries.groupId, groupId)).orderBy(asc(meetupSeries.createdAt)),
    db.select().from(meetupNights).where(and(eq(meetupNights.groupId, groupId), gt(meetupNights.startsAt, since))).orderBy(asc(meetupNights.startsAt)),
    db
      .select()
      .from(meetupNights)
      .where(and(eq(meetupNights.groupId, groupId), lte(meetupNights.startsAt, since)))
      .orderBy(desc(meetupNights.startsAt))
      .limit(30),
    db.selectDistinct({ itemId: gameQueue.itemId }).from(gameQueue).where(eq(gameQueue.groupId, groupId)),
  ]);
  const queuedGames = queue.length
    ? await db.select().from(items).where(inArray(items.id, queue.map((q) => q.itemId)))
    : [];
  const facts = await gameFacts(db, queuedGames.map((g) => g.id), userId, now);
  const queueView = queuedGames
    .map((g) => {
      const f = facts(g.id)!;
      return { id: g.id, name: g.name, links: f.links, tags: f.tags, rating: f.rating, plays: f.plays, queuedBy: f.queuedBy, queuedByMe: f.queuedBy.some((q) => q.userId === userId), queuedAt: f.queuedAt };
    })
    // Most wanted first, then whoever queued first.
    .sort((a, b) => b.queuedBy.length - a.queuedBy.length || new Date(a.queuedAt!).getTime() - new Date(b.queuedAt!).getTime());
  return {
    timezone: await groupTimezone(db, groupId),
    canManage: manager(role),
    series: series.map((s) => ({ id: s.id, title: s.title, weekday: s.weekday, time: s.time, everyWeeks: s.everyWeeks, startDate: s.startDate, location: s.location })),
    upcoming: await nightViews(db, upcoming, userId, now),
    past: await nightViews(db, past, userId, now),
    queue: queueView.map(({ queuedAt: _, ...q }) => q),
  };
}

/** Board game nights starting 12–36 hours from now, for the daily "tomorrow" push. */
export async function nightsTomorrow(db: Db, now = new Date()) {
  const rows = await db
    .select()
    .from(meetupNights)
    .where(and(gt(meetupNights.startsAt, new Date(now.getTime() + 12 * 3_600_000)), lte(meetupNights.startsAt, new Date(now.getTime() + 36 * 3_600_000))));
  const out = [];
  for (const n of rows) {
    const games = await db
      .select({ name: items.name })
      .from(nightGames)
      .innerJoin(items, eq(items.id, nightGames.itemId))
      .where(eq(nightGames.nightId, n.id))
      .orderBy(asc(nightGames.orderIndex));
    out.push({ night: n, tz: await groupTimezone(db, n.groupId), games: games.map((g) => g.name) });
  }
  return out;
}
