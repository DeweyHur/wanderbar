import { z } from "zod";
import { authed, json } from "@/lib/http";
import { rateDish, unrateDish } from "@/lib/dishes";

const Body = z.object({ stars: z.number(), review: z.string().max(4000).optional() });

export const PUT = authed<{ dishId: string }>(async (req, { db, user, params }) => json(await rateDish(db, params.dishId, user.id, Body.parse(await req.json()))));

export const DELETE = authed<{ dishId: string }>(async (_req, { db, user, params }) => json(await unrateDish(db, params.dishId, user.id)));
