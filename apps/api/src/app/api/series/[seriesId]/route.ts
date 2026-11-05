import { deleteSeries, updateSeries } from "@/lib/boardgame";
import { SeriesSchema } from "@/lib/boardgameSchemas";
import { authed, json } from "@/lib/http";

export const PATCH = authed<{ seriesId: string }>(async (req, { db, user, params }) =>
  json(await updateSeries(db, params.seriesId, user.id, SeriesSchema.parse(await req.json()))),
);

export const DELETE = authed<{ seriesId: string }>(async (_req, { db, user, params }) => {
  await deleteSeries(db, params.seriesId, user.id);
  return json({ ok: true });
});
