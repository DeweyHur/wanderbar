import { z } from "zod";
import { createGroup } from "@/lib/groups";
import { authed, json } from "@/lib/http";

const Body = z.object({
  name: z.string().min(1).max(60),
  module: z.enum(["food", "boardgame"]).default("food"),
  defaultLocale: z.enum(["en", "ko"]).default("en"),
  timezone: z.string().min(1).max(64).default("UTC"),
  currency: z.string().length(3).default("USD"),
});

export const POST = authed(async (req, { db, user }) => json(await createGroup(db, user.id, Body.parse(await req.json())), 201));
