import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { signIn } from "@/lib/auth";
import { createDish, deleteDish } from "@/lib/dishes";
import { acceptInvite, createGroup, createInvite } from "@/lib/groups";
import { addMeal, deleteMeal, listMeals } from "@/lib/meals";
import { createPlan, getPlan, listPlans, updatePlan } from "@/lib/plans";
import { addShopping, clearBought, deleteShopping, listShopping, updateShopping } from "@/lib/shopping";
import { profile, testDb } from "./db";

let db: Db;
let me: string;
let friend: string;
let outsider: string;
let groupId: string;
const status = (p: Promise<unknown>) => p.then(() => 200, (e) => e.status as number);

beforeEach(async () => {
  db = await testDb();
  me = (await signIn(db, profile("me"))).user.id;
  friend = (await signIn(db, profile("friend"))).user.id;
  outsider = (await signIn(db, profile("outsider"))).user.id;
  groupId = (await createGroup(db, me, { name: "g", timezone: "America/Los_Angeles" })).id;
  await acceptInvite(db, (await createInvite(db, groupId, me)).token, friend);
});

describe("meals on a day at home", () => {
  it("marks a route as a day at home; lunch and dinner take dishes (by id or typed name) or free text", async () => {
    const plan = await createPlan(db, groupId, me, "", "2026-12-24");
    expect((await updatePlan(db, plan.id, me, { atHome: true })).atHome).toBe(true);
    expect((await getPlan(db, plan.id, me)).atHome).toBe(true);
    expect((await listPlans(db, groupId, me))[0].atHome).toBe(true);
    const stew = await createDish(db, groupId, friend, { name: "김치찌개" });
    await addMeal(db, plan.id, me, { slot: "dinner", dishId: stew.id });
    await addMeal(db, plan.id, me, { slot: "lunch", title: "  샌드위치 " });
    const meals = await addMeal(db, plan.id, me, { slot: "dinner", title: "김치찌개" });
    expect(meals.map((m) => [m.slot, m.name, m.dishId])).toEqual([
      ["lunch", "샌드위치", null],
      ["dinner", "김치찌개", stew.id],
      ["dinner", "김치찌개", stew.id],
    ]);
    expect(await status(addMeal(db, plan.id, me, { slot: "lunch", title: " " }))).toBe(400);
    expect(await status(addMeal(db, plan.id, friend, { slot: "lunch", title: "x" }))).toBe(404);
    const other = await createGroup(db, outsider, { name: "o", timezone: "UTC" });
    const theirs = await createDish(db, other.id, outsider, { name: "x" });
    expect(await status(addMeal(db, plan.id, me, { slot: "lunch", dishId: theirs.id }))).toBe(404);
    // A deleted dish leaves the meal without a name source; it then shows its own (empty) title.
    await deleteDish(db, stew.id, friend);
    expect((await listMeals(db, plan.id, me)).filter((m) => m.slot === "dinner").map((m) => m.dishId)).toEqual([null, null]);
  });

  it("shopping for a meal shows under it and in the group's list; removing the meal drops what's still to buy", async () => {
    const plan = await createPlan(db, groupId, me, "", "2026-12-24");
    const tofu = await createDish(db, groupId, me, { name: "순두부" });
    const [meal] = await addMeal(db, plan.id, me, { slot: "dinner", dishId: tofu.id });
    const added = await addShopping(db, groupId, me, { name: "순두부, 대파, 계란", mealId: meal.id });
    expect(added.map((i) => [i.name, i.dishId, i.meal?.slot, i.meal?.date])).toEqual([
      ["순두부", tofu.id, "dinner", "2026-12-24"],
      ["대파", tofu.id, "dinner", "2026-12-24"],
      ["계란", tofu.id, "dinner", "2026-12-24"],
    ]);
    const [milk] = await addShopping(db, groupId, friend, { name: "우유", qty: "2" });
    expect(milk).toMatchObject({ name: "우유", qty: "2", dishId: null, meal: null, done: false });
    expect((await listMeals(db, plan.id, me))[0].shopping.map((s) => s.name)).toEqual(["순두부", "대파", "계란"]);

    // Friends see and check off the whole list; bought items go to the bottom.
    expect((await updateShopping(db, added[1].id, friend, { done: true })).doneBy).toBe("friend");
    expect((await listShopping(db, groupId, friend)).map((i) => [i.name, i.done])).toEqual([
      ["순두부", false],
      ["계란", false],
      ["우유", false],
      ["대파", true],
    ]);
    expect(await status(listShopping(db, groupId, outsider))).toBe(404);
    expect(await status(updateShopping(db, milk.id, outsider, { done: true }))).toBe(404);
    // Only the route's owner can hang items on its meals.
    expect(await status(addShopping(db, groupId, friend, { name: "x", mealId: meal.id }))).toBe(404);

    await deleteMeal(db, meal.id, me);
    expect((await listShopping(db, groupId, me)).map((i) => [i.name, i.meal])).toEqual([
      ["우유", null],
      ["대파", null],
    ]);
    await clearBought(db, groupId, friend);
    expect((await listShopping(db, groupId, me)).map((i) => i.name)).toEqual(["우유"]);
    await deleteShopping(db, milk.id, friend);
    expect(await listShopping(db, groupId, me)).toEqual([]);
    expect(await status(addShopping(db, groupId, me, { name: " , " }))).toBe(400);
  });
});
