import { authed, json } from "@/lib/http";
import { deleteStop, updateStop } from "@/lib/plans";
import { StopFieldsSchema } from "@/lib/stopFields";

export const PATCH = authed<{ stopId: string }>(async (req, { db, user, params }) =>
  json(await updateStop(db, params.stopId, user.id, StopFieldsSchema.parse(await req.json()))),
);

export const DELETE = authed<{ stopId: string }>(async (_req, { db, user, params }) =>
  json({ stops: await deleteStop(db, params.stopId, user.id) }),
);
