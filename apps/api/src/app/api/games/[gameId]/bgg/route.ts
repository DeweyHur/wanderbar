import { getGame, syncBggDetails } from "@/lib/boardgame";
import { authed, json } from "@/lib/http";

/** Re-read the game's details (and picture) from its BGG link. */
export const POST = authed<{ gameId: string }>(async (_req, { db, user, params }) => {
  const game = await getGame(db, params.gameId, user.id);
  await syncBggDetails(db, game.id, game.links, true);
  return json(await getGame(db, params.gameId, user.id));
});
