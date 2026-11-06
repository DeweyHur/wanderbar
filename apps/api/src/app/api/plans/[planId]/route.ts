import { z } from "zod";
import { authed, json } from "@/lib/http";
import { deletePlan, getPlan, updatePlan } from "@/lib/plans";

export const GET = authed<{ planId: string }>(async (_req, { db, user, params }) => json(await getPlan(db, params.planId, user.id)));

const Patch = z.object({ title: z.string().max(80).optional(), date: z.string().max(10).optional(), atHome: z.boolean().optional() });

/** Rename and/or move to another day. */
export const PATCH = authed<{ planId: string }>(async (req, { db, user, params }) =>
  json(await updatePlan(db, params.planId, user.id, Patch.parse(await req.json()))),
);

export const DELETE = authed<{ planId: string }>(async (_req, { db, user, params }) => {
  await deletePlan(db, params.planId, user.id);
  return json({ ok: true });
});
