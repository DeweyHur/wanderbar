import { z } from "zod";
import { getDb } from "@/db/client";
import { signIn } from "@/lib/auth";
import { myGroups } from "@/lib/groups";
import { CLIENT_HEADER, errorResponse, json, sessionCookie } from "@/lib/http";
import { testLoginEnabled } from "@/lib/testLogin";

const Body = z.object({ email: z.string().email(), name: z.string().min(1).max(80) });

/** End-to-end tests and the staging site only (see testLoginEnabled). Everywhere else this route doesn't exist (404). */
export async function POST(req: Request) {
  if (!testLoginEnabled()) return json({ error: "not_found" }, 404);
  try {
    if (req.headers.get(CLIENT_HEADER) !== "web") return json({ error: "csrf" }, 403);
    const { email, name } = Body.parse(await req.json());
    const db = await getDb();
    const { token, user } = await signIn(db, { sub: `test:${email}`, email, name, picture: null });
    return json({ user, groups: await myGroups(db, user.id) }, 200, { "set-cookie": sessionCookie(token) });
  } catch (e) {
    return errorResponse(e);
  }
}
