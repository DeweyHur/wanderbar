import type { DoneSet, RoutineDay, WeightUnit, Workout } from "@wanderbar/route";
import { api } from "@/core/api";

export type Routine = { days: RoutineDay[]; weeklyGoal: number; unit: WeightUnit };
export type FitnessHome = {
  timezone: string;
  routine: Routine | null;
  next: { dayId: string; dayName: string } | null;
  last: { dayName: string; startedAt: string } | null;
  /** My unfinished workout on the server (e.g. started on another device). */
  active: { id: string; dayId: string; dayName: string; startedAt: string; sets: DoneSet[] } | null;
  /** What I did last time on each exercise. */
  lastSets: Record<string, DoneSet[]>;
  week: { start: string; members: { userId: string; name: string; count: number; goal: number | null; days: number[] }[] };
  feed: { id: string; userId: string; name: string; mine: boolean; dayName: string; startedAt: string; endedAt: string | null; minutes: number | null; sets: number }[];
};

export const fitApi = {
  home: (groupId: string) => api<FitnessHome>(`/api/groups/${groupId}/fitness`),
  saveRoutine: (groupId: string, r: Routine) => api<FitnessHome>(`/api/groups/${groupId}/fitness/routine`, { method: "PUT", body: r }),
  /** The whole workout, after every change (the server keeps the latest). */
  saveWorkout: (w: Workout) =>
    api<{ id: string }>(`/api/workouts/${w.id}`, {
      method: "PUT",
      body: { groupId: w.groupId, dayId: w.dayId, dayName: w.dayName, startedAt: w.startedAt, endedAt: w.endedAt, sets: w.sets },
    }),
  deleteWorkout: (id: string) => api(`/api/workouts/${id}`, { method: "DELETE" }),
};

/** An id the phone makes, so a workout started without signal is the same row once it syncs. */
export const newWorkoutId = () => `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
