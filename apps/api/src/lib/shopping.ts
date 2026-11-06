import { and, asc, eq, gt, inArray, isNotNull, isNull, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "../db/client";
import { items, meals, plans, shoppingItems, users } from "../db/schema";
import { badRequest, notFound } from "./errors";
import { requireMember } from "./groups";
import { mealForShopping } from "./meals";

/**
 * The group's shopping list, shared by every member. An item can be for a meal on a day at home
 * (then it also shows under that meal), for a dish, or for nothing in particular.
 */

const dishes = alias(items, "dish");

export async function shoppingRows(db: Db, where: SQL | undefined) {
  return db
    .select({ item: shoppingItems, dishName: dishes.name, mealSlot: meals.slot, mealTitle: meals.title, mealDish: meals.dishId, planId: plans.id, date: plans.date, doneByName: users.name })
    .from(shoppingItems)
    .leftJoin(dishes, eq(dishes.id, shoppingItems.dishId))
    .leftJoin(meals, eq(meals.id, shoppingItems.mealId))
    .leftJoin(plans, eq(plans.id, meals.planId))
    .leftJoin(users, eq(users.id, shoppingItems.doneBy))
    .where(where)
    .orderBy(asc(shoppingItems.createdAt));
}

export const shoppingDto = (r: Awaited<ReturnType<typeof shoppingRows>>[number]) => ({
  id: r.item.id,
  name: r.item.name,
  qty: r.item.qty,
  dishId: r.item.dishId,
  dishName: r.dishName,
  mealId: r.item.mealId,
  /** For a meal: which day and which meal (the plan is its owner's; others just see the label). */
  meal: r.item.mealId && r.mealSlot ? { slot: r.mealSlot, date: r.date, planId: r.planId } : null,
  done: !!r.item.doneAt,
  doneAt: r.item.doneAt,
  doneBy: r.doneByName,
  createdAt: r.item.createdAt,
});

/** Still to buy (oldest first), then what was bought in the last two weeks (newest first). */
export async function listShopping(db: Db, groupId: string, userId: string) {
  await requireMember(db, groupId, userId);
  const open = await shoppingRows(db, and(eq(shoppingItems.groupId, groupId), isNull(shoppingItems.doneAt)));
  const since = new Date(Date.now() - 14 * 86_400_000);
  const done = (await shoppingRows(db, and(eq(shoppingItems.groupId, groupId), isNotNull(shoppingItems.doneAt), gt(shoppingItems.doneAt, since)))).sort(
    (a, b) => b.item.doneAt!.getTime() - a.item.doneAt!.getTime(),
  );
  return [...open, ...done.slice(0, 50)].map(shoppingDto);
}

export type ShoppingInput = { name: string; qty?: string; dishId?: string | null; mealId?: string | null };

/** "두부, 대파, 계란" adds three. For a meal, the meal's dish comes along. */
export async function addShopping(db: Db, groupId: string, userId: string, input: ShoppingInput) {
  await requireMember(db, groupId, userId);
  const names = input.name
    .split(/[,，、\n]/)
    .map((n) => n.trim().slice(0, 120))
    .filter(Boolean);
  if (!names.length) throw badRequest("shopping.name_required");
  let dishId = input.dishId ?? null;
  let mealId: string | null = null;
  if (input.mealId) {
    const { meal, plan } = await mealForShopping(db, input.mealId, userId);
    if (plan.groupId !== groupId) throw notFound("meal.not_found");
    mealId = meal.id;
    dishId = dishId ?? meal.dishId;
  }
  if (dishId) {
    const [dish] = await db.select({ id: items.id }).from(items).where(and(eq(items.id, dishId), eq(items.type, "dish"), eq(items.groupId, groupId)));
    if (!dish) throw notFound("dish.not_found");
  }
  const qty = names.length === 1 ? (input.qty ?? "").trim().slice(0, 40) : "";
  const rows = await db
    .insert(shoppingItems)
    // Distinct times keep the typed order (the list is ordered by when items were added).
    .values(names.map((name, i) => ({ groupId, name, qty, dishId, mealId, addedBy: userId, createdAt: new Date(Date.now() + i) })))
    .returning({ id: shoppingItems.id });
  return (await shoppingRows(db, inArray(shoppingItems.id, rows.map((r) => r.id)))).map(shoppingDto);
}

async function memberItem(db: Db, id: string, userId: string) {
  const [item] = await db.select().from(shoppingItems).where(eq(shoppingItems.id, id));
  if (!item) throw notFound("shopping.not_found");
  await requireMember(db, item.groupId, userId).catch(() => {
    throw notFound("shopping.not_found");
  });
  return item;
}

/** Check off (or un-check), rename, change the amount. */
export async function updateShopping(db: Db, id: string, userId: string, edit: { done?: boolean; name?: string; qty?: string }) {
  await memberItem(db, id, userId);
  const set: Partial<typeof shoppingItems.$inferInsert> = {};
  if (edit.done !== undefined) {
    set.doneAt = edit.done ? new Date() : null;
    set.doneBy = edit.done ? userId : null;
  }
  if (edit.name !== undefined) {
    if (!edit.name.trim()) throw badRequest("shopping.name_required");
    set.name = edit.name.trim().slice(0, 120);
  }
  if (edit.qty !== undefined) set.qty = edit.qty.trim().slice(0, 40);
  if (Object.keys(set).length) await db.update(shoppingItems).set(set).where(eq(shoppingItems.id, id));
  return shoppingDto((await shoppingRows(db, eq(shoppingItems.id, id)))[0]);
}

export async function deleteShopping(db: Db, id: string, userId: string) {
  await memberItem(db, id, userId);
  await db.delete(shoppingItems).where(eq(shoppingItems.id, id));
}

/** Clears bought items from the list. */
export async function clearBought(db: Db, groupId: string, userId: string) {
  await requireMember(db, groupId, userId);
  await db.delete(shoppingItems).where(and(eq(shoppingItems.groupId, groupId), isNotNull(shoppingItems.doneAt)));
}

