import { z } from "zod";
import { getDb } from "@/db/client";
import { googleAudiences, signIn, verifyGoogleIdToken } from "@/lib/auth";
import { myGroups } from "@/lib/groups";
import { errorResponse, json } from "@/lib/http";

const Body = z.object({ idToken: z.string().min(10) });

/** Exchange a Google ID token (from the app's Google sign-in) for an app session token. */
export async function POST(req: Request) {
  try {
    const { idToken } = Body.parse(await req.json());
    const profile = await verifyGoogleIdToken(idToken, { audiences: googleAudiences() });
    const db = getDb();
    const { token, expiresAt, user } = await signIn(db, profile);
    return json({ token, expiresAt, user, groups: await myGroups(db, user.id) });
  } catch (e) {
    return errorResponse(e);
  }
}
