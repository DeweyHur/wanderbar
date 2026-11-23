import { categoryFromGoogleType, coordsFromMapsUrl, isFoodCategory, isPlaceType, placeQuery, placeTypeFromGoogle, yelpAlias, type PlaceType } from "@wanderbar/route";
import { cleanTags, setTags, tagsByItem } from "./tags";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { eventDetails, externalLinks, groups, items, menuDetails, planStops, ratings, restaurantDetails, users, visits } from "../db/schema";
import { badRequest, forbidden, HttpError, notFound } from "./errors";
import { findPlaceId, googleAvailable, photoUrl, placeDetails, type PlaceDetails } from "./google";
import { requireMember } from "./groups";
import { displayName, notifyGroup, ratingNews, recently } from "./push";
import { coverPhotos, deletePhotoFilesOf } from "./photos";
import { isDay } from "./plans";
import { resolveShortLink } from "./shortLinks";
import { findYelpUrl, yelpAvailable } from "./yelp";

/**
 * Food module: a group's restaurants and their menus.
 * Duplicates are caught by the Yelp alias and the Google place id, each unique within a group.
 */

export const duplicate = () => new HttpError(409, "restaurant.duplicate");

export type NewRestaurant = {
  name?: string;
  address?: string;
  yelpUrl?: string;
  mapsUrl?: string;
  /** Picked from autocomplete: skips the text search. */
  googlePlaceId?: string;
  /** The app's autocomplete session, so Google bills search + details as one session. */
  sessionToken?: string;
  /** Google details already fetched (e.g. while checking a route stop), to skip another call. */
  prefetched?: PlaceDetails | null;
  /** "Been there" when saving: the day you went (YYYY-MM-DD); records your visit. */
  visitedOn?: string;
  category?: string | null;
  memo?: string;
  tags?: string[];
  /** What kind of place; worked out from Google's type when not given (food when there's nothing to go on). */
  placeType?: PlaceType;
  /** Where it is, for a place saved without Google (e.g. a typed route stop). */
  lat?: number | null;
  lng?: number | null;
  /** No "saved a place" notification (places filed from a day route). */
  quiet?: boolean;
};

export type RestaurantEdit = {
  name?: string;
  address?: string;
  hoursRaw?: string;
  yelpUrl?: string;
  mapsUrl?: string;
  category?: string | null;
  memo?: string;
  tags?: string[];
  placeType?: PlaceType;
};

export type MenuInput = { name?: string; priceMinor?: number | null; memo?: string };

export const cleanCategory = (c: string | null | undefined) => {
  if (c === undefined) return undefined;
  if (c === null || c === "") return null;
  if (!isFoodCategory(c)) throw badRequest("restaurant.category_invalid");
  return c;
};

/** Drops tracking parameters from a Yelp link (?utm_source=ishare…). */
const tidyYelpUrl = (url: string) => (yelpAlias(url) ? url.split(/[?#]/)[0] : url);

async function restaurantRow(db: Db, id: string) {
  const [row] = await db
    .select({ item: items, detail: restaurantDetails })
    .from(items)
    .innerJoin(restaurantDetails, eq(restaurantDetails.itemId, items.id))
    .where(and(eq(items.id, id), eq(items.type, "restaurant")));
  return row ?? null;
}

/** The restaurant if the user is in its group; 404 otherwise (same as for a missing one). */
async function memberRestaurant(db: Db, id: string, userId: string) {
  const row = await restaurantRow(db, id);
  if (!row) throw notFound("restaurant.not_found");
  const role = await requireMember(db, row.item.groupId, userId).catch(() => {
    throw notFound("restaurant.not_found");
  });
  return { ...row, role };
}

async function memberMenu(db: Db, id: string, userId: string) {
  const [menu] = await db.select().from(items).where(and(eq(items.id, id), eq(items.type, "menu")));
  if (!menu?.parentId) throw notFound("menu.not_found");
  const r = await memberRestaurant(db, menu.parentId, userId).catch(() => {
    throw notFound("menu.not_found");
  });
  return { menu, restaurant: r };
}

async function setLink(db: Db, itemId: string, kind: "yelp" | "gmaps", url: string) {
  await db.delete(externalLinks).where(and(eq(externalLinks.itemId, itemId), eq(externalLinks.kind, kind)));
  if (url.trim()) await db.insert(externalLinks).values({ itemId, kind, url: url.trim() });
}

async function addLinkIfMissing(db: Db, itemId: string, kind: "yelp" | "gmaps", url: string) {
  if (!url.trim()) return;
  const [has] = await db
    .select({ id: externalLinks.id })
    .from(externalLinks)
    .where(and(eq(externalLinks.itemId, itemId), eq(externalLinks.kind, kind)))
    .limit(1);
  if (!has) await db.insert(externalLinks).values({ itemId, kind, url: url.trim() });
}

async function byKey(db: Db, groupId: string, key: { yelpAlias?: string | null; googlePlaceKey?: string | null }) {
  const cond = key.yelpAlias
    ? eq(restaurantDetails.yelpAlias, key.yelpAlias)
    : key.googlePlaceKey
      ? eq(restaurantDetails.googlePlaceKey, key.googlePlaceKey)
      : null;
  if (!cond) return null;
  const [row] = await db.select().from(restaurantDetails).where(and(eq(restaurantDetails.groupId, groupId), cond)).limit(1);
  return row ?? null;
}

/** Google details for a place picked or found by name; null when Google is off or has nothing. */
async function lookupGoogle(input: { placeId?: string; sessionToken?: string; name: string; address: string; near: { lat: number; lng: number } | null }) {
  if (!googleAvailable()) return null;
  try {
    if (input.placeId) return await placeDetails(input.placeId, input.sessionToken ?? null);
    const id = await findPlaceId(placeQuery(input.name, input.address), input.near);
    return id ? await placeDetails(id, null) : null;
  } catch {
    return null; // Google trouble never blocks saving a restaurant
  }
}

/**
 * Saves a restaurant from a share, a pick or typing. Returns the existing one instead when the Yelp alias
 * or Google place matches (adding whichever link it was missing), so sharing twice never duplicates.
 */
export async function createRestaurant(db: Db, groupId: string, userId: string, input: NewRestaurant) {
  if (input.visitedOn !== undefined && !isDay(input.visitedOn)) throw badRequest("visit.date_invalid");
  const tagNames = input.tags === undefined ? undefined : cleanTags(input.tags, "restaurant.too_many_tags");
  const r = await saveRestaurant(db, groupId, userId, input);
  // A new one gets the tags; an existing one keeps its own and gains these.
  if (tagNames?.length) {
    const had = r.created ? [] : r.restaurant.tags;
    await setTags(db, groupId, r.restaurant.id, cleanTags([...had, ...tagNames], "restaurant.too_many_tags"));
    r.restaurant = await getRestaurant(db, r.restaurant.id, userId);
  }
  if (r.created && !input.quiet)
    notifyGroup(db, groupId, userId, { type: "restaurant", who: await displayName(db, userId), name: r.restaurant.name, itemId: r.restaurant.id, placeType: r.restaurant.placeType });
  if (input.visitedOn) {
    await visitOnDay(db, groupId, r.restaurant.id, userId, input.visitedOn);
    return { ...r, restaurant: await getRestaurant(db, r.restaurant.id, userId) };
  }
  return r;
}

/** A visit on that day (noon UTC, the same calendar day across the Americas and Asia), unless you have one. */
async function visitOnDay(db: Db, groupId: string, itemId: string, userId: string, day: string) {
  const at = new Date(`${day}T12:00:00Z`);
  if (at.getTime() > Date.now() + 86_400_000) throw badRequest("visit.date_invalid");
  const mine = await db.select({ at: visits.visitedAt }).from(visits).where(and(eq(visits.itemId, itemId), eq(visits.userId, userId)));
  if (mine.some((v) => v.at.toISOString().slice(0, 10) === day)) return;
  await db.insert(visits).values({ groupId, itemId, userId, visitedAt: at });
}

async function saveRestaurant(db: Db, groupId: string, userId: string, input: NewRestaurant) {
  await requireMember(db, groupId, userId);
  const category = cleanCategory(input.category);
  if (input.placeType !== undefined && !isPlaceType(input.placeType)) throw badRequest("restaurant.type_invalid");
  let name = (input.name ?? "").trim();
  let address = (input.address ?? "").trim();
  const yelpUrl = input.yelpUrl?.trim() ? tidyYelpUrl(await resolveShortLink(input.yelpUrl)) : "";
  const mapsUrl = (input.mapsUrl ?? "").trim();
  const alias = yelpUrl ? yelpAlias(yelpUrl) : null;
  if (!name && !input.googlePlaceId) throw badRequest("restaurant.name_required");

  const merge = async (existingId: string) => {
    await addLinkIfMissing(db, existingId, "yelp", yelpUrl);
    await addLinkIfMissing(db, existingId, "gmaps", mapsUrl);
    return { restaurant: await getRestaurant(db, existingId, userId), created: false };
  };

  const sameYelp = alias ? await byKey(db, groupId, { yelpAlias: alias }) : null;
  if (sameYelp) return merge(sameYelp.itemId);

  const resolvedMaps = mapsUrl ? await resolveShortLink(mapsUrl) : "";
  const g: PlaceDetails | null = input.prefetched ?? await lookupGoogle({
    placeId: input.googlePlaceId,
    sessionToken: input.sessionToken,
    name,
    address,
    near: resolvedMaps ? coordsFromMapsUrl(resolvedMaps) : null,
  });
  let googlePlaceKey: string | null = g?.googlePlaceId ?? null;
  if (googlePlaceKey) {
    const sameGoogle = await byKey(db, groupId, { googlePlaceKey });
    if (sameGoogle) {
      // A different Yelp business that Google search mapped to the same place (chains): keep them apart.
      if (alias && sameGoogle.yelpAlias && sameGoogle.yelpAlias !== alias) googlePlaceKey = null;
      else {
        if (alias && !sameGoogle.yelpAlias) await db.update(restaurantDetails).set({ yelpAlias: alias }).where(eq(restaurantDetails.itemId, sameGoogle.itemId));
        return merge(sameGoogle.itemId);
      }
    }
  }

  if (!name) name = g?.name ?? "";
  if (!name) throw badRequest("restaurant.name_required");
  if (!address) address = g?.address ?? "";
  const linked = googlePlaceKey ? g : null;
  const type: PlaceType = input.placeType ?? placeTypeFromGoogle(linked?.primaryType, linked?.types) ?? "food";

  const [item] = await db
    .insert(items)
    .values({
      groupId,
      module: "food",
      type: "restaurant",
      name,
      // Cuisine only for somewhere to eat.
      category: category ?? (type === "food" ? categoryFromGoogleType(linked?.primaryType) : null),
      memo: (input.memo ?? "").trim(),
      createdBy: userId,
    })
    .returning();
  await db.insert(restaurantDetails).values({
    itemId: item.id,
    groupId,
    yelpAlias: alias,
    googlePlaceKey,
    address,
    lat: linked?.lat ?? input.lat ?? null,
    lng: linked?.lng ?? input.lng ?? null,
    hoursRaw: linked?.hoursRaw ?? "",
    hoursFetchedAt: linked ? new Date() : null,
    photoName: linked?.photoName || null,
    placeType: type,
  });
  if (yelpUrl) await setLink(db, item.id, "yelp", yelpUrl);
  else if (linked?.lat != null && linked.lng != null) await findOwnYelpPage(db, groupId, item.id, name, { lat: linked.lat, lng: linked.lng });
  if (mapsUrl || linked?.mapsUrl) await setLink(db, item.id, "gmaps", mapsUrl || linked!.mapsUrl);
  return { restaurant: await getRestaurant(db, item.id, userId), created: true };
}

/** With a Yelp API key: link the restaurant's own Yelp page (unless another restaurant here has it). */
async function findOwnYelpPage(db: Db, groupId: string, itemId: string, name: string, near: { lat: number; lng: number }) {
  if (!yelpAvailable()) return;
  const url = await findYelpUrl(name, near);
  const alias = url ? yelpAlias(url) : null;
  if (!url || !alias || (await byKey(db, groupId, { yelpAlias: alias }))) return;
  await db.update(restaurantDetails).set({ yelpAlias: alias }).where(eq(restaurantDetails.itemId, itemId));
  await setLink(db, itemId, "yelp", url);
}

/** Somewhere to eat or drink, judging by Google's main type. */
export const isFoodPlace = (primaryType: string | null | undefined) =>
  !!categoryFromGoogleType(primaryType) || /restaurant|food|meal|diner|deli|bistro|brew|steak|sandwich|cafe|bar_and_grill|tea|juice|winery|gastropub/i.test(primaryType ?? "");

export async function listRestaurants(db: Db, groupId: string, userId: string) {
  await requireMember(db, groupId, userId);
  const rows = await db
    .select({ item: items, detail: restaurantDetails })
    .from(items)
    .innerJoin(restaurantDetails, eq(restaurantDetails.itemId, items.id))
    .where(and(eq(items.groupId, groupId), eq(items.type, "restaurant")))
    // Newest first: what was just added is what you're looking for.
    .orderBy(desc(items.createdAt));
  if (!rows.length) return [];
  await settlePlaceTypes(db, rows);
  const ids = rows.map((r) => r.item.id);
  const counts = await db
    .select({ parentId: items.parentId, n: sql<number>`count(*)::int` })
    .from(items)
    .where(and(eq(items.type, "menu"), inArray(items.parentId, ids)))
    .groupBy(items.parentId);
  const links = await db.select().from(externalLinks).where(inArray(externalLinks.itemId, ids));
  const stats = await db
    .select({ parentId: items.parentId, sum: sql<number>`sum(${ratings.score})::int`, n: sql<number>`count(*)::int` })
    .from(ratings)
    .innerJoin(items, eq(items.id, ratings.itemId))
    .where(inArray(items.parentId, ids))
    .groupBy(items.parentId);
  // Places are also rated themselves (a sight, a hotel…), not only through their menus or events.
  const own = await db
    .select({ itemId: ratings.itemId, sum: sql<number>`sum(${ratings.score})::int`, n: sql<number>`count(*)::int` })
    .from(ratings)
    .where(inArray(ratings.itemId, ids))
    .groupBy(ratings.itemId);
  const ratingOf = (id: string) => {
    const a = stats.find((x) => x.parentId === id);
    const b = own.find((x) => x.itemId === id);
    return summary({ sum: (a?.sum ?? 0) + (b?.sum ?? 0), n: (a?.n ?? 0) + (b?.n ?? 0) });
  };
  const last = await db
    .select({
      itemId: visits.itemId,
      at: sql<Date>`max(${visits.visitedAt})`.mapWith(visits.visitedAt),
      n: sql<number>`count(*)::int`,
      mine: sql<number>`count(*) filter (where ${visits.userId} = ${userId})::int`,
    })
    .from(visits)
    .where(inArray(visits.itemId, ids))
    .groupBy(visits.itemId);
  const covers = await coverPhotos(db, ids);
  const tagged = await tagsByItem(db, ids);
  return rows.map(({ item, detail }) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    placeType: (detail.placeType ?? "food") as PlaceType,
    tags: tagged.get(item.id) ?? [],
    createdAt: item.createdAt,
    hasPhoto: !!detail.photoName,
    /** The group's newest photo of it (or its menus); shown before Google's. */
    coverPhotoId: covers.get(item.id) ?? null,
    lastVisitedAt: last.find((v) => v.itemId === item.id)?.at ?? null,
    /** How many visits the group logged, and whether you've been. */
    visitCount: last.find((v) => v.itemId === item.id)?.n ?? 0,
    visitedByMe: (last.find((v) => v.itemId === item.id)?.mine ?? 0) > 0,
    address: detail.address,
    hoursRaw: detail.hoursRaw,
    lat: detail.lat,
    lng: detail.lng,
    yelpUrl: links.find((l) => l.itemId === item.id && l.kind === "yelp")?.url ?? "",
    mapsUrl: links.find((l) => l.itemId === item.id && l.kind === "gmaps")?.url ?? "",
    menuCount: counts.find((c) => c.parentId === item.id)?.n ?? 0,
    rating: ratingOf(item.id),
  }));
}

/**
 * Places saved before they had a type: worked out once from Google (a place with menus is food; no Google
 * place → food, as everything saved then was a restaurant). A few at a time, so a long list stays quick.
 */
async function settlePlaceTypes(db: Db, rows: { item: typeof items.$inferSelect; detail: typeof restaurantDetails.$inferSelect }[]) {
  const todo = rows.filter((r) => r.detail.placeType == null).slice(0, 12);
  if (!todo.length) return;
  const withMenus = new Set(
    (
      await db
        .select({ parentId: items.parentId })
        .from(items)
        .where(and(eq(items.type, "menu"), inArray(items.parentId, todo.map((r) => r.item.id))))
    ).map((m) => m.parentId),
  );
  await Promise.all(
    todo.map(async (r) => {
      let type: PlaceType = "food";
      if (!withMenus.has(r.item.id) && r.detail.googlePlaceKey && googleAvailable()) {
        try {
          const g = await placeDetails(r.detail.googlePlaceKey, null);
          type = placeTypeFromGoogle(g.primaryType, g.types) ?? "food";
        } catch {
          return; // Google trouble: try again next time
        }
      }
      r.detail.placeType = type;
      await db.update(restaurantDetails).set({ placeType: type }).where(eq(restaurantDetails.itemId, r.item.id));
    }),
  );
}

/** Half-star sums → { avg in stars (one decimal), count }. */
export const summary = (x?: { sum: number; n: number } | null) =>
  x && x.n ? { avg: Math.round((x.sum / x.n / 2) * 10) / 10, count: x.n } : { avg: null as number | null, count: 0 };

/** score 1..10 (half stars) → stars. */
export const stars = (score: number) => score / 2;

export async function getRestaurant(db: Db, id: string, userId: string) {
  const { item, detail } = await memberRestaurant(db, id, userId);
  const [group] = await db.select({ currency: groups.currency }).from(groups).where(eq(groups.id, item.groupId));
  const links = await db.select().from(externalLinks).where(eq(externalLinks.itemId, id)).orderBy(asc(externalLinks.createdAt));
  const menus = await db
    .select({ item: items, detail: menuDetails })
    .from(items)
    .leftJoin(menuDetails, eq(menuDetails.itemId, items.id))
    .where(and(eq(items.parentId, id), eq(items.type, "menu")))
    .orderBy(asc(items.createdAt));
  const rs = menus.length
    ? await db
        .select({ itemId: ratings.itemId, userId: ratings.userId, score: ratings.score })
        .from(ratings)
        .where(inArray(ratings.itemId, menus.map((m) => m.item.id)))
    : [];
  const of = (menuId: string) => rs.filter((r) => r.itemId === menuId);
  const vs = await db
    .select({ visit: visits, name: users.name, email: users.email })
    .from(visits)
    .innerJoin(users, eq(users.id, visits.userId))
    .where(eq(visits.itemId, id))
    .orderBy(sql`${visits.visitedAt} desc`)
    .limit(30);
  const tagged = await tagsByItem(db, [item.id]);
  if (detail.placeType == null) await settlePlaceTypes(db, [{ item, detail }]);
  // The place's own ratings (sights, hotels, venues…) with who wrote them, newest first.
  const ownRows = await db
    .select({ rating: ratings, name: users.name, email: users.email })
    .from(ratings)
    .innerJoin(users, eq(users.id, ratings.userId))
    .where(eq(ratings.itemId, id))
    .orderBy(sql`${ratings.updatedAt} desc`);
  const reviewOf = (r: { rating: typeof ratings.$inferSelect; name: string | null; email: string }) => ({
    userId: r.rating.userId,
    name: r.name || r.email.split("@")[0],
    stars: stars(r.rating.score),
    review: r.rating.review,
    updatedAt: r.rating.updatedAt,
  });
  // Events seen at a venue, newest day first, each with everyone's ratings.
  const evs = await db
    .select({ item: items, detail: eventDetails })
    .from(items)
    .leftJoin(eventDetails, eq(eventDetails.itemId, items.id))
    .where(and(eq(items.parentId, id), eq(items.type, "event")))
    .orderBy(sql`${eventDetails.onDate} desc nulls last`, desc(items.createdAt));
  const evRatings = evs.length
    ? await db
        .select({ rating: ratings, name: users.name, email: users.email })
        .from(ratings)
        .innerJoin(users, eq(users.id, ratings.userId))
        .where(inArray(ratings.itemId, evs.map((e) => e.item.id)))
        .orderBy(sql`${ratings.updatedAt} desc`)
    : [];
  const all = [...rs.map((r) => r.score), ...ownRows.map((r) => r.rating.score), ...evRatings.map((r) => r.rating.score)];
  return {
    id: item.id,
    groupId: item.groupId,
    name: item.name,
    category: item.category,
    placeType: (detail.placeType ?? "food") as PlaceType,
    tags: tagged.get(item.id) ?? [],
    memo: item.memo,
    createdBy: item.createdBy,
    address: detail.address,
    hoursRaw: detail.hoursRaw,
    hoursFetchedAt: detail.hoursFetchedAt,
    lat: detail.lat,
    lng: detail.lng,
    googlePlaceId: detail.googlePlaceKey ?? "",
    hasPhoto: !!detail.photoName,
    coverPhotoId: (await coverPhotos(db, [id])).get(id) ?? null,
    visits: vs.map((v) => ({
      id: v.visit.id,
      userId: v.visit.userId,
      name: v.name || v.email.split("@")[0],
      visitedAt: v.visit.visitedAt,
      fromRoute: !!v.visit.stopId,
    })),
    yelpUrl: links.find((l) => l.kind === "yelp")?.url ?? "",
    mapsUrl: links.find((l) => l.kind === "gmaps")?.url ?? "",
    links: links.map((l) => ({ id: l.id, kind: l.kind, url: l.url, label: l.label })),
    currency: group?.currency ?? "USD",
    rating: summary({ sum: all.reduce((a, x) => a + x, 0), n: all.length }),
    reviews: ownRows.map(reviewOf),
    events: evs.map((e) => {
      const of = evRatings.filter((r) => r.rating.itemId === e.item.id);
      return {
        id: e.item.id,
        name: e.item.name,
        memo: e.item.memo,
        onDate: e.detail?.onDate ?? null,
        createdBy: e.item.createdBy,
        rating: summary({ sum: of.reduce((a, r) => a + r.rating.score, 0), n: of.length }),
        reviews: of.map(reviewOf),
      };
    }),
    menus: menus.map((m) => {
      const mine = of(m.item.id).find((r) => r.userId === userId);
      return {
        id: m.item.id,
        name: m.item.name,
        memo: m.item.memo,
        priceMinor: m.detail?.priceMinor ?? null,
        currency: m.detail?.currency ?? group?.currency ?? "USD",
        rating: summary({ sum: of(m.item.id).reduce((a, r) => a + r.score, 0), n: of(m.item.id).length }),
        myStars: mine ? stars(mine.score) : null,
      };
    }),
  };
}

/** One menu with every member's rating and review, newest first. */
export async function getMenu(db: Db, menuId: string, userId: string) {
  const { menu, restaurant } = await memberMenu(db, menuId, userId);
  const [detail] = await db.select().from(menuDetails).where(eq(menuDetails.itemId, menuId));
  const rows = await db
    .select({ rating: ratings, name: users.name, email: users.email })
    .from(ratings)
    .innerJoin(users, eq(users.id, ratings.userId))
    .where(eq(ratings.itemId, menuId))
    .orderBy(sql`${ratings.updatedAt} desc`);
  const mine = rows.find((r) => r.rating.userId === userId);
  return {
    id: menu.id,
    name: menu.name,
    memo: menu.memo,
    priceMinor: detail?.priceMinor ?? null,
    currency: detail?.currency ?? "USD",
    restaurant: { id: restaurant.item.id, name: restaurant.item.name },
    rating: summary({ sum: rows.reduce((a, r) => a + r.rating.score, 0), n: rows.length }),
    mine: mine ? { stars: stars(mine.rating.score), review: mine.rating.review } : null,
    ratings: rows.map((r) => ({
      userId: r.rating.userId,
      name: r.name || r.email.split("@")[0],
      stars: stars(r.rating.score),
      review: r.rating.review,
      updatedAt: r.rating.updatedAt,
    })),
  };
}

/** My rating of a menu, 0.5..5 stars in halves, with an optional review. Rating again replaces it. */
export async function rateMenu(db: Db, menuId: string, userId: string, input: { stars: number; review?: string }) {
  const { menu } = await memberMenu(db, menuId, userId);
  const score = input.stars * 2;
  if (!Number.isInteger(score) || score < 1 || score > 10) throw badRequest("rating.stars_invalid");
  const review = (input.review ?? "").trim();
  const [before] = await db.select().from(ratings).where(and(eq(ratings.itemId, menuId), eq(ratings.userId, userId)));
  if (ratingNews(before, score, review))
    notifyGroup(db, menu.groupId, userId, { type: "rating", who: await displayName(db, userId), name: menu.name, stars: input.stars, review, again: !!before, itemId: menuId, kind: "menu" });
  await db
    .insert(ratings)
    .values({ groupId: menu.groupId, itemId: menuId, userId, score, review })
    .onConflictDoUpdate({ target: [ratings.itemId, ratings.userId], set: { score, review, updatedAt: new Date() } });
  return getMenu(db, menuId, userId);
}

export async function unrateMenu(db: Db, menuId: string, userId: string) {
  await memberMenu(db, menuId, userId);
  await db.delete(ratings).where(and(eq(ratings.itemId, menuId), eq(ratings.userId, userId)));
  return getMenu(db, menuId, userId);
}

export async function updateRestaurant(db: Db, id: string, userId: string, edit: RestaurantEdit) {
  const { item } = await memberRestaurant(db, id, userId);
  const category = cleanCategory(edit.category);
  if (edit.tags !== undefined) await setTags(db, item.groupId, id, cleanTags(edit.tags, "restaurant.too_many_tags"));
  if (edit.name !== undefined && !edit.name.trim()) throw badRequest("restaurant.name_required");
  const itemSet: Partial<typeof items.$inferInsert> = { updatedAt: new Date() };
  if (edit.name !== undefined) itemSet.name = edit.name.trim();
  if (category !== undefined) itemSet.category = category;
  if (edit.memo !== undefined) itemSet.memo = edit.memo.trim();
  await db.update(items).set(itemSet).where(eq(items.id, id));

  const detailSet: Partial<typeof restaurantDetails.$inferInsert> = {};
  if (edit.placeType !== undefined) {
    if (!isPlaceType(edit.placeType)) throw badRequest("restaurant.type_invalid");
    detailSet.placeType = edit.placeType;
  }
  if (edit.address !== undefined) detailSet.address = edit.address.trim();
  if (edit.hoursRaw !== undefined) detailSet.hoursRaw = edit.hoursRaw.trim();
  if (edit.yelpUrl !== undefined) {
    const url = edit.yelpUrl.trim() ? tidyYelpUrl(await resolveShortLink(edit.yelpUrl)) : "";
    const alias = url ? yelpAlias(url) : null;
    const other = alias ? await byKey(db, item.groupId, { yelpAlias: alias }) : null;
    if (other && other.itemId !== id) throw duplicate();
    detailSet.yelpAlias = alias;
    await setLink(db, id, "yelp", url);
  }
  if (edit.mapsUrl !== undefined) await setLink(db, id, "gmaps", edit.mapsUrl);
  if (Object.keys(detailSet).length) await db.update(restaurantDetails).set(detailSet).where(eq(restaurantDetails.itemId, id));
  if (!recently(item.updatedAt)) notifyGroup(db, item.groupId, userId, { type: "edit", who: await displayName(db, userId), name: itemSet.name ?? item.name, itemId: id, kind: "restaurant" });
  return getRestaurant(db, id, userId);
}

/**
 * (Re)links the restaurant to a Google place: the picked one, or a search by its name and address.
 * Fills opening hours, coordinates and a Maps link; keeps the name and the address unless they're empty.
 */
export async function linkGoogle(db: Db, id: string, userId: string, placeId?: string, sessionToken?: string) {
  const { item, detail } = await memberRestaurant(db, id, userId);
  if (!googleAvailable()) throw new HttpError(503, "google.unavailable");
  const pid = placeId || (await findPlaceId(placeQuery(item.name, detail.address), detail.lat != null && detail.lng != null ? { lat: detail.lat, lng: detail.lng } : null));
  if (!pid) throw notFound("restaurant.google_not_found");
  const g = await placeDetails(pid, placeId ? (sessionToken ?? null) : null);
  const other = await byKey(db, item.groupId, { googlePlaceKey: g.googlePlaceId });
  if (other && other.itemId !== id) throw duplicate();
  await db
    .update(restaurantDetails)
    .set({
      googlePlaceKey: g.googlePlaceId,
      address: detail.address || g.address,
      lat: g.lat,
      lng: g.lng,
      hoursRaw: g.hoursRaw || detail.hoursRaw,
      hoursFetchedAt: new Date(),
      photoName: g.photoName || detail.photoName,
    })
    .where(eq(restaurantDetails.itemId, id));
  if (!detail.yelpAlias && g.lat != null && g.lng != null) await findOwnYelpPage(db, item.groupId, id, item.name, { lat: g.lat, lng: g.lng });
  if (!item.category) {
    const guess = categoryFromGoogleType(g.primaryType);
    if (guess) await db.update(items).set({ category: guess }).where(eq(items.id, id));
  }
  if (g.mapsUrl) await addLinkIfMissing(db, id, "gmaps", g.mapsUrl);
  return getRestaurant(db, id, userId);
}

const halfStars = (s: number) => {
  const score = s * 2;
  if (!Number.isInteger(score) || score < 1 || score > 10) throw badRequest("rating.stars_invalid");
  return score;
};

/** My rating of the place itself (a sight, a hotel, a venue…), 0.5..5 stars with an optional review. */
export async function ratePlace(db: Db, id: string, userId: string, input: { stars: number; review?: string }) {
  const { item } = await memberRestaurant(db, id, userId);
  const score = halfStars(input.stars);
  const review = (input.review ?? "").trim();
  const [before] = await db.select().from(ratings).where(and(eq(ratings.itemId, id), eq(ratings.userId, userId)));
  if (ratingNews(before, score, review))
    notifyGroup(db, item.groupId, userId, { type: "rating", who: await displayName(db, userId), name: item.name, stars: input.stars, review, again: !!before, itemId: id, kind: "restaurant" });
  await db
    .insert(ratings)
    .values({ groupId: item.groupId, itemId: id, userId, score, review })
    .onConflictDoUpdate({ target: [ratings.itemId, ratings.userId], set: { score, review, updatedAt: new Date() } });
  return getRestaurant(db, id, userId);
}

export async function unratePlace(db: Db, id: string, userId: string) {
  await memberRestaurant(db, id, userId);
  await db.delete(ratings).where(and(eq(ratings.itemId, id), eq(ratings.userId, userId)));
  return getRestaurant(db, id, userId);
}

async function memberEvent(db: Db, id: string, userId: string) {
  const [ev] = await db.select().from(items).where(and(eq(items.id, id), eq(items.type, "event")));
  if (!ev?.parentId) throw notFound("event.not_found");
  const place = await memberRestaurant(db, ev.parentId, userId).catch(() => {
    throw notFound("event.not_found");
  });
  return { ev, place };
}

/** Something seen at a venue: what it was and the day (YYYY-MM-DD, optional). */
export async function addEvent(db: Db, placeId: string, userId: string, input: { name?: string; onDate?: string | null; memo?: string }) {
  const { item } = await memberRestaurant(db, placeId, userId);
  const name = (input.name ?? "").trim();
  if (!name) throw badRequest("event.name_required");
  if (input.onDate && !isDay(input.onDate)) throw badRequest("event.date_invalid");
  const [ev] = await db
    .insert(items)
    .values({ groupId: item.groupId, module: "food", type: "event", parentId: placeId, name, memo: (input.memo ?? "").trim(), createdBy: userId })
    .returning();
  await db.insert(eventDetails).values({ itemId: ev.id, onDate: input.onDate || null });
  return getRestaurant(db, placeId, userId);
}

/** Whoever added it, or the group's owner. */
export async function deleteEvent(db: Db, eventId: string, userId: string) {
  const { ev, place } = await memberEvent(db, eventId, userId);
  if (ev.createdBy !== userId && place.role !== "owner") throw forbidden("event.delete_forbidden");
  await deletePhotoFilesOf(db, [eventId]);
  await db.delete(items).where(eq(items.id, eventId));
  return getRestaurant(db, ev.parentId!, userId);
}

export async function rateEvent(db: Db, eventId: string, userId: string, input: { stars: number; review?: string }) {
  const { ev } = await memberEvent(db, eventId, userId);
  const score = halfStars(input.stars);
  const review = (input.review ?? "").trim();
  const [before] = await db.select().from(ratings).where(and(eq(ratings.itemId, eventId), eq(ratings.userId, userId)));
  if (ratingNews(before, score, review))
    notifyGroup(db, ev.groupId, userId, { type: "rating", who: await displayName(db, userId), name: ev.name, stars: input.stars, review, again: !!before, itemId: ev.parentId!, kind: "restaurant" });
  await db
    .insert(ratings)
    .values({ groupId: ev.groupId, itemId: eventId, userId, score, review })
    .onConflictDoUpdate({ target: [ratings.itemId, ratings.userId], set: { score, review, updatedAt: new Date() } });
  return getRestaurant(db, ev.parentId!, userId);
}

export async function unrateEvent(db: Db, eventId: string, userId: string) {
  const { ev } = await memberEvent(db, eventId, userId);
  await db.delete(ratings).where(and(eq(ratings.itemId, eventId), eq(ratings.userId, userId)));
  return getRestaurant(db, ev.parentId!, userId);
}

/** Whoever added it, or the group's owner. */
export async function deleteRestaurant(db: Db, id: string, userId: string) {
  const { item, role } = await memberRestaurant(db, id, userId);
  if (item.createdBy !== userId && role !== "owner") throw forbidden("restaurant.delete_forbidden");
  await deletePhotoFilesOf(db, [id]);
  await db.delete(items).where(eq(items.id, id));
}

const cleanPrice = (p: number | null | undefined) => {
  if (p === undefined || p === null) return p;
  if (!Number.isInteger(p) || p < 0 || p > 100_000_000) throw badRequest("menu.price_invalid");
  return p;
};

export async function addMenu(db: Db, restaurantId: string, userId: string, input: MenuInput) {
  const { item } = await memberRestaurant(db, restaurantId, userId);
  const name = (input.name ?? "").trim();
  if (!name) throw badRequest("menu.name_required");
  const priceMinor = cleanPrice(input.priceMinor) ?? null;
  const [group] = await db.select({ currency: groups.currency }).from(groups).where(eq(groups.id, item.groupId));
  const [menu] = await db
    .insert(items)
    .values({ groupId: item.groupId, module: "food", type: "menu", parentId: restaurantId, name, memo: (input.memo ?? "").trim(), createdBy: userId })
    .returning();
  await db.insert(menuDetails).values({ itemId: menu.id, priceMinor, currency: group?.currency ?? "USD" });
  notifyGroup(db, item.groupId, userId, { type: "menu", who: await displayName(db, userId), name, restaurant: item.name, itemId: menu.id });
  return getRestaurant(db, restaurantId, userId);
}

export async function updateMenu(db: Db, menuId: string, userId: string, input: MenuInput) {
  const { menu } = await memberMenu(db, menuId, userId);
  if (input.name !== undefined && !input.name.trim()) throw badRequest("menu.name_required");
  const priceMinor = cleanPrice(input.priceMinor);
  const set: Partial<typeof items.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) set.name = input.name.trim();
  if (input.memo !== undefined) set.memo = input.memo.trim();
  await db.update(items).set(set).where(eq(items.id, menuId));
  if (priceMinor !== undefined) await db.update(menuDetails).set({ priceMinor }).where(eq(menuDetails.itemId, menuId));
  if (!recently(menu.updatedAt)) notifyGroup(db, menu.groupId, userId, { type: "edit", who: await displayName(db, userId), name: set.name ?? menu.name, itemId: menuId, kind: "menu" });
  return getRestaurant(db, menu.parentId!, userId);
}

export async function deleteMenu(db: Db, menuId: string, userId: string) {
  const { menu } = await memberMenu(db, menuId, userId);
  await deletePhotoFilesOf(db, [menuId]);
  await db.delete(items).where(eq(items.id, menuId));
  return getRestaurant(db, menu.parentId!, userId);
}

/** For adding restaurants to a day route: the item must be a restaurant of the route's group. */
export async function restaurantsInGroup(db: Db, groupId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.groupId, groupId), eq(items.type, "restaurant"), inArray(items.id, ids)));
  return rows.map((r) => r.id);
}

/** A fresh image URL for the restaurant's cover photo (from Google Places). */
export async function restaurantPhotoUrl(db: Db, id: string, userId: string) {
  const { detail } = await memberRestaurant(db, id, userId);
  if (!detail.photoName || !googleAvailable()) throw notFound("restaurant.no_photo");
  return photoUrl(detail.photoName);
}

/** "I went here" by hand, now or at a given time. */
export async function addVisit(db: Db, restaurantId: string, userId: string, visitedAt?: Date) {
  const { item } = await memberRestaurant(db, restaurantId, userId);
  if (visitedAt && (Number.isNaN(visitedAt.getTime()) || visitedAt.getTime() > Date.now() + 86_400_000)) throw badRequest("visit.date_invalid");
  await db.insert(visits).values({ groupId: item.groupId, itemId: restaurantId, userId, visitedAt: visitedAt ?? new Date() });
  notifyGroup(db, item.groupId, userId, { type: "visit", who: await displayName(db, userId), name: item.name, itemId: restaurantId, kind: "restaurant" });
  return getRestaurant(db, restaurantId, userId);
}

/** Only your own visits. */
export async function deleteVisit(db: Db, visitId: string, userId: string) {
  const [v] = await db.select().from(visits).where(eq(visits.id, visitId));
  if (!v) throw notFound("visit.not_found");
  await memberRestaurant(db, v.itemId, userId);
  if (v.userId !== userId) throw forbidden("visit.not_yours");
  await db.delete(visits).where(eq(visits.id, visitId));
  return getRestaurant(db, v.itemId, userId);
}

/** Only your own visits: move one to another day (a visit can't be in the future). */
export async function updateVisit(db: Db, visitId: string, userId: string, visitedAt: Date) {
  const [v] = await db.select().from(visits).where(eq(visits.id, visitId));
  if (!v) throw notFound("visit.not_found");
  await memberRestaurant(db, v.itemId, userId);
  if (v.userId !== userId) throw forbidden("visit.not_yours");
  if (Number.isNaN(visitedAt.getTime()) || visitedAt.getTime() > Date.now() + 86_400_000) throw badRequest("visit.date_invalid");
  await db.update(visits).set({ visitedAt }).where(eq(visits.id, visitId));
  return getRestaurant(db, v.itemId, userId);
}

/** Finishing a restaurant stop records a visit (once per stop); bringing the stop back removes it. */
export async function recordStopVisit(db: Db, stop: { id: string; itemId: string | null }, groupId: string, userId: string, done: boolean) {
  if (!stop.itemId) return;
  if (done) {
    const added = await db.insert(visits).values({ groupId, itemId: stop.itemId, userId, stopId: stop.id }).onConflictDoNothing().returning({ id: visits.id });
    const [item] = added.length ? await db.select({ name: items.name }).from(items).where(eq(items.id, stop.itemId)) : [];
    if (item) notifyGroup(db, groupId, userId, { type: "visit", who: await displayName(db, userId), name: item.name, itemId: stop.itemId, kind: "restaurant" });
  } else await db.delete(visits).where(eq(visits.stopId, stop.id));
}

/**
 * Files a route stop under the group's places (an existing one when the Yelp page or Google place matches),
 * typed by Google: somewhere to eat, a sight, an event venue, a hotel, or other. A typed stop is filed only
 * when it says where it is (an address or a location); a bare "lunch" stays a plain stop.
 * Returns the place id, null when it stays a plain stop, or undefined when it can't tell yet.
 */
export async function fileStopAsRestaurant(
  db: Db,
  groupId: string,
  userId: string,
  stop: { id: string; name: string; address: string; mapsUrl: string; yelpUrl: string; googlePlaceId: string; itemId: string | null; lat?: number | null; lng?: number | null },
): Promise<string | null | undefined> {
  if (stop.itemId) return stop.itemId;
  let type: PlaceType | null = null;
  let details: PlaceDetails | null = null;
  if (stop.googlePlaceId && googleAvailable()) {
    try {
      details = await placeDetails(stop.googlePlaceId, null);
      type = placeTypeFromGoogle(details.primaryType, details.types) ?? "other";
    } catch {
      return undefined; // Google trouble: decide next time
    }
  } else if (yelpAlias(stop.yelpUrl) || /yelp\.to\//.test(stop.yelpUrl)) type = "food";
  else if (stop.googlePlaceId) return undefined; // Google off: decide later
  else if (stop.address.trim() || stop.lat != null) type = "other";
  let itemId: string | null = null;
  if (type) {
    const { restaurant } = await createRestaurant(db, groupId, userId, {
      name: stop.name,
      address: stop.address,
      yelpUrl: stop.yelpUrl,
      mapsUrl: stop.mapsUrl,
      googlePlaceId: stop.googlePlaceId || undefined,
      prefetched: details,
      placeType: type,
      lat: stop.lat ?? null,
      lng: stop.lng ?? null,
      // Somewhere new to eat is news (as before); every other stop quietly becomes a place.
      quiet: type !== "food",
    });
    itemId = restaurant.id;
  }
  await db.update(planStops).set({ placeKind: type ?? "none", itemId }).where(eq(planStops.id, stop.id));
  return itemId;
}
