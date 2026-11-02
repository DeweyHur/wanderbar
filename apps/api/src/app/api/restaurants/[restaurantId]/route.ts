import { z } from "zod";
import { authed, json } from "@/lib/http";
import { deleteRestaurant, getRestaurant, updateRestaurant } from "@/lib/restaurants";

export const GET = authed<{ restaurantId: string }>(async (_req, { db, user, params }) => json(await getRestaurant(db, params.restaurantId, user.id)));

const Body = z.object({
  name: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  hoursRaw: z.string().max(1000).optional(),
  yelpUrl: z.string().max(2000).optional(),
  mapsUrl: z.string().max(2000).optional(),
  category: z.string().max(40).nullable().optional(),
  memo: z.string().max(2000).optional(),
});

export const PATCH = authed<{ restaurantId: string }>(async (req, { db, user, params }) =>
  json(await updateRestaurant(db, params.restaurantId, user.id, Body.parse(await req.json()))),
);

export const DELETE = authed<{ restaurantId: string }>(async (_req, { db, user, params }) => {
  await deleteRestaurant(db, params.restaurantId, user.id);
  return json({ ok: true });
});
