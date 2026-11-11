import { fitnessHome } from "@/lib/fitness";
import { authed, json } from "@/lib/http";

/** Fitness home: my routine and the next day of my cycle, this week's attendance, the group's check-ins. */
export const GET = authed<{ groupId: string }>(async (_req, { db, user, params }) => json(await fitnessHome(db, params.groupId, user.id)));
