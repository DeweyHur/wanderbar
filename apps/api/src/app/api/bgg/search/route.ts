import { searchGames } from "@/lib/bgg";
import { authed, json } from "@/lib/http";

/** Name autocomplete for board games, from BoardGameGeek (cached). Signed-in users only. */
export const GET = authed(async (req, { db }) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return json({ results: await searchGames(db, q.slice(0, 100)) });
});
