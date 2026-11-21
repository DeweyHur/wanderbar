/**
 * A finished workout as a Health Connect exercise session (Samsung Health picks it up from there), and the
 * heart rate a watch recorded during it. Pure: the phone module maps the segment kinds to Health Connect's
 * numbers and does the reading and writing.
 */
import type { DoneSet, Workout } from "./fitness";

/** Health Connect segment types used here (names match react-native-health-connect's ExerciseSegmentType). */
export type SegmentKind =
  | "ARM_CURL"
  | "BACK_EXTENSION"
  | "BENCH_PRESS"
  | "BENCH_SIT_UP"
  | "BURPEE"
  | "CRUNCH"
  | "DEADLIFT"
  | "DOUBLE_ARM_TRICEPS_EXTENSION"
  | "DUMBBELL_ROW"
  | "FRONT_RAISE"
  | "HIP_THRUST"
  | "KETTLEBELL_SWING"
  | "LATERAL_RAISE"
  | "LAT_PULL_DOWN"
  | "LEG_CURL"
  | "LEG_EXTENSION"
  | "LEG_PRESS"
  | "LEG_RAISE"
  | "LUNGE"
  | "PLANK"
  | "PULL_UP"
  | "SHOULDER_PRESS"
  | "SIT_UP"
  | "SQUAT"
  | "OTHER_WORKOUT";

// Most specific first ("leg curl" before "curl", "lat pull" before "pull up"). Spaces are removed before matching.
const RULES: [RegExp, SegmentKind][] = [
  [/legcurl|레그컬/, "LEG_CURL"],
  [/legextension|레그익스텐션/, "LEG_EXTENSION"],
  [/legpress|레그프레스/, "LEG_PRESS"],
  [/legraise|레그레이즈/, "LEG_RAISE"],
  [/backextension|백익스텐션/, "BACK_EXTENSION"],
  [/benchsitup|벤치싯업/, "BENCH_SIT_UP"],
  [/bench|벤치|chestpress|체스트프레스/, "BENCH_PRESS"],
  [/deadlift|데드/, "DEADLIFT"],
  [/squat|스쿼트/, "SQUAT"],
  [/plank|플랭크/, "PLANK"],
  [/latpull|pulldown|랫풀|풀다운/, "LAT_PULL_DOWN"],
  [/pullup|chinup|풀업|턱걸이|친업/, "PULL_UP"],
  [/row|로우/, "DUMBBELL_ROW"],
  [/lateralraise|sideraise|레터럴|레러|사레레|사이드레이즈/, "LATERAL_RAISE"],
  [/frontraise|프론트레이즈/, "FRONT_RAISE"],
  [/shoulderpress|overheadpress|ohp|militarypress|숄더프레스|오버헤드|밀리터리/, "SHOULDER_PRESS"],
  [/tricep|pushdown|skullcrusher|삼두|푸시다운|푸쉬다운|트라이셉/, "DOUBLE_ARM_TRICEPS_EXTENSION"],
  [/curl|컬/, "ARM_CURL"],
  [/hipthrust|힙쓰러스트|힙스러스트/, "HIP_THRUST"],
  [/lunge|런지/, "LUNGE"],
  [/crunch|크런치/, "CRUNCH"],
  [/situp|싯업|윗몸/, "SIT_UP"],
  [/kettlebell|케틀벨/, "KETTLEBELL_SWING"],
  [/burpee|버피/, "BURPEE"],
];

/** What Health Connect calls an exercise, from its name (anything unknown is "other workout"). */
export function segmentKind(name: string): SegmentKind {
  const n = name.toLowerCase().replace(/[\s\-_.·]/g, "");
  return RULES.find(([re]) => re.test(n))?.[1] ?? "OTHER_WORKOUT";
}

export type HealthSegment = { startTime: string; endTime: string; kind: SegmentKind; repetitions: number };
export type HealthSession = { id: string; startTime: string; endTime: string; title: string; notes: string; segments: HealthSegment[] };

/** A set's length when only its end is known: a few seconds a rep, or the hold time. */
const setSeconds = (s: DoneSet) => (s.seconds != null ? s.seconds : Math.min(120, Math.max(20, (s.reps ?? 0) * 3)));
const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
const setLabel = (s: DoneSet) => (s.seconds != null ? `${s.seconds}s` : s.weight ? `${num(s.weight)}${s.unit}×${s.reps ?? 0}` : `×${s.reps ?? 0}`);

/**
 * The session: one segment per set, ending when the set was finished. Segments never overlap and stay
 * inside the session (Health Connect refuses them otherwise). The workout id keeps re-sends from
 * duplicating it.
 */
export function healthSession(w: Pick<Workout, "id" | "dayName" | "startedAt" | "endedAt" | "sets">): HealthSession | null {
  if (!w.endedAt || !w.sets.length) return null;
  const start = new Date(w.startedAt).getTime();
  const end = new Date(w.endedAt).getTime();
  if (!(end > start)) return null;
  const segments: HealthSegment[] = [];
  let floor = start;
  for (const s of [...w.sets].sort((a, b) => a.at.localeCompare(b.at))) {
    const segEnd = Math.min(end, new Date(s.at).getTime());
    const segStart = Math.max(floor, segEnd - setSeconds(s) * 1000);
    if (segEnd <= segStart) continue;
    segments.push({ startTime: new Date(segStart).toISOString(), endTime: new Date(segEnd).toISOString(), kind: segmentKind(s.name), repetitions: s.reps ?? 0 });
    floor = segEnd;
  }
  // "Bench press: 60kg×10, 60kg×8" per exercise, in the order they were done.
  const byName = new Map<string, DoneSet[]>();
  for (const s of w.sets) byName.set(s.name, [...(byName.get(s.name) ?? []), s]);
  const notes = [...byName].map(([name, sets]) => `${name}: ${sets.map(setLabel).join(", ")}`).join("\n");
  return { id: w.id, startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString(), title: w.dayName, notes, segments };
}

/** Average and highest heart rate from a watch's samples (null when there are none). */
export function heartStats(samples: { beatsPerMinute: number }[]): { avg: number; max: number; count: number } | null {
  const bpm = samples.map((s) => s.beatsPerMinute).filter((b) => b > 0 && b <= 300);
  if (!bpm.length) return null;
  return { avg: Math.round(bpm.reduce((a, b) => a + b, 0) / bpm.length), max: Math.max(...bpm), count: bpm.length };
}
