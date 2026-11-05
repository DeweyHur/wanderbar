import { authed, json } from "@/lib/http";
import { deleteMade } from "@/lib/dishes";

export const DELETE = authed<{ dishId: string; madeId: string }>(async (_req, { db, user, params }) =>
  json(await deleteMade(db, params.dishId, params.madeId, user.id)),
);
