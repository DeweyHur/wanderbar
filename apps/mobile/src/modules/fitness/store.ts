import type { Workout } from "@wanderbar/route";

/**
 * The workout in progress, kept on the phone first (gyms often have no signal): a JSON file per group.
 * `synced` says whether the server has the latest version.
 */
export type Stored = { workout: Workout; synced: boolean };

async function file(groupId: string) {
  const { File, Paths } = await import("expo-file-system");
  return new File(Paths.document, `workout-${groupId.replace(/[^\w-]/g, "")}.json`);
}

// Writes go one after another, so a slow one can't land after (and over) a newer one.
let queue: Promise<unknown> = Promise.resolve();
const inOrder = <T,>(job: () => Promise<T>) => {
  const next = queue.then(job, job);
  queue = next.catch(() => {});
  return next;
};

export const workoutStore = {
  load: (groupId: string): Promise<Stored | null> =>
    inOrder(async () => {
    try {
      const f = await file(groupId);
      return f.exists ? (JSON.parse(await f.text()) as Stored) : null;
    } catch {
      return null;
    }
    }),
  save: (groupId: string, s: Stored) =>
    inOrder(async () => {
      try {
        const f = await file(groupId);
        if (!f.exists) f.create();
        f.write(JSON.stringify(s));
      } catch {}
    }),
  clear: (groupId: string) =>
    inOrder(async () => {
      try {
        const f = await file(groupId);
        if (f.exists) f.delete();
      } catch {}
    }),
  /** Marks this exact version as on the server, unless the phone has moved on since. */
  markSynced: (groupId: string, w: Workout) =>
    inOrder(async () => {
      try {
        const f = await file(groupId);
        if (!f.exists) return;
        const cur = JSON.parse(await f.text()) as Stored;
        if (JSON.stringify(cur.workout) === JSON.stringify(w)) f.write(JSON.stringify({ workout: w, synced: true }));
      } catch {}
    }),
};
