import { z } from "zod";
import { authed, json } from "@/lib/http";
import { addEvent } from "@/lib/restaurants";

const Body = z.object({ name: z.string().max(200), onDate: z.string().max(10).nullable().optional(), memo: z.string().max(2000).optional() });

/** Something seen at this venue (a show, a game…) and its day. */
export const POST = authed<{ restaurantId: string }>(async (req, { db, user, params }) => json(await addEvent(db, params.restaurantId, user.id, Body.parse(await req.json())), 201));
