import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type { Db } from "../db/client";
import { groups, meals, memberships, planStops, plans, shoppingItems } from "../db/schema";
import { nightsTomorrow, ensureUpcoming } from "./boardgame";
import { todayIn } from "./plans";
import { sendToGroup } from "./push";

/**
 * What the phone schedules as its own local reminders: my day routes from today to two weeks ahead,
 * with how many stops, meals and open shopping items each has. The phone picks the times.
 */
export async function upcomingDays(db: Db, userId: string, now = new Date()) {
  const mine = await db
    .select({ groupId: groups.id, groupName: groups.name, timezone: groups.timezone })
    .from(memberships)
    .innerJoin(groups, eq(groups.id, memberships.groupId))
    .where(eq(memberships.userId, userId));
  const out = [];
  for (const g of mine) {
    const from = todayIn(g.timezone, now);
    const to = todayIn(g.timezone, new Date(now.getTime() + 14 * 86_400_000));
    const ps = await db
      .select()
      .from(plans)
      .where(and(eq(plans.groupId, g.groupId), eq(plans.userId, userId), gte(plans.date, from), lte(plans.date, to)))
      .orderBy(asc(plans.date));
    if (!ps.length) continue;
    const ids = ps.map((p) => p.id);
    const stops = await db.select({ planId: planStops.planId, name: planStops.name }).from(planStops).where(inArray(planStops.planId, ids)).orderBy(asc(planStops.orderIndex));
    const ms = await db.select({ id: meals.id, planId: meals.planId }).from(meals).where(inArray(meals.planId, ids));
    const open = ms.length
      ? await db.select({ mealId: shoppingItems.mealId }).from(shoppingItems).where(and(inArray(shoppingItems.mealId, ms.map((m) => m.id)), isNull(shoppingItems.doneAt)))
      : [];
    for (const p of ps) {
      const pStops = stops.filter((s) => s.planId === p.id);
      const pMeals = ms.filter((m) => m.planId === p.id).map((m) => m.id);
      out.push({
        planId: p.id,
        groupId: g.groupId,
        groupName: g.groupName,
        date: p.date!,
        title: p.title,
        atHome: p.atHome,
        stops: pStops.length,
        firstStop: pStops[0]?.name ?? null,
        meals: pMeals.length,
        toBuy: open.filter((o) => o.mealId && pMeals.includes(o.mealId)).length,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Daily job: keep series nights created, then tell each group about tomorrow's board game night. */
export async function dailyPushes(db: Db, now = new Date()) {
  const bg = await db.select({ id: groups.id }).from(groups).where(eq(groups.module, "boardgame"));
  for (const g of bg) await ensureUpcoming(db, g.id, now);
  let sent = 0;
  for (const { night, tz, games } of await nightsTomorrow(db, now)) {
    sent += await sendToGroup(db, night.groupId, null, { type: "night_tomorrow", at: night.startsAt, tz, where: night.location, games, nightId: night.id });
  }
  return { sent };
}

