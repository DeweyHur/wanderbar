import { describe, expect, it } from "vitest";
import {
  adjustRest,
  allDone,
  restClock,
  completeSet,
  currentSet,
  editLastSet,
  finishWorkout,
  nextDay,
  openExercise,
  plannedWeight,
  setPlannedWeight,
  secondsLeft,
  skipRest,
  startTimed,
  startWorkout,
  tick,
  workoutSummary,
  type RoutineDay,
  type RoutineExercise,
} from "../src/fitness";

const ex = (p: Partial<RoutineExercise> & { id: string }): RoutineExercise => ({
  name: p.id,
  sets: 3,
  target: "reps",
  reps: 10,
  seconds: null,
  weight: 60,
  unit: "kg",
  restSec: 90,
  note: "",
  ...p,
});
const push: RoutineDay = { id: "a", name: "Chest · shoulders · triceps", exercises: [ex({ id: "bench", sets: 2 }), ex({ id: "dips", weight: null, sets: 1 })] };
const pull: RoutineDay = { id: "b", name: "Lats · back · biceps", exercises: [] };
const legs: RoutineDay = { id: "c", name: "Legs · abs", exercises: [ex({ id: "plank", target: "time", reps: null, seconds: 60, weight: null, sets: 2, restSec: 45 })] };
const T0 = new Date("2026-11-11T17:00:00Z");
const at = (sec: number) => new Date(T0.getTime() + sec * 1000);

describe("nextDay", () => {
  it("goes in order and wraps around, not by the calendar", () => {
    const days = [push, pull, legs];
    expect(nextDay(days, null)?.id).toBe("a");
    expect(nextDay(days, "a")?.id).toBe("b");
    expect(nextDay(days, "c")?.id).toBe("a");
    // The last day was deleted from the routine: start over.
    expect(nextDay(days, "gone")?.id).toBe("a");
    expect(nextDay([], "a")).toBeNull();
  });
});

describe("a workout", () => {
  it("set → rest → set, in any exercise order, then done", () => {
    let w = startWorkout({ id: "w1", groupId: "g", day: push, now: T0 });
    expect(w.startedAt).toBe(T0.toISOString());
    // The bench is taken: dips first.
    w = openExercise(w, "dips");
    expect(currentSet(w)).toMatchObject({ set: 1, total: 1 });
    w = completeSet(w, at(30));
    // Last (only) set: no rest, back to the list.
    expect(w.phase).toBeNull();
    expect(w.sets[0]).toMatchObject({ exerciseId: "dips", set: 1, reps: 10, weight: null });
    // A finished exercise can't be opened again.
    expect(openExercise(w, "dips").phase).toBeNull();

    w = openExercise(w, "bench");
    expect(currentSet(w)).toMatchObject({ set: 1, total: 2 });
    w = completeSet(w, at(100));
    expect(w.phase).toEqual({ exerciseId: "bench", kind: "rest", endsAt: at(190).toISOString() });
    // While resting, the screen already says the next set.
    expect(currentSet(w)).toMatchObject({ set: 2, total: 2 });
    expect(secondsLeft(w, at(130))).toBe(60);
    // Pressing the big button during the rest does nothing.
    expect(completeSet(w, at(120))).toBe(w);
    expect(tick(w, at(189)).phase?.kind).toBe("rest");
    w = tick(w, at(190));
    expect(w.phase).toEqual({ exerciseId: "bench", kind: "work" });
    w = completeSet(w, at(250));
    expect(w.phase).toBeNull();
    expect(allDone(w)).toBe(true);

    w = finishWorkout(w, at(300));
    expect(w.endedAt).toBe(at(300).toISOString());
    expect(workoutSummary(w)).toEqual({ minutes: 5, sets: 3, volume: { kg: 1200 } });
  });

  it("rest can be lengthened, shortened (not past now) and skipped", () => {
    let w = completeSet(openExercise(startWorkout({ id: "w", groupId: "g", day: push, now: T0 }), "bench"), T0);
    w = adjustRest(w, 30, at(10));
    expect(secondsLeft(w, at(10))).toBe(110);
    w = adjustRest(w, -15, at(10));
    expect(secondsLeft(w, at(10))).toBe(95);
    // Shortened past now: the rest is over.
    expect(adjustRest(w, -600, at(10)).phase).toEqual({ exerciseId: "bench", kind: "work" });
    expect(skipRest(w).phase).toEqual({ exerciseId: "bench", kind: "work" });
  });

  it("the set just done can be fixed during the rest", () => {
    let w = completeSet(openExercise(startWorkout({ id: "w", groupId: "g", day: push, now: T0 }), "bench"), T0);
    w = editLastSet(w, "bench", { reps: 8, weight: 57.5 });
    expect(w.sets[0]).toMatchObject({ reps: 8, weight: 57.5 });
    expect(workoutSummary(w, at(60)).volume).toEqual({ kg: 460 });
  });

  it("a timed set (plank) counts down and finishes by itself, even if the app was closed", () => {
    let w = openExercise(startWorkout({ id: "w", groupId: "g", day: legs, now: T0 }), "plank");
    expect(currentSet(w)).toMatchObject({ set: 1, total: 2 });
    w = startTimed(w, at(0));
    expect(secondsLeft(w, at(20))).toBe(40);
    // Reopened 5 minutes later: the set finished at 60 s and its 45 s rest is over too.
    w = tick(tick(w, at(300)), at(300));
    expect(w.sets[0]).toMatchObject({ seconds: 60, reps: null, at: at(60).toISOString() });
    expect(w.phase).toEqual({ exerciseId: "plank", kind: "work" });
  });

  it("no rest set: straight to the next set", () => {
    const day: RoutineDay = { id: "d", name: "d", exercises: [ex({ id: "x", restSec: 0 })] };
    const w = completeSet(openExercise(startWorkout({ id: "w", groupId: "g", day, now: T0 }), "x"), T0);
    expect(w.phase).toEqual({ exerciseId: "x", kind: "work" });
  });
});

it("restClock", () => {
  expect(restClock(65)).toBe("1:05");
  expect(restClock(0)).toBe("0:00");
});

describe("weights and rests between exercises", () => {
  it("the next exercise starts with its rest, counted from the last set (any exercise)", () => {
    let w = openExercise(startWorkout({ id: "w", groupId: "g", day: push, now: T0 }), "dips");
    expect(w.phase?.kind).toBe("work"); // nothing done yet
    w = completeSet(w, at(10)); // dips: its only set → back to the list
    expect(w.phase).toBeNull();
    const bench = openExercise(w, "bench", at(30));
    expect(bench.phase).toEqual({ exerciseId: "bench", kind: "rest", endsAt: at(10 + 90).toISOString() });
    expect(currentSet(bench)).toMatchObject({ set: 1, total: 2 });
    // Already rested long enough: straight to work. No clock given: work.
    expect(openExercise(w, "bench", at(200)).phase?.kind).toBe("work");
    expect(openExercise(w, "bench").phase?.kind).toBe("work");
  });

  it("the weight can change for the next set, and a fixed weight carries on", () => {
    let w = openExercise(startWorkout({ id: "w", groupId: "g", day: push, now: T0 }), "dips");
    const dips = w.exercises[1];
    expect(plannedWeight(w, dips)).toBeNull(); // bodyweight
    w = setPlannedWeight(w, "dips", 10);
    w = completeSet(w, T0);
    expect(w.sets[0]).toMatchObject({ exerciseId: "dips", weight: 10, unit: "kg" });
    // Bench: set 1 at the routine's 60, then "it was 65" → set 2 is 65 too.
    w = openExercise(w, "bench");
    w = completeSet(skipRest(w), at(100));
    expect(w.sets[1].weight).toBe(60);
    w = editLastSet(w, "bench", { weight: 65 });
    w = completeSet(skipRest(w), at(200));
    expect(w.sets.map((s) => s.weight)).toEqual([10, 65, 65]);
    expect(setPlannedWeight(w, "bench", 0).plan?.bench.weight).toBeNull();
  });
});
