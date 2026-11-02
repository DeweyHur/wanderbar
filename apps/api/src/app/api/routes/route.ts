import { z } from "zod";
import { computeRoute, MAX_ROUTE_POINTS } from "@/lib/google";
import { authed, json } from "@/lib/http";

const Body = z.object({
  points: z.array(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })).min(2).max(MAX_ROUTE_POINTS),
});

/** Drive times through the points in order; legs carry Google's encoded polyline. */
export const POST = authed(async (req) => json(await computeRoute(Body.parse(await req.json()).points)));
