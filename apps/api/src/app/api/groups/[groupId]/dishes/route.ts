import { z } from "zod";
import { authed, json } from "@/lib/http";
import { createDish, listDishes } from "@/lib/dishes";

export const GET = authed<{ groupId: string }>(async (_req, { db, user, params }) => json({ dishes: await listDishes(db, params.groupId, user.id) }));

const Body = z.object({ name: z.string().max(200), category: z.string().max(40).nullable().optional(), memo: z.string().max(4000).optional() });

/** A dish made at home. */
export const POST = authed<{ groupId: string }>(async (req, { db, user, params }) =>
  json(await createDish(db, params.groupId, user.id, Body.parse(await req.json())), 201),
);
