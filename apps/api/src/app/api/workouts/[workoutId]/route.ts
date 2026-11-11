import { deleteWorkout, saveWorkout, WorkoutBody } from "@/lib/fitness";
import { authed, json } from "@/lib/http";

/** Creates or updates my workout (the id comes from the phone, so an offline start syncs later). */
export const PUT = authed<{ workoutId: string }>(async (req, { db, user, params }) => json(await saveWorkout(db, params.workoutId, user.id, WorkoutBody.parse(await req.json()))));

export const DELETE = authed<{ workoutId: string }>(async (_req, { db, user, params }) => json(await deleteWorkout(db, params.workoutId, user.id)));
