import { authed, json } from "@/lib/http";
import { upcomingDays, upcomingFixed } from "@/lib/reminders";

/** My upcoming day routes and fixed-time stops, for the phone's own reminders (route day, shopping, when to leave). */
export const GET = authed(async (_req, { db, user }) => json({ days: await upcomingDays(db, user.id), fixed: await upcomingFixed(db, user.id) }));
