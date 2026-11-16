import { authed, json } from "@/lib/http";
import { visitedPlaces } from "@/lib/plans";

/** Places you've finished on your day routes in this group (for place search). */
export const GET = authed<{ groupId: string }>(async (_req, { db, user, params }) => json({ places: await visitedPlaces(db, params.groupId, user.id) }));
