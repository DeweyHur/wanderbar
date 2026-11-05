import { z } from "zod";
import { authed, json } from "@/lib/http";
import { addMade } from "@/lib/dishes";

const Body = z.object({ madeAt: z.string().datetime({ offset: true }).optional() });

/** "I made it" (now, or at madeAt). */
export const POST = authed<{ dishId: string }>(async (req, { db, user, params }) => {
  const { madeAt } = Body.parse(await req.json().catch(() => ({})));
  return json(await addMade(db, params.dishId, user.id, madeAt ? new Date(madeAt) : undefined), 201);
});
