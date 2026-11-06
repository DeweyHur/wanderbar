import { z } from "zod";
import { addGuest } from "@/lib/boardgame";
import { authed, json } from "@/lib/http";

const Body = z.object({ name: z.string().max(100) });

/** Someone without the app coming along, by name. */
export const POST = authed<{ nightId: string }>(async (req, { db, user, params }) => json(await addGuest(db, params.nightId, user.id, Body.parse(await req.json()).name), 201));
