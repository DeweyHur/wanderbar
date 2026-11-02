import { signOut } from "@/lib/auth";
import { authed, clearedSessionCookie, json } from "@/lib/http";

export const POST = authed(async (_req, { db, token }) => {
  await signOut(db, token);
  return json({ ok: true }, 200, { "set-cookie": clearedSessionCookie });
});
