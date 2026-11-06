import { getDb } from "@/db/client";
import { json } from "@/lib/http";
import { dailyPushes } from "@/lib/reminders";

/** Vercel Cron (vercel.json), once a day. Vercel sends CRON_SECRET as a bearer token; nothing runs without it. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "unauthorized" }, 401);
  return json(await dailyPushes(await getDb()));
}
