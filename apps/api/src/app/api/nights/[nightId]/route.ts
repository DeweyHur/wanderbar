import { deleteNight, getNight, updateNight } from "@/lib/boardgame";
import { NightSchema } from "@/lib/boardgameSchemas";
import { authed, json } from "@/lib/http";

export const GET = authed<{ nightId: string }>(async (_req, { db, user, params }) => json(await getNight(db, params.nightId, user.id)));

export const PATCH = authed<{ nightId: string }>(async (req, { db, user, params }) =>
  json(await updateNight(db, params.nightId, user.id, NightSchema.parse(await req.json()))),
);

export const DELETE = authed<{ nightId: string }>(async (_req, { db, user, params }) => {
  await deleteNight(db, params.nightId, user.id);
  return json({ ok: true });
});
