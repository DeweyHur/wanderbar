import { queueGame, unqueueGame } from "@/lib/boardgame";
import { authed, json } from "@/lib/http";

/** Queue up / take back my "want to play". */
export const POST = authed<{ gameId: string }>(async (_req, { db, user, params }) => json(await queueGame(db, params.gameId, user.id)));

export const DELETE = authed<{ gameId: string }>(async (_req, { db, user, params }) => json(await unqueueGame(db, params.gameId, user.id)));
