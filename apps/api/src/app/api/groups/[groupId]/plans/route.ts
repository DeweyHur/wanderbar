import { z } from "zod";
import { authed, json } from "@/lib/http";
import { createPlan, listPlans } from "@/lib/plans";

export const GET = authed<{ groupId: string }>(async (_req, { db, user, params }) =>
  json({ plans: await listPlans(db, params.groupId, user.id) }),
);

const Body = z.object({ title: z.string().min(1).max(80) });

export const POST = authed<{ groupId: string }>(async (req, { db, user, params }) => {
  const { title } = Body.parse(await req.json());
  return json(await createPlan(db, params.groupId, user.id, title), 201);
});
