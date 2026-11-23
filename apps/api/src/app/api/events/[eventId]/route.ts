import { authed, json } from "@/lib/http";
import { deleteEvent } from "@/lib/restaurants";

export const DELETE = authed<{ eventId: string }>(async (_req, { db, user, params }) => json(await deleteEvent(db, params.eventId, user.id)));
