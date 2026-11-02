import { acceptInvite } from "@/lib/groups";
import { authed, json } from "@/lib/http";

export const POST = authed<{ token: string }>(async (_req, { db, user, params }) =>
  json(await acceptInvite(db, params.token, user.id)),
);
