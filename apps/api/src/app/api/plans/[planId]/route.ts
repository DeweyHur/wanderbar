import { z } from "zod";
import { authed, json } from "@/lib/http";
import { deletePlan, getPlan, renamePlan } from "@/lib/plans";

export const GET = authed<{ planId: string }>(async (_req, { db, user, params }) => json(await getPlan(db, params.planId, user.id)));

const Patch = z.object({ title: z.string().min(1).max(80) });

export const PATCH = authed<{ planId: string }>(async (req, { db, user, params }) => {
  const { title } = Patch.parse(await req.json());
  return json(await renamePlan(db, params.planId, user.id, title));
});

export const DELETE = authed<{ planId: string }>(async (_req, { db, user, params }) => {
  await deletePlan(db, params.planId, user.id);
  return json({ ok: true });
});
