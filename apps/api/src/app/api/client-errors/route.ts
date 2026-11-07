import { z } from "zod";
import { json } from "@/lib/http";

const Body = z.object({
  message: z.string().max(2000),
  stack: z.string().max(8000).optional(),
  where: z.string().max(200).optional(),
  platform: z.string().max(20).optional(),
  version: z.string().max(40).optional(),
});

/** Crashes the apps caught (error screen or global handler), written to the server log to debug from. No user data. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ ok: false }, 400);
  const e = parsed.data;
  console.error(`[client-error] ${e.platform ?? "?"} ${e.version ?? "?"} at ${e.where ?? "?"}: ${e.message}\n${e.stack ?? ""}`);
  return json({ ok: true });
}
