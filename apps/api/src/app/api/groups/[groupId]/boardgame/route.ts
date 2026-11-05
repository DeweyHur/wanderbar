import { boardgameHome } from "@/lib/boardgame";
import { authed, json } from "@/lib/http";

/** Board game home: schedules, upcoming nights (the next one is created ahead), history, the queue. */
export const GET = authed<{ groupId: string }>(async (_req, { db, user, params }) => json(await boardgameHome(db, params.groupId, user.id)));
