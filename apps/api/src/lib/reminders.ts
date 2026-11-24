import { and, asc, eq, gt, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import type { Db } from "../db/client";
import { groups, meals, memberships, planStops, plans, shoppingItems } from "../db/schema";
import { nightsTomorrow, ensureUpcoming } from "./boardgame";
import { todayIn } from "./plans";
import { sendToGroup } from "./push";
import { computeRoute, googleAvailable } from "./google";

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

/** Drive times between two points, kept for a while (they're asked for again on every reminder sync). */
const driveCache = new Map<string, { seconds: number; at: number }>();
async function driveSeconds(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  if (!googleAvailable()) return null;
  const key = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}>${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
  const hit = driveCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.seconds;
  try {
    const { seconds } = await computeRoute([from, to]);
    driveCache.set(key, { seconds, at: Date.now() });
    return seconds;
  } catch {
    return null;
  }
}

/**
 * My stops with a fixed time (a reservation, a show) still ahead, in the next two weeks, with the drive
 * time from the stop before it: the phone works out when to leave and reminds me.
 */
export async function upcomingFixed(db: Db, userId: string, now = new Date()) {
  const rows = await db
    .select({ stop: planStops, groupId: plans.groupId })
    .from(planStops)
    .innerJoin(plans, eq(plans.id, planStops.planId))
    .innerJoin(memberships, and(eq(memberships.groupId, plans.groupId), eq(memberships.userId, userId)))
    .where(and(eq(plans.userId, userId), isNotNull(planStops.fixedAt), gt(planStops.fixedAt, now), lte(planStops.fixedAt, new Date(now.getTime() + 14 * 86_400_000))));
  const out = [];
  for (const { stop, groupId } of rows) {
    if (stop.status === "done" || stop.status === "skipped") continue;
    // Where you'd leave from: the stop before it on the route that has a location.
    const before = await db
      .select()
      .from(planStops)
      .where(and(eq(planStops.planId, stop.planId), lte(planStops.orderIndex, stop.orderIndex)))
      .orderBy(asc(planStops.orderIndex));
    const from = before.filter((s) => s.id !== stop.id && s.status !== "skipped" && s.lat != null && s.lng != null).at(-1);
    const travelSeconds = from && stop.lat != null && stop.lng != null ? await driveSeconds({ lat: from.lat!, lng: from.lng! }, { lat: stop.lat, lng: stop.lng }) : null;
    out.push({ stopId: stop.id, planId: stop.planId, groupId, name: stop.name, fixedAt: stop.fixedAt!.toISOString(), from: from?.name ?? null, travelSeconds });
  }
  return out.sort((a, b) => a.fixedAt.localeCompare(b.fixedAt));
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

