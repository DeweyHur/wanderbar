import { z } from "zod";
import { authed, json } from "@/lib/http";
import { addStops } from "@/lib/plans";
import { StopFieldsSchema } from "@/lib/stopFields";

const Body = z.object({ stops: z.array(StopFieldsSchema.extend({ name: z.string().min(1).max(200) })).min(1).max(50) });

/** Add one or more stops at the end ("카페, 공원, 재즈바" quick-add sends several). */
export const POST = authed<{ planId: string }>(async (req, { db, user, params }) => {
  const { stops } = Body.parse(await req.json());
  return json({ stops: await addStops(db, params.planId, user.id, stops) }, 201);
});
