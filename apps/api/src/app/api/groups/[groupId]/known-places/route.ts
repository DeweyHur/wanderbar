import { authed, json } from "@/lib/http";
import { knownPlaces } from "@/lib/plans";

/** Places the group already has (your route stops, saved restaurants), for place search on a trip. */
export const GET = authed<{ groupId: string }>(async (_req, { db, user, params }) => json({ places: await knownPlaces(db, params.groupId, user.id) }));
