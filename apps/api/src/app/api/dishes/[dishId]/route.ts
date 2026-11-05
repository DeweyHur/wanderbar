import { z } from "zod";
import { authed, json } from "@/lib/http";
import { deleteDish, getDish, updateDish } from "@/lib/dishes";

export const GET = authed<{ dishId: string }>(async (_req, { db, user, params }) => json(await getDish(db, params.dishId, user.id)));

const Body = z.object({ name: z.string().max(200).optional(), category: z.string().max(40).nullable().optional(), memo: z.string().max(4000).optional() });

export const PATCH = authed<{ dishId: string }>(async (req, { db, user, params }) =>
  json(await updateDish(db, params.dishId, user.id, Body.parse(await req.json()))),
);

export const DELETE = authed<{ dishId: string }>(async (_req, { db, user, params }) => {
  await deleteDish(db, params.dishId, user.id);
  return json({ ok: true });
});
