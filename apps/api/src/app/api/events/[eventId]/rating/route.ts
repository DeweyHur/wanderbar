import { z } from "zod";
import { authed, json } from "@/lib/http";
import { rateEvent, unrateEvent } from "@/lib/restaurants";

const Body = z.object({ stars: z.number(), review: z.string().max(4000).optional() });

export const PUT = authed<{ eventId: string }>(async (req, { db, user, params }) => json(await rateEvent(db, params.eventId, user.id, Body.parse(await req.json()))));

export const DELETE = authed<{ eventId: string }>(async (_req, { db, user, params }) => json(await unrateEvent(db, params.eventId, user.id)));
