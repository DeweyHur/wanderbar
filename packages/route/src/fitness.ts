/**
 * Fitness module: a split routine (days → exercises → sets) and one workout's flow
 * (pick any exercise → set → rest → set … → done), shared by the app and the API.
 *
 * Timers are stored as instants (restEndsAt / timedEndsAt), never as "seconds left", so a workout
 * picks up where it was after the app is closed or the phone restarts.
 */

export type TargetKind = "reps" | "time";
export type WeightUnit = "kg" | "lb";

export type RoutineExercise = {
  id: string;
  name: string;
  sets: number;
  /** "reps": do `reps` times. "time": hold for `seconds` (plank). */
  target: TargetKind;
  reps: number | null;
  seconds: number | null;
  /** null = bodyweight. */
  weight: number | null;
  unit: WeightUnit;
  /** Rest after each set (not after the last one). */
  restSec: number;
  note: string;
};
export type RoutineDay = { id: string; name: string; exercises: RoutineExercise[] };
export type Routine = { days: RoutineDay[]; weeklyGoal: number; unit: WeightUnit };

/** One finished set: what was actually done. */
export type DoneSet = {
  exerciseId: string;
  name: string;
  /** 1-based. */
  set: number;
  reps: number | null;
  seconds: number | null;
  weight: number | null;
  unit: WeightUnit;
  at: string;
};

export type Phase =
  /** Doing the set; the big button finishes it. */
  | { exerciseId: string; kind: "work" }
  /** A timed set running until `endsAt`, then it finishes by itself. */
  | { exerciseId: string; kind: "timed"; endsAt: string }
  /** Resting until `endsAt` (then a notification, and back to work). */
  | { exerciseId: string; kind: "rest"; endsAt: string };

export type Workout = {
  id: string;
  groupId: string;
  dayId: string;
  dayName: string;
  /** Check-in: the moment "Start workout" was pressed. */
  startedAt: string;
  endedAt: string | null;
  /** The day's exercises as they were when the workout started (editing the routine later doesn't change it). */
  exercises: RoutineExercise[];
  sets: DoneSet[];
  /** Which exercise is open, and whether it's a set or a rest. null = the exercise list. */
  phase: Phase | null;
  /** The weight for each exercise's next set when it differs from the routine (changed today). */
  plan?: Record<string, { weight: number | null }>;
};

export const LIMITS = { days: 7, exercises: 20, sets: 20, reps: 200, seconds: 3600, weight: 2000, restSec: 900, name: 60, note: 300, weeklyGoal: 7 } as const;

/** The day after the last one done, wrapping around; the first day when nothing's been done (or it was deleted). */
export function nextDay(days: RoutineDay[], lastDayId: string | null | undefined): RoutineDay | null {
  if (!days.length) return null;
  const i = days.findIndex((d) => d.id === lastDayId);
  return days[i < 0 ? 0 : (i + 1) % days.length];
}

const iso = (ms: number) => new Date(ms).toISOString();
const ms = (s: string) => new Date(s).getTime();

export function startWorkout(input: { id: string; groupId: string; day: RoutineDay; now: Date }): Workout {
  return {
    id: input.id,
    groupId: input.groupId,
    dayId: input.day.id,
    dayName: input.day.name,
    startedAt: input.now.toISOString(),
    endedAt: null,
    exercises: input.day.exercises.map((e) => ({ ...e })),
    sets: [],
    phase: null,
  };
}

export const exerciseOf = (w: Workout, id: string) => w.exercises.find((e) => e.id === id);
export const setsDone = (w: Workout, exerciseId: string) => w.sets.filter((s) => s.exerciseId === exerciseId).length;
export const exerciseDone = (w: Workout, e: RoutineExercise) => setsDone(w, e.id) >= e.sets;
export const allDone = (w: Workout) => w.exercises.length > 0 && w.exercises.every((e) => exerciseDone(w, e));

/** The set number on screen: "Set 2 of 4" while doing set 2, and while resting before it. */
export function currentSet(w: Workout): { exercise: RoutineExercise; set: number; total: number } | null {
  if (!w.phase) return null;
  const exercise = exerciseOf(w, w.phase.exerciseId);
  if (!exercise) return null;
  return { exercise, set: Math.min(setsDone(w, exercise.id) + 1, exercise.sets), total: exercise.sets };
}

/**
 * Tap an exercise in the list (any order; the machine may be taken). When a set was just done (on any
 * exercise), the exercise's rest runs first, counted from that set.
 */
export function openExercise(w: Workout, exerciseId: string, now?: Date): Workout {
  const e = exerciseOf(w, exerciseId);
  if (!e || exerciseDone(w, e) || w.endedAt) return w;
  const last = w.sets.at(-1);
  const restEnds = last && now && e.restSec > 0 ? ms(last.at) + e.restSec * 1000 : 0;
  if (now && restEnds > now.getTime()) return { ...w, phase: { exerciseId, kind: "rest", endsAt: iso(restEnds) } };
  return { ...w, phase: { exerciseId, kind: "work" } };
}

/** The weight the next set of this exercise will be done with: changed today, else the routine's. */
export function plannedWeight(w: Workout, e: RoutineExercise): number | null {
  return w.plan && e.id in w.plan ? w.plan[e.id].weight : e.weight;
}

/** Changes the weight for this exercise's next sets (null = bodyweight). */
export function setPlannedWeight(w: Workout, exerciseId: string, weight: number | null): Workout {
  const clean = weight == null || weight <= 0 ? null : Math.min(LIMITS.weight, Math.round(weight * 100) / 100);
  return { ...w, plan: { ...w.plan, [exerciseId]: { weight: clean } } };
}

/** Back to the list (a rest in progress is dropped). */
export const closeExercise = (w: Workout): Workout => ({ ...w, phase: null });

/** A timed set (plank): starts the countdown. */
export function startTimed(w: Workout, now: Date): Workout {
  const e = w.phase && exerciseOf(w, w.phase.exerciseId);
  if (!e || w.phase?.kind !== "work" || e.target !== "time") return w;
  return { ...w, phase: { exerciseId: e.id, kind: "timed", endsAt: iso(now.getTime() + (e.seconds ?? 0) * 1000) } };
}

/**
 * Finishes the current set with the target values (they can be fixed during the rest), then rests;
 * after the last set it's back to the list.
 */
export function completeSet(w: Workout, now: Date): Workout {
  const e = w.phase && exerciseOf(w, w.phase.exerciseId);
  if (!e || !w.phase || w.phase.kind === "rest" || exerciseDone(w, e)) return w;
  const set: DoneSet = {
    exerciseId: e.id,
    name: e.name,
    set: setsDone(w, e.id) + 1,
    reps: e.target === "reps" ? e.reps : null,
    seconds: e.target === "time" ? e.seconds : null,
    weight: plannedWeight(w, e),
    unit: e.unit,
    at: now.toISOString(),
  };
  const next = { ...w, sets: [...w.sets, set] };
  if (set.set >= e.sets) return { ...next, phase: null };
  if (e.restSec <= 0) return { ...next, phase: { exerciseId: e.id, kind: "work" } };
  return { ...next, phase: { exerciseId: e.id, kind: "rest", endsAt: iso(now.getTime() + e.restSec * 1000) } };
}

/** Moves time forward: a timed set that ran out finishes, a rest that ran out goes back to work. */
export function tick(w: Workout, now: Date): Workout {
  const p = w.phase;
  if (p?.kind === "timed" && now.getTime() >= ms(p.endsAt)) return completeSet(w, new Date(p.endsAt));
  if (p?.kind === "rest" && now.getTime() >= ms(p.endsAt)) return { ...w, phase: { exerciseId: p.exerciseId, kind: "work" } };
  return w;
}

/** +30 s / −15 s on the rest (never before now). */
export function adjustRest(w: Workout, deltaSec: number, now: Date): Workout {
  const p = w.phase;
  if (p?.kind !== "rest") return w;
  const endsAt = Math.max(now.getTime(), ms(p.endsAt) + deltaSec * 1000);
  return tick({ ...w, phase: { ...p, endsAt: iso(endsAt) } }, now);
}

export function skipRest(w: Workout): Workout {
  const p = w.phase;
  return p?.kind === "rest" ? { ...w, phase: { exerciseId: p.exerciseId, kind: "work" } } : w;
}

/** Fixes the set just done (did 8, not 10). */
export function editLastSet(w: Workout, exerciseId: string, patch: Partial<Pick<DoneSet, "reps" | "seconds" | "weight">>): Workout {
  const i = w.sets.map((s) => s.exerciseId).lastIndexOf(exerciseId);
  if (i < 0) return w;
  const clean = (n: number | null | undefined, max: number) => (n == null ? null : Math.max(0, Math.min(max, Math.round(n * 100) / 100)));
  const s = w.sets[i];
  const fixed: DoneSet = {
    ...s,
    reps: "reps" in patch ? clean(patch.reps, LIMITS.reps) : s.reps,
    seconds: "seconds" in patch ? clean(patch.seconds, LIMITS.seconds) : s.seconds,
    weight: "weight" in patch ? clean(patch.weight, LIMITS.weight) : s.weight,
  };
  const next = { ...w, sets: w.sets.map((x, j) => (j === i ? fixed : x)) };
  // A different weight on the set just done carries on to the next ones.
  return "weight" in patch ? setPlannedWeight(next, exerciseId, fixed.weight) : next;
}

/** Done for today (all of it, or "finish now" with some left). */
export const finishWorkout = (w: Workout, now: Date): Workout => (w.endedAt ? w : { ...w, phase: null, endedAt: now.toISOString() });

/** Minutes, sets, and volume (weight × reps) per unit. */
export function workoutSummary(w: { startedAt: string; endedAt: string | null; sets: DoneSet[] }, now = new Date()) {
  const end = w.endedAt ? ms(w.endedAt) : now.getTime();
  const volume: Partial<Record<WeightUnit, number>> = {};
  for (const s of w.sets) if (s.weight && s.reps) volume[s.unit] = (volume[s.unit] ?? 0) + s.weight * s.reps;
  return { minutes: Math.max(0, Math.round((end - ms(w.startedAt)) / 60_000)), sets: w.sets.length, volume };
}

/** Seconds left on a rest or a timed set (rounded up, so it shows 1 until it's really over). */
export function secondsLeft(w: Workout, now: Date) {
  const p = w.phase;
  if (!p || p.kind === "work") return 0;
  return Math.max(0, Math.ceil((ms(p.endsAt) - now.getTime()) / 1000));
}

/** "1:05" */
export const restClock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
