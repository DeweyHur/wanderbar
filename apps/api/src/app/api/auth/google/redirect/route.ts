import { getDb } from "@/db/client";
import { googleAudiences, signIn, verifyGoogleIdToken } from "@/lib/auth";
import { readCookie, RETURN_COOKIE, safeReturnPath } from "@/lib/gsiRedirect";
import { sessionCookie } from "@/lib/http";

/**
 * Google Identity Services (ux_mode "redirect") posts here after the user picks an account.
 * Sets the web session cookie and sends the browser back to where sign-in started.
 */
export async function POST(req: Request) {
  const back = (path: string, extra: string[] = []) => {
    const headers = new Headers({ location: new URL(path, req.url).toString() });
    for (const c of [...extra, `${RETURN_COOKIE}=; Path=/; Secure; SameSite=Lax; Max-Age=0`]) headers.append("set-cookie", c);
    return new Response(null, { status: 303, headers });
  };
  const returnTo = safeReturnPath(readCookie(req, RETURN_COOKIE));
  try {
    const form = await req.formData();
    const credential = String(form.get("credential") ?? "");
    const csrf = String(form.get("g_csrf_token") ?? "");
    // Google's double-submit check. Browsers that drop the cookie on the cross-site post (strict
    // privacy modes) still sign in safely: the ID token itself is verified below.
    const cookieCsrf = readCookie(req, "g_csrf_token");
    if (!credential || (cookieCsrf !== null && cookieCsrf !== csrf)) return back(`/?signin=csrf`);
    const profile = await verifyGoogleIdToken(credential, { audiences: googleAudiences() });
    const { token } = await signIn(await getDb(), profile);
    return back(returnTo, [sessionCookie(token)]);
  } catch (e) {
    console.error("[auth.redirect]", e instanceof Error ? e.message : e);
    return back(`/?signin=failed`);
  }
}
