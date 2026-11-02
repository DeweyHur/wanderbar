import { createInvite, revokeInvites } from "@/lib/groups";
import { authed, json } from "@/lib/http";

function inviteUrl(req: Request, token: string) {
  const base = process.env.PUBLIC_BASE_URL ?? new URL(req.url).origin;
  return `${base.replace(/\/$/, "")}/invite/${token}`;
}

/** New invite link (owners only). */
export const POST = authed<{ groupId: string }>(async (req, { db, user, params }) => {
  const { token, expiresAt } = await createInvite(db, params.groupId, user.id);
  return json({ token, url: inviteUrl(req, token), expiresAt }, 201);
});

/** Revoke every open invite link of the group (owners only). */
export const DELETE = authed<{ groupId: string }>(async (_req, { db, user, params }) => {
  await revokeInvites(db, params.groupId, user.id);
  return json({ ok: true });
});
