import { categoryFromGoogleType, coordsFromMapsUrl, isFoodCategory, placeQuery, yelpAlias } from "@wanderbar/route";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { externalLinks, groups, items, menuDetails, ratings, restaurantDetails, users } from "../db/schema";
import { badRequest, forbidden, HttpError, notFound } from "./errors";
import { findPlaceId, googleAvailable, placeDetails, type PlaceDetails } from "./google";
import { requireMember } from "./groups";
import { resolveShortLink } from "./shortLinks";

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
  category?: string | null;
  memo?: string;
};

export type RestaurantEdit = {
  name?: string;
  address?: string;
  hoursRaw?: string;
  yelpUrl?: string;
  mapsUrl?: string;
  category?: string | null;
  memo?: string;
};

export type MenuInput = { name?: string; priceMinor?: number | null; memo?: string };

const cleanCategory = (c: string | null | undefined) => {
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
  await requireMember(db, groupId, userId);
  const category = cleanCategory(input.category);
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
  const g: PlaceDetails | null = await lookupGoogle({
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

  const [item] = await db
    .insert(items)
    .values({
      groupId,
      module: "food",
      type: "restaurant",
      name,
      category: category ?? categoryFromGoogleType(linked?.primaryType),
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
    lat: linked?.lat ?? null,
    lng: linked?.lng ?? null,
    hoursRaw: linked?.hoursRaw ?? "",
    hoursFetchedAt: linked ? new Date() : null,
  });
  if (yelpUrl) await setLink(db, item.id, "yelp", yelpUrl);
  if (mapsUrl || linked?.mapsUrl) await setLink(db, item.id, "gmaps", mapsUrl || linked!.mapsUrl);
  return { restaurant: await getRestaurant(db, item.id, userId), created: true };
}

export async function listRestaurants(db: Db, groupId: string, userId: string) {
  await requireMember(db, groupId, userId);
  const rows = await db
    .select({ item: items, detail: restaurantDetails })
    .from(items)
    .innerJoin(restaurantDetails, eq(restaurantDetails.itemId, items.id))
    .where(and(eq(items.groupId, groupId), eq(items.type, "restaurant")))
    .orderBy(asc(sql`lower(${items.name})`));
  if (!rows.length) return [];
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
  return rows.map(({ item, detail }) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    address: detail.address,
    hoursRaw: detail.hoursRaw,
    lat: detail.lat,
    lng: detail.lng,
    yelpUrl: links.find((l) => l.itemId === item.id && l.kind === "yelp")?.url ?? "",
    mapsUrl: links.find((l) => l.itemId === item.id && l.kind === "gmaps")?.url ?? "",
    menuCount: counts.find((c) => c.parentId === item.id)?.n ?? 0,
    rating: summary(stats.find((x) => x.parentId === item.id)),
  }));
}

/** Half-star sums → { avg in stars (one decimal), count }. */
const summary = (x?: { sum: number; n: number } | null) =>
  x && x.n ? { avg: Math.round((x.sum / x.n / 2) * 10) / 10, count: x.n } : { avg: null as number | null, count: 0 };

/** score 1..10 (half stars) → stars. */
const stars = (score: number) => score / 2;

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
  return {
    id: item.id,
    groupId: item.groupId,
    name: item.name,
    category: item.category,
    memo: item.memo,
    createdBy: item.createdBy,
    address: detail.address,
    hoursRaw: detail.hoursRaw,
    hoursFetchedAt: detail.hoursFetchedAt,
    lat: detail.lat,
    lng: detail.lng,
    googlePlaceId: detail.googlePlaceKey ?? "",
    yelpUrl: links.find((l) => l.kind === "yelp")?.url ?? "",
    mapsUrl: links.find((l) => l.kind === "gmaps")?.url ?? "",
    links: links.map((l) => ({ id: l.id, kind: l.kind, url: l.url, label: l.label })),
    currency: group?.currency ?? "USD",
    rating: summary({ sum: rs.reduce((a, r) => a + r.score, 0), n: rs.length }),
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
  if (edit.name !== undefined && !edit.name.trim()) throw badRequest("restaurant.name_required");
  const itemSet: Partial<typeof items.$inferInsert> = { updatedAt: new Date() };
  if (edit.name !== undefined) itemSet.name = edit.name.trim();
  if (category !== undefined) itemSet.category = category;
  if (edit.memo !== undefined) itemSet.memo = edit.memo.trim();
  await db.update(items).set(itemSet).where(eq(items.id, id));

  const detailSet: Partial<typeof restaurantDetails.$inferInsert> = {};
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
    })
    .where(eq(restaurantDetails.itemId, id));
  if (!item.category) {
    const guess = categoryFromGoogleType(g.primaryType);
    if (guess) await db.update(items).set({ category: guess }).where(eq(items.id, id));
  }
  if (g.mapsUrl) await addLinkIfMissing(db, id, "gmaps", g.mapsUrl);
  return getRestaurant(db, id, userId);
}

/** Whoever added it, or the group's owner. */
export async function deleteRestaurant(db: Db, id: string, userId: string) {
  const { item, role } = await memberRestaurant(db, id, userId);
  if (item.createdBy !== userId && role !== "owner") throw forbidden("restaurant.delete_forbidden");
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
  return getRestaurant(db, menu.parentId!, userId);
}

export async function deleteMenu(db: Db, menuId: string, userId: string) {
  const { menu } = await memberMenu(db, menuId, userId);
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
