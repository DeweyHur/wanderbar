import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { items, ratings, users, visits } from "../db/schema";
import { badRequest, forbidden, notFound } from "./errors";
import { requireMember } from "./groups";
import { cleanCategory, stars, summary } from "./restaurants";

/**
 * Food module: dishes made at home. Rated like menus (half stars + review, one per member) and
 * logged each time someone makes it ("made it" uses the visits table: someone had it, on a day).
 */

export type DishInput = { name?: string; category?: string | null; memo?: string };

async function memberDish(db: Db, id: string, userId: string) {
  const [dish] = await db.select().from(items).where(and(eq(items.id, id), eq(items.type, "dish")));
  if (!dish) throw notFound("dish.not_found");
  const role = await requireMember(db, dish.groupId, userId).catch(() => {
    throw notFound("dish.not_found");
  });
  return { dish, role };
}

export async function listDishes(db: Db, groupId: string, userId: string) {
  await requireMember(db, groupId, userId);
  const rows = await db
    .select()
    .from(items)
    .where(and(eq(items.groupId, groupId), eq(items.type, "dish")))
    .orderBy(asc(sql`lower(${items.name})`));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const rs = await db
    .select({ itemId: ratings.itemId, sum: sql<number>`sum(${ratings.score})::int`, n: sql<number>`count(*)::int` })
    .from(ratings)
    .where(inArray(ratings.itemId, ids))
    .groupBy(ratings.itemId);
  const made = await db
    .select({ itemId: visits.itemId, at: sql<string>`max(${visits.visitedAt})`, n: sql<number>`count(*)::int` })
    .from(visits)
    .where(inArray(visits.itemId, ids))
    .groupBy(visits.itemId);
  return rows.map((d) => {
    const m = made.find((x) => x.itemId === d.id);
    return {
      id: d.id,
      name: d.name,
      category: d.category,
      memo: d.memo,
      rating: summary(rs.find((x) => x.itemId === d.id)),
      lastMadeAt: m?.at ?? null,
      madeCount: m?.n ?? 0,
    };
  });
}

export async function createDish(db: Db, groupId: string, userId: string, input: DishInput) {
  await requireMember(db, groupId, userId);
  const name = (input.name ?? "").trim();
  if (!name) throw badRequest("dish.name_required");
  const [dish] = await db
    .insert(items)
    .values({ groupId, module: "food", type: "dish", name, category: cleanCategory(input.category) ?? null, memo: (input.memo ?? "").trim(), createdBy: userId })
    .returning();
  return getDish(db, dish.id, userId);
}

export async function getDish(db: Db, id: string, userId: string) {
  const { dish } = await memberDish(db, id, userId);
  const rows = await db
    .select({ rating: ratings, name: users.name, email: users.email })
    .from(ratings)
    .innerJoin(users, eq(users.id, ratings.userId))
    .where(eq(ratings.itemId, id))
    .orderBy(desc(ratings.updatedAt));
  const made = await db
    .select({ visit: visits, name: users.name, email: users.email })
    .from(visits)
    .innerJoin(users, eq(users.id, visits.userId))
    .where(eq(visits.itemId, id))
    .orderBy(desc(visits.visitedAt))
    .limit(30);
  const mine = rows.find((r) => r.rating.userId === userId);
  const who = (r: { name: string | null; email: string }) => r.name || r.email.split("@")[0];
  return {
    id: dish.id,
    groupId: dish.groupId,
    name: dish.name,
    category: dish.category,
    memo: dish.memo,
    createdBy: dish.createdBy,
    rating: summary({ sum: rows.reduce((a, r) => a + r.rating.score, 0), n: rows.length }),
    mine: mine ? { stars: stars(mine.rating.score), review: mine.rating.review } : null,
    ratings: rows.map((r) => ({ userId: r.rating.userId, name: who(r), stars: stars(r.rating.score), review: r.rating.review, updatedAt: r.rating.updatedAt })),
    made: made.map((m) => ({ id: m.visit.id, userId: m.visit.userId, name: who(m), madeAt: m.visit.visitedAt })),
  };
}

export async function updateDish(db: Db, id: string, userId: string, input: DishInput) {
  await memberDish(db, id, userId);
  if (input.name !== undefined && !input.name.trim()) throw badRequest("dish.name_required");
  const set: Partial<typeof items.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) set.name = input.name.trim();
  const category = cleanCategory(input.category);
  if (category !== undefined) set.category = category;
  if (input.memo !== undefined) set.memo = input.memo.trim();
  await db.update(items).set(set).where(eq(items.id, id));
  return getDish(db, id, userId);
}

/** Whoever added it, or the group's owner. */
export async function deleteDish(db: Db, id: string, userId: string) {
  const { dish, role } = await memberDish(db, id, userId);
  if (dish.createdBy !== userId && role !== "owner") throw forbidden("dish.delete_forbidden");
  await db.delete(items).where(eq(items.id, id));
}

export async function rateDish(db: Db, id: string, userId: string, input: { stars: number; review?: string }) {
  const { dish } = await memberDish(db, id, userId);
  const score = input.stars * 2;
  if (!Number.isInteger(score) || score < 1 || score > 10) throw badRequest("rating.stars_invalid");
  const review = (input.review ?? "").trim();
  await db
    .insert(ratings)
    .values({ groupId: dish.groupId, itemId: id, userId, score, review })
    .onConflictDoUpdate({ target: [ratings.itemId, ratings.userId], set: { score, review, updatedAt: new Date() } });
  return getDish(db, id, userId);
}

export async function unrateDish(db: Db, id: string, userId: string) {
  await memberDish(db, id, userId);
  await db.delete(ratings).where(and(eq(ratings.itemId, id), eq(ratings.userId, userId)));
  return getDish(db, id, userId);
}

/** "I made it" (now, or on a given time). */
export async function addMade(db: Db, id: string, userId: string, madeAt?: Date) {
  const { dish } = await memberDish(db, id, userId);
  if (madeAt && (Number.isNaN(madeAt.getTime()) || madeAt.getTime() > Date.now() + 86_400_000)) throw badRequest("visit.date_invalid");
  await db.insert(visits).values({ groupId: dish.groupId, itemId: id, userId, visitedAt: madeAt ?? new Date() });
  return getDish(db, id, userId);
}

/** Only your own entries. */
export async function deleteMade(db: Db, id: string, madeId: string, userId: string) {
  await memberDish(db, id, userId);
  const [v] = await db.select().from(visits).where(and(eq(visits.id, madeId), eq(visits.itemId, id)));
  if (!v) throw notFound("visit.not_found");
  if (v.userId !== userId) throw forbidden("visit.not_yours");
  await db.delete(visits).where(eq(visits.id, madeId));
  return getDish(db, id, userId);
}
