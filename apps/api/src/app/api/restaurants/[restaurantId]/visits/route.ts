import { z } from "zod";
import { authed, json } from "@/lib/http";
import { addVisit } from "@/lib/restaurants";

const Body = z.object({ visitedAt: z.string().datetime({ offset: true }).optional() });

/** "I went here" (now, or at visitedAt). */
export const POST = authed<{ restaurantId: string }>(async (req, { db, user, params }) => {
  const { visitedAt } = Body.parse(await req.json().catch(() => ({})));
  return json(await addVisit(db, params.restaurantId, user.id, visitedAt ? new Date(visitedAt) : undefined), 201);
});
