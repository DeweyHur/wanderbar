import { groupDetail } from "@/lib/groups";
import { authed, json } from "@/lib/http";

export const GET = authed<{ groupId: string }>(async (_req, { db, user, params }) =>
  json(await groupDetail(db, params.groupId, user.id)),
);
