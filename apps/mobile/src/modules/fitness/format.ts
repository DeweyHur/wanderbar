import type { DoneSet, RoutineExercise } from "@wanderbar/route";
import type { TFunction } from "i18next";

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));

/** "10 reps · 60 kg" / "60 s" / "12 reps · bodyweight" */
export function targetText(t: TFunction, e: Pick<RoutineExercise, "target" | "reps" | "seconds" | "weight" | "unit">) {
  const amount = e.target === "time" ? t("fitness:workout.time", { n: e.seconds ?? 0 }) : t("fitness:workout.reps", { n: e.reps ?? 0 });
  return e.weight ? `${amount} · ${num(e.weight)} ${e.unit}` : e.target === "reps" ? `${amount} · ${t("fitness:workout.bodyweight")}` : amount;
}

/** One set done: "60kg×10", "10", "60 s". */
export const setText = (s: DoneSet) => (s.seconds != null ? `${s.seconds}s` : s.weight ? `${num(s.weight)}${s.unit}×${s.reps ?? 0}` : String(s.reps ?? 0));

/** "60kg×10, 60kg×10, 57.5kg×8" */
export const setsText = (sets: DoneSet[] | undefined) => (sets?.length ? sets.map(setText).join(", ") : "");

/** "Mon, Nov 9, 7:10 PM" in the device's locale. */
export function whenText(iso: string, lang: string) {
  return new Intl.DateTimeFormat(lang.startsWith("ko") ? "ko-KR" : "en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** Mon..Sun short names in the device's language. */
export function weekdayNames(lang: string) {
  const f = new Intl.DateTimeFormat(lang.startsWith("ko") ? "ko-KR" : "en-US", { weekday: "narrow", timeZone: "UTC" });
  // 2026-11-09 is a Monday.
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2026, 10, 9 + i))));
}

export const volumeText = (v: Partial<Record<"kg" | "lb", number>>) =>
  Object.entries(v)
    .map(([u, n]) => `${Math.round(n ?? 0).toLocaleString()} ${u}`)
    .join(" · ") || "—";
