import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { signIn } from "@/lib/auth";
import { addMade, createDish, deleteDish, deleteMade, getDish, listDishes, rateDish, unrateDish, updateDish } from "@/lib/dishes";
import { acceptInvite, createGroup, createInvite } from "@/lib/groups";
import { createPlan, isDay, listPlans, todayIn, updatePlan } from "@/lib/plans";
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
  groupId = (await createGroup(db, me, { name: "우리집", timezone: "America/Los_Angeles" })).id;
  await acceptInvite(db, (await createInvite(db, groupId, me)).token, friend);
});

describe("routes for any day", () => {
  it("defaults to today in the group's time zone; future days work; titles are optional", async () => {
    const today = await createPlan(db, groupId, me);
    expect(today).toMatchObject({ title: "", date: todayIn("America/Los_Angeles") });
    const later = await createPlan(db, groupId, me, "Napa trip", "2026-12-24");
    expect(later.date).toBe("2026-12-24");
    expect((await listPlans(db, groupId, me)).map((p) => [p.title, p.date])).toEqual([
      ["Napa trip", "2026-12-24"],
      ["", today.date],
    ]);
    expect((await updatePlan(db, later.id, me, { date: "2027-01-02", title: " " })).date).toBe("2027-01-02");
    expect((await updatePlan(db, later.id, me, { title: "Day 2" })).title).toBe("Day 2");
  });

  it("rejects days that don't exist", async () => {
    for (const d of ["2026-02-30", "2026-13-01", "11/08/2026", "tomorrow", ""]) {
      expect(isDay(d)).toBe(false);
      expect(await status(createPlan(db, groupId, me, "", d))).toBe(400);
    }
    expect(isDay("2028-02-29")).toBe(true);
  });

  it("knows today per time zone", () => {
    const t = new Date("2026-11-05T06:30:00Z");
    expect(todayIn("America/Los_Angeles", t)).toBe("2026-11-04");
    expect(todayIn("Asia/Seoul", t)).toBe("2026-11-05");
  });
});

describe("home cooking", () => {
  it("dishes: add, rate (one per member), log when made, list with averages", async () => {
    const d = await createDish(db, groupId, me, { name: " 김치찌개 ", category: "korean", memo: "돼지고기 + 묵은지" });
    expect(d).toMatchObject({ name: "김치찌개", category: "korean", memo: "돼지고기 + 묵은지", made: [], rating: { avg: null, count: 0 } });
    await rateDish(db, d.id, me, { stars: 4.5, review: "칼칼" });
    await rateDish(db, d.id, friend, { stars: 3.5 });
    let got = await rateDish(db, d.id, me, { stars: 5, review: "최고" });
    expect(got.rating).toEqual({ avg: 4.3, count: 2 });
    expect(got.mine).toEqual({ stars: 5, review: "최고" });
    await addMade(db, d.id, friend, new Date("2026-10-01T18:00:00Z"));
    got = await addMade(db, d.id, me);
    expect(got.made.map((m) => m.name)).toEqual(["me", "friend"]);
    const [row] = await listDishes(db, groupId, friend);
    expect(row).toMatchObject({ name: "김치찌개", madeCount: 2, rating: { avg: 4.3, count: 2 } });
    expect(row.lastMadeAt).not.toBeNull();
    got = await unrateDish(db, d.id, me);
    expect(got.rating).toEqual({ avg: 3.5, count: 1 });
  });

  it("edits; only your own made-it entries; creator or owner deletes; private to the group", async () => {
    const d = await createDish(db, groupId, friend, { name: "파스타" });
    expect((await updateDish(db, d.id, me, { name: "알리오 올리오", category: "italian" })).name).toBe("알리오 올리오");
    expect(await status(updateDish(db, d.id, me, { name: "" }))).toBe(400);
    expect(await status(updateDish(db, d.id, me, { category: "파스타" }))).toBe(400);
    const withMade = await addMade(db, d.id, friend);
    expect(await status(deleteMade(db, d.id, withMade.made[0].id, me))).toBe(403);
    expect((await deleteMade(db, d.id, withMade.made[0].id, friend)).made).toEqual([]);
    expect(await status(rateDish(db, d.id, me, { stars: 6 }))).toBe(400);
    expect(await status(getDish(db, d.id, outsider))).toBe(404);
    expect(await status(listDishes(db, groupId, outsider))).toBe(404);
    expect(await status(createDish(db, groupId, me, { name: " " }))).toBe(400);
    const mine = await createDish(db, groupId, me, { name: "라면" });
    expect(await status(deleteDish(db, mine.id, friend))).toBe(403);
    expect(await status(deleteDish(db, d.id, me))).toBe(200); // owner
    expect((await listDishes(db, groupId, me)).map((x) => x.name)).toEqual(["라면"]);
  });
});
