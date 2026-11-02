import { z } from "zod";
import { getDb } from "@/db/client";
import { googleAudiences, signIn, verifyGoogleIdToken } from "@/lib/auth";
import { myGroups } from "@/lib/groups";
import { CLIENT_HEADER, errorResponse, json, sessionCookie } from "@/lib/http";

const Body = z.object({ idToken: z.string().min(10), client: z.enum(["app", "web"]).default("app") });

/**
 * Exchange a Google ID token for an app session.
 * Apps get the token in the body (kept in the secure store); the web gets an httpOnly cookie only.
 */
export async function POST(req: Request) {
  try {
    const { idToken, client } = Body.parse(await req.json());
    if (client === "web" && req.headers.get(CLIENT_HEADER) !== "web") return json({ error: "csrf" }, 403);
    const profile = await verifyGoogleIdToken(idToken, { audiences: googleAudiences() });
    const db = await getDb();
    const { token, expiresAt, user } = await signIn(db, profile);
    const body = { expiresAt, user, groups: await myGroups(db, user.id) };
    return client === "web"
      ? json(body, 200, { "set-cookie": sessionCookie(token) })
      : json({ ...body, token });
  } catch (e) {
    return errorResponse(e);
  }
}
