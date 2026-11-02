import { previewInvite } from "@/lib/groups";
import { authed, json } from "@/lib/http";

export const GET = authed<{ token: string }>(async (_req, { db, params }) => json(await previewInvite(db, params.token)));
