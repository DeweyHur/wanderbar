import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { items, meals, shoppingItems } from "../db/schema";
import { badRequest, notFound } from "./errors";
import { ownPlan } from "./plans";
import { shoppingDto, shoppingRows } from "./shopping";

/**
 * Lunch and dinner on a day at home. A meal is a dish from the group's home cooking (typing a dish's
 * name links it) or just a name, and can carry what to buy for it (shopping items with mealId).
 * Meals belong to the route, so like routes they are the owner's.
 */

export type Slot = "lunch" | "dinner";
export const SLOTS: Slot[] = ["lunch", "dinner"];

export async function listMeals(db: Db, planId: string, userId: string) {
  await ownPlan(db, planId, userId);
  const rows = await db
    .select({ meal: meals, dishName: items.name })
    .from(meals)
    .leftJoin(items, eq(items.id, meals.dishId))
    .where(eq(meals.planId, planId))
    .orderBy(asc(meals.orderIndex), asc(meals.createdAt));
  const ids = rows.map((r) => r.meal.id);
  const shopping = ids.length ? await shoppingRows(db, inArray(shoppingItems.mealId, ids)) : [];
  return rows
    .sort((a, b) => SLOTS.indexOf(a.meal.slot) - SLOTS.indexOf(b.meal.slot))
    .map(({ meal, dishName }) => ({
      id: meal.id,
      slot: meal.slot,
      dishId: meal.dishId,
      name: dishName ?? meal.title,
      shopping: shopping.filter((s) => s.item.mealId === meal.id).map(shoppingDto),
    }));
}

/** Adds a dish (by id, or by typing its name) or a free-text meal to lunch or dinner. */
export async function addMeal(db: Db, planId: string, userId: string, input: { slot: Slot; dishId?: string | null; title?: string }) {
  const plan = await ownPlan(db, planId, userId);
  if (!SLOTS.includes(input.slot)) throw badRequest("meal.slot_invalid");
  let dishId: string | null = null;
  const title = (input.title ?? "").trim();
  if (input.dishId) {
    const [dish] = await db.select({ id: items.id }).from(items).where(and(eq(items.id, input.dishId), eq(items.type, "dish"), eq(items.groupId, plan.groupId)));
    if (!dish) throw notFound("dish.not_found");
    dishId = dish.id;
  } else {
    if (!title) throw badRequest("meal.name_required");
    const [dish] = await db
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.groupId, plan.groupId), eq(items.type, "dish"), sql`lower(${items.name}) = ${title.toLowerCase()}`));
    dishId = dish?.id ?? null;
  }
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(meals).where(and(eq(meals.planId, planId), eq(meals.slot, input.slot)));
  await db.insert(meals).values({ planId, slot: input.slot, dishId, title: dishId ? "" : title.slice(0, 200), orderIndex: n });
  return listMeals(db, planId, userId);
}

async function ownMeal(db: Db, mealId: string, userId: string) {
  const [meal] = await db.select().from(meals).where(eq(meals.id, mealId));
  if (!meal) throw notFound("meal.not_found");
  const plan = await ownPlan(db, meal.planId, userId).catch(() => {
    throw notFound("meal.not_found");
  });
  return { meal, plan };
}

/** Removes the meal and what was still to buy for it (bought items stay in the list's history). */
export async function deleteMeal(db: Db, mealId: string, userId: string) {
  const { meal } = await ownMeal(db, mealId, userId);
  await db.delete(shoppingItems).where(and(eq(shoppingItems.mealId, mealId), isNull(shoppingItems.doneAt)));
  await db.delete(meals).where(eq(meals.id, mealId));
  return listMeals(db, meal.planId, userId);
}

/** The meal's plan, for adding shopping items to it. */
export const mealForShopping = ownMeal;
