import { z } from "zod";
import { json } from "@/lib/http";

const Body = z.object({
  message: z.string().max(2000),
  stack: z.string().max(8000).default(""),
  fatal: z.boolean().default(false),
  where: z.string().max(100).default(""),
  platform: z.string().max(20).default(""),
  platformVersion: z.string().max(40).default(""),
  build: z.string().max(40).default(""),
});

/**
 * Crash reports from the apps (no sign-in needed: the app may crash before it can sign in).
 * Only written to the server log; nothing is stored or returned.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ ok: false }, 400);
  console.error("[client-error]", JSON.stringify({ ...parsed.data, ua: req.headers.get("user-agent")?.slice(0, 200) }));
  return json({ ok: true });
}
