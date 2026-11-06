import { getBggGame } from "@/lib/bgg";
import { authed, json } from "@/lib/http";

/** One game's BGG details (name, year, picture, players, time), for previewing a pick. */
export const GET = authed<{ bggId: string }>(async (_req, { db, params }) => json(await getBggGame(db, Number(params.bggId))));
