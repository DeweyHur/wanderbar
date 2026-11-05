import { createGame, listGames } from "@/lib/boardgame";
import { GameSchema } from "@/lib/boardgameSchemas";
import { authed, json } from "@/lib/http";

export const GET = authed<{ groupId: string }>(async (_req, { db, user, params }) => json({ games: await listGames(db, params.groupId, user.id) }));

export const POST = authed<{ groupId: string }>(async (req, { db, user, params }) =>
  json(await createGame(db, params.groupId, user.id, GameSchema.parse(await req.json())), 201),
);
