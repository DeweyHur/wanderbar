import { ZodError } from "zod";
import { getDb, type Db } from "../db/client";
import { userFromToken, type User } from "./auth";
import { forbidden, HttpError, unauthorized } from "./errors";

export const SESSION_COOKIE = "wb_session";
/** Sent by the web app on every request; cross-site forms and links can't set custom headers. */
export const CLIENT_HEADER = "x-wanderbar-client";
const SESSION_MAX_AGE = 90 * 24 * 60 * 60;

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { "cache-control": "no-store", ...headers } });
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return json({ error: e.code }, e.status);
  if (e instanceof ZodError) return json({ error: "bad_request", issues: e.issues }, 400);
  console.error(e);
  return json({ error: "server_error" }, 500);
}

function cookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** Apps send a bearer token; the web app relies on an httpOnly cookie. */
export function sessionToken(req: Request): { token: string; via: "bearer" | "cookie" } | null {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  if (m) return { token: m[1].trim(), via: "bearer" };
  const c = cookie(req, SESSION_COOKIE);
  return c ? { token: c, via: "cookie" } : null;
}

/**
 * CSRF guard for cookie sessions: state-changing requests must carry the custom client header
 * (SameSite=Lax already blocks cross-site cookie POSTs in modern browsers; this is the second lock).
 */
export function csrfOk(req: Request, via: "bearer" | "cookie") {
  if (via === "bearer") return true;
  if (req.method === "GET" || req.method === "HEAD") return true;
  return req.headers.get(CLIENT_HEADER) === "web";
}

export function sessionCookie(token: string) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}
export const clearedSessionCookie = `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

type Ctx<P> = { db: Db; user: User; token: string; via: "bearer" | "cookie"; params: P };

/** Wraps a route handler: resolves the session (401 if missing), checks CSRF, and maps errors to JSON. */
export function authed<P = Record<string, never>>(
  handler: (req: Request, ctx: Ctx<P>) => Promise<Response>,
) {
  return async (req: Request, route: { params: Promise<P> }) => {
    try {
      const session = sessionToken(req);
      if (!session) throw unauthorized();
      if (!csrfOk(req, session.via)) throw forbidden("csrf");
      const db = getDb();
      const user = await userFromToken(db, session.token);
      if (!user) throw unauthorized();
      return await handler(req, { db, user, token: session.token, via: session.via, params: await route.params });
    } catch (e) {
      return errorResponse(e);
    }
  };
}
