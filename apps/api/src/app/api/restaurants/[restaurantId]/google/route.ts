import { z } from "zod";
import { authed, json } from "@/lib/http";
import { linkGoogle } from "@/lib/restaurants";

const Body = z.object({ placeId: z.string().max(300).optional(), sessionToken: z.string().min(8).max(100).optional() });

/** Link (or relink) to a Google place for opening hours and the map: the picked place, or found by name. */
export const POST = authed<{ restaurantId: string }>(async (req, { db, user, params }) => {
  const { placeId, sessionToken } = Body.parse(await req.json().catch(() => ({})));
  return json(await linkGoogle(db, params.restaurantId, user.id, placeId, sessionToken));
});
