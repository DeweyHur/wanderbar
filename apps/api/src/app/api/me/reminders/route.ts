import { authed, json } from "@/lib/http";
import { upcomingDays } from "@/lib/reminders";

/** My upcoming day routes, for the phone's own reminders (route day, shopping before a day at home). */
export const GET = authed(async (_req, { db, user }) => json({ days: await upcomingDays(db, user.id) }));
