import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { signIn } from "@/lib/auth";
import { acceptInvite, createGroup, createInvite } from "@/lib/groups";
import {
  addStops,
  applyFlow,
  createPlan,
  deletePlan,
  deleteStop,
  getPlan,
  getTeslaFormat,
  listPlans,
  setTeslaFormat,
  updateStop,
} from "@/lib/plans";
import { profile, testDb } from "./db";

let db: Db;
let me: string;
let friend: string;
let groupId: string;

const status = (p: Promise<unknown>) => p.then(() => 200, (e) => e.status as number);
const view = (stops: { name: string; status: string }[]) => stops.map((s) => `${s.name}:${s.status}`);

beforeEach(async () => {
  db = await testDb();
  me = (await signIn(db, profile("me"))).user.id;
  friend = (await signIn(db, profile("friend"))).user.id;
  groupId = (await createGroup(db, me, { name: "g" })).id;
  await acceptInvite(db, (await createInvite(db, groupId, me)).token, friend);
});

describe("plans", () => {
  it("quick-adds stops in order; the first becomes current", async () => {
    const plan = await createPlan(db, groupId, me, "11월 2일 동선");
    const stops = await addStops(db, plan.id, me, [{ name: "카페" }, { name: " 공원 " }, { name: "재즈바" }]);
    expect(view(stops)).toEqual(["카페:current", "공원:pending", "재즈바:pending"]);
    expect(stops.map((s) => s.orderIndex)).toEqual([0, 1, 2]);
  });

  it("runs the day: done, skip, drop, go here now, restore, move, restart", async () => {
    const plan = await createPlan(db, groupId, me, "p");
    const [a, b, c] = await addStops(db, plan.id, me, [{ name: "a" }, { name: "b" }, { name: "c" }]);
    expect(view(await applyFlow(db, plan.id, me, { action: "complete", stopId: a.id }))).toEqual(["a:done", "b:current", "c:pending"]);
    expect(view(await applyFlow(db, plan.id, me, { action: "postpone", stopId: b.id }))).toEqual(["a:done", "c:current", "b:pending"]);
    expect(view(await applyFlow(db, plan.id, me, { action: "drop", stopId: c.id }))).toEqual(["a:done", "c:skipped", "b:current"]);
    expect(view(await applyFlow(db, plan.id, me, { action: "restore", stopId: c.id }))).toEqual(["a:done", "c:pending", "b:current"]);
    expect(view(await applyFlow(db, plan.id, me, { action: "setCurrent", stopId: c.id }))).toEqual(["a:done", "c:current", "b:pending"]);
    expect(view(await applyFlow(db, plan.id, me, { action: "move", from: 2, to: 0 }))).toEqual(["b:pending", "a:done", "c:current"]);
    expect(view(await applyFlow(db, plan.id, me, { action: "restart" }))).toEqual(["b:current", "a:pending", "c:pending"]);
    // Persisted, not just returned:
    expect(view((await getPlan(db, plan.id, me)).stops)).toEqual(["b:current", "a:pending", "c:pending"]);
  });

  it("deleting the current stop promotes the next one", async () => {
    const plan = await createPlan(db, groupId, me, "p");
    const [a] = await addStops(db, plan.id, me, [{ name: "a" }, { name: "b" }]);
    expect(view(await deleteStop(db, a.id, me))).toEqual(["b:current"]);
  });

  it("edits stop details", async () => {
    const plan = await createPlan(db, groupId, me, "p");
    const [a] = await addStops(db, plan.id, me, [{ name: "a" }]);
    const s = await updateStop(db, a.id, me, { address: "315 Linden St", hoursRaw: "09:00-22:00", lat: 37.77, lng: -122.42 });
    expect(s).toMatchObject({ name: "a", address: "315 Linden St", hoursRaw: "09:00-22:00", lat: 37.77 });
    expect(await status(updateStop(db, a.id, me, { name: "  " }))).toBe(400);
  });

  it("lists my plans with progress", async () => {
    const plan = await createPlan(db, groupId, me, "p");
    const [a] = await addStops(db, plan.id, me, [{ name: "a" }, { name: "b" }]);
    await applyFlow(db, plan.id, me, { action: "complete", stopId: a.id });
    expect(await listPlans(db, groupId, me)).toMatchObject([{ id: plan.id, total: 2, finished: 1, currentName: "b" }]);
  });

  it("plans are personal: other members and outsiders get 404", async () => {
    const plan = await createPlan(db, groupId, me, "p");
    const [a] = await addStops(db, plan.id, me, [{ name: "a" }]);
    expect(await listPlans(db, groupId, friend)).toEqual([]);
    expect(await status(getPlan(db, plan.id, friend))).toBe(404);
    expect(await status(applyFlow(db, plan.id, friend, { action: "complete", stopId: a.id }))).toBe(404);
    expect(await status(updateStop(db, a.id, friend, { name: "x" }))).toBe(404);
    expect(await status(deletePlan(db, plan.id, friend))).toBe(404);
    const stranger = (await signIn(db, profile("stranger"))).user.id;
    expect(await status(createPlan(db, groupId, stranger, "x"))).toBe(404);
  });

  it("remembers the Tesla format per platform", async () => {
    expect(await getTeslaFormat(db, me, "android")).toBeNull();
    await setTeslaFormat(db, me, "android", "address");
    await setTeslaFormat(db, me, "android", "nameAddress");
    expect(await getTeslaFormat(db, me, "android")).toBe("nameAddress");
    expect(await getTeslaFormat(db, me, "ios")).toBeNull();
  });
});
