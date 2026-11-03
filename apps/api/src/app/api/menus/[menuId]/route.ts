import { z } from "zod";
import { authed, json } from "@/lib/http";
import { deleteMenu, getMenu, updateMenu } from "@/lib/restaurants";

export const GET = authed<{ menuId: string }>(async (_req, { db, user, params }) => json(await getMenu(db, params.menuId, user.id)));

const Body = z.object({
  name: z.string().max(200).optional(),
  priceMinor: z.number().int().nullable().optional(),
  memo: z.string().max(2000).optional(),
});

export const PATCH = authed<{ menuId: string }>(async (req, { db, user, params }) =>
  json(await updateMenu(db, params.menuId, user.id, Body.parse(await req.json()))),
);

export const DELETE = authed<{ menuId: string }>(async (_req, { db, user, params }) => json(await deleteMenu(db, params.menuId, user.id)));
