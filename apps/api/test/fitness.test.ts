import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { signIn } from "@/lib/auth";
import { deleteWorkout, fitnessHome, myWorkouts, RoutineBody, saveRoutine, saveWorkout, weekOf, WorkoutBody, type RoutineInput } from "@/lib/fitness";
import { acceptInvite, createGroup, createInvite } from "@/lib/groups";
import { pushText } from "@/lib/push";
import { profile, testDb } from "./db";

let db: Db;
let me: string;
let amy: string;
let outsider: string;
let groupId: string;
const LA = "America/Los_Angeles";
// Wednesday Nov 11 2026, 9 am in Los Angeles.
const NOW = new Date("2026-11-11T17:00:00Z");
const min = (m: number) => new Date(NOW.getTime() + m * 60_000);
const status = (p: Promise<unknown>) => p.then(() => 200, (e) => e.status as number);

const ex = (id: string, name: string, p: Partial<RoutineInput["days"][number]["exercises"][number]> = {}) => ({
  id,
  name,
  sets: 3,
  target: "reps" as const,
  reps: 10,
  seconds: null,
  weight: 60,
  unit: "kg" as const,
  restSec: 90,
  note: "",
  ...p,
});
const split: RoutineInput = {
  weeklyGoal: 3,
  unit: "kg",
  days: [
    { id: "d-push", name: "Chest · shoulders · triceps", exercises: [ex("e-bench", "Bench press", { sets: 2 })] },
    { id: "d-pull", name: "Lats · back · biceps", exercises: [ex("e-row", "Row")] },
    { id: "d-legs", name: "Legs · abs", exercises: [ex("e-plank", "Plank", { target: "time", reps: null, seconds: 60, weight: null })] },
  ],
};
const set = (exerciseId: string, n: number, at: Date, p: { reps?: number; weight?: number | null } = {}) => ({
  exerciseId,
  name: exerciseId,
  set: n,
  reps: p.reps ?? 10,
  seconds: null,
  weight: p.weight === undefined ? 60 : p.weight,
  unit: "kg" as const,
  at: at.toISOString(),
});
const workout = (p: Partial<{ dayId: string; dayName: string; startedAt: Date; endedAt: Date | null; sets: ReturnType<typeof set>[] }> = {}) =>
  WorkoutBody.parse({
    groupId,
    dayId: p.dayId ?? "d-push",
    dayName: p.dayName ?? "Chest · shoulders · triceps",
    startedAt: (p.startedAt ?? min(-60)).toISOString(),
    endedAt: p.endedAt === undefined ? null : p.endedAt?.toISOString() ?? null,
    sets: p.sets ?? [],
  });

beforeEach(async () => {
  db = await testDb();
  me = (await signIn(db, profile("me"))).user.id;
  amy = (await signIn(db, profile("amy"))).user.id;
  outsider = (await signIn(db, profile("eve"))).user.id;
  groupId = (await createGroup(db, me, { name: "Gym crew", module: "fitness", timezone: LA })).id;
  await acceptInvite(db, (await createInvite(db, groupId, me)).token, amy);
});

describe("routine", () => {
  it("saves a 3-day split; the cycle starts at day 1", async () => {
    const home = await saveRoutine(db, groupId, me, RoutineBody.parse(split), NOW);
    expect(home.routine?.days.map((d) => d.name)).toEqual(["Chest · shoulders · triceps", "Lats · back · biceps", "Legs · abs"]);
    expect(home.next).toEqual({ dayId: "d-push", dayName: "Chest · shoulders · triceps" });
    // Each member has their own routine.
    expect((await fitnessHome(db, groupId, amy, NOW)).routine).toBeNull();
  });

  it("rejects bad routines and outsiders", async () => {
    expect(RoutineBody.safeParse({ ...split, days: [] }).success).toBe(false);
    expect(RoutineBody.safeParse({ ...split, days: [{ ...split.days[0], exercises: [ex("x", "X", { sets: 0 })] }] }).success).toBe(false);
    expect(await status(saveRoutine(db, groupId, me, { ...split, days: [{ ...split.days[0], exercises: [ex("x", "X", { reps: null })] }] }))).toBe(400);
    expect(await status(saveRoutine(db, groupId, me, { ...split, days: [split.days[0], { ...split.days[1], id: "d-push" }] }))).toBe(400);
    expect(await status(saveRoutine(db, groupId, outsider, split))).toBe(404);
    expect(await status(fitnessHome(db, groupId, outsider))).toBe(404);
  });
});

describe("workouts", () => {
  beforeEach(async () => {
    await saveRoutine(db, groupId, me, split, NOW);
  });

  it("start = check-in; finishing moves the cycle to the next day and remembers last time", async () => {
    await saveWorkout(db, "w-000001", me, workout({ startedAt: min(-50) }), NOW);
    let home = await fitnessHome(db, groupId, me, NOW);
    // In progress: offered to continue, and it already counts for the week.
    expect(home.active).toMatchObject({ id: "w-000001", dayId: "d-push" });
    expect(home.week.members.find((m) => m.userId === me)).toMatchObject({ count: 1, goal: 3, days: [2] });
    expect(home.next?.dayId).toBe("d-push");

    // The phone sends the whole workout after each set; then it's done.
    await saveWorkout(db, "w-000001", me, workout({ startedAt: min(-50), sets: [set("e-bench", 1, min(-40), { reps: 10 }), set("e-bench", 2, min(-35), { reps: 8 })] }), NOW);
    await saveWorkout(db, "w-000001", me, workout({ startedAt: min(-50), endedAt: min(-2), sets: [set("e-bench", 1, min(-40)), set("e-bench", 2, min(-35), { reps: 8 })] }), NOW);
    home = await fitnessHome(db, groupId, me, NOW);
    expect(home.active).toBeNull();
    expect(home.next).toEqual({ dayId: "d-pull", dayName: "Lats · back · biceps" });
    expect(home.last?.dayName).toBe("Chest · shoulders · triceps");
    expect(home.lastSets["e-bench"].map((s) => [s.set, s.reps])).toEqual([
      [1, 10],
      [2, 8],
    ]);
    expect(home.feed[0]).toMatchObject({ name: "me", dayName: "Chest · shoulders · triceps", minutes: 48, sets: 2, mine: true });
    expect((await myWorkouts(db, groupId, me))[0].sets).toHaveLength(2);
  });

  it("the group sees who came and for how long, never the weights", async () => {
    await saveWorkout(db, "w-000002", me, workout({ endedAt: min(-5), sets: [set("e-bench", 1, min(-30), { weight: 100 })] }), NOW);
    const amys = await fitnessHome(db, groupId, amy, NOW);
    expect(amys.feed).toHaveLength(1);
    expect(amys.feed[0]).toMatchObject({ name: "me", mine: false, sets: 1 });
    expect(JSON.stringify(amys.feed)).not.toContain("100");
    expect(amys.week.members.map((m) => [m.name, m.count])).toEqual([
      ["me", 1],
      ["amy", 0],
    ]);
    // Someone else's workout can't be read through the "mine" list, overwritten or deleted.
    expect(await myWorkouts(db, groupId, amy)).toEqual([]);
    expect(await status(saveWorkout(db, "w-000002", amy, workout(), NOW))).toBe(404);
    expect(await status(deleteWorkout(db, "w-000002", amy))).toBe(404);
  });

  it("an offline start syncs later; times far off are refused", async () => {
    // Started yesterday without signal, synced now.
    await saveWorkout(db, "w-offline", me, workout({ startedAt: min(-24 * 60), endedAt: min(-23 * 60) }), NOW);
    expect((await fitnessHome(db, groupId, me, NOW)).feed[0].minutes).toBe(60);
    expect(await status(saveWorkout(db, "w-future", me, workout({ startedAt: min(30) }), NOW))).toBe(400);
    expect(await status(saveWorkout(db, "w-oldold", me, workout({ startedAt: min(-8 * 24 * 60) }), NOW))).toBe(400);
    expect(await status(saveWorkout(db, "w-backwd", me, workout({ startedAt: min(-10), endedAt: min(-20) }), NOW))).toBe(400);
    expect(await status(saveWorkout(db, "bad id!", me, workout(), NOW))).toBe(400);
  });

  it("a workout started by mistake can be dropped (and its check-in with it)", async () => {
    await saveWorkout(db, "w-oops001", me, workout(), NOW);
    await deleteWorkout(db, "w-oops001", me);
    const home = await fitnessHome(db, groupId, me, NOW);
    expect(home.active).toBeNull();
    expect(home.week.members[0].count).toBe(0);
  });

  it("the week starts on Monday in the group's time zone", async () => {
    // Sunday 11 pm in LA is still last week; Monday 0:30 am LA is this week.
    await saveWorkout(db, "w-sunday1", me, workout({ startedAt: new Date("2026-11-09T07:00:00Z"), endedAt: new Date("2026-11-09T07:30:00Z") }), NOW);
    await saveWorkout(db, "w-monday1", me, workout({ startedAt: new Date("2026-11-09T08:30:00Z"), endedAt: new Date("2026-11-09T09:30:00Z") }), NOW);
    expect(weekOf(NOW, LA).start).toBe("2026-11-09");
    const home = await fitnessHome(db, groupId, me, NOW);
    expect(home.week.members[0]).toMatchObject({ count: 1, days: [0] });
  });
});

it("push text when someone finishes", () => {
  expect(pushText("en", { type: "workout", who: "Amy", day: "Legs · abs", minutes: 52, groupId: "g" })).toBe("💪 Amy finished Legs · abs (52 min)");
  expect(pushText("ko", { type: "workout", who: "지수", day: "다리·배", minutes: 52, groupId: "g" })).toBe("💪 지수님이 다리·배 운동을 마쳤어요 (52분)");
});
