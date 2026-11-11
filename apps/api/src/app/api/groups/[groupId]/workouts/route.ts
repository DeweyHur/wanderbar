import { myWorkouts } from "@/lib/fitness";
import { authed, json } from "@/lib/http";

/** My finished workouts here, with their sets (only mine). */
export const GET = authed<{ groupId: string }>(async (_req, { db, user, params }) => json({ workouts: await myWorkouts(db, params.groupId, user.id) }));
