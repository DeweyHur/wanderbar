import { signOut } from "@/lib/auth";
import { authed, json } from "@/lib/http";

export const POST = authed(async (_req, { db, token }) => {
  await signOut(db, token);
  return json({ ok: true });
});
