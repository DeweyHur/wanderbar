import { addressKey, CHECK_KEYS, parseListingUrl, QUICK, RE_LIMITS, ROOMS, SCORE_KEYS, STAGES } from "@wanderbar/route";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import { externalLinks, groups, items, photos, propertyDetails, tours, users } from "../db/schema";
import { badRequest, forbidden, HttpError, notFound } from "./errors";
import { googleAvailable, placeDetails } from "./google";
import { requireMember } from "./groups";
import { coverPhotos, deletePhotoFilesOf } from "./photos";
import { todayIn } from "./plans";
import { displayName, notifyGroup } from "./push";

/**
 * Real-estate module: houses we saw (or want to see) at open houses, and each member's tour records.
 * A listing link (Zillow / Redfin / Realtor.com) only gives the address; it's read from the URL, never
 * fetched. Everything else is typed in.
 */

const money = z.number().int().min(0).max(RE_LIMITS.price).nullable();
const Facts = {
  price: money.optional(),
  beds: z.number().min(0).max(RE_LIMITS.beds).nullable().optional(),
  baths: z.number().min(0).max(RE_LIMITS.beds).nullable().optional(),
  sqft: z.number().int().min(0).max(RE_LIMITS.sqft).nullable().optional(),
  lotSqft: z.number().int().min(0).max(100_000_000).nullable().optional(),
  yearBuilt: z.number().int().min(1700).max(2100).nullable().optional(),
  hoaMonthly: z.number().int().min(0).max(1_000_000).nullable().optional(),
  openHouse: z.string().max(RE_LIMITS.note).optional(),
  memo: z.string().max(RE_LIMITS.text).optional(),
};
export const NewPropertyBody = z.object({
  url: z.string().max(2000).optional(),
  googlePlaceId: z.string().max(300).optional(),
  sessionToken: z.string().max(200).optional(),
  address: z.string().trim().max(RE_LIMITS.address).optional(),
  stage: z.enum(STAGES).optional(),
  ...Facts,
});
export type NewProperty = z.infer<typeof NewPropertyBody>;

export const PropertyEditBody = z.object({
  address: z.string().trim().min(1).max(RE_LIMITS.address).optional(),
  stage: z.enum(STAGES).optional(),
  rejectReason: z.string().max(RE_LIMITS.note).optional(),
  /** Adds a listing link (Zillow / Redfin / Realtor.com). */
  url: z.string().max(2000).optional(),
  ...Facts,
});
export type PropertyEdit = z.infer<typeof PropertyEditBody>;

const score = z.number().int().min(1).max(5);
export const TourBody = z.object({
  visitedOn: z.iso.date().optional(),
  overall: z.number().int().min(1).max(10).nullable().optional(),
  quick: z.enum(QUICK).nullable().optional(),
  scores: z.partialRecord(z.enum(SCORE_KEYS), score.nullable()).optional(),
  checks: z.partialRecord(z.enum(CHECK_KEYS), z.boolean().nullable()).optional(),
  roomNotes: z.partialRecord(z.enum(ROOMS), z.string().max(RE_LIMITS.note)).optional(),
  pros: z.string().max(RE_LIMITS.text).optional(),
  cons: z.string().max(RE_LIMITS.text).optional(),
  agent: z.string().max(RE_LIMITS.note).optional(),
  heard: z.string().max(RE_LIMITS.text).optional(),
});
export type TourInput = z.infer<typeof TourBody>;

const duplicate = (id: string) => Object.assign(new HttpError(409, "property.duplicate"), { id });
const cityOf = (address: string) => address.split(",").map((s) => s.trim())[1] ?? "";
const zipOf = (address: string) => /\b(\d{5})(?:-\d{4})?\b(?!.*\b\d{5}\b)/.exec(address)?.[1] ?? "";
/** Drop nulls from score / check maps (null = cleared). */
const compact = <T>(m: Partial<Record<string, T | null>> | undefined) =>
  m ? (Object.fromEntries(Object.entries(m).filter(([, v]) => v !== null && v !== undefined && v !== "")) as Record<string, T>) : undefined;

async function memberProperty(db: Db, itemId: string, userId: string) {
  const [row] = await db
    .select({ item: items, detail: propertyDetails })
    .from(items)
    .innerJoin(propertyDetails, eq(propertyDetails.itemId, items.id))
    .where(and(eq(items.id, itemId), eq(items.type, "property")));
  if (!row) throw notFound("property.not_found");
  const role = await requireMember(db, row.item.groupId, userId).catch(() => {
    throw notFound("property.not_found");
  });
  return { ...row, role };
}

async function groupTz(db: Db, groupId: string) {
  const [g] = await db.select({ timezone: groups.timezone }).from(groups).where(eq(groups.id, groupId));
  return g?.timezone ?? "UTC";
}

/** Saves a house from a listing link, a Google place or a typed address. An existing house (same address) is returned instead. */
export async function createProperty(db: Db, groupId: string, userId: string, input: NewProperty) {
  await requireMember(db, groupId, userId);
  let address = input.address?.trim() ?? "";
  let city = "";
  let zip = "";
  let lat: number | null = null;
  let lng: number | null = null;
  let googlePlaceId: string | null = null;
  let link: { kind: "zillow" | "redfin" | "realtor"; url: string } | null = null;

  if (input.url?.trim()) {
    const parsed = parseListingUrl(input.url);
    if (!parsed) throw badRequest("property.link_unreadable");
    address = parsed.address;
    city = parsed.city;
    zip = parsed.zip;
    link = { kind: parsed.source, url: parsed.url };
  } else if (input.googlePlaceId) {
    if (!googleAvailable()) throw badRequest("google.unavailable");
    const p = await placeDetails(input.googlePlaceId, input.sessionToken ?? null);
    address = p.address || p.name;
    lat = p.lat;
    lng = p.lng;
    googlePlaceId = p.googlePlaceId;
  }
  if (!address) throw badRequest("property.address_required");
  city ||= cityOf(address);
  zip ||= zipOf(address);
  const key = addressKey(address);

  const [existing] = await db
    .select({ itemId: propertyDetails.itemId })
    .from(propertyDetails)
    .where(and(eq(propertyDetails.groupId, groupId), eq(propertyDetails.addressKey, key)));
  if (existing) {
    if (link) await db.insert(externalLinks).values({ itemId: existing.itemId, ...link }).onConflictDoNothing();
    return { property: await getProperty(db, existing.itemId, userId), created: false };
  }

  // No transactions on the Neon HTTP driver: insert in order and undo the item if a later insert fails.
  const [item] = await db
    .insert(items)
    .values({ groupId, module: "realestate", type: "property", name: address, memo: input.memo ?? "", createdBy: userId })
    .returning({ id: items.id });
  const itemId = item.id;
  try {
    await db.insert(propertyDetails).values({
      itemId,
      groupId,
      address,
      addressKey: key,
      city,
      zip,
      lat,
      lng,
      googlePlaceId,
      price: input.price ?? null,
      beds: input.beds ?? null,
      baths: input.baths ?? null,
      sqft: input.sqft ?? null,
      lotSqft: input.lotSqft ?? null,
      yearBuilt: input.yearBuilt ?? null,
      hoaMonthly: input.hoaMonthly ?? null,
      openHouse: input.openHouse ?? "",
      stage: input.stage ?? "interested",
    });
    if (link) await db.insert(externalLinks).values({ itemId, ...link });
  } catch (e) {
    await db.delete(items).where(eq(items.id, itemId));
    throw e;
  }
  notifyGroup(db, groupId, userId, { type: "property", who: await displayName(db, userId), name: address, itemId });
  return { property: await getProperty(db, itemId, userId), created: true };
}

/** The group's houses, newest activity first, with tour summaries and a cover photo. */
export async function listProperties(db: Db, groupId: string, userId: string) {
  await requireMember(db, groupId, userId);
  const rows = await db
    .select({ item: items, detail: propertyDetails })
    .from(items)
    .innerJoin(propertyDetails, eq(propertyDetails.itemId, items.id))
    .where(and(eq(items.groupId, groupId), eq(items.type, "property")))
    .orderBy(desc(propertyDetails.updatedAt));
  const ids = rows.map((r) => r.item.id);
  const allTours = ids.length
    ? await db.select({ itemId: tours.itemId, userId: tours.userId, overall: tours.overall, quick: tours.quick, visitedOn: tours.visitedOn }).from(tours).where(inArray(tours.itemId, ids))
    : [];
  const covers = await coverPhotos(db, ids);
  return rows.map(({ item, detail }) => {
    const ts = allTours.filter((t) => t.itemId === item.id);
    const rated = ts.filter((t) => t.overall !== null);
    const mine = ts.filter((t) => t.userId === userId).sort((a, b) => b.visitedOn.localeCompare(a.visitedOn))[0];
    const cover = covers.get(item.id);
    return {
      id: item.id,
      address: detail.address,
      city: detail.city,
      price: detail.price,
      beds: detail.beds,
      baths: detail.baths,
      sqft: detail.sqft,
      stage: detail.stage,
      openHouse: detail.openHouse,
      tours: ts.length,
      lastVisited: ts.map((t) => t.visitedOn).sort().at(-1) ?? null,
      avgOverall: rated.length ? Math.round((rated.reduce((a, t) => a + (t.overall ?? 0), 0) / rated.length) * 10) / 10 : null,
      myOverall: mine?.overall ?? null,
      myQuick: mine?.quick ?? null,
      coverUrl: cover ? `/api/photos/${cover}?size=thumb` : null,
      updatedAt: detail.updatedAt,
    };
  });
}

const tourDto = (t: typeof tours.$inferSelect, who: { name: string | null; email: string }, me: string) => ({
  id: t.id,
  userId: t.userId,
  name: who.name || who.email.split("@")[0],
  mine: t.userId === me,
  visitedOn: t.visitedOn,
  overall: t.overall,
  quick: t.quick,
  scores: t.scores,
  checks: t.checks,
  roomNotes: t.roomNotes,
  pros: t.pros,
  cons: t.cons,
  agent: t.agent,
  heard: t.heard,
  updatedAt: t.updatedAt,
});

export async function getProperty(db: Db, id: string, userId: string) {
  const { item, detail, role } = await memberProperty(db, id, userId);
  const [links, tourRows] = await Promise.all([
    db.select({ id: externalLinks.id, kind: externalLinks.kind, url: externalLinks.url }).from(externalLinks).where(eq(externalLinks.itemId, id)).orderBy(asc(externalLinks.createdAt)),
    db
      .select({ tour: tours, name: users.name, email: users.email })
      .from(tours)
      .innerJoin(users, eq(users.id, tours.userId))
      .where(eq(tours.itemId, id))
      .orderBy(desc(tours.visitedOn), desc(tours.createdAt)),
  ]);
  const { itemId: _i, groupId: _g, addressKey: _k, ...facts } = detail;
  return {
    id: item.id,
    groupId: item.groupId,
    memo: item.memo,
    createdBy: item.createdBy,
    canDelete: item.createdBy === userId || role === "owner",
    ...facts,
    links,
    tours: tourRows.map((r) => tourDto(r.tour, r, userId)),
  };
}

export async function updateProperty(db: Db, id: string, userId: string, edit: PropertyEdit) {
  const { item } = await memberProperty(db, id, userId);
  const set: Partial<typeof propertyDetails.$inferInsert> = { updatedAt: new Date() };
  if (edit.address !== undefined) {
    const key = addressKey(edit.address);
    const [other] = await db
      .select({ itemId: propertyDetails.itemId })
      .from(propertyDetails)
      .where(and(eq(propertyDetails.groupId, item.groupId), eq(propertyDetails.addressKey, key)));
    if (other && other.itemId !== id) throw duplicate(other.itemId);
    Object.assign(set, { address: edit.address, addressKey: key, city: cityOf(edit.address), zip: zipOf(edit.address) });
    await db.update(items).set({ name: edit.address, updatedAt: new Date() }).where(eq(items.id, id));
  }
  for (const k of ["price", "beds", "baths", "sqft", "lotSqft", "yearBuilt", "hoaMonthly", "openHouse", "stage", "rejectReason"] as const) {
    if (edit[k] !== undefined) (set as Record<string, unknown>)[k] = edit[k];
  }
  if (edit.memo !== undefined) await db.update(items).set({ memo: edit.memo, updatedAt: new Date() }).where(eq(items.id, id));
  await db.update(propertyDetails).set(set).where(eq(propertyDetails.itemId, id));
  if (edit.url?.trim()) {
    const parsed = parseListingUrl(edit.url);
    if (!parsed) throw badRequest("property.link_unreadable");
    await db.insert(externalLinks).values({ itemId: id, kind: parsed.source, url: parsed.url }).onConflictDoNothing();
  }
  return getProperty(db, id, userId);
}

/** Whoever saved it, or the group's owner. Tours and photos go with it. */
export async function deleteProperty(db: Db, id: string, userId: string) {
  const { item, role } = await memberProperty(db, id, userId);
  if (item.createdBy !== userId && role !== "owner") throw forbidden("property.delete_forbidden");
  await deletePhotoFilesOf(db, [id]);
  await db.delete(items).where(eq(items.id, id));
  return { ok: true };
}

export async function removeLink(db: Db, id: string, linkId: string, userId: string) {
  await memberProperty(db, id, userId);
  await db.delete(externalLinks).where(and(eq(externalLinks.id, linkId), eq(externalLinks.itemId, id)));
  return getProperty(db, id, userId);
}

function tourValues(input: TourInput) {
  const v: Partial<typeof tours.$inferInsert> = {};
  if (input.visitedOn !== undefined) v.visitedOn = input.visitedOn;
  if (input.overall !== undefined) v.overall = input.overall;
  if (input.quick !== undefined) v.quick = input.quick;
  if (input.scores !== undefined) v.scores = compact(input.scores);
  if (input.checks !== undefined) v.checks = compact(input.checks);
  if (input.roomNotes !== undefined) v.roomNotes = compact(input.roomNotes);
  for (const k of ["pros", "cons", "agent", "heard"] as const) if (input[k] !== undefined) v[k] = input[k];
  return v;
}

/** Starts my record of a visit (today in the group's time zone unless given). Moves a house we hadn't seen yet to "toured". */
export async function createTour(db: Db, propertyId: string, userId: string, input: TourInput, now = new Date()) {
  const { item, detail } = await memberProperty(db, propertyId, userId);
  const visitedOn = input.visitedOn ?? todayIn(await groupTz(db, item.groupId), now);
  if (visitedOn > todayIn("Pacific/Kiritimati", now)) throw badRequest("tour.future");
  const [row] = await db
    .insert(tours)
    .values({ groupId: item.groupId, itemId: propertyId, userId, ...tourValues(input), visitedOn })
    .returning();
  if (detail.stage === "interested" || detail.stage === "to_tour") await db.update(propertyDetails).set({ stage: "toured", updatedAt: now }).where(eq(propertyDetails.itemId, propertyId));
  else await db.update(propertyDetails).set({ updatedAt: now }).where(eq(propertyDetails.itemId, propertyId));
  return tourOf(db, row.id, userId);
}

async function myTour(db: Db, tourId: string, userId: string) {
  const [t] = await db.select().from(tours).where(eq(tours.id, tourId));
  if (!t) throw notFound("tour.not_found");
  await requireMember(db, t.groupId, userId).catch(() => {
    throw notFound("tour.not_found");
  });
  return t;
}

export async function tourOf(db: Db, tourId: string, userId: string) {
  const t = await myTour(db, tourId, userId);
  const [who] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, t.userId));
  const [d] = await db.select({ address: propertyDetails.address }).from(propertyDetails).where(eq(propertyDetails.itemId, t.itemId));
  return { ...tourDto(t, who, userId), propertyId: t.itemId, address: d?.address ?? "" };
}

/** Only my own tour. The first time it gets an overall score the group hears about it. */
export async function updateTour(db: Db, tourId: string, userId: string, input: TourInput, now = new Date()) {
  const t = await myTour(db, tourId, userId);
  if (t.userId !== userId) throw forbidden("tour.not_yours");
  const v = tourValues(input);
  if (v.visitedOn && v.visitedOn > todayIn("Pacific/Kiritimati", now)) throw badRequest("tour.future");
  await db.update(tours).set({ ...v, updatedAt: now }).where(eq(tours.id, tourId));
  await db.update(propertyDetails).set({ updatedAt: now }).where(eq(propertyDetails.itemId, t.itemId));
  if (t.overall === null && typeof v.overall === "number") {
    const [d] = await db.select({ address: propertyDetails.address }).from(propertyDetails).where(eq(propertyDetails.itemId, t.itemId));
    notifyGroup(db, t.groupId, userId, { type: "tour", who: await displayName(db, userId), name: d?.address ?? "", score: v.overall, itemId: t.itemId });
  }
  return tourOf(db, tourId, userId);
}

export async function deleteTour(db: Db, tourId: string, userId: string) {
  const t = await myTour(db, tourId, userId);
  if (t.userId !== userId) throw forbidden("tour.not_yours");
  await db.update(photos).set({ tourId: null }).where(eq(photos.tourId, tourId));
  await db.delete(tours).where(eq(tours.id, tourId));
  return { ok: true };
}
