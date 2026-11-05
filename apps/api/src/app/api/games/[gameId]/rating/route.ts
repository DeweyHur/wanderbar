import { z } from "zod";
import { rateGame, unrateGame } from "@/lib/boardgame";
import { authed, json } from "@/lib/http";

const Body = z.object({ score: z.number(), review: z.string().max(4000).optional() });

/** My rating, 1..10, with a comment. */
export const PUT = authed<{ gameId: string }>(async (req, { db, user, params }) => json(await rateGame(db, params.gameId, user.id, Body.parse(await req.json()))));

export const DELETE = authed<{ gameId: string }>(async (_req, { db, user, params }) => json(await unrateGame(db, params.gameId, user.id)));
