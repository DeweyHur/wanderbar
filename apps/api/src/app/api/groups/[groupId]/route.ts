import { z } from "zod";
import { groupDetail, GROUP_THEMES, GROUP_FONTS, updateGroup } from "@/lib/groups";
import { authed, json } from "@/lib/http";

export const GET = authed<{ groupId: string }>(async (_req, { db, user, params }) =>
  json(await groupDetail(db, params.groupId, user.id)),
);

const Patch = z.object({ name: z.string().max(60).optional(), theme: z.enum(GROUP_THEMES).optional(), font: z.enum(GROUP_FONTS).optional() });

/** Rename or re-theme the group (owner). */
export const PATCH = authed<{ groupId: string }>(async (req, { db, user, params }) =>
  json(await updateGroup(db, params.groupId, user.id, Patch.parse(await req.json()))),
);
