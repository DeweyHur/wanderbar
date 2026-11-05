import { z } from "zod";
import { addNightGame } from "@/lib/boardgame";
import { authed, json } from "@/lib/http";

const Body = z.object({ gameId: z.string().min(1).max(64) });

/** Add a game to the night's lineup (the picker, or the owner / a host). */
export const POST = authed<{ nightId: string }>(async (req, { db, user, params }) =>
  json(await addNightGame(db, params.nightId, Body.parse(await req.json()).gameId, user.id)),
);
