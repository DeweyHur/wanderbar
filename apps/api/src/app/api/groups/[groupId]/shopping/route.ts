import { z } from "zod";
import { authed, json } from "@/lib/http";
import { addShopping, clearBought, listShopping } from "@/lib/shopping";

/** The group's shopping list: still to buy, then recently bought. */
export const GET = authed<{ groupId: string }>(async (_req, { db, user, params }) => json({ items: await listShopping(db, params.groupId, user.id) }));

const Body = z.object({
  name: z.string().max(2000),
  qty: z.string().max(40).optional(),
  dishId: z.string().max(64).nullable().optional(),
  mealId: z.string().max(64).nullable().optional(),
});

/** Adds one item, or several separated by commas or lines. */
export const POST = authed<{ groupId: string }>(async (req, { db, user, params }) =>
  json({ items: await addShopping(db, params.groupId, user.id, Body.parse(await req.json())) }, 201),
);

/** Clears what's been bought. */
export const DELETE = authed<{ groupId: string }>(async (_req, { db, user, params }) => {
  await clearBought(db, params.groupId, user.id);
  return json({ items: await listShopping(db, params.groupId, user.id) });
});
