import { z } from "zod";
import { authed, json } from "@/lib/http";
import { addMenu } from "@/lib/restaurants";

const MenuBody = z.object({
  name: z.string().max(200).optional(),
  /** Minor units of the group's currency (cents, whole won). */
  priceMinor: z.number().int().nullable().optional(),
  memo: z.string().max(2000).optional(),
});

export const POST = authed<{ restaurantId: string }>(async (req, { db, user, params }) =>
  json(await addMenu(db, params.restaurantId, user.id, MenuBody.parse(await req.json())), 201),
);
