import { z } from "zod";
import { setUserLocale, SUPPORTED_LOCALES } from "@/lib/auth";
import { myGroups } from "@/lib/groups";
import { authed, json } from "@/lib/http";

export const GET = authed(async (_req, { db, user }) => json({ user, groups: await myGroups(db, user.id) }));

const Patch = z.object({ locale: z.enum(SUPPORTED_LOCALES).nullable() });

/** Save the UI language (null = follow the device). */
export const PATCH = authed(async (req, { db, user }) => {
  const { locale } = Patch.parse(await req.json());
  return json({ user: await setUserLocale(db, user.id, locale) });
});
