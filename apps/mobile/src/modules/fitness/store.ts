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

export const workoutStore = {
  load: async (groupId: string): Promise<Stored | null> => {
    try {
      const f = await file(groupId);
      return f.exists ? (JSON.parse(await f.text()) as Stored) : null;
    } catch {
      return null;
    }
  },
  save: async (groupId: string, s: Stored) => {
    try {
      const f = await file(groupId);
      if (!f.exists) f.create();
      await f.write(JSON.stringify(s));
    } catch {}
  },
  clear: async (groupId: string) => {
    try {
      const f = await file(groupId);
      if (f.exists) f.delete();
    } catch {}
  },
};
