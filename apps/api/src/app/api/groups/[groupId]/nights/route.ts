import { createNight } from "@/lib/boardgame";
import { NightSchema } from "@/lib/boardgameSchemas";
import { authed, json } from "@/lib/http";

/** A one-off game night (owner or host). */
export const POST = authed<{ groupId: string }>(async (req, { db, user, params }) =>
  json(await createNight(db, params.groupId, user.id, NightSchema.parse(await req.json())), 201),
);
