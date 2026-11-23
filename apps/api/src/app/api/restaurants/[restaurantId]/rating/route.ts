import { z } from "zod";
import { authed, json } from "@/lib/http";
import { ratePlace, unratePlace } from "@/lib/restaurants";

const Body = z.object({ stars: z.number(), review: z.string().max(4000).optional() });

/** Set (or replace) my rating of the place itself (a sight, a hotel, a venue…). */
export const PUT = authed<{ restaurantId: string }>(async (req, { db, user, params }) => json(await ratePlace(db, params.restaurantId, user.id, Body.parse(await req.json()))));

export const DELETE = authed<{ restaurantId: string }>(async (_req, { db, user, params }) => json(await unratePlace(db, params.restaurantId, user.id)));
