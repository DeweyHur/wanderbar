import type { Workout } from "@wanderbar/route";

/** Web: the workout in progress in localStorage (missing or throwing in private mode = nothing saved). */
export type Stored = { workout: Workout; synced: boolean };
const key = (groupId: string) => `workout-${groupId}`;

export const workoutStore = {
  load: async (groupId: string): Promise<Stored | null> => {
    try {
      const v = window.localStorage.getItem(key(groupId));
      return v ? (JSON.parse(v) as Stored) : null;
    } catch {
      return null;
    }
  },
  save: async (groupId: string, s: Stored) => {
    try {
      window.localStorage.setItem(key(groupId), JSON.stringify(s));
    } catch {}
  },
  /** Marks this exact version as on the server, unless the page has moved on since. */
  markSynced: async (groupId: string, w: Workout) => {
    try {
      const v = window.localStorage.getItem(key(groupId));
      if (v && JSON.stringify((JSON.parse(v) as Stored).workout) === JSON.stringify(w)) window.localStorage.setItem(key(groupId), JSON.stringify({ workout: w, synced: true }));
    } catch {}
  },
  clear: async (groupId: string) => {
    try {
      window.localStorage.removeItem(key(groupId));
    } catch {}
  },
};
