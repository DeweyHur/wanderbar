import { z } from "zod";
import { getDb } from "@/db/client";
import { appleAudiences, signInWithApple, verifyAppleIdToken } from "@/lib/auth";
import { myGroups } from "@/lib/groups";
import { CLIENT_HEADER, errorResponse, json, sessionCookie } from "@/lib/http";

const Body = z.object({
  idToken: z.string().min(10),
  /** Apple sends the name to the app only on the first sign-in. */
  name: z.string().trim().max(80).nullish(),
  client: z.enum(["app", "web"]).default("app"),
});

/** Exchange a Sign in with Apple identity token for an app session (same shape as /api/auth/google). */
export async function POST(req: Request) {
  try {
    const { idToken, name, client } = Body.parse(await req.json());
    if (client === "web" && req.headers.get(CLIENT_HEADER) !== "web") return json({ error: "csrf" }, 403);
    const profile = await verifyAppleIdToken(idToken, { audiences: appleAudiences() });
    const db = await getDb();
    const { token, expiresAt, user } = await signInWithApple(db, profile, name || null);
    const body = { expiresAt, user, groups: await myGroups(db, user.id) };
    return client === "web" ? json(body, 200, { "set-cookie": sessionCookie(token) }) : json({ ...body, token });
  } catch (e) {
    return errorResponse(e);
  }
}
