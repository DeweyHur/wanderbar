import { PlanFlow, type StopStatus } from "@wanderbar/route";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { groups, planStops, plans, teslaFormats } from "../db/schema";
import { badRequest, notFound } from "./errors";
import { requireMember } from "./groups";
import { fileStopAsRestaurant, recordStopVisit, restaurantsInGroup } from "./restaurants";

export type Stop = typeof planStops.$inferSelect;
export type StopFields = Partial<
  Pick<Stop, "name" | "memo" | "address" | "mapsUrl" | "yelpUrl" | "hoursRaw" | "lat" | "lng" | "googlePlaceId" | "itemId">
>;

/** Plans are personal in the MVP: visible only to their owner, who must still be a group member. */
export async function ownPlan(db: Db, planId: string, userId: string) {
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
  if (!plan || plan.userId !== userId) throw notFound("plan.not_found");
  await requireMember(db, plan.groupId, userId);
  return plan;
}

async function ownStop(db: Db, stopId: string, userId: string) {
  const [stop] = await db.select().from(planStops).where(eq(planStops.id, stopId));
  if (!stop) throw notFound("plan.stop_not_found");
  const plan = await ownPlan(db, stop.planId, userId);
  return { stop, plan };
}

const stopsOf = (db: Db, planId: string) =>
  db.select().from(planStops).where(eq(planStops.planId, planId)).orderBy(asc(planStops.orderIndex), asc(planStops.createdAt));

/** Persists a new order/status list, writing only rows that changed. */
async function save(db: Db, before: Stop[], after: Stop[]) {
  const prev = new Map(before.map((s, i) => [s.id, { i, status: s.status }]));
  for (const [i, s] of after.entries()) {
    const p = prev.get(s.id);
    if (p && p.i === i && p.status === s.status && s.orderIndex === i) continue;
    await db.update(planStops).set({ orderIndex: i, status: s.status }).where(eq(planStops.id, s.id));
  }
  return after.map((s, i) => ({ ...s, orderIndex: i }));
}

export async function listPlans(db: Db, groupId: string, userId: string) {
  await requireMember(db, groupId, userId);
  const rows = await db
    .select()
    .from(plans)
    .where(and(eq(plans.groupId, groupId), eq(plans.userId, userId)))
    .orderBy(desc(plans.date), desc(plans.createdAt));
  if (!rows.length) return [];
  const stops = await db
    .select({ planId: planStops.planId, status: planStops.status, name: planStops.name })
    .from(planStops)
    .where(inArray(planStops.planId, rows.map((p) => p.id)));
  return rows.map((p) => {
    const mine = stops.filter((s) => s.planId === p.id);
    return {
      id: p.id,
      title: p.title,
      date: p.date,
      atHome: p.atHome,
      createdAt: p.createdAt,
      total: mine.length,
      finished: mine.filter((s) => s.status === "done" || s.status === "skipped").length,
      currentName: mine.find((s) => s.status === "current")?.name ?? null,
    };
  });
}

/** "YYYY-MM-DD" that is a real calendar day. */
export function isDay(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Today in a time zone, as YYYY-MM-DD. */
export const todayIn = (timeZone: string, now = new Date()) => {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
};

/** A route for any day (today when none is given); the title is optional (it's then called by its date). */
export async function createPlan(db: Db, groupId: string, userId: string, title = "", date?: string) {
  await requireMember(db, groupId, userId);
  if (date !== undefined && !isDay(date)) throw badRequest("plan.date_invalid");
  const [group] = await db.select({ timezone: groups.timezone }).from(groups).where(eq(groups.id, groupId));
  const [plan] = await db
    .insert(plans)
    .values({ groupId, userId, title: title.trim(), date: date ?? todayIn(group?.timezone ?? "UTC") })
    .returning();
  return plan;
}

/** Files not-yet-checked stops that are restaurants under the group's restaurants (older routes too). */
async function fileRestaurants(db: Db, groupId: string, userId: string, stops: Stop[]) {
  let changed = false;
  for (const s of stops) {
    if (s.itemId || s.placeKind) continue;
    if ((await fileStopAsRestaurant(db, groupId, userId, s)) !== undefined) changed = true;
  }
  return changed;
}

export async function getPlan(db: Db, planId: string, userId: string) {
  const plan = await ownPlan(db, planId, userId);
  const stops = await stopsOf(db, planId);
  if (await fileRestaurants(db, plan.groupId, userId, stops)) return { ...plan, stops: await stopsOf(db, planId) };
  return { ...plan, stops };
}

/** Rename (empty = call it by its date), move the route to another day, or mark it a day at home. */
export async function updatePlan(db: Db, planId: string, userId: string, edit: { title?: string; date?: string; atHome?: boolean }) {
  await ownPlan(db, planId, userId);
  if (edit.date !== undefined && !isDay(edit.date)) throw badRequest("plan.date_invalid");
  const set: Partial<typeof plans.$inferInsert> = {};
  if (edit.title !== undefined) set.title = edit.title.trim();
  if (edit.date !== undefined) set.date = edit.date;
  if (edit.atHome !== undefined) set.atHome = edit.atHome;
  if (!Object.keys(set).length) return ownPlan(db, planId, userId);
  const [plan] = await db.update(plans).set(set).where(eq(plans.id, planId)).returning();
  return plan;
}

export async function deletePlan(db: Db, planId: string, userId: string) {
  await ownPlan(db, planId, userId);
  await db.delete(plans).where(eq(plans.id, planId));
}

/** Adds stops at the end, in order. The first stop of an empty plan becomes current. */
export async function addStops(db: Db, planId: string, userId: string, fields: StopFields[]) {
  const plan = await ownPlan(db, planId, userId);
  const clean = fields.map((f) => ({ ...f, name: (f.name ?? "").trim() })).filter((f) => f.name);
  if (!clean.length) throw badRequest("plan.stop_name_required");
  const itemIds = [...new Set(clean.map((f) => f.itemId).filter((x): x is string => !!x))];
  const ok = await restaurantsInGroup(db, plan.groupId, itemIds);
  if (ok.length !== itemIds.length) throw notFound("restaurant.not_found");
  let stops = await stopsOf(db, planId);
  for (const f of clean) {
    const [row] = await db
      .insert(planStops)
      .values({ ...f, name: f.name, planId, orderIndex: stops.length, status: "pending" })
      .returning();
    const before = stops;
    stops = await save(db, [...before, row], PlanFlow.add(before, row));
  }
  if (await fileRestaurants(db, plan.groupId, userId, stops)) stops = await stopsOf(db, planId);
  return stops;
}

export async function updateStop(db: Db, stopId: string, userId: string, fields: StopFields) {
  const { plan } = await ownStop(db, stopId, userId);
  if (fields.itemId && !(await restaurantsInGroup(db, plan.groupId, [fields.itemId])).length) throw notFound("restaurant.not_found");
  if (fields.name !== undefined && !fields.name.trim()) throw badRequest("plan.stop_name_required");
  const [stop] = await db
    .update(planStops)
    .set({ ...fields, ...(fields.name !== undefined ? { name: fields.name.trim() } : {}) })
    .where(eq(planStops.id, stopId))
    .returning();
  return stop;
}

export async function deleteStop(db: Db, stopId: string, userId: string) {
  const { plan } = await ownStop(db, stopId, userId);
  const before = await stopsOf(db, plan.id);
  await db.delete(planStops).where(eq(planStops.id, stopId));
  return save(db, before.filter((s) => s.id !== stopId), PlanFlow.remove(before, stopId));
}

export type FlowAction =
  | { action: "complete" | "postpone" | "drop" | "setCurrent" | "restore"; stopId: string }
  | { action: "move"; from: number; to: number }
  | { action: "restart" };

/** Applies one "naive scheduler" step (same rules as the old Kotlin app) and returns the new stop list. */
export async function applyFlow(db: Db, planId: string, userId: string, a: FlowAction) {
  const plan = await ownPlan(db, planId, userId);
  const before = await stopsOf(db, planId);
  let after: Stop[];
  switch (a.action) {
    case "move":
      after = PlanFlow.move(before, a.from, a.to);
      break;
    case "restart":
      after = PlanFlow.restart(before);
      break;
    default:
      if (!before.some((s) => s.id === a.stopId)) throw notFound("plan.stop_not_found");
      after = PlanFlow[a.action](before, a.stopId);
  }
  // Visits follow "done": finishing a restaurant stop records one, bringing it back removes it.
  for (const b of before) {
    const now = after.find((x) => x.id === b.id);
    if (!now || (b.status === "done") === (now.status === "done") || a.action === "restart") continue;
    await recordStopVisit(db, b, plan.groupId, userId, now.status === "done");
  }
  return save(db, before, after);
}

export type Platform = "android" | "ios";

export async function getTeslaFormat(db: Db, userId: string, platform: Platform) {
  const [row] = await db
    .select()
    .from(teslaFormats)
    .where(and(eq(teslaFormats.userId, userId), eq(teslaFormats.platform, platform)));
  return row?.format ?? null;
}

export async function setTeslaFormat(db: Db, userId: string, platform: Platform, format: (typeof teslaFormats.$inferSelect)["format"]) {
  await db
    .insert(teslaFormats)
    .values({ userId, platform, format })
    .onConflictDoUpdate({ target: [teslaFormats.userId, teslaFormats.platform], set: { format } });
  return format;
}

export type { StopStatus };
