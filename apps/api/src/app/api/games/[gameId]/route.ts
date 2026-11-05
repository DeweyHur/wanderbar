import { deleteGame, getGame, updateGame } from "@/lib/boardgame";
import { GameSchema } from "@/lib/boardgameSchemas";
import { authed, json } from "@/lib/http";

export const GET = authed<{ gameId: string }>(async (_req, { db, user, params }) => json(await getGame(db, params.gameId, user.id)));

export const PATCH = authed<{ gameId: string }>(async (req, { db, user, params }) =>
  json(await updateGame(db, params.gameId, user.id, GameSchema.parse(await req.json()))),
);

export const DELETE = authed<{ gameId: string }>(async (_req, { db, user, params }) => {
  await deleteGame(db, params.gameId, user.id);
  return json({ ok: true });
});
