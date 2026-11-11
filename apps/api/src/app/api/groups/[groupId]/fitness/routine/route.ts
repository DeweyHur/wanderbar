import { RoutineBody, saveRoutine } from "@/lib/fitness";
import { authed, json } from "@/lib/http";

/** Saves my split routine in this group; answers with the fitness home. */
export const PUT = authed<{ groupId: string }>(async (req, { db, user, params }) => json(await saveRoutine(db, params.groupId, user.id, RoutineBody.parse(await req.json()))));
