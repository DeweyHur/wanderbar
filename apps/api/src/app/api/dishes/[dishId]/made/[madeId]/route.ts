import { z } from "zod";
import { authed, json } from "@/lib/http";
import { deleteMade, updateMade } from "@/lib/dishes";

/** Change who made it. */
export const PATCH = authed<{ dishId: string; madeId: string }>(async (req, { db, user, params }) =>
  json(await updateMade(db, params.dishId, params.madeId, user.id, z.object({ userId: z.string().max(64).optional() }).parse(await req.json()))),
);

export const DELETE = authed<{ dishId: string; madeId: string }>(async (_req, { db, user, params }) =>
  json(await deleteMade(db, params.dishId, params.madeId, user.id)),
);
