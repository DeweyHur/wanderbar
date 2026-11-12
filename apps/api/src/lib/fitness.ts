import { LIMITS, nextDay, type DoneSet, type RoutineDay } from "@wanderbar/route";
import { and, asc, desc, eq, gte, isNotNull, lt } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import { fitnessRoutines, groups, memberships, users, workouts } from "../db/schema";
import { badRequest, notFound } from "./errors";
import { requireMember } from "./groups";
import { displayName, notifyGroup } from "./push";
import { addDays, localDate, weekdayOf, zonedInstant } from "./recurrence";

/**
 * Fitness module: each member keeps a split routine (days → exercises → sets / reps or seconds /
 * weight / rest). Starting a workout is the check-in the group sees (who, which day, how long); the
 * weights and reps stay the member's own. The next day of the cycle follows the last one done, not the
 * calendar.
 */

const unit = z.enum(["kg", "lb"]);
const shortId = z.string().trim().min(1).max(64);
const count = (max: number) => z.number().int().min(1).max(max);

const Exercise = z.object({
  id: shortId,
  name: z.string().trim().min(1).max(LIMITS.name),
  sets: count(LIMITS.sets),
  target: z.enum(["reps", "time"]),
  reps: count(LIMITS.reps).nullable(),
  seconds: count(LIMITS.seconds).nullable(),
  weight: z.number().min(0).max(LIMITS.weight).nullable(),
  unit,
  restSec: z.number().int().min(0).max(LIMITS.restSec),
  note: z.string().max(LIMITS.note).default(""),
});
const Day = z.object({
  id: shortId,
  name: z.string().trim().min(1).max(LIMITS.name),
  exercises: z.array(Exercise).max(LIMITS.exercises),
});
export const RoutineBody = z.object({
  days: z.array(Day).min(1).max(LIMITS.days),
  weeklyGoal: z.number().int().min(1).max(LIMITS.weeklyGoal),
  unit,
});
export type RoutineInput = z.infer<typeof RoutineBody>;

const Set = z.object({
  exerciseId: shortId,
  name: z.string().max(LIMITS.name),
  set: count(LIMITS.sets),
  reps: z.number().min(0).max(LIMITS.reps).nullable(),
  seconds: z.number().min(0).max(LIMITS.seconds).nullable(),
  weight: z.number().min(0).max(LIMITS.weight).nullable(),
  unit,
  at: z.iso.datetime(),
});
export const WorkoutBody = z.object({
  groupId: shortId,
  dayId: shortId,
  dayName: z.string().trim().min(1).max(LIMITS.name),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  sets: z.array(Set).max(400),
});
export type WorkoutInput = z.infer<typeof WorkoutBody>;

/** A phone's clock may be a little ahead; a workout started offline may sync days later. */
const AHEAD_MS = 10 * 60_000;
const SYNC_WINDOW_MS = 7 * 24 * 3_600_000;
/** An unfinished workout older than this isn't offered to continue. */
const ACTIVE_MS = 12 * 3_600_000;
const FEED = 20;

const minutes = (a: Date, b: Date | null) => (b ? Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000)) : null);

function checkRoutine(r: RoutineInput) {
  const ids = new globalThis.Set<string>();
  for (const d of r.days) {
    if (ids.has(d.id)) throw badRequest("fitness.duplicate_id");
    ids.add(d.id);
    for (const e of d.exercises) {
      if (ids.has(e.id)) throw badRequest("fitness.duplicate_id");
      ids.add(e.id);
      if (e.target === "reps" && e.reps == null) throw badRequest("fitness.reps_required");
      if (e.target === "time" && e.seconds == null) throw badRequest("fitness.seconds_required");
    }
  }
}

/** Saves my routine in this group (one per member). */
export async function saveRoutine(db: Db, groupId: string, userId: string, input: RoutineInput, now = new Date()) {
  await requireMember(db, groupId, userId);
  checkRoutine(input);
  await db
    .insert(fitnessRoutines)
    .values({ groupId, userId, days: input.days, weeklyGoal: input.weeklyGoal, unit: input.unit, updatedAt: now })
    .onConflictDoUpdate({
      target: [fitnessRoutines.groupId, fitnessRoutines.userId],
      set: { days: input.days, weeklyGoal: input.weeklyGoal, unit: input.unit, updatedAt: now },
    });
  return fitnessHome(db, groupId, userId, now);
}

/** Monday of this week in the group's time zone, and the instants the week starts and ends. */
export function weekOf(now: Date, tz: string) {
  const today = localDate(now, tz);
  const start = addDays(today, -((weekdayOf(today) + 6) % 7));
  return { start, from: zonedInstant(start, "00:00", tz), to: zonedInstant(addDays(start, 7), "00:00", tz) };
}

export async function fitnessHome(db: Db, groupId: string, userId: string, now = new Date()) {
  await requireMember(db, groupId, userId);
  const [group] = await db.select({ timezone: groups.timezone }).from(groups).where(eq(groups.id, groupId));
  const tz = group.timezone;
  const week = weekOf(now, tz);
  const [routineRow] = await db.select().from(fitnessRoutines).where(and(eq(fitnessRoutines.groupId, groupId), eq(fitnessRoutines.userId, userId)));
  const days = (routineRow?.days ?? []) as RoutineDay[];

  const [mine, members, goals, thisWeek, feedRows] = await Promise.all([
    db
      .select()
      .from(workouts)
      .where(and(eq(workouts.groupId, groupId), eq(workouts.userId, userId)))
      .orderBy(desc(workouts.startedAt))
      .limit(30),
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.groupId, groupId))
      .orderBy(asc(memberships.joinedAt)),
    db.select({ userId: fitnessRoutines.userId, goal: fitnessRoutines.weeklyGoal }).from(fitnessRoutines).where(eq(fitnessRoutines.groupId, groupId)),
    db
      .select({ userId: workouts.userId, startedAt: workouts.startedAt })
      .from(workouts)
      .where(and(eq(workouts.groupId, groupId), gte(workouts.startedAt, week.from), lt(workouts.startedAt, week.to))),
    db
      .select({ w: workouts, name: users.name, email: users.email })
      .from(workouts)
      .innerJoin(users, eq(users.id, workouts.userId))
      .where(eq(workouts.groupId, groupId))
      .orderBy(desc(workouts.startedAt))
      .limit(FEED),
  ]);

  const lastDone = mine.find((w) => w.endedAt);
  const next = nextDay(days, lastDone?.dayId);
  const active = mine.find((w) => !w.endedAt && now.getTime() - w.startedAt.getTime() < ACTIVE_MS);
  const who = (r: { name: string | null; email: string }) => r.name || r.email.split("@")[0];
  const goalOf = new Map(goals.map((g) => [g.userId, g.goal]));
  return {
    timezone: tz,
    routine: routineRow ? { days, weeklyGoal: routineRow.weeklyGoal, unit: routineRow.unit as "kg" | "lb" } : null,
    next: next ? { dayId: next.id, dayName: next.name } : null,
    last: lastDone ? { dayName: lastDone.dayName, startedAt: lastDone.startedAt.toISOString() } : null,
    active: active
      ? { id: active.id, dayId: active.dayId, dayName: active.dayName, startedAt: active.startedAt.toISOString(), sets: active.sets as DoneSet[] }
      : null,
    lastSets: lastSetsOf(mine.filter((w) => w.id !== active?.id)),
    week: {
      start: week.start,
      members: members.map((m) => {
        const mineThisWeek = thisWeek.filter((w) => w.userId === m.id);
        return {
          userId: m.id,
          name: who(m),
          count: mineThisWeek.length,
          goal: goalOf.get(m.id) ?? null,
          /** 0 = Monday … 6 = Sunday. */
          days: [...new globalThis.Set(mineThisWeek.map((w) => (weekdayOf(localDate(w.startedAt, tz)) + 6) % 7))].sort(),
        };
      }),
    },
    feed: feedRows.map(({ w, ...u }) => ({
      id: w.id,
      userId: w.userId,
      name: who(u),
      mine: w.userId === userId,
      dayName: w.dayName,
      startedAt: w.startedAt.toISOString(),
      endedAt: w.endedAt?.toISOString() ?? null,
      minutes: minutes(w.startedAt, w.endedAt),
      sets: (w.sets as unknown[]).length,
    })),
  };
}

/** For each exercise, the sets from the most recent workout that had it. Workouts newest first. */
export function lastSetsOf(ws: { sets: unknown }[]) {
  const out: Record<string, DoneSet[]> = {};
  for (const w of ws) {
    const here: Record<string, DoneSet[]> = {};
    for (const s of w.sets as DoneSet[]) (here[s.exerciseId] ??= []).push(s);
    for (const [k, v] of Object.entries(here)) out[k] ??= v.sort((a, b) => a.set - b.set);
  }
  return out;
}

/**
 * Creates or updates my workout (the phone sends the whole thing after each set). Finishing it tells
 * the group.
 */
export async function saveWorkout(db: Db, id: string, userId: string, input: WorkoutInput, now = new Date()) {
  if (!/^[\w-]{8,64}$/.test(id)) throw badRequest("fitness.bad_id");
  await requireMember(db, input.groupId, userId);
  const startedAt = new Date(input.startedAt);
  const endedAt = input.endedAt ? new Date(input.endedAt) : null;
  if (startedAt.getTime() > now.getTime() + AHEAD_MS || startedAt.getTime() < now.getTime() - SYNC_WINDOW_MS) throw badRequest("fitness.bad_time");
  if (endedAt && (endedAt < startedAt || endedAt.getTime() > now.getTime() + AHEAD_MS)) throw badRequest("fitness.bad_time");
  const [before] = await db.select().from(workouts).where(eq(workouts.id, id));
  if (before && before.userId !== userId) throw notFound("fitness.workout_not_found");
  if (before && before.groupId !== input.groupId) throw badRequest("fitness.bad_group");
  // Sets only ever get added (or fixed), so a copy with fewer is an older one arriving late (a retry
  // from a phone that lost signal): keep what's here.
  if (before && (before.sets as unknown[]).length > input.sets.length && !before.endedAt) return { id, endedAt: null, stale: true };
  const values = { dayId: input.dayId, dayName: input.dayName, startedAt, endedAt, sets: input.sets, updatedAt: now };
  if (before) await db.update(workouts).set(values).where(eq(workouts.id, id));
  else await db.insert(workouts).values({ id, groupId: input.groupId, userId, ...values });
  if (endedAt && !before?.endedAt) {
    notifyGroup(db, input.groupId, userId, { type: "workout", who: await displayName(db, userId), day: input.dayName, minutes: minutes(startedAt, endedAt) ?? 0, groupId: input.groupId });
  }
  return { id, endedAt: endedAt?.toISOString() ?? null };
}

/** Started by mistake: drop it (and its check-in). */
export async function deleteWorkout(db: Db, id: string, userId: string) {
  const [w] = await db.select().from(workouts).where(eq(workouts.id, id));
  if (!w || w.userId !== userId) throw notFound("fitness.workout_not_found");
  await db.delete(workouts).where(eq(workouts.id, id));
  return { ok: true };
}

/** My finished workouts here, newest first, with their sets. */
export async function myWorkouts(db: Db, groupId: string, userId: string) {
  await requireMember(db, groupId, userId);
  const rows = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.groupId, groupId), eq(workouts.userId, userId), isNotNull(workouts.endedAt)))
    .orderBy(desc(workouts.startedAt))
    .limit(50);
  return rows.map((w) => ({ id: w.id, dayName: w.dayName, startedAt: w.startedAt.toISOString(), endedAt: w.endedAt?.toISOString() ?? null, minutes: minutes(w.startedAt, w.endedAt), sets: w.sets as DoneSet[] }));
}
