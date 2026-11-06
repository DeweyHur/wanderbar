import { removeGuest } from "@/lib/boardgame";
import { authed, json } from "@/lib/http";

export const DELETE = authed<{ nightId: string; guestId: string }>(async (_req, { db, user, params }) =>
  json(await removeGuest(db, params.nightId, params.guestId, user.id)),
);
