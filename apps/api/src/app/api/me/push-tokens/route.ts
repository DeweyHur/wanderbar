import { z } from "zod";
import { authed, json } from "@/lib/http";
import { registerPushToken, unregisterPushToken } from "@/lib/push";

const Body = z.object({ token: z.string().min(10).max(4096), platform: z.enum(["android", "ios"]), locale: z.string().max(10).optional() });

/** This device wants group news. */
export const POST = authed(async (req, { db, user }) => {
  await registerPushToken(db, user.id, Body.parse(await req.json()));
  return json({ ok: true });
});

/** This device no longer wants group news (or is signing out). */
export const DELETE = authed(async (req, { db, user }) => {
  const { token } = z.object({ token: z.string().max(4096) }).parse(await req.json());
  await unregisterPushToken(db, user.id, token);
  return json({ ok: true });
});
