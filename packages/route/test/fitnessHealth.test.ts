import { describe, expect, it } from "vitest";
import type { DoneSet } from "../src/fitness";
import { healthSession, heartStats, segmentKind } from "../src/fitnessHealth";

const T0 = Date.parse("2026-11-20T18:00:00Z");
const at = (sec: number) => new Date(T0 + sec * 1000).toISOString();
const set = (name: string, n: number, sec: number, p: Partial<DoneSet> = {}): DoneSet => ({ exerciseId: name, name, set: n, reps: 10, seconds: null, weight: 60, unit: "kg", at: at(sec), ...p });

describe("segmentKind", () => {
  it("knows common lifts in English and Korean", () => {
    expect(segmentKind("Bench press")).toBe("BENCH_PRESS");
    expect(segmentKind("인클라인 벤치")).toBe("BENCH_PRESS");
    expect(segmentKind("스쿼트")).toBe("SQUAT");
    expect(segmentKind("Lat pulldown")).toBe("LAT_PULL_DOWN");
    expect(segmentKind("랫풀다운")).toBe("LAT_PULL_DOWN");
    expect(segmentKind("Pull-up")).toBe("PULL_UP");
    expect(segmentKind("턱걸이")).toBe("PULL_UP");
    expect(segmentKind("Leg curl")).toBe("LEG_CURL");
    expect(segmentKind("바벨 컬")).toBe("ARM_CURL");
    expect(segmentKind("케이블 푸시다운")).toBe("DOUBLE_ARM_TRICEPS_EXTENSION");
    expect(segmentKind("사이드 레터럴 레이즈")).toBe("LATERAL_RAISE");
    expect(segmentKind("OHP")).toBe("SHOULDER_PRESS");
    expect(segmentKind("시티드 로우")).toBe("DUMBBELL_ROW");
    expect(segmentKind("플랭크")).toBe("PLANK");
    expect(segmentKind("Battle ropes")).toBe("OTHER_WORKOUT");
  });
});

describe("healthSession", () => {
  it("one segment per set, ending when it was finished, never overlapping, inside the session", () => {
    const s = healthSession({
      id: "w-1",
      dayName: "Chest · shoulders · triceps",
      startedAt: at(0),
      endedAt: at(600),
      sets: [set("Bench press", 1, 10), set("Bench press", 2, 100, { reps: 8, weight: 57.5 }), set("Plank", 1, 200, { reps: null, seconds: 60, weight: null })],
    })!;
    expect(s).toMatchObject({ id: "w-1", title: "Chest · shoulders · triceps", startTime: at(0), endTime: at(600) });
    expect(s.segments).toEqual([
      // 10 reps ≈ 30 s, but the session only started 10 s before.
      { startTime: at(0), endTime: at(10), kind: "BENCH_PRESS", repetitions: 10 },
      { startTime: at(76), endTime: at(100), kind: "BENCH_PRESS", repetitions: 8 },
      { startTime: at(140), endTime: at(200), kind: "PLANK", repetitions: 0 },
    ]);
    expect(s.notes).toBe("Bench press: 60kg×10, 57.5kg×8\nPlank: 60s");
  });

  it("nothing to send for an unfinished or empty workout", () => {
    expect(healthSession({ id: "w", dayName: "d", startedAt: at(0), endedAt: null, sets: [set("x", 1, 5)] })).toBeNull();
    expect(healthSession({ id: "w", dayName: "d", startedAt: at(0), endedAt: at(60), sets: [] })).toBeNull();
  });

  it("a set logged after the end (clock drift) is clamped inside", () => {
    const s = healthSession({ id: "w", dayName: "d", startedAt: at(0), endedAt: at(100), sets: [set("Squat", 1, 150, { weight: null, reps: 12 })] })!;
    expect(s.segments).toEqual([{ startTime: at(64), endTime: at(100), kind: "SQUAT", repetitions: 12 }]);
    expect(s.notes).toBe("Squat: ×12");
  });
});

it("heartStats", () => {
  expect(heartStats([{ beatsPerMinute: 100 }, { beatsPerMinute: 151 }, { beatsPerMinute: 120 }, { beatsPerMinute: 0 }])).toEqual({ avg: 124, max: 151, count: 3 });
  expect(heartStats([])).toBeNull();
});
