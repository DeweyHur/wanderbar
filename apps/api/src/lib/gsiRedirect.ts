/**
 * Google sign-in for the web in redirect mode: Google posts the ID token to us as a form
 * (no popup, so popup blockers and in-app browsers like KakaoTalk's can't break it).
 * Google's double-submit CSRF check: the g_csrf_token cookie must equal the posted field.
 */
export const RETURN_COOKIE = "wb_return";

export function readCookie(req: Request, name: string): string | null {
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(req.headers.get("cookie") ?? "");
  return m ? decodeURIComponent(m[1]) : null;
}

/** Only same-site paths ("/invite/abc"), never "//evil.com" or absolute URLs. */
export function safeReturnPath(p: string | null): string {
  return p && p.startsWith("/") && !p.startsWith("//") && !p.startsWith("/\\") && !p.startsWith("/api/") ? p : "/";
}
