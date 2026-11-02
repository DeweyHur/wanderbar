import { myGroups } from "@/lib/groups";
import { authed, json } from "@/lib/http";

export const GET = authed(async (_req, { db, user }) => json({ user, groups: await myGroups(db, user.id) }));
