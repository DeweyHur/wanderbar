import { removeNightGame } from "@/lib/boardgame";
import { authed, json } from "@/lib/http";

export const DELETE = authed<{ nightId: string; gameId: string }>(async (_req, { db, user, params }) =>
  json(await removeNightGame(db, params.nightId, params.gameId, user.id)),
);
