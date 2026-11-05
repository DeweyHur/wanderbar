import { createSeries } from "@/lib/boardgame";
import { SeriesSchema } from "@/lib/boardgameSchemas";
import { authed, json } from "@/lib/http";

/** A regular meetup (owner or host). */
export const POST = authed<{ groupId: string }>(async (req, { db, user, params }) =>
  json(await createSeries(db, params.groupId, user.id, SeriesSchema.parse(await req.json())), 201),
);
