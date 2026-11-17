import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { itemTags, tags } from "../db/schema";
import { badRequest } from "./errors";

/** Free-form tags on a group's items (games, restaurants): "Co-op", "Date night". Case-insensitively unique per group. */

export const MAX_TAGS = 12;

/** "  Co-op " → "Co-op"; duplicates (ignoring case) dropped; at most MAX_TAGS. */
export function cleanTags(names: string[], tooMany = "tags.too_many") {
  const out: string[] = [];
  for (const n of names) {
    const name = n.replace(/\s+/g, " ").replace(/^#+/, "").trim().slice(0, 30);
    if (name && !out.some((o) => o.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  if (out.length > MAX_TAGS) throw badRequest(tooMany);
  return out;
}

/** Replaces an item's tags (creating any the group doesn't have yet). */
export async function setTags(db: Db, groupId: string, itemId: string, names: string[]) {
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

/** Each item's tag names, alphabetical. */
export async function tagsByItem(db: Db, ids: string[]) {
  const out = new Map<string, string[]>();
  if (!ids.length) return out;
  const rows = await db
    .select({ itemId: itemTags.itemId, name: tags.name })
    .from(itemTags)
    .innerJoin(tags, eq(tags.id, itemTags.tagId))
    .where(inArray(itemTags.itemId, ids))
    .orderBy(asc(sql`lower(${tags.name})`));
  for (const r of rows) out.set(r.itemId, [...(out.get(r.itemId) ?? []), r.name]);
  return out;
}
