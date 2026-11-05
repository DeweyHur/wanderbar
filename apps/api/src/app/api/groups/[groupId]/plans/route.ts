import { z } from "zod";
import { authed, json } from "@/lib/http";
import { createPlan, listPlans } from "@/lib/plans";

export const GET = authed<{ groupId: string }>(async (_req, { db, user, params }) =>
  json({ plans: await listPlans(db, params.groupId, user.id) }),
);

const Body = z.object({ title: z.string().max(80).optional(), date: z.string().max(10).optional() });

/** A route for any day: { date: "2026-11-08" } (today when omitted); title optional. */
export const POST = authed<{ groupId: string }>(async (req, { db, user, params }) => {
  const { title, date } = Body.parse(await req.json());
  return json(await createPlan(db, params.groupId, user.id, title, date), 201);
});
