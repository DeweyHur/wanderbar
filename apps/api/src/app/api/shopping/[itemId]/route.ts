import { z } from "zod";
import { authed, json } from "@/lib/http";
import { deleteShopping, updateShopping } from "@/lib/shopping";

const Patch = z.object({ done: z.boolean().optional(), name: z.string().max(120).optional(), qty: z.string().max(40).optional() });

/** Check off, rename or change the amount. */
export const PATCH = authed<{ itemId: string }>(async (req, { db, user, params }) =>
  json(await updateShopping(db, params.itemId, user.id, Patch.parse(await req.json()))),
);

export const DELETE = authed<{ itemId: string }>(async (_req, { db, user, params }) => {
  await deleteShopping(db, params.itemId, user.id);
  return json({ ok: true });
});
