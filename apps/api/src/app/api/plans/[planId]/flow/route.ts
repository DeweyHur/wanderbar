import { z } from "zod";
import { authed, json } from "@/lib/http";
import { applyFlow } from "@/lib/plans";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["complete", "postpone", "drop", "setCurrent", "restore"]), stopId: z.string() }),
  z.object({ action: z.literal("move"), from: z.number().int().min(0), to: z.number().int().min(0) }),
  z.object({ action: z.literal("restart") }),
]);

/** Done / skip / drop / go here now / restore / reorder / restart. Returns the plan's stops in order. */
export const POST = authed<{ planId: string }>(async (req, { db, user, params }) =>
  json({ stops: await applyFlow(db, params.planId, user.id, Body.parse(await req.json())) }),
);
