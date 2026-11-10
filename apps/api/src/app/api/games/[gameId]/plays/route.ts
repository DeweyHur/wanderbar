import { z } from "zod";
import { logPlay } from "@/lib/boardgame";
import { authed, json } from "@/lib/http";

const Body = z.object({ date: z.string() });

/** "We played this on 2026-11-02": puts it on that day's game night (making one if needed). */
export const POST = authed<{ gameId: string }>(async (req, { db, user, params }) => json(await logPlay(db, params.gameId, user.id, Body.parse(await req.json()).date)));
