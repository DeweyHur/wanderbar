import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { groups, items, photos, users, visits } from "../db/schema";
import { badRequest, forbidden, notFound } from "./errors";
import { requireMember } from "./groups";
import { photoStore } from "./photoStore";
import { todayIn } from "./plans";

/**
 * Photos on restaurants, menus and dishes. The device resizes and strips metadata (GPS) before upload;
 * the camera time it read first comes along as takenAt and records the visit / "made it" for that day.
 */

const PHOTO_ITEMS = ["restaurant", "menu", "dish"] as const;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

async function memberItem(db: Db, itemId: string, userId: string) {
  const [item] = await db.select().from(items).where(eq(items.id, itemId));
  if (!item || !(PHOTO_ITEMS as readonly string[]).includes(item.type)) throw notFound("photo.item_not_found");
  const role = await requireMember(db, item.groupId, userId).catch(() => {
    throw notFound("photo.item_not_found");
  });
  return { item, role };
}

const dto = (p: typeof photos.$inferSelect, who: { name: string | null; email: string }, itemName?: string) => ({
  id: p.id,
  itemId: p.itemId,
  itemName: itemName ?? null,
  uploadedBy: p.uploadedBy,
  name: who.name || who.email.split("@")[0],
  takenAt: p.takenAt,
  createdAt: p.createdAt,
  width: p.width,
  height: p.height,
  url: `/api/photos/${p.id}`,
});

export type NewPhoto = { body: Uint8Array; contentType: string; width?: number | null; height?: number | null; takenAt?: Date | null };

export async function addPhoto(db: Db, itemId: string, userId: string, f: NewPhoto) {
  const { item } = await memberItem(db, itemId, userId);
  const ext = TYPES[f.contentType];
  if (!ext) throw badRequest("photo.type_invalid");
  if (!f.body.byteLength || f.body.byteLength > MAX_PHOTO_BYTES) throw badRequest("photo.too_large");
  const takenAt = f.takenAt && !Number.isNaN(f.takenAt.getTime()) && f.takenAt.getTime() <= Date.now() + 86_400_000 ? f.takenAt : null;
  const id = crypto.randomUUID();
  const blobPath = `groups/${item.groupId}/${item.id}/${id}.${ext}`;
  await photoStore().put(blobPath, f.body, f.contentType);
  const [row] = await db
    .insert(photos)
    .values({ id, groupId: item.groupId, itemId, uploadedBy: userId, blobPath, contentType: f.contentType, width: f.width ?? null, height: f.height ?? null, takenAt })
    .returning();
  if (takenAt) await recordFromPhoto(db, item, userId, takenAt);
  const [who] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId));
  return dto(row, who);
}

/**
 * A photo taken at a restaurant (or of one of its menus) means you were there that day; a dish photo
 * means you made it. Adds that record unless you already have one on that day.
 */
async function recordFromPhoto(db: Db, item: typeof items.$inferSelect, userId: string, takenAt: Date) {
  const target = item.type === "menu" ? item.parentId : item.id;
  if (!target) return;
  const [group] = await db.select({ timezone: groups.timezone }).from(groups).where(eq(groups.id, item.groupId));
  const tz = group?.timezone ?? "UTC";
  const day = todayIn(tz, takenAt);
  const mine = await db.select({ at: visits.visitedAt }).from(visits).where(and(eq(visits.itemId, target), eq(visits.userId, userId)));
  if (mine.some((v) => todayIn(tz, v.at) === day)) return;
  await db.insert(visits).values({ groupId: item.groupId, itemId: target, userId, visitedAt: takenAt });
}

/** Photos of an item, newest first; for a restaurant also its menus' photos (with the menu's name). */
export async function listPhotos(db: Db, itemId: string, userId: string) {
  const { item } = await memberItem(db, itemId, userId);
  const children = item.type === "restaurant" ? await db.select({ id: items.id, name: items.name }).from(items).where(eq(items.parentId, item.id)) : [];
  const ids = [item.id, ...children.map((c) => c.id)];
  const rows = await db
    .select({ photo: photos, name: users.name, email: users.email })
    .from(photos)
    .innerJoin(users, eq(users.id, photos.uploadedBy))
    .where(inArray(photos.itemId, ids))
    .orderBy(desc(sql`coalesce(${photos.takenAt}, ${photos.createdAt})`))
    .limit(200);
  return rows.map((r) => dto(r.photo, r, children.find((c) => c.id === r.photo.itemId)?.name));
}

/** The newest photo of each item (restaurants: including their menus), for covers and thumbnails. */
export async function coverPhotos(db: Db, itemIds: string[]) {
  if (!itemIds.length) return new Map<string, string>();
  const rows = await db
    .select({ photoId: photos.id, itemId: photos.itemId, parentId: items.parentId })
    .from(photos)
    .innerJoin(items, eq(items.id, photos.itemId))
    .where(sql`${photos.itemId} in ${itemIds} or ${items.parentId} in ${itemIds}`)
    .orderBy(desc(sql`coalesce(${photos.takenAt}, ${photos.createdAt})`));
  const out = new Map<string, string>();
  for (const r of rows) {
    const key = itemIds.includes(r.itemId) ? r.itemId : r.parentId!;
    if (!out.has(key)) out.set(key, r.photoId);
  }
  return out;
}

/** The image bytes, for members of the photo's group only. */
export async function photoFile(db: Db, photoId: string, userId: string) {
  const [p] = await db.select().from(photos).where(eq(photos.id, photoId));
  if (!p) throw notFound("photo.not_found");
  await requireMember(db, p.groupId, userId).catch(() => {
    throw notFound("photo.not_found");
  });
  const file = await photoStore().get(p.blobPath);
  if (!file) throw notFound("photo.not_found");
  return file;
}

/** Whoever added it, or the group's owner. */
export async function deletePhoto(db: Db, photoId: string, userId: string) {
  const [p] = await db.select().from(photos).where(eq(photos.id, photoId));
  if (!p) throw notFound("photo.not_found");
  const role = await requireMember(db, p.groupId, userId).catch(() => {
    throw notFound("photo.not_found");
  });
  if (p.uploadedBy !== userId && role !== "owner") throw forbidden("photo.delete_forbidden");
  await db.delete(photos).where(eq(photos.id, photoId));
  await photoStore().delete([p.blobPath]);
}

/** Before deleting items: remove their photo files (rows go with the items). Includes child menus. */
export async function deletePhotoFilesOf(db: Db, itemIds: string[]) {
  if (!itemIds.length) return;
  const rows = await db
    .select({ path: photos.blobPath })
    .from(photos)
    .innerJoin(items, eq(items.id, photos.itemId))
    .where(sql`${photos.itemId} in ${itemIds} or ${items.parentId} in ${itemIds}`);
  await photoStore()
    .delete(rows.map((r) => r.path))
    .catch((e) => console.error("[photos.cleanup]", e instanceof Error ? e.message : e));
}
