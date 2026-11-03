import { authed, json } from "@/lib/http";
import { deleteVisit } from "@/lib/restaurants";

export const DELETE = authed<{ visitId: string }>(async (_req, { db, user, params }) => json(await deleteVisit(db, params.visitId, user.id)));
