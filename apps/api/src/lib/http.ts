import { ZodError } from "zod";
import { getDb, type Db } from "../db/client";
import { bearerToken, userFromToken, type User } from "./auth";
import { HttpError, unauthorized } from "./errors";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  if (e instanceof ZodError) return json({ error: "요청 형식이 올바르지 않아요", issues: e.issues }, 400);
  console.error(e);
  return json({ error: "서버 오류" }, 500);
}

type Ctx<P> = { db: Db; user: User; token: string; params: P };

/** Wraps a route handler: resolves the bearer session (401 if missing) and maps errors to JSON. */
export function authed<P = Record<string, never>>(
  handler: (req: Request, ctx: Ctx<P>) => Promise<Response>,
) {
  return async (req: Request, route: { params: Promise<P> }) => {
    try {
      const db = getDb();
      const token = bearerToken(req);
      const user = await userFromToken(db, token);
      if (!user || !token) throw unauthorized();
      return await handler(req, { db, user, token, params: await route.params });
    } catch (e) {
      return errorResponse(e);
    }
  };
}
