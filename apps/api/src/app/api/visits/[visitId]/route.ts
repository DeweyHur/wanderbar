import { z } from "zod";
import { authed, json } from "@/lib/http";
import { deleteVisit, updateVisit } from "@/lib/restaurants";

const Body = z.object({ visitedAt: z.string().datetime({ offset: true }) });

/** Move your visit to another day. */
export const PATCH = authed<{ visitId: string }>(async (req, { db, user, params }) => {
  const { visitedAt } = Body.parse(await req.json());
  return json(await updateVisit(db, params.visitId, user.id, new Date(visitedAt)));
});

export const DELETE = authed<{ visitId: string }>(async (_req, { db, user, params }) => json(await deleteVisit(db, params.visitId, user.id)));
