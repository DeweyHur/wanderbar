import { z } from "zod";
import { authed, json } from "@/lib/http";
import { createRestaurant, listRestaurants } from "@/lib/restaurants";

export const GET = authed<{ groupId: string }>(async (_req, { db, user, params }) =>
  json({ restaurants: await listRestaurants(db, params.groupId, user.id) }),
);

const Body = z.object({
  name: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  yelpUrl: z.string().max(2000).optional(),
  mapsUrl: z.string().max(2000).optional(),
  googlePlaceId: z.string().max(300).optional(),
  sessionToken: z.string().min(8).max(100).optional(),
  category: z.string().max(40).nullable().optional(),
  memo: z.string().max(2000).optional(),
});

/** Save a restaurant (from a share, a Google pick or typing). 200 with created=false when it already exists. */
export const POST = authed<{ groupId: string }>(async (req, { db, user, params }) => {
  const r = await createRestaurant(db, params.groupId, user.id, Body.parse(await req.json()));
  return json(r, r.created ? 201 : 200);
});
