import { z } from "zod";
import { authed, json } from "@/lib/http";
import { rateMenu, unrateMenu } from "@/lib/restaurants";

const Body = z.object({ stars: z.number(), review: z.string().max(4000).optional() });

/** Set (or replace) my rating of this menu. */
export const PUT = authed<{ menuId: string }>(async (req, { db, user, params }) => json(await rateMenu(db, params.menuId, user.id, Body.parse(await req.json()))));

export const DELETE = authed<{ menuId: string }>(async (_req, { db, user, params }) => json(await unrateMenu(db, params.menuId, user.id)));
